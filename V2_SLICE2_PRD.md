# Retro Deck V2 — Slice 2 PRD

> **Status:** Implementation-ready
> **Audience:** Two implementation agents (frontend + backend)
> **Owner:** rld
> **Coordinator:** Opus (this conversation)

This slice closes the "edit binding → press button → action fires" loop. It does not yet move toward the full V2 PRD schema (`device`/`display`/`http`/`version`/`function`); that's Slice 3.

## Current state (as committed on `feature/v2-rewrite`)

- **Server schema** (authoritative for this slice): `host/src/server/config.ts`
  ```ts
  Action =
    | { type: 'bash';     label?: string; cmd: string }
    | { type: 'keypress'; label?: string; keys: string[] }
    | { type: 'profile';  label?: string; profile: string }
    | { type: 'noop';     label?: string }

  ButtonBinding = { press?: Action; hold?: Action; color?: string; icon?: string }
  Profile       = { name: string; buttons: Record<string, RawButton> }
  Config        = { activeProfile: string; profiles: Record<string, Profile> }
  ```
  `RawButton = Action | ButtonBinding` — both shapes accepted; `normalizeBinding()` collapses to `ButtonBinding`.

- **Dispatch** (`host/src/server/dispatch.ts`) — `bash` works, `profile` works, `noop` works, **`keypress` is a `console.log` stub**.

- **API** (`host/src/server/api.ts`): `GET /api/status`, `GET/PUT /api/config`, `POST /api/profile/:name`, `POST /api/fire/:id/:slot`, `GET /api/events` (SSE).

- **UI** (`host/src/client/*`): profile pills + 4×2 button grid (read-only) + Test button per card + live event log.

## Two epics in this slice

### Epic A — Inline Binding Editor (frontend only)
Make the grid editable. Click a card → drawer with a form per action type. Save → `PUT /api/config` → daemon hot-reloads.

### Epic B — Keypress Action Execution (backend only)
Implement the `keypress` branch in `dispatch.ts` so a bound keypress action actually emits the keystroke on the host using `ydotool`.

**Files touched by Epic A are disjoint from Epic B — they run in parallel.**

---

## Epic A — Binding Editor

### Goal
A user clicks any `ButtonCard`, picks an action type, fills the fields, saves, and the daemon immediately hot-reloads with the new binding. The card reflects the change without a manual reload.

### Files this epic owns (create or modify)
- `host/src/client/components/BindingDrawer.tsx` — new, the drawer shell + tabs/segmented control for action type
- `host/src/client/components/forms/BashForm.tsx` — new
- `host/src/client/components/forms/KeypressForm.tsx` — new
- `host/src/client/components/forms/ProfileForm.tsx` — new
- `host/src/client/components/forms/NoopForm.tsx` — new (just a placeholder body)
- `host/src/client/components/ButtonCard.tsx` — make the whole card a clickable open-drawer target; the **Test** button stays and stops propagation so clicking it doesn't open the drawer
- `host/src/client/components/ButtonGrid.tsx` — owns the drawer-open state (which button id is being edited)
- `host/src/client/queries/config.ts` — add `useSaveBinding({ profileName, id, binding })` mutation that does `PUT /api/config` with the next full Config
- `host/src/client/lib/binding.ts` — add `setBinding(config, profileName, id, binding)` pure helper
- `host/src/client/styles.css` — drawer + form styles

**Do NOT modify:** anything under `host/src/server/`, `host/server.ts`, any other server-side file, `App.tsx`.

### Behavior spec

1. **Open**: clicking the card body (not the Test button) opens the drawer for that button id. Only one drawer open at a time.
2. **Action type tabs**: a 4-way segmented control: Bash · Keypress · Profile · Noop. Switching tabs reshapes the form. Switching to a new type with no data resets to that type's default empty value.
3. **Form per type**:
   - **Bash**: `<label>` text input + `<cmd>` textarea (single-line ok; allow multi-line). Validation: cmd non-empty.
   - **Keypress**: `<label>` text input + a key-combo capture area. Capture works by clicking "Capture" then pressing the desired combo on the keyboard; show the captured combo as token chips (`Ctrl + Shift + R`). Allow manual edit by clearing + retyping a `+`-joined string. Store as `keys: string[]` lowercased per the host alias table in `V2_PRD.md` §6.4.1 (but for this slice, **store whatever the user typed**, lowercased — alias mapping is Slice 3). Validation: ≥1 token.
   - **Profile**: `<label>` text input + a `<select>` of all profile names from the current config. Validation: profile must exist.
   - **Noop**: just `<label>` input. No other fields.
