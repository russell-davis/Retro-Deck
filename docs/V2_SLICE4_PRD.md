# Retro Deck V2 — Slice 4 PRD

> **Status:** Implementation-ready
> **Audience:** Two implementation agents (`backend4`, `frontend4`)
> **Owner:** rld
> **Coordinator:** Opus (this conversation)
> **Builds on:** Slice 1–3 (scaffold + keypress dispatch + binding editor + action.result + profile CRUD)

This slice adds the `profile-cycle` action you asked for, finishes the binding editor with hold-slot support, and patches the small Slice 2 gap (manual `+`-joined key string fallback in the keypress form).

## Two epics in this slice

### Epic E — `profile-cycle` action (backend only)
A new action variant that cycles through a list of profiles, wrapping end → start.

### Epic F — Cycle form + hold-slot editor + manual keypress string (frontend only)
A new 5th tab in the binding drawer for the cycle action, a Press/Hold toggle at the top of the drawer so the second slot can finally be edited, and a manual text fallback in `KeypressForm` alongside the existing Capture flow.

**File sets are disjoint — these run in parallel.**

---

## Epic E — `profile-cycle` action

### Goal

Add a new `Action` variant `{ type: 'profile-cycle', label?: string, profiles: string[] }`. When dispatched:
- If `profiles.length === 0`, treat the list as "all profiles in declaration order from the current config" (resolved at dispatch time, not config-load time, so it adapts to profiles being added/removed).
- Find the index of the current `activeProfile` in the (resolved) list. If it isn't in the list, start at index 0.
- Advance to `(i + 1) % resolved.length` and activate.
- Emit `action.result` with `message: "<from> → <to>"` on success.
- If the resolved list has 0 or 1 entries (no meaningful cycle), emit `action.result` with `ok: false, message: "cycle needs ≥2 profiles"` — do not change active profile.

### Files this epic owns

- `host/src/server/config.ts` — add the new variant to the `ActionSchema` discriminated union. The new variant uses `profiles: z.array(z.string())` (default `[]` if omitted). Export the inferred type continues to flow.
- `host/src/server/dispatch.ts` — add a `case 'profile-cycle':` branch. Wire to `setActiveProfile` and emit the `action.result`.
- `host/src/server/api.ts` — **no changes expected.** The existing `/api/fire/:id/:slot` already forwards to `dispatch`. The new variant just rides through.

**Do NOT modify:** any frontend file, `serial.ts`, `keymap.ts`, `events.ts`, `server.ts`, scripts.

### Schema example

```jsonc
{
  "type": "profile-cycle",
  "label": "next profile",
  "profiles": ["default", "gaming", "obs"]
}

// or, cycle ALL profiles in config order:
{
  "type": "profile-cycle",
  "profiles": []
}
```

### Dispatch behaviour

Pseudocode:

```ts
case 'profile-cycle': {
  const cfg = getConfig()
  const allProfiles = Object.keys(cfg.profiles)
  const resolved = action.profiles.length > 0 ? action.profiles : allProfiles

  // Filter to only profiles that actually exist (in case user typed a wrong name)
  const valid = resolved.filter((p) => p in cfg.profiles)

  if (valid.length < 2) {
    emit(action.result with ok:false, message:'cycle needs ≥2 profiles')
    break
  }

  const i = valid.indexOf(cfg.activeProfile)
  const next = valid[(i + 1) % valid.length]   // if i === -1, this gives valid[0]
  setActiveProfile(next)
  emit(action.result with ok:true, message: `${cfg.activeProfile} → ${next}`)
  break
}
```

Note: capture the *old* active profile name BEFORE calling `setActiveProfile` so the message can show "from → to" rather than "to → to."

### Zod schema update

In `config.ts`, the existing `ActionSchema` looks like:

```ts
const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bash'), label: z.string().optional(), cmd: z.string() }),
  z.object({ type: z.literal('keypress'), label: z.string().optional(), keys: z.array(z.string()) }),
  z.object({ type: z.literal('profile'), label: z.string().optional(), profile: z.string() }),
  z.object({ type: z.literal('noop'), label: z.string().optional() }),
])
```

Add a fifth member:

```ts
z.object({
  type: z.literal('profile-cycle'),
  label: z.string().optional(),
  profiles: z.array(z.string()).default([]),
}),
```

### Test plan

