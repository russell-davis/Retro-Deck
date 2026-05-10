# Retro Deck V2 — Implementation Issues

> **Source:** `V2_PRD.md` (primary), `V2_REWRITE_ANALYSIS.md` (V1 context)
> **Total issues:** 17
> **Tracks:** deploy · firmware · host-daemon · config · config-ui · protocol

---

## Track overview and ordering

```
Deploy (#1)          ← standalone, do first — enables fast firmware iteration
Firmware (#2–6)      ← parallel with Host track; each builds on #2
Host (#7–13)         ← parallel with Firmware; #8 (config) is independent
Config UI (#14–16)   ← depends on HTTP API (#12); owner must confirm webapp vs TUI before #14
Claude Code (#17)    ← depends on HTTP API (#12); standalone integration
```

---

## Issue #1: Deploy Tooling

**Labels:** deploy
**Depends on:** none
**Effort:** M

### What & Why
Implements `bun run deploy` (`host/scripts/deploy.ts`) — the only sanctioned way to push firmware to the Pico. Without it, every firmware iteration requires manual CIRCUITPY mount/rsync/unmount steps. This is the first issue to tackle because a fast deploy loop (target: under 10 seconds) unblocks every other firmware issue.

### Acceptance Criteria
- [ ] `bun run deploy` detects the CIRCUITPY block device by filesystem label using `blkid -L CIRCUITPY` or `lsblk -o LABEL,PATH -nr` — never by hardcoded path
- [ ] Mounts the device (prefers `udisksctl mount`, falls back to `sudo mount`), creating the mountpoint if needed
- [ ] Reuses an existing mountpoint if the device is already mounted
- [ ] Runs `rsync -av --delete` from `firmware/` to the mount
- [ ] Calls `sync` then unmounts cleanly (`udisksctl unmount` + `udisksctl power-off` when available)
- [ ] Exits non-zero with a helpful message if no CIRCUITPY label is found
- [ ] Paranoia check: refuses to proceed if the resolved device label is not `CIRCUITPY`
- [ ] CLI flags: `--dry-run`, `--firmware <path>`, `--device /dev/sdX1` (override label detection)
- [ ] `package.json` exposes `bun run deploy` as the canonical command
- [ ] Total round-trip time under 10 seconds on a typical Pico

### Implementation Notes
Read PRD §8 in full before starting. Key gotcha: `--delete` on `rsync` to a wrong disk is catastrophic — the label check (and the paranoia re-check after mount) is the safety net. See §8.4 for the `udisksctl` vs `sudo` fallback pattern. The V2_REWRITE_ANALYSIS §8 notes `/dev/sda1` was the original plan — do not use it.

---

## Issue #2: Firmware Foundation — boot.py + asyncio Scaffold

**Labels:** firmware
**Depends on:** none
**Effort:** S

### What & Why
Creates the `firmware/` directory layout, `boot.py` (enables USB CDC data channel), and the skeleton of `code.py` (asyncio main with placeholder tasks). Without this, nothing else in the firmware track can be built or tested on hardware.

### Acceptance Criteria
- [ ] `firmware/boot.py` calls `usb_cdc.enable(console=True, data=True)` — no other logic
- [ ] After hard reset, `/dev/ttyACM0` (REPL) and `/dev/ttyACM1` (data) both enumerate on host
- [ ] `firmware/code.py` defines an `async def main()` that gathers four named tasks: `button_scanner_task`, `serial_reader_task`, `display_render_task`, `heartbeat_task`
- [ ] Each task is a stub (`async def ... : await asyncio.sleep(0)` loop) that compiles without error
- [ ] `firmware/retro/__init__.py` exists (can be empty)
- [ ] Module layout matches PRD §4.10 skeleton (empty files for `protocol.py`, `buttons.py`, `serial_io.py`, `display.py`, `hid.py`, `state.py`)
- [ ] No `time.sleep()` calls anywhere — every wait uses `await asyncio.sleep(...)`
- [ ] Device boots without dropping to REPL

### Implementation Notes
`boot.py` runs only at hard reset (power-cycle or RST button), not on soft-reload. This matters during development: after editing `code.py`, a soft-reload is enough; after editing `boot.py`, you must power-cycle. The asyncio module ships built-in with CircuitPython 8+ — do NOT add it to `lib/`. See PRD §4.2 and §4.7.