4. **Slot**: this slice edits the `press` slot only. (Hold slot deferred — leave the binding's `hold` field unchanged if present.)
5. **Save**: builds the next `Config` by replacing `profiles[activeProfile].buttons[id]` with a `ButtonBinding` whose `press` is the new action. Calls `PUT /api/config`. On success: close drawer, invalidate `['config']` and `['status']`. On error: show error inline, leave drawer open.
6. **Cancel / Esc / click outside**: closes the drawer without saving.
7. **Loading/pending states**: save button shows "Saving…" while pending and is disabled. Form inputs disabled during save.

### Non-functional
- Keyboard accessible: Esc to close, Enter inside text inputs doesn't submit accidentally — there must be an explicit Save button.
- The drawer is a right-side panel on desktop, full-screen modal on mobile (CSS media query).
- No new dependencies. React + existing Tanstack Query + plain CSS only.

### Test plan (manual, for the agent to walk through before reporting done)
1. Start the daemon with `bun host/scripts/daemon-ctl.ts status` — should be running.
2. Open `http://localhost:7842/`.
3. Click button #1 → drawer opens.
4. Switch to Keypress tab → click Capture → press `Ctrl+Shift+R` → see chips → Save.
5. Card #1 should show type=KEYPRESS, summary `ctrl + shift + r`.
6. Reload the page → state persists (config file was written).
7. Click #2 → Bash → set cmd `notify-send hello` → Save → Test button fires the notify.
8. Click #3 → Profile → pick another profile (if more than one exists) → Save → card summary shows `→ <name>`.
9. Esc closes without saving; click-outside closes without saving.

### Done = report this back to the coordinator
- Files changed (list).
- `bun run typecheck` clean output.
- Confirmation that the 9 test-plan steps all pass.
- Any surprises or judgment calls made.

**Do NOT** start Epic B work. **Do NOT** touch server files. **Do NOT** modify the action schema in `config.ts`. **Do NOT** add new npm dependencies. If something blocks you, stop and message the coordinator.

---

## Epic B — Keypress Action Execution

### Goal
When a `keypress` action fires (either from a physical button press or a Test fire), the configured keystroke is actually emitted on the host.

### Host capability (confirmed by coordinator)
- `/usr/bin/ydotool` is installed.
- The `ydotool` systemd user service is **active**; socket at `$XDG_RUNTIME_DIR/.ydotool_socket` (or wherever the user service places it — `ydotool` reads `YDOTOOL_SOCKET` env or default).
- `/dev/uinput` exists, current user is in `input` group.
- Wayland (Hyprland) — `wtype` is also installed as a fallback, but **prefer ydotool** (works under Hyprland focused windows; wtype has compositor quirks).

### Files this epic owns (create or modify)
- `host/src/server/dispatch.ts` — implement the `keypress` branch.
- `host/src/server/keymap.ts` — new. Maps human-friendly tokens (the `keys: string[]` array from config) to ydotool keycodes.
- (Optional, only if needed) `host/scripts/keymap-dump.ts` — utility script that prints the keymap for diagnosis.

**Do NOT modify:** any UI file, any other server file, the action schema in `config.ts`. **Do NOT** change the wire shape of `Action.keypress`.

### Behavior spec

1. **Input shape**: `Action.keypress.keys: string[]` — each string is one token like `"ctrl"`, `"shift"`, `"r"`, `"f5"`, `"enter"`. Case-insensitive.
2. **Mapping**: lowercase each token, look up in the alias table (see below). Unknown tokens cause the dispatch to log an error and emit nothing.
3. **Emission**: use `ydotool key` with hold-then-release notation: `<KEYCODE>:1` to press, `<KEYCODE>:0` to release. Press modifiers first → press main key(s) → release all in reverse order. Example for `ctrl+shift+r`:
   ```
   ydotool key 29:1 42:1 19:1 19:0 42:0 29:0
   ```
   (29 = LEFT_CTRL, 42 = LEFT_SHIFT, 19 = R — Linux input event codes from `linux/input-event-codes.h`.)
4. **Hold timing**: 30ms between full press and full release. Use a single `ydotool key` invocation with sleep tokens (`-d 30` or chained `:1 -d 30 :0`) per ydotool man page — or, if simpler, spawn ydotool, sleep 30ms in TS, then a second ydotool for release. Single-invocation is preferred (less latency, one process).
5. **Process spawn**: `Bun.spawn(['ydotool', 'key', ...args], { stdout: 'pipe', stderr: 'pipe' })`. Await exit; on non-zero, log stderr.
6. **Environment**: read `YDOTOOL_SOCKET` if set; otherwise let ydotool default. Do not assume the socket path.
7. **No state**: dispatch is fire-and-forget. Don't queue. Don't retry.

### Keymap (use Linux input event codes — these are the integers ydotool expects)

Implement at least these. Anything not in the table → log error and emit nothing.

| Token (lowercased) | Code | Notes |
|---|---|---|
| `ctrl`, `control` | 29 | LEFTCTRL |
| `shift` | 42 | LEFTSHIFT |
| `alt`, `option`, `opt` | 56 | LEFTALT |
| `super`, `cmd`, `meta`, `win`, `windows` | 125 | LEFTMETA |
| `a` | 30 | … (alphabet a–z = 30..44 wrapping, see table) |
| `b` | 48 |
| `c` | 46 |
| `d` | 32 |
| `e` | 18 |
| `f` | 33 |
| `g` | 34 |
| `h` | 35 |
| `i` | 23 |
| `j` | 36 |
| `k` | 37 |
| `l` | 38 |
| `m` | 50 |
| `n` | 49 |
| `o` | 24 |
| `p` | 25 |
| `q` | 16 |
| `r` | 19 |
| `s` | 31 |
| `t` | 20 |
| `u` | 22 |
| `v` | 47 |
| `w` | 17 |
| `x` | 45 |
| `y` | 21 |
| `z` | 44 |
| `1`..`9`, `0` | 2..10, 11 |
| `enter`, `return` | 28 |
| `esc`, `escape` | 1 |
| `tab` | 15 |
| `space`, `spacebar` | 57 |
| `backspace` | 14 |
| `delete`, `del` | 111 |
| `home` / `end` | 102 / 107 |
| `pageup` / `pagedown` | 104 / 109 |
| `left` / `right` / `up` / `down` | 105 / 106 / 103 / 108 |
| `f1`..`f12` | 59..70 |
| `minus`, `-` | 12 |
| `equals`, `=` | 13 |
| `,` | 51 |
| `.` | 52 |
| `/` | 53 |
| `;` | 39 |
| `'` | 40 |
| `[` | 26 |
| `]` | 27 |
| `\\` | 43 |
| `` ` `` | 41 |

These codes come from `linux/input-event-codes.h` (`KEY_*` constants). Trust them; do **not** spend time researching.

### Test plan (manual, for the agent to walk through before reporting done)
1. Edit `~/.config/retro-deck/config.json` to give button 1 a `keypress` action with `keys: ["ctrl", "alt", "t"]`. (Or use the Test endpoint — see step 3.)
2. Daemon should hot-reload; coordinator-built UI may show the change.
3. From a terminal: `curl -X POST http://localhost:7842/api/fire/1/press`.
4. Observe: on Omarchy/Hyprland, `Ctrl+Alt+T` opens a terminal. Confirm a new terminal opened.
5. Try a single character: `keys: ["a"]` → fire → an `a` is typed into whichever window is focused.
6. Try an unknown token: `keys: ["frobnicate"]` → fire → daemon log shows an error, nothing emitted, no crash.
7. Run `bun run typecheck` — clean.

### Done = report this back to the coordinator
- Files changed (list).
- `bun run typecheck` clean.
- Confirmation that the 7 test-plan steps all pass (the agent will need a way to test — `curl` is fine; visual confirmation of the terminal opening is acceptable).
- Any surprises (e.g., if ydotoold socket needs explicit env, note it).

**Do NOT** start Epic A work. **Do NOT** touch UI files. **Do NOT** change the config schema. If the keymap codes seem wrong, **fix them locally** — don't go research the kernel headers, the codes above are correct.

---

## Coordination rules

1. Each agent does ONLY its assigned epic. Nothing else.
2. No new dependencies. No `bun add`.
3. No refactors outside scope. No "while I was here" cleanups.
4. When done, post the report described under "Done = report this back" and STOP. Do not move on. Wait for the coordinator.
5. If blocked, message the coordinator (named `coordinator` in the team) with a clear description of what's blocking. Do not improvise.
6. `host/src/server/serial.ts` is fragile — leave it alone.
7. The daemon is currently running on port 7842 via `bun host/scripts/daemon-ctl.ts`. To pick up server-side changes, the agent assigned Epic B must `bun host/scripts/daemon-ctl.ts restart` after editing. Frontend (Epic A) is HMR-live — no restart needed.

---

*End of Slice 2 PRD.*