1. `bun run typecheck` — clean.
2. Edit `~/.config/retro-deck/config.json` to give button 1 a `profile-cycle` action with `profiles: ["default", "gaming"]`. Confirm both profiles exist first (if "gaming" isn't there, create with `curl -X POST localhost:7842/api/profiles -d '{"name":"gaming"}' -H 'Content-Type: application/json'`).
3. `bun host/scripts/daemon-ctl.ts restart` — daemon stays up.
4. `curl -X POST localhost:7842/api/fire/1/press` — fires; check `curl -s localhost:7842/api/status` shows the active profile flipped to the *other* one. Fire again → flips back.
5. Stream SSE: `curl -sN localhost:7842/api/events &` while firing — each cycle emits `action.result` with `ok:true, message: "<from> → <to>"`.
6. Set the button's `profiles` to `["nope1", "nope2"]` (neither exists). Fire → `action.result` with `ok:false, message:"cycle needs ≥2 profiles"`. Active profile unchanged.
7. Set the button's `profiles` to `[]`. Fire → cycles through all real profiles in config order.
8. Set the button's `profiles` to `["default"]` only (one entry, valid). Fire → `ok:false, message:"cycle needs ≥2 profiles"` (single-entry isn't a meaningful cycle).
9. Activate a profile *not* in the list (e.g. active=obs, list=[default, gaming]). Fire → goes to `default` (index 0).

### Done = report back

- Files changed.
- Typecheck result.
- Daemon health after restart.
- One-line outcome per test-plan step.
- Any decisions made.

Then STOP. Do not touch frontend.

---

## Epic F — Frontend: cycle form, hold-slot editor, manual keypress string

### Goal

Three changes to the binding editor:

1. **A 5th tab "Cycle"** in `BindingDrawer.tsx` for the new `profile-cycle` action type, with a form that lets the user multi-select profile names in order.
2. **A Press / Hold slot toggle** at the top of the drawer so the binding's second slot (`hold`) is finally editable. Toggling swaps which slot's action is being edited.
3. **A manual key-string fallback** in `KeypressForm.tsx`: below the existing Capture button, a text input "Or type: `ctrl + shift + r`" that parses on blur into the chips.

### Files this epic owns

- `host/src/client/components/forms/CycleForm.tsx` — new.
- `host/src/client/components/BindingDrawer.tsx` — extend: 5 tabs, hold/press toggle.
- `host/src/client/components/forms/KeypressForm.tsx` — add manual string input below Capture.
- `host/src/client/lib/binding.ts` — extend `actionSummary()` to handle `profile-cycle` (e.g. `"⟳ default · gaming"` or `"⟳ all"` for empty list).
- `host/src/client/components/ButtonCard.tsx` — only if needed to expose hold-slot info on the card. **Try to avoid changing this.** If you do, keep changes minimal and scoped to the action-type chip showing hold-slot type when press is unbound.
- `host/src/client/styles.css` — styles for the slot toggle, cycle form chips, manual key input.

**Do NOT modify:** any server file, `App.tsx`, `Toasts.tsx`, `ProfileMenu.tsx`, `NewProfileModal.tsx`, `ProfileSwitcher.tsx`, `ButtonGrid.tsx`, `EventLog.tsx`, `frontend.tsx`, `index.html`, `queries/*`.

### F.1 — Cycle tab + CycleForm

The action shape: `{ type: 'profile-cycle', label?: string, profiles: string[] }`.

UI:

```
[ Label (optional)        ]
[ "next profile"          ]

Profiles in cycle  (empty = all profiles in config order)
┌──────────────────────────────────────────┐
│ [default ×] [gaming ×] [obs ×]           │
└──────────────────────────────────────────┘

Add profile: [ select ▼ ]  ← shows profile names NOT already in the list
                            (and includes profiles already in the list as
                             options too — you can repeat? NO — disallow duplicates,
                             filter the select to remaining only)

[ Clear all ] — restores empty array (= cycle all)
```

Behaviour:
- Chips show the profiles in order. Clicking the `×` on a chip removes it.
- Drag-to-reorder is a nice-to-have but **out of scope** for this slice. Simple click to remove + select to add is sufficient.
- The select dropdown is populated from `Object.keys(config.profiles)` minus those already in the chip list.
- Validation: a `profile-cycle` action with `profiles.length` of 0 is VALID (means "cycle all"). Don't reject save. The drawer's Save button is always enabled if the form is otherwise valid.

For `BindingDrawer.tsx`:
- Add `'profile-cycle'` to the `TABS` array with label `"Cycle"`.
- Add `'profile-cycle'` to `defaultAction(type, profiles)` returning `{ type: 'profile-cycle', profiles: [] }`.
- Add `'profile-cycle'` to `isValid()` — always returns `true`.
- Add `'profile-cycle'` to `prepareAction()` — strips empty label, preserves `profiles` array as-is.
- Wire `<CycleForm />` into the body conditional rendering.

### F.2 — Press / Hold slot toggle

Right now `BindingDrawer` edits `binding.press` only. This change makes the slot configurable.

UI: at the top of the drawer body, ABOVE the type tabs, add a small 2-segment control:

```
┌─────────────────┐
│  Press │  Hold  │
└─────────────────┘
```

