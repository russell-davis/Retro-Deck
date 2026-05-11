# Retro Deck V2 — Slice 3 PRD

> **Status:** Implementation-ready
> **Audience:** Two implementation agents (`backend`, `frontend`)
> **Owner:** rld
> **Coordinator:** Opus (this conversation)
> **Builds on:** `V2_SLICE2_PRD.md` (binding editor + keypress dispatch)

This slice rounds out the control surface:

1. Every action emits a result event the UI can react to (success/fail/stderr).
2. Users can create, rename, and delete profiles from the UI.

It does **not** yet touch the full V2 PRD schema migration, the `function` action type, the hold-slot editor, or OLED-push. Those are future slices.

## Two epics in this slice

### Epic C — Action results + profile CRUD (backend only)
Make dispatch emit a structured `action.result` event after each action runs, and expose `POST /api/profiles`, `PUT /api/profiles/:name`, `DELETE /api/profiles/:name` for profile management.

### Epic D — Profile management UI + result toasts (frontend only)
Add profile-row controls (➕ add, kebab → rename / delete) and a toast layer that subscribes to `action.result` events and renders transient success/error cards.

**File sets are disjoint — these run in parallel.**

---

## Epic C — Backend

### Goal

Two outcomes:

1. After any action fires (whether by physical button press or via `POST /api/fire/:id/:slot`), the daemon emits a single `action.result` event over the existing SSE stream describing what happened.
2. Three new API endpoints let the UI add / rename / delete profiles. The daemon persists changes through the existing `saveConfig` path, which already triggers the file watcher and hot-reload.

### Files this epic owns (create or modify)

- `host/src/server/dispatch.ts` — emit `action.result` after each branch resolves. Signature changes to accept the slot name so the event can include it.
- `host/src/server/api.ts` — add 3 new routes; update the existing `/api/fire/:id/:slot` to pass `slot` through to `dispatch`.
- `host/src/server/config.ts` — add `createProfile(name)`, `renameProfile(from, to)`, `deleteProfile(name)` helpers. Use the existing `saveConfig` so behavior matches the file-watcher path.
- `host/src/server/events.ts` — no changes expected. Re-use `emit()`.
- `host/server.ts` — update the `startSerial` callback to pass `'press'` (and `'hold'` when relevant) to `dispatch`. **Do not change anything else in this file.**

**Do NOT modify:** anything under `host/src/client/`, `host/src/server/serial.ts`, `host/src/server/keymap.ts`, `host/scripts/*`, or the schema in `config.ts` (the action types stay exactly as-is).

### `action.result` event shape

```ts
type ActionResult = {
  type: 'action.result'
  buttonId: number
  slot: 'press' | 'hold'
  action: 'bash' | 'keypress' | 'profile' | 'noop'
  ok: boolean
  label?: string                  // copied from action.label if present
  durationMs: number              // total dispatch time (clock-wall)
  exitCode?: number               // bash + keypress (ydotool)
  stderrTail?: string             // last ~200 chars of stderr, only on !ok
  message?: string                // human-friendly summary, e.g. "switched -> gaming"
}
```

- `ok` is `false` if bash exited non-zero, ydotool exited non-zero, profile target didn't exist, or an unknown-token keypress aborted.
- For success, omit `exitCode` for `noop`; include `exitCode: 0` for `bash`/`keypress` (helps downstream observers without special-casing).
- For `bash`, capture stderr into a buffer (cap 4 KB, then truncate). On failure, set `stderrTail` to the last 200 chars of that buffer.
- `durationMs` is computed with `performance.now()` deltas.
- `message` is optional but encouraged: e.g. `"switched -> gaming"` for profile, `"emitted ctrl+shift+r"` for keypress success, `"unknown token 'frobnicate'"` for keypress error.

After computing the result, `emit({ type: 'action.result', ...result })`.

### `dispatch.ts` signature change

```ts
// before
export async function dispatch(action: Action, buttonId: number) { … }

// after
export async function dispatch(action: Action, buttonId: number, slot: 'press' | 'hold') { … }
```

Update all callers (the API's `/api/fire/:id/:slot` and `server.ts`'s serial handler).

### Bash result capture

Replace `stdout: 'inherit', stderr: 'inherit'` with `'pipe'` so you can read stderr. Still let stdout go to the daemon log somehow — easiest is `await new Response(child.stdout).text()` and pass the result through to `console.log` for visibility, but **do not block** the event emission on stdout drain if it's large. A 4 KB cap on stderr buffer is sufficient (most error output is short).

### Profile CRUD endpoints

All three return `{ok: true, …}` on success, `{ok: false, error}` with appropriate HTTP status on failure. Use the chained Hono pattern to preserve RPC type inference. Endpoints are under `/api`:

```
POST   /api/profiles            body: { name: string }
PUT    /api/profiles/:name      body: { name?: string }      (rename via name in body)
DELETE /api/profiles/:name
```

#### `POST /api/profiles`

