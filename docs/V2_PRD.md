# Retro Deck V2 — Product Requirements Document

> **Status:** Draft v1
> **Audience:** Implementation team, issues writer, future maintainers
> **Source of truth for V1 state:** `V2_REWRITE_ANALYSIS.md`
> **Owner:** rld

---

## 1. Overview

Retro Deck V2 is a ground-up rewrite of the firmware, host integration, and configuration tooling for an 8-key + OLED USB macro pad built on a Raspberry Pi Pico (RP2040, CircuitPython). V1 is a self-contained HID emitter: every button is wired in Python to a hardcoded keystroke, and the host has no idea the device exists beyond stock USB descriptors. V2 inverts that relationship.

In V2, the **host owns the brains** and the **Pico is a thin I/O peripheral**:

- The Pico reports raw button events (press / hold / release with durations) and renders whatever the host tells it to render on the OLED.
- A host-side **Bun/TypeScript daemon** owns the config, dispatches actions, drives the OLED, and exposes hooks (e.g. for Claude Code) that other processes can call.
- A **configuration UI** edits the config live, and the daemon hot-reloads it.
- Three distinct **action types** are supported per button: `keypress` (Pico emits HID directly), `bash` (host shell command), and `function` (host TypeScript module imported and invoked).
- **Profiles** are infinite, named, and stored on the host. Switching is host-driven, with a configurable on-device gesture (default: long-press a designated button).

The result: any new behaviour — a deploy command, an "approve PR" hotkey, a Claude Code "yes/no" prompt, a new profile for a different app — is a config edit on the host, not a firmware re-flash.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| # | Goal | Why it matters |
|---|------|----------------|
| G1 | Two-way structured comms over USB CDC between Pico and host | Unblocks every other goal |
| G2 | Host-owned config, hot-reloadable, no firmware edits to add/change actions | Configuration is a TypeScript/JSON workflow, not a CircuitPython workflow |
| G3 | Three action types: `keypress`, `bash`, `function` | Covers the realistic action surface (HID, shell, custom TS logic) |
| G4 | Infinite named profiles with host-driven switching | Removes V1's hardcoded 3-profile / IndexError limit |
| G5 | Host pushes display content; OLED shows current profile + per-button labels | The user can read what each button does without pressing it |
| G6 | Non-blocking firmware loop (asyncio) — concurrent button + serial + display | No more `time.sleep(1.5)` stalling the entire device |
| G7 | Persistent active profile across reboots (host-side) | Reboot resumes where you left off |
| G8 | Configuration UI (TUI or webapp) showing all profiles, all 8 slots, live device state | Editing JSON by hand is fine but not the primary workflow |
| G9 | Deploy tooling for fast firmware iteration (CIRCUITPY mount/rsync/unmount) | A code-edit/test cycle of seconds, not minutes |
| G10 | Graceful error reporting from device to host (and to user via OLED) | Replace V1's silent drop-to-REPL on exceptions |
| G11 | Claude Code hook integration via HTTP endpoints on the daemon | Use the deck as an approval surface for agent prompts |

### 2.2 Non-Goals

| # | Non-goal | Reason |
|---|----------|--------|
| NG1 | WiFi / Bluetooth / network comms from the Pico | Hardware is base Pico (no W). USB is sufficient. |
| NG2 | Multi-host / multi-device pairing | One Pico, one host. Identity disambiguation deferred. |
| NG3 | Per-key RGB or per-key LCD | Hardware is monochrome SSD1306 OLED + plain switches. |
| NG4 | Cross-OS support beyond Linux | Owner runs Linux (Arch/Omarchy). macOS/Windows untested in V2. |
| NG5 | Encryption / authentication on the serial channel | USB-attached peripheral on a single-user machine. |
| NG6 | Replacing CircuitPython with MicroPython or bare-metal | CircuitPython is intentionally chosen for iteration speed. |
| NG7 | Backwards compatibility with V1 profiles or `mappings.json` schema | Clean break. V1 is removed. |
| NG8 | OTA firmware updates over USB CDC | Deploy is a host-side rsync to CIRCUITPY mount. |
| NG9 | Mouse / consumer-control HID in v2.0 | Bundled libs exist; deferred to v2.1+. |

### 2.3 Success Criteria

- A new action can be added by editing a single JSON file on the host and saving — no firmware reflash, no daemon restart.
- A new profile can be added the same way.
- The OLED shows the active profile name persistently and updates within 100ms of a profile switch.
- All 8 buttons work for press, hold (with duration), and release events. No button gesture crashes the firmware.
- The daemon survives Pico unplug/replug without a manual restart.
- `bun run deploy` syncs firmware to the device in under 10 seconds.

---

## 3. System Architecture