---

## Issue #3: Firmware — Button Scanner

**Labels:** firmware, protocol
**Depends on:** Issue #2
**Effort:** S

### What & Why
Implements the `button_scanner_task` using `keypad.Keys` for non-blocking, debounced edge detection. This is the primary input path — it produces the `button.press`, `button.hold`, and `button.release` events that drive everything else.

### Acceptance Criteria
- [ ] `firmware/retro/buttons.py` wraps `keypad.Keys` with the 8 GPIO pins from PRD §4.9 as a hardcoded constant
- [ ] `button_scanner_task` runs at ~100Hz and yields between polls (`await asyncio.sleep(0.01)`)
- [ ] Emits `press` event on leading edge; `release` event on trailing edge with `duration_ms`; `hold` event every 250ms after the first 500ms of held state
- [ ] Events include `id` (1–8, mapping from GPIO constant), `t` (`supervisor.ticks_ms()`), and `duration_ms` where applicable
- [ ] Events are placed onto an asyncio Queue that other tasks (serial_io, hid) can consume
- [ ] No `time.sleep()` in this module
- [ ] Pressing and releasing all 8 buttons in sequence produces 8 press + 8 release events without drops

### Implementation Notes
Use `keypad.Keys` (CircuitPython core module, not a library) — it handles debouncing internally so the task only needs to call `keys.events.get()` in a loop. The GPIO pins are GP20, GP19, GP18, GP17, GP11, GP12, GP13, GP14 for buttons 1–8 respectively (see PRD §4.9). `supervisor.ticks_ms()` is the timestamp source — not `time.monotonic()`. The hold-tick logic is in the scanner task, not in `keypad.Keys`.

---

## Issue #4: Firmware — Serial I/O (JSONL Framing + Handshake)

**Labels:** firmware, protocol
**Depends on:** Issue #2
**Effort:** M

### What & Why
Implements the JSONL read/write layer over `usb_cdc.data`, plus the `ready` handshake, `tick` heartbeat, `ping`/`pong`, `log`, and `error` message types. This is the protocol backbone — without it the host has no channel to or from the device.

### Acceptance Criteria
- [ ] `firmware/retro/serial_io.py` has a `serial_reader_task` that reads `usb_cdc.data` in a non-blocking loop, buffers bytes, splits on `\n`, and parses each line as JSON
- [ ] Lines longer than 1024 bytes are dropped with an `error` reply (`bad_json`, message explaining the drop)
- [ ] Unknown `type` values produce an `error` reply (`unknown_type`)
- [ ] Missing required fields produce an `error` reply (`bad_payload`)
- [ ] A write helper serializes any dict to `JSON.dumps(msg) + "\n"` and writes to `usb_cdc.data`
- [ ] On asyncio main start, firmware emits `{ "type": "ready", "protocol": 1, "app": "retro-deck", "buttons": 8, "display": { "w": 128, "h": 64 } }`
- [ ] `heartbeat_task` emits `{ "type": "tick", "t": <ticks_ms> }` every 5 seconds
- [ ] `ping` message is handled: replies immediately with `{ "type": "pong", "n": <echo>, "t": <ticks_ms> }`
- [ ] Received `hello` message is dispatched to an internal queue (consumed by bind and display subsystems in later issues)
- [ ] All errors are caught at task boundary — no unhandled exception crashes the firmware

### Implementation Notes
`usb_cdc.data` is the second serial endpoint (enabled by `boot.py`). In CircuitPython it behaves like a byte stream — use `.read(n)` with `in_waiting` to avoid blocking. The reader must be non-blocking: use `await asyncio.sleep(0)` inside the inner loop so other tasks get CPU time. The `ready` message is emitted once after `asyncio.gather` starts — not in `boot.py`. The full message catalogue is in PRD §9.

---

## Issue #5: Firmware — HID Emitter + Keypress Bindings

**Labels:** firmware, protocol
**Depends on:** Issue #3, Issue #4
**Effort:** S