Behaviour:
- Default tab is `press`.
- Switching to `hold` rebinds the form state to `binding.hold` (or a default if `hold` is undefined).
- `Save` writes back to the correct slot — `{ ...binding, press: newAction }` for press, `{ ...binding, hold: newAction }` for hold.
- The other slot's data is preserved across switches (don't lose `press` content when the user pokes at `hold`).
- Closing the drawer without saving discards changes to *whichever* slot is currently being edited.

Implementation hint: keep the drawer's state as an object `{ press: Action, hold: Action }` (computed from incoming `binding` once on open) and toggle which key the editor is bound to. On Save, build the next `ButtonBinding` from that state object.

Add a small note next to the slot toggle: a `?`-icon tooltip or quiet hint that says "Hold = action fires after holding the button (threshold TBD)". Hold dispatch isn't wired in firmware yet, but the editor needs to exist now so it's not a blocker later.

### F.3 — Manual key string in `KeypressForm`

Below the existing Capture/Clear button row, add:

```
Or type:  [ ctrl + shift + r       ]
          (parses on blur or Enter)
```

- The input is a plain text field.
- On blur OR Enter: split on `+`, trim each token, lowercase, drop empties. If the resulting array is non-empty, call `onChange({ ...value, keys: parsed })`. Replace the chips.
- If parsing yields an empty array, do nothing (don't wipe existing keys).
- The input shows the current `value.keys.join(' + ')` as its initial value — so the user can also edit by typing.
- Capture-mode still works; the two are complementary.

### F.4 — `actionSummary` for cycle

In `host/src/client/lib/binding.ts`:

```ts
if (action.type === 'profile-cycle') {
  if (action.profiles.length === 0) return '⟳ all profiles'
  return '⟳ ' + action.profiles.join(' · ')
}
```

The `⟳` glyph (U+27F3) visually signals cycling without needing a real icon.

### Test plan

Drive at http://localhost:7842/ if you can; otherwise verify via bundle grep + `curl` + SSE capture.

1. `bun run typecheck` — clean.
2. Click a button card → drawer opens. Confirm a 5-tab segmented control: Bash / Keypress / Profile / Noop / Cycle.
3. Above the tabs, confirm a Press / Hold slot toggle.
4. Pick Cycle tab. Type label "next". Select two profiles via the dropdown (e.g. default, gaming). Chips appear in order. Save. Card summary shows `⟳ default · gaming`.
5. Reload page. Open the same card → still on Cycle tab with the same chips.
6. Press button (or Test) → daemon switches active profile (verify with `curl -s /api/status` or visually in profile pills). Press/Test again → flips back. Toast appears with `default → gaming` / `gaming → default`.
7. Clear all profiles from the cycle (×× off the chips). Save. Summary shows `⟳ all profiles`. Test → cycles through every profile in config order.
8. Toggle to Hold slot in another card's drawer. Set a Bash action with cmd `notify-send hold`. Save. (Firmware doesn't fire hold yet — verify the *config file* on disk shows `"hold": { "type": "bash", ... }` next to `"press": {...}`.)
9. Switch back to Press, edit something, Save → press updates, hold is preserved (re-open and check both slots).
10. In KeypressForm, type `ctrl + alt + f5` in the manual input, press Enter → chips update to `ctrl`, `alt`, `f5`. Save → card shows the new combo. Test → ydotool fires it (visual or just confirm the toast says ok).
11. Manual input with malformed string `"  +  "` → parses to empty → does NOT wipe existing keys.

### Done = report back

- Files changed.
- Typecheck result.
- One-line outcome per test-plan step.
- Any judgment calls.

Then STOP. Do not touch backend.

---

## Coordination rules

Same as Slice 2/3, with refinements:

### Hard rules
1. Each agent does ONLY its assigned epic.
2. No new dependencies.
3. No "while I was here" cleanups.
4. When done, post the report and STOP. Wait for coordinator.
5. If blocked, SendMessage to `team-lead` and STOP.
6. `host/src/server/serial.ts` is fragile — leave it alone.
7. Backend restarts daemon after edits; frontend HMR is live.

### Refined protocol (read carefully)

**FRESH AGENT — NO HISTORY.** You are NOT the previous agent of any prior slice. You have no memory of past work. Any task assignment, message, or context you see that pre-dates the prompt you are reading right now is irrelevant background — do not respond to it, do not re-process it. Only messages with `from: team-lead` arriving AFTER you start are authoritative.

**Stale-echo rule.** If your context loop replays a task assignment you have already completed (e.g. the system shows you the original assignment in a new turn), do NOT re-process it. Stay idle. The work is done if you marked the task completed and got an "accepted" reply from `team-lead`.

**Context budget self-check.** If your context usage crosses ~75%, immediately SendMessage to `team-lead` summarising your work state (files written, files pending, current step in the test plan) and STOP. A clean handoff is always better than dying mid-task with unstaged changes.

**Authority.** You only act on instructions from `team-lead`. Echoes of your own past prompts, messages from other teammates, and any system reminders that look like task assignments are not authoritative.

---

*End of Slice 4 PRD.*