### 3.1 ASCII Diagram

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                              HOST (Linux)                            │
 │                                                                      │
 │   ┌──────────────────┐     ┌────────────────────┐    ┌─────────────┐ │
 │   │   Config UI      │     │   retro-deckd      │    │  Claude     │ │
 │   │   (TUI/webapp)   │◄───►│  (Bun/TS daemon)   │◄──►│  Code /     │ │
 │   │                  │ HTTP│                    │HTTP│  external   │ │
 │   │  - profile list  │     │  ┌──────────────┐  │    │  tools      │ │
 │   │  - 8 slots/prof  │     │  │ ConfigStore  │  │    └─────────────┘ │
 │   │  - live state    │     │  │ (JSON, hot-  │  │                    │
 │   │  - test buttons  │     │  │  reloaded)   │  │                    │
 │   └──────────────────┘     │  └──────┬───────┘  │                    │
 │                            │         │          │                    │
 │   ┌──────────────────┐     │  ┌──────▼───────┐  │                    │
 │   │ ~/.config/       │◄───►│  │ ActionExec   │  │                    │
 │   │ retro-deck/      │ R/W │  │ (keypress/   │  │                    │
 │   │   config.json    │     │  │  bash/fn)    │  │                    │
 │   │ ~/.local/share/  │     │  └──────┬───────┘  │                    │
 │   │ retro-deck/      │     │         │          │                    │
 │   │   state.json     │     │         │          │                    │
 │   └──────────────────┘     │         │          │                    │
 │                            │  ┌──────▼───────┐  │                    │
 │                            │  │ SerialMgr    │  │                    │
 │                            │  │ (CDC, JSONL) │  │                    │
 │                            │  └──────┬───────┘  │                    │
 │                            └─────────┼──────────┘                    │
 │                                      │ /dev/ttyACM1                  │
 └──────────────────────────────────────┼───────────────────────────────┘
                                        │ (USB CDC + USB HID, same cable)
 ┌──────────────────────────────────────┼───────────────────────────────┐
 │                              DEVICE  │ (Pi Pico, CircuitPython)      │
 │                                      │                               │
 │                   ┌──────────────────▼───────────┐                   │
 │                   │       code.py (asyncio)      │                   │
 │                   │                              │                   │
 │  ┌─────────────┐  │  ┌────────────────────────┐  │  ┌─────────────┐  │
 │  │ 8 switches  ├─►│  │ ButtonScanner (keypad) ├──┼─►│ usb_cdc.data│  │
 │  │ GP20,19,18, │  │  └────────────────────────┘  │  │ (events out)│  │
 │  │ 17,11,12,   │  │                              │  └─────────────┘  │
 │  │ 13,14       │  │  ┌────────────────────────┐  │                   │
 │  └─────────────┘  │  │ SerialReader (cmds in) ◄──┼──┐                │
 │                   │  └──────────┬─────────────┘  │  │                │
 │  ┌─────────────┐  │             │                │  │                │
 │  │ SSD1306     │◄─┼──┌──────────▼─────────────┐  │  │                │
 │  │ OLED 128x64 │  │  │ DisplayRenderer        │  │  │                │
 │  │ I2C GP0/1   │  │  └────────────────────────┘  │  │                │
 │  └─────────────┘  │                              │  │                │
 │                   │  ┌────────────────────────┐  │  │                │
 │  ┌─────────────┐  │  │ HIDEmitter (Keyboard)  │◄─┼──┘                │
 │  │ USB HID     │◄─┼──┤ for "keypress" actions │  │                   │
 │  └─────────────┘  │  └────────────────────────┘  │                   │
 │                   └──────────────────────────────┘                   │
 └──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Roles at a glance

| Layer | Owns | Does NOT own |
|-------|------|--------------|
| **Pico firmware** | Button scanning, HID emission for `keypress` actions, OLED rendering, serial framing | Action dispatch, profiles, action semantics, what to show |
| **Host daemon** | Config, profiles, action execution (`bash`/`function`), display content decisions, persistence, external HTTP integrations | Raw button electricals, HID emission for keypress (Pico does this directly to reduce latency), OLED pixel drawing |
| **Config UI** | Editing experience, validation, "test" affordances | Live action execution (delegates to daemon), serial comms |

### 3.3 Why the Pico emits keypress HID directly (not via the host)

For `keypress` actions, the Pico has the HID device on the same USB connection and can emit a keystroke immediately on button press without a host round-trip. The action **type** is configured on the host, but for `keypress` actions the **actual keys** are pushed to the Pico (via a `bind` message — see §9) so it can fire them with zero host involvement during the press. This keeps `keypress` latency at hardware speed and avoids a "host crashed → keys don't work" failure mode for the most common action type.

`bash` and `function` actions go through the host because they have to.

---

## 4. Component 1: Pico Firmware (CircuitPython)

### 4.1 Responsibilities

The Pico firmware is intentionally minimal:

1. Scan 8 buttons; emit press / hold-tick / release events with millisecond timestamps over USB CDC.
2. Render OLED content as instructed by the host (header, per-button labels, transient toasts, error banners).
3. Emit USB HID keystrokes for buttons that have been bound to a `keypress` action by the host.
4. Maintain a small in-memory cache of: current profile name, per-button labels, per-button keypress bindings.
5. On boot, send a `ready` handshake and wait for the host to push initial state.
6. Surface fatal errors as a banner on the OLED *before* dropping to REPL.

The firmware does **not** know:

- What profiles exist (only the currently active one's labels and bindings).
- What `bash` or `function` actions exist (those are entirely host-side).
- How to switch profiles by itself (it sends a "long-press" event; the host decides what that means).

### 4.2 boot.py requirements

`boot.py` must enable USB CDC data channel (the second serial endpoint):

```python
# boot.py
import usb_cdc
usb_cdc.enable(console=True, data=True)  # data=True enables /dev/ttyACM1
```

**Notes:**
- `console=True` keeps the REPL on `/dev/ttyACM0` so we can still debug via Mu/Thonny/screen.
- `data=True` adds the second endpoint at `/dev/ttyACM1` — this is the channel used by the host daemon. *(Exact device path may vary by enumeration order; the host daemon must auto-discover via VID/PID or by trying `/dev/ttyACM*` and looking for the `ready` handshake.)*
- `boot.py` runs at hard reset and is what configures USB endpoints (which can only be set up before USB enumeration). Soft reload does not re-run it.

### 4.3 Serial Protocol (overview, full spec in §9)

- **Transport:** USB CDC, `usb_cdc.data` endpoint (`/dev/ttyACM1`).
- **Encoding:** UTF-8.
- **Framing:** newline-delimited JSON (JSONL). Each message is a single-line JSON object terminated by `\n`. Values must be valid JSON — embedded newlines inside string values are JSON-escaped (`\n`) per the spec; the line delimiter is the literal byte `0x0A` outside any string token.
- **Direction tags:** Each message has a `type` field. Pico→Host messages are reactive/eventy; Host→Pico messages are imperative/setter-y.
- **Versioning:** A `protocol` field is sent only in the `ready` and `hello` handshake messages (see §9). All other messages omit it; both sides assume the version handshake.

### 4.4 Button event model

Three event types are emitted per button, all reaching the host:

| Event | When | Payload |
|-------|------|---------|
| `press` | Edge: button transitions from released to pressed | `{ id, t }` |
| `hold` | Every 250ms while held, after the first 500ms | `{ id, t, duration_ms }` |
| `release` | Edge: button transitions from pressed to released | `{ id, t, duration_ms }` |

- `id`: 1–8, the logical button index (post-mapping, see §6.2).
- `t`: monotonic milliseconds since Pico boot (`supervisor.ticks_ms()`).
- `duration_ms`: total time held so far (for `hold`) or total time pressed (for `release`).

**Press semantics on the host:**
- A *short press* is a `press` followed by a `release` with `duration_ms < long_press_ms` (default 1500ms; configurable).
- A *long press* is a `release` with `duration_ms >= long_press_ms` (or, equivalently, the host can act on the first `hold` event whose `duration_ms` crosses the threshold for instant feedback).
- The host owns the threshold; the Pico just streams raw events.

**Implementation:** Use CircuitPython's `keypad.Keys` for non-blocking, debounced edge detection. Run the scanner inside an asyncio task at ~100Hz tick (the library does its own debouncing).

### 4.5 OLED rendering model

The OLED has three render zones:

```
 ┌──────────────────────────────┐
 │ HEADER       (line 1, small) │   ← profile name, e.g. "OBS"
 ├──────────────────────────────┤
 │                              │
 │   BODY      (lines 2–6)      │   ← 8 button labels in a 4x2 grid,
 │                              │     OR transient toast,
 │                              │     OR error banner (overrides body)
 │                              │
 ├──────────────────────────────┤
 │ STATUS  (line 7, small)      │   ← e.g. "● ready"  /  "● running…"
 └──────────────────────────────┘
```

- Default body: a 4×2 grid of button labels (buttons 1–4 top row, 5–8 bottom row). Labels truncated to fit.
- Toast: a transient large-font centred message after a press (configurable TTL, default 1500ms), then revert to grid.
- Error banner: full-body inverted (white-on-black) message with the most recent error, until cleared by host or auto-dismissed after `display.errorTtlMs`.

The host pushes content via `display.set_layout`, `display.toast`, `display.error`, `display.clear_error` messages (see §9). The Pico does no semantic decision-making about display state; it renders what it's told.

**Font:** `terminalio.FONT` (built-in 6×8 monospace) for v2.0. If labels need to be longer than ~10 chars per cell, v2.1 can vendor `adafruit_display_text` source `.py` and add scrolling — but v2.0 truncates with an ellipsis.

### 4.6 HID for keypress actions

- The Pico keeps a dict `keypress_bindings: dict[int, list[str]]` — button id → list of keycode names (e.g. `["CONTROL", "SHIFT", "R"]`).
- This dict is populated on profile-load by a `bind.set` message from the host.
- On a `press` event, the Pico checks the dict and (if a binding exists) emits the HID report immediately, then releases the keys after a short delay (~30ms) — simulating a tap.
- Only `keypress` actions populate the dict. `bash` and `function` actions do not — those buttons send their event to the host and let the host do the work.
- The Pico still emits the `press`/`release` events to the host even if it fires a HID report locally — the host is the system of record for "what just happened."

**Keycode parsing:** The host sends keys as a list of canonical names (e.g. `["CONTROL", "SHIFT", "F5"]`). The Pico maps these to `adafruit_hid.keycode.Keycode` attributes by `getattr`. Unknown names cause the binding to be rejected with an `error` reply naming the bad key.

### 4.7 asyncio loop design

CircuitPython 8+ ships with `asyncio`. The main loop is a small set of cooperating tasks:

```python
async def main():
    await asyncio.gather(
        button_scanner_task(),     # keypad.Keys → emit events
        serial_reader_task(),      # usb_cdc.data → parse JSON → dispatch
        display_render_task(),     # subscribe to display state changes
        heartbeat_task(),          # emit a "tick" every 5s for liveness
    )
```

- Tasks communicate via `asyncio.Queue` instances.
- The serial reader is a pure router: it parses a line, validates `type`, and pushes onto the appropriate queue (display queue / bindings queue / etc.).
- No `time.sleep()` anywhere — every wait is `await asyncio.sleep(...)`.
- Errors caught at task boundary and reported to host via an `error` message; firmware does not crash.

### 4.8 Persistence on the Pico

- **None.** The Pico does not remember the active profile, last action, or anything else across reboots.
- The host pushes the full state on every connect (`hello` from the host, in response to the Pico's `ready`).
- This keeps the Pico stateless and the host as single source of truth.

### 4.9 GPIO mapping

Hardware pin assignments are unchanged from V1:

| Button id | GPIO |
|-----------|------|
| 1 | GP20 |
| 2 | GP19 |
| 3 | GP18 |
| 4 | GP17 |
| 5 | GP11 |
| 6 | GP12 |
| 7 | GP13 |
| 8 | GP14 |

OLED I2C: SDA=GP0, SCL=GP1, address `0x3C`.

The pin-to-button map is hardcoded in firmware as a constant. Remapping is not a runtime feature in v2.0 (V1's `mappings.json` is removed) — if a re-wire happens, edit the constant and reflash. Rationale: the case is 3D-printed and the wiring is fixed.

### 4.10 Module structure (target)

```
firmware/
  boot.py                    # enable usb_cdc.data
  code.py                    # asyncio main, glue
  retro/
    __init__.py
    protocol.py              # JSON message dataclasses, serializer/parser
    buttons.py               # keypad.Keys wrapper, event emission
    serial_io.py             # usb_cdc.data read/write tasks
    display.py               # OLED state machine + render
    hid.py                   # keypress binding store + emit
    state.py                 # in-memory state (current profile name, labels, bindings)
  lib/
    adafruit_hid/            # carry forward from V1
    adafruit_displayio_ssd1306.py
    adafruit_display_text/   # carry forward (still .mpy unless we vendor)
    # asyncio is built into CircuitPython 8+ — do NOT vendor it
```

---

## 5. Component 2: Host Daemon (Bun/TypeScript)

### 5.1 Responsibilities

The daemon (working name: `retro-deckd`) is a long-running Bun process that:

1. Discovers and connects to the Pico via USB CDC.
2. Loads the user's config from `~/.config/retro-deck/config.json`.
3. Tracks the active profile (persisted in `~/.config/retro-deck/state.json`).
4. On Pico `ready`: pushes the active profile's labels, key bindings, and display content.
5. On button events: looks up the action for that button in the active profile and executes it.
6. Hot-reloads config when the file changes on disk.
7. Exposes an HTTP control API (localhost) for the config UI and external integrations.
8. Handles Pico unplug/replug gracefully (auto-reconnect with backoff).
9. Logs structured events to a rotating log file in `~/.local/share/retro-deck/logs/`.

### 5.2 Process lifecycle

- **Startup:** read config → validate → discover serial port → connect → wait for `ready` → push initial state → enter event loop.
- **Shutdown:** on SIGTERM/SIGINT, send a final `display.toast` ("daemon stopped"), close the serial port cleanly, save state, exit.
- **Run mode:** intended to be run as a systemd user service (`retro-deckd.service`) for `omarchy-desktop`. The PRD does not mandate the unit file, but the daemon must be 12-factor-friendly: foreground-by-default, log to stdout, exit non-zero on fatal error.

### 5.3 Serial Port Manager

- **Discovery:** scan `/dev/ttyACM*` (and `/dev/serial/by-id/*` as a robustness pass), open each non-busy candidate, and **listen for an incoming `ready` line** for up to 1500ms. The Pico emits `ready` on its own at boot; the host does not provoke it. The first port that yields a valid `ready` with the expected `protocol` and `app: "retro-deck"` wins. If no candidate emits a `ready` within the window, the daemon backs off and rescans (the Pico may be mid-reset). After connect, the host replies with `hello` (see §9.5).
- **Connect:** open the port via the [`serialport`](https://serialport.io/) npm package (Bun has working Node-compat for it). USB CDC ignores baud; pick any value (e.g. 115200). Configure for non-blocking reads.
- **Read loop:** buffer incoming bytes; split on `\n`; parse each line as JSON; dispatch by `type`.
- **Write:** every outbound message is `JSON.stringify(msg) + "\n"`. Writes are queued per-connection; never interleave half-messages.
- **Reconnect:** if the read loop sees EOF or an error (Pico unplugged), back off (250ms → 500ms → 1s → 2s, max 5s) and re-discover. On re-connect, re-push the full active state.

### 5.4 Action Executor

The daemon listens to **all** button event types (`press`, `hold`, `release`) but only takes action-dispatch decisions on `release`. `press` and `hold` are used for live state (e.g. SSE clients showing "button 3 down") and for early long-press feedback (the daemon may show a toast as soon as the first `hold` event crosses the threshold, without waiting for `release`). Note that for `keypress` actions, the **Pico** has already fired the HID at `press` time independently — the host's dispatch path is unrelated to that.

For each `release` event, the daemon:

1. Determines if it was a short or long press (using `duration_ms` and the configured threshold).
2. Looks up the action in `config.profiles[active].buttons[id]`.
3. For long-press on the configured *profile-switch button*, cycles or selects a profile (see §6.3) instead of executing the action.
4. Otherwise, dispatches by `action.type`:

| `action.type` | Behaviour |
|---------------|-----------|
| `keypress` | **No host-side execution.** The Pico already fired the HID at `press` time. The host does not enter the per-button concurrency queue for keypress actions — it only logs the event and updates the OLED status to "● done". |
| `bash` | `Bun.spawn` the command in a shell. stdout/stderr captured to log. Status updates pushed to OLED: `running…` → `done` / `error: <stderr-tail>`. Exit code surfaced. Default working dir: `$HOME`. Override per-action via `action.cwd` (see §6.4.2). Default timeout: 30s (override via `action.timeoutMs`). |
| `function` | Dynamically `await import(modulePath)` — module must export a default async function `(ctx) => Promise<void \| {message?: string}>`. `ctx` provides logging, OLED toast, and access to env. Module is cached; hot-reload invalidates the cache. |
| `noop` | No execution; emits a `✓ <label>` toast for user feedback. |

**Concurrency:** `bash` and `function` actions execute in order per button (no overlap — a second press while the first action is still running is queued, capped at 1 queued event; further presses dropped with a "busy" toast). `keypress` actions never enter this queue. Different buttons run concurrently.

**Action timeout handling:** on timeout, send SIGTERM to the action's process; SIGKILL 5s later if still alive. Display a `✗ timeout` toast and log the killed action.

**Action result reporting:**
- Success: `display.toast("✓ <action-name>")` for 1500ms.
- Failure: `display.toast("✗ <error-summary>")` for 3000ms, plus full error logged.

### 5.5 Config loader + hot-reload

- Source: `~/.config/retro-deck/config.json` (XDG-compliant).
- On startup: read, parse, validate against schema (§6). Fail hard on invalid config (log the error, exit non-zero) — invalid config is a user error, not a runtime exception.
- Hot-reload: watch the file with [`fs.watch`](https://nodejs.org/api/fs.html#fswatchfilename-options-listener) (debounced 250ms). On change: re-validate; if valid, swap the in-memory config atomically and re-push the active profile to the Pico. If invalid, log error and *keep the previous config running* — do not crash.
- A successful hot-reload pushes a brief OLED toast: `config reloaded`.

### 5.6 Persistence

- `~/.config/retro-deck/config.json` — user-edited config (read-only from daemon's perspective, except via the config UI's HTTP API which writes through the daemon to the file).
- `~/.local/share/retro-deck/state.json` — daemon-managed runtime state. Schema:
  ```json
  { "activeProfile": "obs", "lastUpdated": "2026-05-09T12:34:56Z" }
  ```
- State is written on every profile switch, atomically (`write-tmp + rename`).

### 5.7 HTTP control API

The daemon binds an HTTP server on `127.0.0.1:7842` (configurable). All endpoints are JSON.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | `{ ok: true, connected: bool, activeProfile: string }` |
| `GET` | `/config` | Current parsed config |
| `PUT` | `/config` | Replace config (writes to file → triggers hot-reload). Body: full config JSON. |
| `GET` | `/profiles` | List of profile names |
| `POST` | `/profiles/:name/activate` | Switch to a named profile |
| `POST` | `/buttons/:id/test` | Trigger button `id`'s action manually (for the config UI's "test" button) |
| `GET` | `/state` | Snapshot of in-memory state: connected, active profile, last events, last error |
| `GET` | `/events` | Server-Sent Events stream of button events + state changes (for live UI) |
| `POST` | `/display/toast` | `{ message, ttl_ms? }` — push a toast to the OLED. Used by Claude Code hooks. |
| `POST` | `/display/prompt` | `{ message, options: [{button, label}], timeout_ms? }` — show a prompt with per-button labels; resolve when the user presses one of the listed buttons or the timeout elapses. Used by Claude Code "approve / deny" workflows. Returns `{ chosen: string \| null }`. |

The config UI consumes this API. So can any other tool — Claude Code hooks call `/display/toast` and `/display/prompt`.

### 5.8 Claude Code hook integration

Claude Code hooks (configured in user settings) can shell out to `curl http://127.0.0.1:7842/display/...`. The daemon must:

- Make `/display/toast` non-blocking, returning 202 immediately.
- Make `/display/prompt` blocking (long-poll) up to the timeout, suitable for use as a hook that gates the next agent action.
- Accept basic-auth-free localhost-only connections in v2.0; revisit if the daemon ever binds to a non-loopback address.

**Reference hook example** (`~/.claude/settings.json`):

```json
{
  "hooks": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "curl -s -X POST http://127.0.0.1:7842/display/prompt -H 'Content-Type: application/json' -d '{\"message\":\"Run bash?\",\"options\":[{\"button\":1,\"label\":\"yes\"},{\"button\":8,\"label\":\"no\"}],\"timeout_ms\":15000}' | jq -r 'if .chosen==\"yes\" then \"\" else \"deny\" end'"
        }
      ]
    }
  ]
}
```

The daemon doesn't need to know about Claude Code specifically — the integration is just HTTP.

### 5.9 Module structure (target)

```
host/
  package.json              # Bun project
  bunfig.toml
  src/
    daemon.ts               # entry point: starts everything
    config/
      schema.ts             # zod schema + validator
      loader.ts             # read/parse/watch
      types.ts              # TS types derived from schema
    serial/
      manager.ts            # discovery + connect + reconnect
      protocol.ts           # JSON message types (mirror firmware/retro/protocol.py)
    actions/
      executor.ts           # dispatch by action.type
      keypress.ts           # logging only (Pico does emission)
      bash.ts               # Bun.spawn wrapper
      function.ts           # dynamic import + invoke
    display/
      controller.ts         # owns "what should be on the OLED right now"
      layouts.ts            # builds layout messages from profile data
    state/
      store.ts              # in-memory + file-backed state
    http/
      server.ts             # Bun.serve
      routes.ts             # endpoint handlers
      sse.ts                # /events stream
    integrations/
      claude-code.ts        # helpers for /display/prompt-as-gate
  scripts/
    deploy.ts               # firmware deploy (see §8)
  tests/
    ...
```

---

## 6. Component 3: Config Format

### 6.1 Top-level schema

The host config is a single JSON file, hand-editable but normally edited via the config UI.

```jsonc
{
  "$schema": "https://retro-deck/v2-config.schema.json",
  "version": 2,

  "device": {
    "longPressMs": 1500,
    "profileSwitchButton": 8,        // long-press button 8 to cycle profiles
    "profileSwitchMode": "cycle"     // "cycle" | "menu" — see §6.3
  },

  "display": {
    "toastTtlMs": 1500,
    "errorTtlMs": 5000,
    "defaultStatus": "ready"
  },

  "http": {
    "host": "127.0.0.1",
    "port": 7842
  },

  "profiles": {
    "default": {
      "label": "Default",
      "buttons": {
        "1": { "label": "BTN 1", "action": { "type": "keypress", "key": "ctrl+shift+r" } },
        "2": { "label": "test",  "action": { "type": "bash", "cmd": "bun test" } },
        "3": { "label": "deploy","action": { "type": "function", "module": "./actions/deploy.ts" } },
        "4": { "label": "noop",  "action": { "type": "noop" } },
        "5": { "label": "noop",  "action": { "type": "noop" } },
        "6": { "label": "noop",  "action": { "type": "noop" } },
        "7": { "label": "noop",  "action": { "type": "noop" } },
        "8": { "label": "mode",  "action": { "type": "noop" } }
      }
    },

    "obs": {
      "label": "OBS",
      "buttons": {
        "1": { "label": "black",   "action": { "type": "keypress", "key": "ctrl+alt+shift+1" } },
        "2": { "label": "soon",    "action": { "type": "keypress", "key": "ctrl+alt+shift+2" } },
        "3": { "label": "chat",    "action": { "type": "keypress", "key": "ctrl+alt+shift+3" } },
        "4": { "label": "edge",    "action": { "type": "keypress", "key": "ctrl+alt+shift+4" } },
        "5": { "label": "mic",     "action": { "type": "keypress", "key": "ctrl+alt+shift+5" } },
        "6": { "label": "video",   "action": { "type": "keypress", "key": "ctrl+alt+shift+6" } },
        "7": { "label": "t4w",     "action": { "type": "keypress", "key": "ctrl+alt+shift+7" } },
        "8": { "label": "mode",    "action": { "type": "noop" } }
      }
    }
  }
}
```

### 6.2 Profile structure

```ts
type Profile = {
  label: string;             // human-readable; shown in OLED header and UI
  buttons: Record<"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8", ButtonSlot>;
};

type ButtonSlot = {
  label: string;             // shown in OLED grid (truncated to ~10 chars)
  action: Action;
};
```

All 8 button slots must be present in every profile (use `{ "type": "noop" }` for empty slots). This keeps the OLED grid stable when switching profiles.

### 6.3 Profile switching

- **`cycle` mode (default):** long-press the `device.profileSwitchButton`. Each long-press advances to the next profile in declaration order, wrapping at the end. The new profile name is displayed as a toast.
- **`menu` mode:** long-press the switch button → OLED shows a profile menu (one profile per line, paged if more than 4); subsequent short-presses on buttons 1–4 select; button 8 cancels. *(v2.1 — out of scope for v2.0.)*

The profile-switch button itself still has a `label` and `action` for short-presses — long-press is overloaded for switching and short-press fires the regular action.

### 6.4 Action type definitions

```ts
type Action =
  | { type: "keypress"; key: string }
  | { type: "bash"; cmd: string; shell?: string; cwd?: string; timeoutMs?: number }
  | { type: "function"; module: string; export?: string }   // export defaults to "default"
  | { type: "noop" };
// `shell` defaults to "bash -c"; `cwd` defaults to $HOME; `timeoutMs` defaults to 30000.
```

#### 6.4.1 `keypress`

- `key` is a `+`-separated string of human-friendly key tokens (case-insensitive). The host parses by: lowercase, strip whitespace, split on `+`, then map each token to a canonical `adafruit_hid.keycode.Keycode` attribute name via the alias table below. Canonical names are pushed to the Pico via `bind.set`.

**Token → canonical Keycode name (full alias table the host must implement):**

| Input token (lowercased) | Canonical name | Notes |
|---|---|---|
| `ctrl`, `control` | `CONTROL` | |
| `shift` | `SHIFT` | |
| `alt`, `option`, `opt` | `ALT` | |
| `cmd`, `super`, `win`, `windows`, `meta` | `WINDOWS` | |
| `a`..`z` | `A`..`Z` | uppercased |
| `0` | `ZERO` | |
| `1`..`9` | `ONE`..`NINE` | spelled out |
| `f1`..`f24` | `F1`..`F24` | uppercased |
| `tab` | `TAB` | |
| `enter`, `return` | `ENTER` | |
| `esc`, `escape` | `ESCAPE` | |
| `space`, `spacebar` | `SPACEBAR` | |
| `backspace` | `BACKSPACE` | |
| `delete`, `del` | `DELETE` | |
| `home` / `end` / `pageup` / `pagedown` | `HOME` / `END` / `PAGE_UP` / `PAGE_DOWN` | |
| `left`, `leftarrow` | `LEFT_ARROW` | analogous: `right`, `up`, `down` |
| `minus`, `-` | `MINUS` | |
| `equals`, `=` | `EQUALS` | |
| `,` | `COMMA` |  |
| `.` | `PERIOD` |  |
| `/` | `FORWARD_SLASH` |  |
| `\\` | `BACKSLASH` |  |
| `;` | `SEMICOLON` |  |
| `'` | `QUOTE` |  |
| `[` | `LEFT_BRACKET` |  |
| `]` | `RIGHT_BRACKET` |  |
| ``` ` ``` | `GRAVE_ACCENT` |  |

- Any token not in the alias table is passed through verbatim (uppercased) — e.g. `"KEYPAD_ZERO"` works as a literal canonical name.
- After mapping, the host validates each canonical name exists in `adafruit_hid.keycode.Keycode` (the daemon ships a generated list) and rejects the config on unknown names.
- The Pico does the final `getattr(Keycode, name)` resolution and rejects unknown names with an `error` message at `bind.set` time.

#### 6.4.2 `bash`

- `cmd` is the full command line (passed to `bash -c` or `shell` if specified).
- Stdout/stderr captured to log. Exit code drives toast (`✓` on 0, `✗` on non-zero).
- Long-running commands stream status to OLED status line every 1s.
- `cwd` defaults to `$HOME`.
- Default timeout: 30s. SIGTERM on timeout, SIGKILL 5s after that.
- Environment: inherits daemon env, with `RETRO_DECK_BUTTON=<id>` and `RETRO_DECK_PROFILE=<name>` exported.

#### 6.4.3 `function`

- `module` is a path resolvable from the directory of the config file (e.g. `./actions/deploy.ts`) — daemon resolves relative to `dirname(configPath)`.
- Module loaded via `await import(absolutePath)`. Bun handles TypeScript natively.
- Default export: `async (ctx: ActionContext) => void | { message?: string }`.
- `ActionContext` shape:
  ```ts
  type ActionContext = {
    button: number;           // 1–8
    profile: string;
    log: (msg: string) => void;
    toast: (msg: string, ttlMs?: number) => void;
    setStatus: (msg: string) => void;
    env: Record<string, string>;
  };
  ```
- Return value: if it returns `{ message }`, that becomes the success toast; otherwise the daemon shows `✓ <button-label>`.
- Throws → `✗ <error.message>` toast + logged.
- Hot-reload: when the config file changes OR the module file changes (watched), the import cache is cleared so the next press re-imports.

#### 6.4.4 `noop`

- Does nothing. Still emits a `✓` toast with the button's label so the user gets feedback. Used for "this slot is just for the OLED label" or "this is the profile-switch button."

### 6.5 Validation rules

The daemon validates the config on load (and on every hot-reload) using a [Zod](https://zod.dev) schema. Failures:

| Rule | On failure |
|------|-----------|
| `version` must equal `2` | Reject |
| At least one profile must exist | Reject |
| Every profile must have all 8 button keys (`"1"`–`"8"`) | Reject with the missing key |
| `device.profileSwitchButton` ∈ 1..8 | Reject |
| `keypress.key` parses to ≥1 known keycode | Reject with the bad token |
| `bash.cmd` is a non-empty string | Reject |
| `function.module` is a string ending in `.ts`, `.js`, or `.mjs` | Reject |
| `function.module` resolves to an existing file | Reject (only on initial load — hot-reload tolerates transient absence with a warning) |

Invalid config on **startup** → exit non-zero with a clear error.
Invalid config on **hot-reload** → log error, keep running with previous config.

### 6.6 Config file location

- Default: `~/.config/retro-deck/config.json`.
- Overridable via env var `RETRO_DECK_CONFIG=/path/to/config.json`.
- A bundled `examples/config.example.json` ships with the repo and is copied to the user's config dir on first run if no config exists.

---

## 7. Component 4: Configuration UI

### 7.1 Requirements

The UI must support:

1. **Browse profiles** — list all profiles with their labels.
2. **Edit a profile** — show all 8 button slots in a grid, each with editable label and action.
3. **Edit each action type** with the right form:
   - `keypress`: a "press keys to capture" input + manual keycode entry fallback.
   - `bash`: a single-line `cmd` field, optional `cwd`, optional `timeoutMs`.
   - `function`: a file picker for `module`, optional `export` field.
   - `noop`: just a toggle.
4. **Live device state** — show whether the daemon is connected, which profile is active, recent button events.
5. **Test a button** — fire its action without pressing the physical button (calls `POST /buttons/:id/test`).
6. **Activate a profile** — switch the active profile (calls `POST /profiles/:name/activate`).
7. **Validation feedback** — show errors inline before saving.
8. **Save** — `PUT /config` with the full updated config; daemon hot-reloads.

### 7.2 Recommended approach

Two viable options. The recommendation is **webapp**, but TUI is acceptable and faster to ship.

| | TUI (Ink / Bubble Tea-style) | Webapp (React + Bun static server) |
|---|---|---|
| **Time to ship** | Faster — single Bun binary, runs in terminal | Slower — needs frontend stack, build step |
| **Live updates** | Good (terminal redraws); SSE simple | Excellent (SSE → React state, animations) |
| **Key capture for keypress action** | Limited (terminal swallows or remaps modifiers; capturing `Ctrl+Shift+R` is awkward) | Native (`keydown` events with full modifier info) |
| **Discoverability** | Lower (need to know how to launch it) | Higher (open a tab, bookmark) |
| **Multi-window** | One terminal at a time | Multi-tab, multi-monitor |
| **Visual polish** | Constrained (text only, no colors-of-state for OLED preview) | Can render an actual SSD1306-look OLED preview |

**Recommendation:** Webapp using Bun's built-in static serving + a simple React frontend. Bind to `127.0.0.1:7843` (separate from the daemon's API port; the webapp itself just calls the daemon API).

**Rationale:** The "press keys to capture" affordance matters a lot for keypress actions, and only a browser gives reliable cross-platform key event data with all modifiers. The OLED preview pane is also genuinely useful and only feasible in HTML/CSS.

**Concrete starting stack:** `Bun.serve()` + React + TypeScript — **Tier 3A** per the project web stack standard. Single-page app served by a dedicated `server.ts` on port 7843. No Vite, no build step — Bun bundles the SPA from HTML imports on the fly. Dev and prod run the same `server.ts`. State syncs via SSE (`GET /events` from the daemon). TanStack Query for all data fetching against the daemon API on port 7842.

**Module layout (Tier 3A):**
```
host/ui/
  server.ts             # Bun.serve({ routes: { "/": index }, development: { hmr: true } })
  index.html            # <script type="module" src="./src/frontend.tsx">
  src/
    frontend.tsx        # createRoot, App entry
    components/
    queries/            # TanStack Query hooks → daemon API on :7842
    styles.css
```

**CORS:** The daemon's HTTP server (`host/src/http/server.ts`) must set `Access-Control-Allow-Origin: http://127.0.0.1:7843` (or `*` — localhost-only service) for the config UI to call it from the browser.

### 7.3 Out of scope for v2.0

- User-defined themes / custom CSS.
- Drag-and-drop reordering of profiles (rename + edit-in-place is sufficient).
- Profile import/export (just edit `config.json` directly).
- Multi-config-file support (one config file per host).

---

## 8. Component 5: Deploy Tooling

### 8.1 What it does

`bun run deploy` (`scripts/deploy.ts`) is the only sanctioned way to push firmware to the Pico. It:

1. **Detects the CIRCUITPY block device by filesystem label** (`lsblk -o LABEL,PATH -nr` or `blkid -L CIRCUITPY`). **Never** defaults to `/dev/sda1` or any other hardcoded path — that risks `rsync --delete`-ing the wrong disk on a multi-drive desktop.
2. Creates a mountpoint at `/run/media/$USER/CIRCUITPY` if not already mounted.
3. Mounts read-write (prefers `udisksctl mount` to avoid sudo; falls back to `sudo mount`).
4. `rsync -av --delete` the contents of `firmware/` to the mount.
5. `sync` to flush.
6. Unmounts cleanly (`udisksctl unmount` then `udisksctl power-off` if available).
7. Prints success and the timestamp.
8. *(Optional)* Tail the daemon log for 5s to surface any startup errors after Pico re-enumerates.

### 8.2 Behaviour and edge cases

- If no block device with label `CIRCUITPY` is found, exit non-zero with a helpful message ("plug in the Pico in BOOTSEL/CIRCUITPY mode").
- If the device is already mounted, reuse the existing mountpoint rather than re-mounting.
- `--device /dev/sdX1` overrides label-based detection (use only when sure).
- `--dry-run` prints what would be copied without touching anything.
- `--firmware <path>` overrides the default `./firmware` source dir.
- Refuse to proceed if the resolved device's label is anything other than `CIRCUITPY` (paranoia check).

### 8.3 Why a TS script (not a bash script)

- Consistent with the rest of the host stack (Bun/TypeScript).
- Easier to add structured options, argument parsing, and post-deploy verification.
- The repo's `package.json` exposes `bun run deploy` as the canonical command.

### 8.4 Permissions

Mounting/unmounting typically requires either:
- a polkit rule allowing `udisksctl mount/unmount` for the user (preferred — no sudo prompt), or
- `sudo mount`/`sudo umount` (acceptable, prompts for password).

The script should prefer `udisksctl` and fall back to sudo with a clear log line.

### 8.5 Out of scope

- Verifying firmware was actually loaded by reconnecting and reading `ready` (nice-to-have for v2.1).
- Cross-platform deploy (macOS/Windows). Linux only in v2.0.
- Versioning or rollback (the user can git-revert the firmware dir and re-deploy).

---

## 9. Serial Protocol Reference

This section is the canonical message catalogue. Both sides must implement exactly these.

### 9.1 Framing rules

- One JSON object per line, terminated by `\n` (LF, not CRLF).
- UTF-8.
- Max line length: 1024 bytes (enforced by both sides; over-length lines are dropped with an `error` reply).
- No comments, no trailing commas, no whitespace outside JSON tokens beyond the trailing `\n`.
- Order is preserved per direction (USB CDC is a stream).
- No request/response correlation IDs in v2.0 — all messages are fire-and-forget. (Add `id`/`reply_to` if needed in v2.1.)

### 9.2 Pico → Host messages

#### `ready`
Sent once on Pico boot, after asyncio main has started.
```json
{ "type": "ready", "protocol": 1, "app": "retro-deck", "buttons": 8, "display": { "w": 128, "h": 64 } }
```
Host responds with `hello`.

#### `tick`
Heartbeat every 5s. Host uses to detect a stalled firmware. **Stall threshold:** if the host receives no `tick` (and no other message) for 15s (3 missed ticks), it closes the port and re-enters the discovery/reconnect loop.
```json
{ "type": "tick", "t": 1234567 }
```

#### `button.press`
```json
{ "type": "button.press", "id": 1, "t": 12345 }
```

#### `button.hold`
Every 250ms while held, after the first 500ms of holding.
```json
{ "type": "button.hold", "id": 1, "t": 12895, "duration_ms": 550 }
```

#### `button.release`
```json
{ "type": "button.release", "id": 1, "t": 13100, "duration_ms": 755 }
```

#### `error`
Non-fatal firmware-side error.
```json
{ "type": "error", "code": "bad_keycode", "message": "unknown key 'FROBNICATE'", "context": { "button": 3 } }
```

#### `log`
Optional debug log line from firmware.
```json
{ "type": "log", "level": "info", "message": "binding set for button 5" }
```

### 9.3 Host → Pico messages

#### `hello`
Sent immediately after the host receives `ready` (and after reconnect). Acknowledges the device and resets the Pico's in-memory cache; host follows with state pushes.
```json
{ "type": "hello", "protocol": 1 }
```
The host owns all action and timing thresholds (long-press, etc.). The Pico does not need them — it streams raw events. `hello` carries no thresholds in v2.0.

#### `bind.set`
Set the keypress binding for one button. Repeated for every `keypress` button in the active profile.
```json
{ "type": "bind.set", "id": 2, "keys": ["CONTROL", "SHIFT", "R"] }
```
To clear a binding (button is `bash`/`function`/`noop`):
```json
{ "type": "bind.clear", "id": 2 }
```

#### `bind.clearAll`
Clear all keypress bindings. Sent at the start of a profile switch before re-issuing per-button binds.
```json
{ "type": "bind.clearAll" }
```

#### `display.layout`
Push the full body grid. Replaces any toast.
```json
{
  "type": "display.layout",
  "header": "OBS",
  "labels": ["black","soon","chat","edge","mic","video","t4w","mode"],
  "status": "● ready"
}
```

#### `display.toast`
Show a transient large message in the body area. Reverts to grid after `ttl_ms`.
```json
{ "type": "display.toast", "message": "✓ deploy", "ttl_ms": 1500 }
```

#### `display.status`
Update only the status line.
```json
{ "type": "display.status", "message": "● running…" }
```

#### `display.error`
Show an error banner over the body. Stays until cleared.
```json
{ "type": "display.error", "message": "config invalid" }
```

#### `display.clearError`
```json
{ "type": "display.clearError" }
```

#### `ping`
Health probe. Pico replies with a `pong`.
```json
{ "type": "ping", "n": 42 }
```
Reply (Pico → Host):
```json
{ "type": "pong", "n": 42, "t": 12345 }
```

### 9.4 Error handling

- **Malformed line** (host or device side): respond with `{"type":"error","code":"bad_json","message":"..."}` if possible; otherwise drop. Never crash the loop.
- **Unknown `type`:** respond with `{"type":"error","code":"unknown_type","message":"<the type>"}`.
- **Bad payload** (missing field, wrong type): respond with `{"type":"error","code":"bad_payload","message":"..."}`.
- **Resource unavailable** (e.g. binding requested before `hello`): respond with `{"type":"error","code":"not_ready"}`.
- All errors are logged on both sides.

### 9.5 Connect / reconnect dance

```
Pico boots → ready
                      ←───────  ready
            hello     ───────→
            bind.clearAll ───→
            bind.set …    ───→  (one per keypress button)
            display.layout  ─→
            display.status  ─→  (e.g. "● ready")
                              … steady state …
            ←─────  button.press
            ←─────  button.release
            display.toast  ─→  (action result)
                              …
Pico unplug → host sees EOF → backoff loop → re-detect → repeat from "ready"
```

---

## 10. Open Questions

These are deliberate gaps. Each one needs to be resolved by the issues writer or, where flagged, kicked back to the owner before implementation.

1. **Profile-switch button overload.** Long-press on the configured switch button cycles profiles; short-press fires its action. Is that ergonomic, or do we want to forbid configuring an action on the switch button to avoid confusion? **Recommend:** allow short-press action; document the overload clearly. Defer if ambiguous.

2. **`menu`-mode profile switching.** Spec'd above as v2.1. Does v2.0 need a fallback for users with >5 profiles who don't want to long-press 5 times? Possible v2.0 minimum: cycle only, but `POST /profiles/:name/activate` exists, so users with many profiles can wire a hotkey or the UI to switch.

3. **Webapp vs TUI for config UI.** PRD recommends webapp but acknowledges TUI is faster. **Owner decision needed before issue is written.** If TUI: drop the OLED-preview requirement.

4. **Daemon as systemd user service.** The PRD assumes the user will run the daemon as a long-lived service. Out of scope for the issues themselves, but the README needs to ship example unit files. **Owner decision: in v2.0 docs, or v2.1?**

5. **Multi-host / second Pico.** Not a goal, but if a second device is plugged in, the daemon should at least *not* connect to it and clobber the wrong device. **Recommend:** discovery uses a stable serial number from the Pico's USB descriptor; the host config can pin a specific serial. Defer to v2.1 unless the owner has two decks.

6. **Long-key-name truncation strategy.** `terminalio.FONT` is 6×8; in a 4×2 grid the per-cell label budget is ~10 chars. Truncate with `…` or scroll? **Recommend:** truncate in v2.0; vendor `adafruit_display_text` source for marquee scrolling in v2.1.

7. **Action concurrency model.** PRD says 1 action queued per button; further presses dropped. Is that the right policy? Alternative: cancel the in-flight action and start the new one. **Recommend:** queue=1, drop further; revisit if it's annoying in practice.

8. **Hot-reload of `function` modules.** If a `function` action's `.ts` file is edited, the import cache must be invalidated without a config-file change. Bun's `import()` caches by path. A `?t=<mtime>` query string trick on a file:// path is unreliable in Bun — the proper approach is a small wrapper that reads the source, evaluates it via a fresh worker, or uses `Bun.spawn` to run the module in a subprocess. **Recommend:** v2.0 watches action module files via `fs.watch`; on change, the wrapper drops its cached reference and re-imports the next time the action fires (acceptable cost: one stale execution if the press races the save).

9. **What happens on action timeout.** PRD says SIGTERM at 30s, SIGKILL 5s later. Should the OLED show a "killed" toast? **Recommend:** yes, `✗ timeout` toast.

10. **HID key release timing.** Pico sends keys on `press` and releases ~30ms later. Does any application need a longer hold (e.g. games)? **Recommend:** v2.0 fixed 30ms, configurable per-action in v2.1.

11. **Boot ordering.** If the daemon is up before the Pico is plugged in, is the "auto-discover with backoff" loop sufficient, or do we want udev rules to trigger discovery? **Recommend:** backoff is enough for v2.0; udev is a v2.1 polish.

12. **Error reporting on the OLED.** PRD says `display.error` banners stay until cleared. Should there be an auto-dismiss after N seconds? **Recommend:** auto-dismiss after `display.errorTtlMs` (default 5s) is the simpler default; daemon can re-send if the underlying state is still bad.

13. **Config schema versioning.** v2.0 hardcodes `version: 2`. Migration path for v2.1+ schema bumps not specified. **Defer:** add a migrator in v2.1 when the first incompatible change lands.

14. **Test strategy.** Not specified above. Suggested baseline:
    - Host: Bun's built-in test runner; mock the serial port with a virtual pty.
    - Firmware: hard to unit-test on Pico directly; instead, factor protocol parsing into a pure Python module testable on host CPython.
    - End-to-end: a "harness" config + a USB-attached Pico in CI. Out of scope for v2.0.

---

*End of PRD.*