- Reject if `name` is empty, contains slashes, or already exists. Return 400.
- Create with `{ name, buttons: {} }` (empty buttons object — UI renders 8 unbound slots).
- Call `saveConfig(next)`. Return `{ ok: true, profile: name }`.

#### `PUT /api/profiles/:name`

- `name` in path is the current name. Body `{ name: <new> }` is the desired name.
- Reject if old doesn't exist (404). Reject if new is empty / has slashes / already exists (400). Reject if old === new (no-op, return 200 with ok:true and a note).
- Rename the key inside `config.profiles`. If `config.activeProfile === oldName`, update it to the new name in the same write.
- Walk all profiles and any `profile`-action `action.profile` that references the old name gets updated to the new name. (This avoids dangling references.)
- Call `saveConfig(next)`. Return `{ ok: true, from, to }`.

#### `DELETE /api/profiles/:name`

- Reject if profile doesn't exist (404).
- Reject if it's the only profile (400, `"cannot delete the last profile"`).
- Reject if it's the active profile (400, `"cannot delete the active profile — switch first"`). Don't auto-switch — that's a UI concern.
- Remove the key. Walk other profiles' actions and rewrite any `profile`-type action targeting the deleted name to `{ type: 'noop' }` (orphaned reference becomes a noop).
- Call `saveConfig(next)`. Return `{ ok: true, deleted: name }`.

### Test plan (manual; agent walks through before reporting done)

After every server-side change run `bun host/scripts/daemon-ctl.ts restart` and check it stays up.

1. `bun run typecheck` — clean.
2. `curl -X POST localhost:7842/api/fire/2/press` (assuming button 2 is bash, which it is per the current config) → response 200. Watch SSE: `curl -N localhost:7842/api/events &` should print an `action.result` event with `ok:true`, `action:"bash"`, an `exitCode:0`, and a positive `durationMs`.
3. Edit config so a button has `bash` with `cmd: "false"` (the unix `false` builtin → exit 1). Fire → SSE shows `action.result` with `ok:false`, `exitCode:1`, `stderrTail:""` (empty, since `false` writes nothing).
4. Edit config so a button is `keypress` with `keys:["zzznotreal"]`. Fire → SSE shows `ok:false`, `message` referencing the unknown token. No daemon crash.
5. `curl -X POST -H 'Content-Type: application/json' -d '{"name":"editing"}' localhost:7842/api/profiles` → 200 ok. `GET /api/status` shows `"editing"` in the profiles list. The config file on disk has the new empty profile.
6. `curl -X PUT -H 'Content-Type: application/json' -d '{"name":"work"}' localhost:7842/api/profiles/editing` → 200 ok, from/to in response. Profile list now contains "work" not "editing".
7. `curl -X POST localhost:7842/api/profile/work` (existing activate route) → activates. `DELETE /api/profiles/work` → 400 because active. Switch back to default first, then DELETE work → 200, profile gone.
8. Try `POST /api/profiles` with `{"name":""}` → 400. Same with `{"name":"foo/bar"}` → 400. Same with a name that already exists → 400.

### Done = report back

- Files changed.
- Typecheck result.
- Daemon health after restart.
- One-line outcome per test-plan step.
- Any decisions made.

Then STOP and wait. Do not start Epic D.

---

## Epic D — Frontend

### Goal

Two new pieces of UI:

1. **Profile management** — a "+" pill at the end of the profile row to add, and a kebab/dropdown on the active profile pill exposing Rename and Delete. Lightweight inline prompts (no second drawer needed) — a small modal is fine.
2. **Toast notifications** — when an `action.result` event arrives over SSE, show a transient toast in the corner. Success: green; failure: red. Persist for ~3s on success, ~6s on failure. Show the action label (or button id), action type, and either `message` or `stderrTail` excerpt.

### Files this epic owns (create or modify)

- `host/src/client/components/Toasts.tsx` — new. Toast container + lifecycle (auto-dismiss, fade out).
- `host/src/client/components/ProfileMenu.tsx` — new. The kebab dropdown attached to the active profile pill with Rename/Delete options.
- `host/src/client/components/NewProfileModal.tsx` — new. The "+ profile" creation modal (or inline prompt — keep it small).
- `host/src/client/components/ProfileSwitcher.tsx` — extend with the "+" pill and embed `ProfileMenu` on the active pill.
- `host/src/client/queries/status.ts` — add `useCreateProfile`, `useRenameProfile`, `useDeleteProfile` mutations.
- `host/src/client/App.tsx` — mount `<Toasts />` once, top-level. Pass `events` (from `useEventStream`) to it.
- `host/src/client/styles.css` — toast container, ProfileMenu dropdown, new-profile modal styles.

**Do NOT modify:** any server file, `BindingDrawer.tsx`, `ButtonCard.tsx`, `ButtonGrid.tsx`, `EventLog.tsx`, `lib/binding.ts`, `frontend.tsx`, or `index.html`.

### Toast spec