### What & Why
Implements the `bind.set`, `bind.clear`, and `bind.clearAll` message handlers plus the HID emission logic. When a button with a `keypress` binding is pressed, the Pico fires the HID report immediately — no host round-trip — giving hardware-speed keystroke latency.

### Acceptance Criteria
- [ ] `firmware/retro/hid.py` maintains `keypress_bindings: dict[int, list[str]]` (button id → list of canonical Keycode names)
- [ ] `bind.set` message (`{ id, keys: [...] }`) populates the dict; unknown Keycode names reply with `error` (`bad_keycode`) naming the bad key, and the binding is rejected
- [ ] `bind.clear` removes the binding for a single button
- [ ] `bind.clearAll` clears the entire dict
- [ ] On a `button.press` event, if a binding exists for that button id, `Keyboard.send(*keycodes)` is called immediately, then keys are released after ~30ms
- [ ] Keycode names are resolved via `getattr(Keycode, name)` — validation at `bind.set` time prevents `AttributeError` at press time
- [ ] Buttons with no binding (or `bash`/`function`/`noop`) proceed normally — no HID emitted, event forwarded to serial_io for the host
- [ ] Both HID emission AND serial event forwarding happen for keypress buttons (host receives the event too)

### Implementation Notes
The host sends canonical names (e.g. `["CONTROL", "SHIFT", "R"]`) — the Pico only needs `getattr`. The alias table (mapping `ctrl` → `CONTROL`, etc.) lives on the host side (see PRD §6.4.1 and Issue #8/config loader). The Pico accepts only canonical names in `bind.set`. `adafruit_hid.keyboard.Keyboard` is already vendored in `lib/` from V1 — carry it forward unchanged.

---

## Issue #6: Firmware — OLED Display Renderer

**Labels:** firmware, protocol
**Depends on:** Issue #4
**Effort:** M

### What & Why
Implements the `display_render_task` and handlers for all `display.*` message types. The OLED shows the 3-zone layout (header / body / status) as instructed by the host — the Pico renders, never decides what to show.

### Acceptance Criteria
- [ ] `firmware/retro/display.py` manages a display state machine with three zones: header (line 1), body (lines 2–6), status (line 7)
- [ ] `display.layout` message renders: header = `message.header`, body = a 4×2 grid of 8 labels (buttons 1–4 top row, 5–8 bottom row), status = `message.status`
- [ ] Labels longer than 10 characters are truncated with `…`
- [ ] `display.toast` message replaces the body with the toast message in large font; after `ttl_ms` milliseconds, reverts to the last grid layout
- [ ] `display.status` updates only the status zone without disturbing the body
- [ ] `display.error` shows an inverted (white-on-black) error banner over the body until cleared
- [ ] `display.clearError` restores the body to the last grid layout
- [ ] Display updates are driven from the `display_render_task` which consumes a display state queue — no direct rendering in the serial reader task
- [ ] All rendering uses `terminalio.FONT` (built-in 6×8 monospace); no vendored text library required in v2.0
- [ ] The OLED shows a boot splash or blank on startup before the first `display.layout` from the host

### Implementation Notes
Use `displayio.Group` for scene management — swap the group's children rather than re-creating displays (mirrors the V1 `oled.py` `.pop()` pattern). The SSD1306 driver (`adafruit_displayio_ssd1306`) carries forward from V1. Toast TTL timing must use `supervisor.ticks_ms()` comparisons inside `display_render_task`'s loop, not `time.sleep()`. See PRD §4.5 for the 3-zone layout spec and §9.3 for all `display.*` message schemas.

---

## Issue #7: Host — Serial Port Manager

**Labels:** host-daemon, protocol
**Depends on:** none
**Effort:** M

### What & Why
Implements `host/src/serial/manager.ts` — the host-side serial connection lifecycle: device discovery, `ready` handshake, JSONL read/write loop, heartbeat stall detection, and auto-reconnect with backoff. This is the spine of the daemon — every other host module sends and receives via this manager.

### Acceptance Criteria
- [ ] Scans `/dev/ttyACM*` (and `/dev/serial/by-id/*` as a robustness pass); opens each non-busy candidate and listens for a `ready` line for up to 1500ms
- [ ] Accepts the first port that yields a valid `ready` with `protocol: 1` and `app: "retro-deck"`; ignores others
- [ ] Uses the `serialport` npm package (Node-compat in Bun); baud rate 115200 (ignored by USB CDC but required by the API)
- [ ] On receiving `ready`, emits `hello` (`{ "type": "hello", "protocol": 1 }`), then fires a `connected` event for other modules to hook
- [ ] Read loop buffers bytes, splits on `\n`, parses JSON, dispatches by `type` to registered handlers
- [ ] Write path serializes any object to `JSON.stringify(msg) + "\n"` and queues writes — never interleaves partial messages
- [ ] If no `tick` (or other message) is received for 15 seconds, closes the port and re-enters discovery
- [ ] On EOF or read error, backs off (250ms → 500ms → 1s → 2s → 5s max) and re-discovers
- [ ] On reconnect, fires `connected` event again (so other modules can re-push state)
- [ ] Malformed JSON lines: log error, emit `error` to device if possible, do not crash the read loop
- [ ] `manager.ts` exports a typed event emitter interface usable by `daemon.ts`

### Implementation Notes
The host does not send `ready` — it only listens for it from the Pico. The Pico always initiates. The 15-second stall threshold is 3 missed `tick` messages (tick period = 5s). Do not hard-code `/dev/ttyACM1` — it varies by enumeration order. The discovery window should try candidates serially (not in parallel) to avoid opening the REPL port. Full connect/reconnect sequence is in PRD §9.5.

---

## Issue #8: Host — Config Schema, Loader + Hot-Reload

**Labels:** config, host-daemon
**Depends on:** none
**Effort:** M

### What & Why
Implements the Zod schema (`host/src/config/schema.ts`), config loader (`loader.ts`), the keypress alias table, and hot-reload via `fs.watch`. This is the host's source of truth for user intent — every action dispatch and every profile switch flows through it.

### Acceptance Criteria
- [ ] Zod schema validates all fields from PRD §6.1–6.5, including: `version: 2`, at least one profile, all 8 button keys per profile, valid action types
- [ ] `keypress.key` parsing: lowercase, strip whitespace, split on `+`, map each token via the full alias table (PRD §6.4.1), validate each canonical name against the bundled Keycode name list
- [ ] Invalid canonical key name → schema validation error naming the bad token
- [ ] Config loaded from `~/.config/retro-deck/config.json` by default; overridable via `RETRO_DECK_CONFIG` env var
- [ ] On startup: read → validate → fail hard (exit non-zero) on invalid config
- [ ] `fs.watch` on the config file (debounced 250ms); on change: re-validate; if valid, swap in-memory config atomically and emit `configReloaded` event; if invalid, log error and keep previous config
- [ ] State persisted to `~/.local/share/retro-deck/state.json` (`{ activeProfile, lastUpdated }`); written atomically (write-tmp + rename) on every profile switch
- [ ] `state.json` read on startup to restore `activeProfile`; falls back to the first profile if absent or invalid
- [ ] First-run: if no `config.json` exists, copy `examples/config.example.json` to the user config dir
- [ ] TypeScript types derived from the Zod schema and exported from `types.ts`

### Implementation Notes
The keypress alias table is the full table in PRD §6.4.1 — implement it completely, not a subset. The "bundled Keycode name list" is a static `.ts` file generated from `adafruit_hid.keycode.Keycode` attribute names (can be hand-authored from the CircuitPython source; no runtime import needed). `function.module` paths are resolved relative to `dirname(configPath)`. See §6.5 for all validation rules and their failure modes.

---

## Issue #9: Host — Action Executor

**Labels:** host-daemon
**Depends on:** Issue #7, Issue #8
**Effort:** L

### What & Why
Implements `host/src/actions/executor.ts` — the dispatch logic for all action types (`keypress`, `bash`, `function`, `noop`) plus the per-button concurrency queue and timeout handling. This is where user intent becomes observable system behavior.

### Acceptance Criteria
- [ ] Listens to `button.release` events from the Serial Port Manager; determines short vs. long press using `duration_ms` and `config.device.longPressMs`
- [ ] Skips dispatch for `button.press` and `button.hold` (those are for live-state/SSE consumers only)
- [ ] `keypress` actions: log the event only — Pico has already fired HID. No host-side execution.
- [ ] `bash` actions: `Bun.spawn` with `bash -c <cmd>`, inheriting env plus `RETRO_DECK_BUTTON` and `RETRO_DECK_PROFILE`. Captures stdout/stderr to log. Status updates pushed to display controller every 1s during execution. Default timeout 30s (override per `action.timeoutMs`). On timeout: SIGTERM, then SIGKILL 5s later.
- [ ] `function` actions: `await import(absoluteModulePath)`, invoke default export with `ActionContext`. Module cached between presses; cache invalidated on config hot-reload or module file change. Return value `{ message }` used as success toast text.
- [ ] `noop` actions: emit a `✓ <button-label>` toast immediately.
- [ ] Per-button concurrency: at most 1 action in-flight + 1 queued per button. Further presses while both slots filled → "busy" toast and drop.
- [ ] Different buttons execute concurrently.
- [ ] `keypress` buttons never enter the concurrency queue.
- [ ] Success: `display.toast("✓ <action-name>", 1500)`; failure: `display.toast("✗ <error-summary>", 3000)`; timeout: `display.toast("✗ timeout", 3000)`.
- [ ] All stdout/stderr and errors logged to `~/.local/share/retro-deck/logs/`.

### Implementation Notes
For `function` hot-reload: use `fs.watch` on the module file path (resolved from config); on change, clear the cached module reference. The next press re-imports. One stale execution is acceptable if a press races the save — document this. For `bash`, the `cwd` default is `$HOME` (not the config dir). See PRD §5.4, §6.4.2, §6.4.3 for exact specs on each action type. The `ActionContext` type definition (PRD §6.4.3) must be exported for users writing `.ts` action modules.

---

## Issue #10: Host — Display Controller

**Labels:** host-daemon
**Depends on:** Issue #7
**Effort:** M

### What & Why
Implements `host/src/display/controller.ts` and `layouts.ts` — the component that owns "what should be on the OLED right now" and pushes the appropriate `display.*` messages to the Pico via the Serial Port Manager. Decoupled from action execution so any part of the system can request a toast or status update.

### Acceptance Criteria
- [ ] `DisplayController` accepts the current profile data and builds a `display.layout` message: `header` = profile label, `labels` = array of 8 button labels (in slot order 1–8), `status` = a status string
- [ ] On reconnect (`connected` event from Serial Port Manager): pushes `display.layout` and `display.status` to restore the Pico's display
- [ ] `toast(message, ttlMs?)` method: sends `display.toast` to the Pico
- [ ] `setStatus(message)` method: sends `display.status` to the Pico
- [ ] `showError(message)` / `clearError()`: sends `display.error` / `display.clearError`
- [ ] Labels longer than 10 chars are truncated to 9 chars + `…` before sending (host-side guard matching firmware behavior)
- [ ] After a profile switch, pushes updated `display.layout` within 100ms
- [ ] `DisplayController` exposes a simple event-based API so `ActionExecutor` can call `toast(...)` without importing Serial Port Manager directly

### Implementation Notes
The controller is a thin layer — it translates high-level intent ("show this profile") into protocol messages. It does not own a queue or retry logic; that's the Serial Port Manager's job. Profile label truncation on the host is a safety net — the Pico also truncates, but consistent behavior matters for the OLED preview in the config UI. See PRD §4.5 for the 3-zone layout and §9.3 for message schemas.

---

## Issue #11: Host — Profile Switch Logic

**Labels:** host-daemon
**Depends on:** Issue #8, Issue #9, Issue #10
**Effort:** S

### What & Why
Implements the profile cycling logic — detecting long-press on the configured `device.profileSwitchButton`, cycling through profiles in declaration order, persisting the new active profile, and pushing the full updated state to the Pico.

### Acceptance Criteria
- [ ] On `button.release` with `duration_ms >= config.device.longPressMs` and `id === config.device.profileSwitchButton`: treat as profile switch, not action dispatch
- [ ] Profile switching cycles through profiles in declaration order, wrapping at the end
- [ ] New active profile written to `state.json` atomically
- [ ] Full state push to Pico: `bind.clearAll` → `bind.set` for each keypress button in the new profile → `display.layout` with new profile labels → `display.toast("<new profile label>", 1500)`
- [ ] The switch button's short-press fires its configured action normally (no special handling)
- [ ] Profile switch completes within 100ms of the `release` event being received
- [ ] `POST /profiles/:name/activate` endpoint (see Issue #12) also routes through this same logic

### Implementation Notes
The `cycle` mode is the only mode required in v2.0. `menu` mode is deferred to v2.1 (PRD §6.3). The profile order for cycling is the key-insertion order of `config.profiles` (JSON object order — JavaScript preserves insertion order). The full bind push sequence matches the connect sequence from PRD §9.5.

---

## Issue #12: Host — HTTP API + SSE Stream

**Labels:** host-daemon
**Depends on:** Issue #8
**Effort:** M

### What & Why
Implements the HTTP control server (`host/src/http/server.ts`, `routes.ts`, `sse.ts`) binding on `127.0.0.1:7842`. This is the integration surface for the config UI and for external tools (Claude Code hooks, future integrations).

### Acceptance Criteria
- [ ] `Bun.serve` on `127.0.0.1:7842` (configurable via `config.http.host/port`)
- [ ] `GET /health` → `{ ok: true, connected: bool, activeProfile: string }`
- [ ] `GET /config` → current parsed config object
- [ ] `PUT /config` → replace config (validate, write to file, trigger hot-reload path); return 400 with validation errors on invalid input
- [ ] `GET /profiles` → array of `{ name, label }` objects
- [ ] `POST /profiles/:name/activate` → switch active profile; 404 if name not found
- [ ] `POST /buttons/:id/test` → trigger the action for button `id` in the active profile; 404 if id not in 1–8
- [ ] `GET /state` → `{ connected, activeProfile, lastEvent, lastError }`
- [ ] `GET /events` → SSE stream; emits events on button press/release/hold, profile switch, action result, connect/disconnect
- [ ] `POST /display/toast` → `{ message, ttl_ms? }` — push toast to OLED; return 202 immediately (non-blocking)
- [ ] `POST /display/prompt` → see Issue #17
- [ ] All endpoints return JSON; `Content-Type: application/json`
- [ ] Unrecognized routes → 404 JSON
- [ ] Server starts as part of daemon startup; port conflict → exit non-zero with clear message
- [ ] CORS headers set on all responses: `Access-Control-Allow-Origin: http://127.0.0.1:7843` (or `*` — localhost-only) so the config UI webapp can call the API from the browser

### Implementation Notes
The `/events` SSE stream is used by the config UI for live state sync — emit at minimum: `button-event`, `profile-changed`, `action-started`, `action-finished`, `device-connected`, `device-disconnected`. Bun has native SSE support via `Response` with a `ReadableStream`. The `/display/prompt` long-poll endpoint is in Issue #17 — wire the route stub here but the implementation lives there.

---

## Issue #13: Host — Daemon Entry Point + Lifecycle

**Labels:** host-daemon
**Depends on:** Issue #7, Issue #8, Issue #9, Issue #10, Issue #11, Issue #12
**Effort:** S

### What & Why
Implements `host/src/daemon.ts` — the entry point that wires all host modules together, manages startup sequencing, and handles SIGTERM/SIGINT for graceful shutdown. This is the final integration step that makes the daemon runnable as a single `bun run src/daemon.ts` command.

### Acceptance Criteria
- [ ] Startup sequence: load config → validate (exit non-zero on failure) → restore state → start HTTP server → start serial discovery
- [ ] On Pico `connected` event: push `bind.clearAll` + per-button `bind.set` + `display.layout` + `display.status("● ready")`
- [ ] Config hot-reload: on `configReloaded` event, re-push active profile state to Pico and emit a toast `config reloaded`
- [ ] On SIGTERM or SIGINT: send `display.toast("daemon stopped", 1500)`, wait 1.5s, close serial port cleanly, save state, exit 0
- [ ] Logs to stdout in a structured format (JSON lines or human-readable with timestamps); no file logging required at daemon entry level (action executor handles its own log file)
- [ ] Exits non-zero on fatal errors (invalid config, port conflict); exit code and message surfaced clearly
- [ ] `package.json` includes `"start": "bun run src/daemon.ts"` and `"dev": "bun --watch run src/daemon.ts"`
- [ ] 12-factor: foreground-by-default, all config via env/file, log to stdout

### Implementation Notes
The `--watch` dev mode is Bun's built-in hot-restart on file change — useful during development but should not be the production run mode (use a systemd user service). A sample `retro-deckd.service` unit file can be added to `examples/` but is not required for this issue. See PRD §5.2 for the full lifecycle spec.

---

## Issue #14: Config UI — Vite/React Scaffold + Live State Panel

**Labels:** config-ui
**Depends on:** Issue #12
**Effort:** M

### What & Why
Scaffolds the configuration webapp using **Bun.serve() + React — Tier 3A** per the project web stack standard (no Vite, no build step, dev = prod). Served on `127.0.0.1:7843`. Implements the live device state panel (connection status, active profile, recent button events) via SSE. This is the foundation the profile editor and OLED preview build on.

### Acceptance Criteria
- [ ] `Bun.serve()` + React project in `host/ui/` — no Vite, no `dist/` directory, no build step
- [ ] `host/ui/server.ts`: `Bun.serve({ routes: { "/": index }, development: { hmr: true } })` on `127.0.0.1:7843`
- [ ] `host/ui/index.html` loads `src/frontend.tsx` via `<script type="module">`; Bun bundles on the fly
- [ ] `package.json` adds `"ui": "bun run host/ui/server.ts"` — no `"ui:build"` script needed
- [ ] App connects to daemon `GET /events` SSE stream on load; reconnects automatically on disconnect
- [ ] Live state panel shows: device connected/disconnected indicator, active profile name, last 5 button events (id, type, timestamp)
- [ ] On device disconnect, the panel shows a "device disconnected" state (not an error crash)
- [ ] `GET /health` polled every 10s as a connectivity check; stale SSE connection detected via a 30s no-event timeout
- [ ] Two-pane layout: left sidebar = profile list with Activate buttons; right main area = profile editor (stub for Issue #15) + OLED preview (stub for Issue #16)
- [ ] App routes: `/` (root renders sidebar + default/active profile editor area), `/profiles/:name` (selects a profile in the editor)
- [ ] TanStack Query used for all REST data fetching against daemon API on port 7842

### Implementation Notes
Tier 3A: the UI has no own API — it only calls the daemon on port 7842. The daemon HTTP server (Issue #12) must set `Access-Control-Allow-Origin: http://127.0.0.1:7843` (or `*`). No Vite proxy, no build artifacts, no separate dev server. Bun's HMR (`development: { hmr: true }`) covers hot reload in dev. Use `EventSource` for SSE, TanStack Query for REST calls. Keep dep footprint minimal: React, TanStack Query, a router if needed.

---

## Issue #15: Config UI — Profile Editor (All Action Types)

**Labels:** config-ui
**Depends on:** Issue #14
**Effort:** L

### What & Why
Implements the core editing experience: browsing profiles, viewing and editing all 8 button slots per profile, with the right form for each action type — including the keypress capture affordance that motivated the webapp choice.

### Acceptance Criteria
- [ ] Profile list sidebar: shows all profiles with their labels; "Activate" button per profile (calls `POST /profiles/:name/activate`, SSE confirms switch); clicking a profile loads its 8-slot editor in the main area
- [ ] Profile editor main area: 8-slot button grid, each slot shows its label + action type badge; selecting a slot opens an inline editor panel
- [ ] Slot editor panel: editable label field; action type selector (keypress / bash / function / noop)
- [ ] `keypress` form: "Press keys" capture target (listens to `keydown` with modifiers — Ctrl, Shift, Alt, Meta); updates the `key` string in canonical `ctrl+shift+r` form; manual text entry fallback
- [ ] `bash` form: `cmd` text input, optional `cwd` and `timeoutMs` fields
- [ ] `function` form: `module` path input (relative to config file dir), optional `export` field
- [ ] `noop`: a single toggle / radio to select it (no additional fields)
- [ ] Inline validation: error messages shown per-field before save (e.g. unknown keycode, empty cmd)
- [ ] Changes are local until "Save" (Issue #16) — no auto-save

### Implementation Notes
The keypress capture is the primary reason for choosing webapp over TUI (PRD §7.2). The `keydown` handler needs to suppress browser defaults for the captured modifiers (`e.preventDefault()`) and should show a "recording" state. Map captured `e.key` / `e.code` + modifier flags to the alias table from PRD §6.4.1 to build the `key` string. Validation logic can mirror the daemon's Zod schema — consider sharing a `schema.ts` by importing it in the Vite build if the path resolution is clean.

---

## Issue #16: Config UI — OLED Preview + Test/Save Integration

**Labels:** config-ui
**Depends on:** Issue #14, Issue #15
**Effort:** M

### What & Why
Adds the OLED simulator preview pane (128×64 SSD1306-look CSS component showing what the current profile looks like on the device) and the "Test" button per slot plus the global "Save" flow with validation feedback.

### Acceptance Criteria
- [ ] OLED preview component: a 128×64px CSS-rendered "display" styled to look like an SSD1306 (dark bg, monochrome text); shows the 3-zone layout (header = profile label, body = 4×2 button grid, status line)
- [ ] Preview reflects live device state by default: header/labels/status mirror what the Pico is currently showing, sourced from SSE events (`display-layout`, `display-toast`, `display-status`)
- [ ] While the user is editing labels in the profile editor, the preview switches to "edit preview" mode — showing the locally-edited labels instead of live device state; reverts to live state on Save or Cancel
- [ ] Labels > 10 chars are shown truncated in the preview (matching firmware truncation)
- [ ] "Test" button per slot: calls `POST /buttons/:id/test`; shows a spinner while in-flight; shows success/error result
- [ ] "Save" button: collects the full edited config, calls `PUT /config`, shows validation errors inline on failure, shows a success toast on 200
- [ ] "Activate" button on profile list page works correctly (calls `POST /profiles/:name/activate`; SSE updates the live state panel)
- [ ] If the daemon returns a validation error on `PUT /config`, the specific field(s) are highlighted in the editor (not just a global error message)

### Implementation Notes
The OLED preview is a fixed-size `<div>` with a pixel-grid-like appearance — use CSS `font-family: monospace`, dark background, phosphor-green or white text, 128×64 aspect ratio. The label grid is 4 columns × 2 rows using CSS grid; truncate labels at 10 chars + `…` to match PRD §4.5. The "Test" call goes directly to the daemon API — it does not go through the firmware serial path, it's a daemon-level action trigger.

---

## Issue #17: Claude Code Hook Integration (/display/prompt)

**Labels:** host-daemon
**Depends on:** Issue #12
**Effort:** S

### What & Why
Implements the `POST /display/prompt` long-poll endpoint, which is the core Claude Code integration primitive: a hook can POST a prompt (with per-button option labels), block until the user presses one of the listed buttons, and receive back the chosen option — enabling the deck as an approval surface for agent workflows.

### Acceptance Criteria
- [ ] `POST /display/prompt` accepts `{ message: string, options: [{button: number, label: string}], timeout_ms?: number }`
- [ ] Pushes `display.layout` with per-slot labels overridden to show the option labels (other slots show blank or their normal label)
- [ ] Blocks (long-poll) until: one of the listed button ids is pressed (short-press), OR `timeout_ms` elapses (default 15000ms)
- [ ] On button press: returns `{ chosen: "<label>" }` (the label string, not the button id)
- [ ] On timeout: returns `{ chosen: null }`
- [ ] Restores the normal profile `display.layout` after resolution (whether pressed or timed out)
- [ ] Only one `/display/prompt` can be active at a time; a second call while one is pending returns 409 with `{ error: "prompt already active" }`
- [ ] `POST /display/toast` remains non-blocking (returns 202 immediately) — unchanged by this issue
- [ ] An example Claude Code hook config (the snippet from PRD §5.8) is documented in `examples/claude-hook.json`

### Implementation Notes
This endpoint is designed to be called by `curl` from a Claude Code hook command (see PRD §5.8 for the exact example). The long-poll approach means the HTTP connection stays open until resolved — Bun handles this well with `async` route handlers. The `/display/prompt` flow temporarily overrides the OLED display — make sure to restore it cleanly even if the daemon receives SIGTERM during the wait. The daemon does not need to know about Claude Code specifically; the integration is pure HTTP.

---

*End of V2_ISSUES.md*