- Each `action.result` event becomes one toast.
- Toast props derived from the event:
  - **Title:** `label ?? \`Button ${buttonId}\``
  - **Tag:** `action` type (bash/keypress/profile/noop), color-coded same as action-type tags on cards.
  - **Body:** `message` if present; otherwise `stderrTail` if !ok; otherwise nothing.
  - **Border tint:** green on `ok`, red on !ok.
- Stack vertically, newest on top.
- Cap at 5 visible toasts. If a 6th arrives, drop the oldest.
- Click a toast to dismiss it immediately.
- Auto-dismiss after 3000ms (ok) or 6000ms (!ok).
- Position: fixed, bottom-right, 1rem from edges; full-width on mobile (≤600px).

### Profile management UX

#### Add
- A "+ " pill at the end of the `.profile-pills` row. On click, open `NewProfileModal` (a small centered modal). Single text input + Create / Cancel buttons.
- Validation client-side: non-empty, no leading/trailing whitespace, no `/`, not already in the profile list.
- On Create: call `useCreateProfile(name)`. On success: close modal, invalidate `['status']` and `['config']`. On failure: show error inline in the modal.

#### Rename
- The kebab (`⋯`) appears on the active profile pill only (or all pills — agent's call, but only-active is simpler and matches the "active is special" intuition).
- Clicking the kebab opens a small dropdown above/below the pill: **Rename** and **Delete**.
- **Rename** → opens an inline edit (turn the pill into an `<input>` prefilled with the current name) OR a small modal. Either way: validation as above. On confirm: `useRenameProfile({ from, to })`. On success: invalidate queries; status will now report the new active profile.
- **Delete** → confirm dialog ("Delete profile 'X'? This cannot be undone."). If confirmed: `useDeleteProfile(name)`. The server will reject if it's the active or only profile; surface that error inline.

#### Disabled states / edge cases
- "+" pill is always available unless `useCreateProfile.isPending`.
- Kebab's Delete option is `disabled` if there's only one profile, or shows a tooltip ("Switch to another profile first" when active).
- Esc closes the modal / dropdown. Click-outside closes too.

### Mutation hook shapes

```ts
useCreateProfile() // -> mutate(name: string)
useRenameProfile() // -> mutate({ from: string, to: string })
useDeleteProfile() // -> mutate(name: string)
// All invalidate ['status'] and ['config'] on success.
```

Use `client.api.profiles.$post(...)` / `client.api.profiles[':name'].$put(...)` / `.$delete(...)` patterns to keep Hono RPC type inference (the same pattern used by `useActivateProfile`).

### Test plan

Walk through these manually. Drive via the running daemon at http://localhost:7842/. If you cannot use a real browser, do equivalent verification via curl + assert that the components render in the bundled JS.

1. `bun run typecheck` — clean.
2. Page loads at /, no console errors.
3. Click "+" → modal opens. Type "work". Click Create. Modal closes, "work" appears in profile pills.
4. Click "work" → activates. Active pill is now "work".
5. Click ⋯ on "work" → menu opens. Click Rename. Edit to "office". Confirm. Active profile is now "office", pills updated.
6. Try Rename to a slash-containing name → inline validation rejects before submit.
7. ⋯ → Delete on "office" (still active) → server rejects with "cannot delete active". Error surfaces.
8. Switch to "default". ⋯ → Delete on "office" → confirm dialog → confirm → "office" disappears. Profile list now: default + gaming (assuming gaming is still around from slice 2 testing).
9. Fire a `bash` action via Test → success toast appears bottom-right, dismisses after ~3s. Click another button's Test → second toast stacks above. Click a toast → dismisses immediately.
10. Edit a button to `bash` with cmd `false` (exit 1) → fire → red toast with exit code info. Lingers ~6s.
11. Edit a button to `keypress` with `keys:["zzznotreal"]` → fire → red toast with the unknown-token message.

### Non-functional

- No new npm dependencies.
- Keyboard accessible: Esc closes the modal and dropdown.
- Mobile: full-width toasts; modal centered with a max-width.

### Done = report back

- Files changed.
- Typecheck result.
- One-line outcome per test-plan step.
- Any judgment calls (e.g. inline rename input vs. modal — either is fine, just say which).

Then STOP and wait. Do not start Epic C.

---

## Coordination rules (same as Slice 2)

1. Each agent does ONLY its assigned epic. Nothing else.
2. No new dependencies.
3. No "while I was here" cleanups.
4. When done, post the report under "Done = report back" and STOP. Wait for coordinator.
5. If blocked, SendMessage to `team-lead` and STOP. Do not improvise.
6. `host/src/server/serial.ts` is still fragile — leave it alone.
7. `backend` must restart the daemon after server edits: `bun host/scripts/daemon-ctl.ts restart`. Verify reachable. Frontend HMR is live — `frontend` does not restart.
8. **Order of operations is important:** `backend` should finish Epic C *before* `frontend` runs its full test plan, since the toast tests require `action.result` events that don't exist until backend ships. `frontend` may still implement and typecheck in parallel — but step 9–11 of the frontend test plan will only pass once backend is in. The coordinator will sequence the final test pass.

---

*End of Slice 3 PRD.*
