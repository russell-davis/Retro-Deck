# Retro Deck — Current Implementation Analysis

> **Purpose:** Comprehensive snapshot of the V1 codebase for use by the V2 rewrite agent team.
> This document was produced by a coordinated 3-agent analysis. Sections are authored by:
> - **Coordinator** (Claude Sonnet 4.6) — Architecture, hardware, data model, OLED, file utilities
> - **Sonnet Agent** — Profile configs (all button mappings, HID keycodes)
> - **Opus Agent** — Library dependencies, gaps/TODOs, pain points, V2 constraints

---

## 1. Hardware

### Device
- **MCU**: Raspberry Pi Pico (RP2040, dual-core ARM Cortex-M0+)
- **Firmware runtime**: CircuitPython
- **Form factor**: 3D-printed 8-key macro pad with integrated OLED mount
- **Based on**: DaveM's [Stream Cheap](https://www.thingiverse.com/thing:2822140) design, adapted for Pico
- **3D files**: `prints/_v1/` and `prints/_v2/` (STL included: `Pico MacroPad + Oled.stl`)

### Bill of Materials
| Component | Notes |
|-----------|-------|
| Raspberry Pi Pico | RP2040, not Pico W (no WiFi used) |
| 8x mechanical switches | MX-compatible |
| Keycaps | Standard MX |
| 0.96" SSD1306 OLED | 128×64px, I2C |
| Development breakout board | For wiring switches to GPIO |
| Threaded inserts + hex bolts | Enclosure fasteners |

### GPIO Pin Assignments

From `example-mappings.json` and `src/register_buttons.py`:

| Button # | GPIO Pin | Notes |
|----------|----------|-------|
| 1 | GP20 | Pull-up, active low |
| 2 | GP19 | Pull-up, active low |
| 3 | GP18 | Pull-up, active low |
| 4 | GP17 | Pull-up, active low |
| 5 | GP11 | Pull-up, active low |
| 6 | GP12 | Pull-up, active low |
| 7 | GP13 | Pull-up, active low |
| 8 | GP14 | Pull-up, active low |

Default fallback pin range (no mappings.json): GP10–GP13, GP21–GP18 (reverse)

### OLED Wiring
| Signal | GPIO |
|--------|------|
| SDA | GP0 |
| SCL | GP1 |
| Protocol | I2C, address 0x3C (60 decimal) |
| Driver | SSD1306 128×64 |

---

## 2. Firmware Architecture

### Entry Point: `code.py`

Startup sequence:
1. Import profile configs (`RiderConfig`, `DebugButtonFunctions`, `OBSConfig`)
2. Instantiate `Oled` → releases displays, sets up I2C, shows logo, goes to standby
3. Instantiate `Keyboard` (USB HID)
4. Instantiate all profile objects, pass `screen` + `kbd`
5. Load `mappings.json` if present, else use default pin order
6. Call `setup_buttons(button_map)` → returns list of 8 `DigitalInOut` objects
7. Set `current_config = configs[0].config` (Debug profile is always default)
8. Enter main loop

### Main Loop

```python
while not quit_app:
    for button in buttons:
        if not button.value:          # active low
            handle_button_press(button)
    time.sleep(0.01)                  # 10ms debounce tick
```

### Button Handler (`handle_button_press`)

- Determines key index (1-based) from `buttons.index(button)`
- Polls while button is held, incrementing `held_for` in 10ms ticks
- **Long press (>2s)**: switches active profile to `configs[key-1]` (button 1 → profile 0, etc.)
  - This means buttons 1–3 can switch profiles; buttons 4–8 cannot (only 3 profiles exist)
  - Displays profile name on OLED via `cfg.print_name(key)`
  - Consumes button release before returning
- **Short press**: looks up `current_config[key]["action"]` and calls `action(key)`

### Module Structure

```
code.py                        # entry point, main loop
src/
  buttons_functions.py         # (implied base — not present, each profile is standalone)
  debug_buttons_functions.py   # Debug profile
  obs_buttons.py               # OBS Studio profile
  rider_config.py              # JetBrains Rider profile
  webstorm_button_functions.py # JetBrains WebStorm profile (may be unused)
  oled.py                      # OLED display wrapper
  register_buttons.py          # GPIO button setup
  fileUtilities.py             # os.stat-based file existence check
lib/
  adafruit_hid/                # USB HID (keyboard, mouse, consumer control)
  adafruit_display_text/       # Text label rendering (compiled .mpy)
  adafruit_displayio_ssd1306.py # SSD1306 display driver
```

### Profile / Config System

Each profile is a class with:
- `mode: str` — display name
- `config: dict[int, {"name": str, "action": Callable}]` — keyed 1–8
- `print_name(name)` — shows selection on OLED
- Individual action methods (e.g. `start()`, `attach_debug()`)

Profile instances are stored in a `configs` list. Long-pressing button N switches to `configs[N-1]`.

---

## 3. Profile Configs

> **Authored by: Sonnet Agent** — fills this section with all button mappings, HID keycodes, timing details

<!-- SONNET_AGENT_START -->

### 3.1 Debug Profile (`src/debug_buttons_functions.py`)

| Button | Name | Keycodes | Delay after |
|--------|------|----------|-------------|
| 1 | BTN 1 | (none — echo/no-op) | — |
| 2 | BTN 2 | (none — echo/no-op) | — |
| 3 | BTN 3 | (none — echo/no-op) | — |
| 4 | BTN 4 | (none — echo/no-op) | — |
| 5 | BTN 5 | (none — echo/no-op) | — |
| 6 | BTN 6 | (none — echo/no-op) | — |
| 7 | BTN 7 | (none — echo/no-op) | — |
| 8 | BTN 8 | (none — echo/no-op) | — |

- All 8 buttons are wired to `self.print_name` — they only update the OLED with the button label and do nothing else.
- Five real action methods exist in the class but are **not wired into the config dict**:
  - `start_project`: no keycodes, `time.sleep(3)` — effectively a 3-second stall with OLED update only
  - `stop_project`: `CTRL+F2`, 1.5s delay
  - `previous_file`: `CTRL+SHIFT+TAB`, 0.3s delay
  - `next_file`: `CTRL+TAB`, 0.3s delay
  - `lock_screen`: `WINDOWS+L`, 1.5s delay
- The Debug profile is entirely a **placeholder** — it appears to be where new actions are developed before being promoted to a real profile.

### 3.2 OBS Profile (`src/obs_buttons.py`)

| Button | Name | Keycodes | Delay after |
|--------|------|----------|-------------|
| 1 | black | CTRL+ALT+SHIFT+1 | 1.5s |
| 2 | starting_soon | CTRL+ALT+SHIFT+2 | 1.5s |
| 3 | chatting | CTRL+ALT+SHIFT+3 | 1.5s |
| 4 | edge | CTRL+ALT+SHIFT+4 | 1.5s |
| 5 | mic_toggle | CTRL+ALT+SHIFT+5 | 1.5s |
| 6 | video_toggle | CTRL+ALT+SHIFT+6 | 1.5s |
| 7 | t4w | CTRL+ALT+SHIFT+7 | 1.5s |
| 8 | lofi | CTRL+ALT+SHIFT+8 | 1.5s |

- All keycodes use `Keycode.ONE` through `Keycode.EIGHT` (not numpad) with the `CTRL+ALT+SHIFT` modifier prefix — these are OBS scene-switching hotkeys.
- Copy-paste bugs: `mic_toggle` (button 5) and `lofi` (button 8) both call `self.print_name('edge')` instead of their own action names — the OLED label will show "edge" for those buttons.
- An `echo` lambda is defined in `__init__` but never used anywhere in the config.
- No conditional logic or branching in any action.

### 3.3 Rider Profile (`src/rider_config.py`)

Already read — documented here for completeness:

| Button | Name | Keycodes | Delay after |
|--------|------|----------|-------------|
| 1 | echo(1) — no-op label | (none) | — |
| 2 | start | CTRL+ALT+SHIFT+R | 1.5s |
| 3 | attach_debug | CTRL+ALT+F5 | 1.5s |
| 4 | stop_proj | SHIFT+F5 | 1.5s |
| 5–8 | echo(N) — no-op label | (none) | — |

### 3.4 WebStorm Profile (`src/webstorm_button_functions.py`)

**This file is a stub — no class, no config, no button mappings exist.**

The file contains only a 4-line comment block:
```python
###
# Webstorm buttons functions
# Methods for the debug profile of the RetroDeck
###
```

- No `class`, no `config` dict, no action methods defined.
- The profile is listed as a `# TODO` in `code.py` (`# TODO: - Profile for Webstorm actions`) confirming it was never implemented.
- The file is not imported in `code.py` and has no effect at runtime.

<!-- SONNET_AGENT_END -->

---

## 4. OLED Display System (`src/oled.py`)

### Hardware Init
- Releases all `displayio` displays on startup (required by CircuitPython for re-init)
- I2C on GP0/GP1, locked/unlocked before display init
- 50ms settle delay after display bus creation
- Shows logo scene briefly on startup

### Scenes

| Method | Content | When Used |
|--------|---------|-----------|
| `set_logo()` | "RetroDeck" centered, scale=2 | On boot, 300ms |
| `set_standby()` | Line 1: "RetroDeck v1.0.0" · Line 2: "MODE: STANDBY" | After boot, on profile switch |
| `set_confirm_selection(mode, name)` | Line 1: app name+version · Line 2: "Mode: {mode}" · Line 3: selection name (scale=2, uppercase) | After button press action |

### Display Pattern
- `current_scene` group is tracked; `.pop()` removes previous content before drawing new scene
- All scenes use `terminalio.FONT` (built-in monospace bitmap font)
- No animation, no brightness control, no sleep/wake

---

## 5. Configuration / Data Model

### `mappings.json` Schema

```json
{
  "mappings": [
    { "Pin": 20, "Button": 1 },
    { "Pin": 19, "Button": 2 },
    ...
  ]
}
```

- Loaded at startup if file exists (`file_exists('mappings.json')`)
- Parsed once; used to order `buttons[]` list by button number
- If absent: default GPIO sequence is used (hardcoded in `register_buttons.py`)
- No hot-reload; change requires device reset

### Config Object Shape (per profile)

```python
{
  1: { "name": "action_name", "action": callable },
  2: { "name": "action_name", "action": callable },
  ...
  8: { "name": "action_name", "action": callable },
}
```

- Keys are `int` 1–8
- `action` is a bound method — receives `button_index: int` as argument
- No persistence of which profile is active between resets (always boots to `configs[0]`)

### File Utilities (`src/fileUtilities.py`)

```python
def file_exists(filename: str) -> bool:
    # uses os.stat() — OSError means file absent
```

Only used to check for `mappings.json`. No other file I/O at runtime.

---

## 6. Library Dependencies

> **Authored by: Opus Agent** — fills this section

<!-- OPUS_AGENT_START -->

### 6.1 Bundled vendor libraries (`lib/`)

| Library | Version | Form | Source |
|---------|---------|------|--------|
| `adafruit_hid` | 5.3.0 | bundled `.py` (editable) | [Adafruit_CircuitPython_HID](https://github.com/adafruit/Adafruit_CircuitPython_HID) |
| `adafruit_displayio_ssd1306` | 1.5.6 | bundled `.py` (editable) | [Adafruit_CircuitPython_DisplayIO_SSD1306](https://github.com/adafruit/Adafruit_CircuitPython_DisplayIO_SSD1306) |
| `adafruit_display_text` | unknown (mpy header) | compiled `.mpy` (read-only) | [Adafruit_CircuitPython_Display_Text](https://github.com/adafruit/Adafruit_CircuitPython_Display_Text) |

#### `adafruit_hid` — USB HID device drivers
Provides keyboard, mouse, and consumer-control HID report senders that target a `usb_hid.Device`.

| Sub-module | What it provides | Used by V1? |
|------------|------------------|-------------|
| `__init__.py` | `find_device(devices, usage_page, usage)` helper | indirectly (via `Keyboard`) |
| `keyboard.py` | `Keyboard` class — `press()`, `release()`, `release_all()`, `send(*keycodes)` | **YES** — `Keyboard(usb_hid.devices)` + `kbd.send(...)` only |
| `keycode.py` | `Keycode` class — named USB HID usage codes (A–Z, F1–F24, modifiers, ONE–ZERO, TAB, etc.) | **YES** — `CONTROL, ALT, SHIFT, WINDOWS, F2, F5, TAB, R, L, ONE..EIGHT` |
| `consumer_control.py` | `ConsumerControl` class — media/volume/brightness reports | **No** (bundled but unused) |
| `consumer_control_code.py` | `ConsumerControlCode` enum (VOLUME_INCREMENT, SCAN_NEXT_TRACK, …) | **No** |
| `keyboard_layout_us.py` | `KeyboardLayoutUS` — string-to-keypress translation | **No** |
| `keyboard_layout_base.py` | `KeyboardLayoutBase` (parent) | **No** |
| `mouse.py` | `Mouse` class — `press()`, `release()`, `click()`, `move()` | **No** |

#### `adafruit_displayio_ssd1306` — SSD1306 OLED driver
Single-class module exposing `SSD1306(displayio.Display)`. Used by `src/oled.py` to wrap the I2C bus and drive the 128×64 panel. Editable, so tweaking init sequence / contrast / inversion is in-scope.

#### `adafruit_display_text` — bitmap text rendering
Provides `label.Label`, `bitmap_label.Label`, `scrolling_label.ScrollingLabel`. **All sub-modules are pre-compiled `.mpy`** — to modify rendering behaviour V2 must replace the whole package with a `.py` source build (or hand-roll the text routine). V1 uses only `from adafruit_display_text import label` → `label.Label(font, text, x, y, scale)`.

### 6.2 CircuitPython built-in modules

These ship with the CircuitPython firmware itself (no files in `lib/`) and are immutable from the device side.

| Module | Used in V1 by | Surface used |
|--------|--------------|--------------|
| `board` | `oled.py`, `register_buttons.py` | `board.GP0`, `board.GP1`, `getattr(board, 'GP{n}')` for `n ∈ {10..14, 17..21}` |
| `busio` | `oled.py` | `busio.I2C(SCL, SDA)`, `try_lock()`, `unlock()` |
| `displayio` | `oled.py` | `release_displays()`, `Group()`, `I2CDisplay(bus, device_address=60)` |
| `terminalio` | `oled.py` | `terminalio.FONT` (built-in 6×8 monospace bitmap) |
| `digitalio` | `register_buttons.py` | `DigitalInOut`, `Direction.INPUT`, `Pull.UP` |
| `usb_hid` | `code.py` | `usb_hid.devices` (sequence passed to `Keyboard`) |
| `micropython` | `adafruit_hid/keyboard.py` (vendored) | `const()` |
| `time` | `code.py`, all profiles, `oled.py` | `time.sleep()` only |
| `json` | `register_buttons.py`, `fileUtilities.py` (imported but unused there) | `json.loads()` |
| `os` | `fileUtilities.py` | `os.stat()` |

**Not yet used but available in stock CircuitPython** (V2 will rely on these):
- `usb_cdc` — USB serial port (the missing host channel — see §7)
- `supervisor` — soft reload, runtime status, `ticks_ms` timer
- `microcontroller` — NVM byte storage for persistent profile-index across reboots
- `storage` — remount CIRCUITPY read-write from the device side (needed if firmware itself wants to write config)
- `asyncio` (CircuitPython 8+) — non-blocking concurrent button + serial loops

### 6.3 V2 retention vs. replacement

**Must keep (no realistic alternative on this MCU):**
- `board`, `busio`, `digitalio`, `displayio`, `terminalio`, `usb_hid`, `usb_cdc` — the CircuitPython HAL.
- `adafruit_displayio_ssd1306` — the only sane SSD1306 driver for `displayio`.
- `adafruit_hid.keyboard.Keyboard` + `Keycode` — needed for any keypress-type action the Pico itself emits.

**Keep but extend:**
- `adafruit_display_text` — currently `.mpy` only. Either accept the limitation, or vendor the source `.py` build to gain custom rendering (icons, inverted regions, marquee labels for long button names).
- `adafruit_hid.mouse.Mouse` and `consumer_control` — already bundled; cheap to expose as additional V2 action types (`mouse-click`, `media-key`).

**Replace / add:**
- Replace the hand-rolled long-press scan loop in `code.py` with non-blocking event detection (e.g. `keypad.Keys` from CircuitPython core, or an `asyncio` loop).
- Add a `usb_cdc.data` JSON-line protocol layer — the central new piece.
- Add a small persistence layer (`microcontroller.nvm` or a JSON file written via CDC handshake) for last-active profile index.

<!-- OPUS_AGENT_END -->

---

## 7. Gaps, TODOs, and Pain Points

> **Authored by: Opus Agent** — fills this section

<!-- OPUS_AGENT_START_2 -->

### 7.1 TODO inventory

A `grep -rn 'TODO\|FIXME\|XXX\|HACK'` over the whole repo (`code.py`, `src/`, `README.md`) returns exactly five hits, all clustered at the top of `code.py`:

| File:Line | TODO |
|-----------|------|
| `code.py:11` | `# TODO: - Switch profile button` |
| `code.py:12` | `# TODO: - Companion App - Open specific apps` |
| `code.py:13` | `# TODO: - Profile for Launcher - Open specific apps` |
| `code.py:14` | `# TODO: - Profile for HomeKit actions` |
| `code.py:15` | `# TODO: - Profile for Webstorm actions` |

All five point at the same root issue: there is no way for the Pico to do anything except press hardcoded keystrokes, so every "feature idea" stalls at "we'd need a different architecture."

The README adds an informal self-assessment: *"Your code is shit." — "I know. I'm working on it."*

### 7.2 Latent bugs and dead code

| # | File:Line | Issue |
|---|-----------|-------|
| B1 | `code.py:67-68` | `if configs[index]:` indexes `configs[]` directly with `key-1`. There are only 3 entries (Debug, Rider, OBS) but 8 buttons — long-pressing buttons 4–8 raises `IndexError` and crashes the firmware (CircuitPython drops to REPL). |
| B2 | `code.py:43` | `current_config = configs[0].config` — boot always starts in Debug, regardless of last user choice. There is no persistence (no `microcontroller.nvm`, no file write). |
| B3 | `code.py:74-76` | After the long-press fires, the inner `while not button.value` busy-loops at 10 ms with no timeout, blocking everything else (other buttons, screen updates). Stuck-key = stuck firmware. |
| B4 | `code.py:90-95` | Main loop is single-threaded blocking. While a profile method calls `time.sleep(1.5)` (every short-press in OBS/Rider/Debug.stop), no other button can register, and the OLED can't update. |
| B5 | `src/register_buttons.py:28` | `buttons.insert(val["Button"] - 1, …)` does **not** guarantee positional ordering if mappings are out-of-order or skip indices — it inserts, doesn't pad. A `mappings.json` listing buttons `[3,1,2,…]` produces a wrong-order list with no error. |
| B6 | `src/register_buttons.py:17-20` | Default fallback range hardcodes `GP10..GP13` then `GP21..GP18` (reverse). Doesn't match the documented production wiring (`GP20..GP17, GP11..GP14` per `example-mappings.json`) — anyone running without a mappings file gets a layout that doesn't match the case. |
| B7 | `src/webstorm_button_functions.py` | File exists and is a 4-line comment header. No class, no config, never imported in `code.py`. Dead reference. |
| B8 | `src/fileUtilities.py:1` | `import json` is imported but never used in this file. |
| B9 | `src/debug_buttons_functions.py:19-21` | `start_project` exists but is **not wired into `self.config`** — the Debug profile maps every button (1–8) to `print_name` only. `stop_project`, `previous_file`, `next_file`, `lock_screen` are similarly defined but unreachable. |
| B10 | `src/oled.py:30` | `print()` with no argument inside the I2C init — leftover debug noise. |
| B11 | `src/oled.py:33` | `device_address=60` (decimal `0x3C`) is hardcoded — no fallback for SSD1306 modules wired to `0x3D`. |
| B12 | `code.py:56` | `quit_app = False` / `config_mode = False` are declared but never reassigned anywhere — `while not quit_app` is a permanent `while True`. |

### 7.3 Architectural limitations

V1 is a **pure HID emitter with no return channel.** Everything that follows stems from that.

1. **No USB CDC / serial comms.** `boot.py` doesn't enable `usb_cdc.data`, and nothing in `code.py` reads or writes a serial port. The Pico has zero ability to tell the host what just happened, and the host has zero ability to tell the Pico what to do.
2. **No host → device channel.** The host cannot push display content, button labels, profile changes, or status. Every byte the Pico emits is a synthetic keystroke.
3. **No event acknowledgement.** When a button is pressed and a keystroke is sent, there is no signal that the host received it, processed it, or rejected it. Fire-and-forget.
4. **No structured data channel.** All "communication" is a hardcoded macro pretending to be a keyboard. No JSON, no framed messages, no IDs.
5. **No dynamic config.** `mappings.json` is read once at boot. Changing a mapping requires editing the file and resetting the Pico. Profile contents (which keystroke maps to which button) are baked into Python class bodies and require a code edit + reset.
6. **No hot-reload of profiles.** CircuitPython auto-reloads on `code.py` save, but profile files live under `src/` and changes there don't always trigger a reload reliably; even when they do, every reset wipes the in-memory active-profile selection.
7. **No persistent state.** Active profile, last action, and any kind of usage counter are all in RAM. Reboot → back to Debug.
8. **No key labelling mechanism.** Names exist only inside the per-profile `config` dict and surface only after a button is pressed (`set_confirm_selection`). The user has no way to know what each key currently does without pressing it.
9. **Profile-switching gesture is broken.** Long-press on button N selects `configs[N-1]`. Buttons 1–3 work. Buttons 4–8 long-press → `IndexError` (B1). There is no dedicated profile-cycle key, no on-screen menu, no host-driven switch.
10. **Blocking main loop.** Every action ends in `time.sleep(1.5)` inside a single-threaded loop. No concurrent input, no animated display, no asynchronous host comms — adding any of those requires reworking the loop entirely.
11. **No mouse / consumer-control bindings.** `adafruit_hid.mouse` and `adafruit_hid.consumer_control` are bundled but unused. V1 is keyboard-only.
12. **No identity / pairing.** Nothing distinguishes one Retro Deck from another at the USB layer beyond a stock CircuitPython VID/PID. The host can't address a specific device.
13. **No timing source for events.** `time.sleep()` is the only `time` API used. There is no `ticks_ms` event timestamping — `held_for` is a counter, not a timestamp.
14. **No error reporting.** Exceptions drop the firmware into the CircuitPython REPL with no visual or audible hint to the user.

### 7.4 UX limitations

- **Long-press-only profile switching** — there's no dedicated button, no menu, no shortcut. Mode change is invisible until it happens.
- **Three profiles, eight buttons** — buttons 4–8 long-press crash the firmware (B1), so the gesture is half-broken even within its own design.
- **No on-screen indication of current profile** — between actions the OLED shows `MODE: STANDBY` after a profile switch via `set_standby()`? No — actually `set_standby()` is only called once at boot. After a profile switch the screen stays on `set_confirm_selection` forever, until the next press. There is no persistent header showing "you are in OBS profile."
- **No indication of which buttons are active vs no-op** — Rider has 4 active buttons, 4 echoes; Debug is 8 echoes; nothing on screen tells the user that.
- **Physical keycaps are unlabelled** — same blank caps regardless of profile. No legend sheet, no LCD-per-key, no host-pushed icon.
- **Action confirmation overwrites itself** — every press wipes the previous label; you can't see a recent action history.
- **No volume/brightness/sleep affordance for the OLED** — it's always at full brightness, always on.
- **Boot logo is a 300 ms flash** that disappears before the user can read it.
- **No haptic / audible feedback** — only visual via OLED.

### 7.5 What V1 cannot do that an agent-driven V2 needs

An "agent-driven" Retro Deck means: a host process (Claude Code, a TUI, a daemon) treats the device as a peripheral with two-way structured comms, and uses it to surface state, request approval, and run arbitrary host-side actions. V1 is incapable of *every* requirement on that list:

| Capability V2 needs | V1 gap |
|---------------------|--------|
| Host pushes a button label set | No host→device channel |
| Host pushes display content (current profile, agent state, prompts) | OLED is driven only by local profile classes |
| Host receives button events with IDs and timestamps | No outbound channel except synthetic keystrokes |
| Host distinguishes press / release / hold / double-tap | V1 collapses everything to "press fires action" or "hold ≥2s switches profile" |
| Host remaps buttons at runtime | Profiles are Python classes; remap requires file edit + reset |
| Host runs arbitrary shell / TS code in response to a press | Pico can only synthesize keystrokes |
| Approval workflow (button = "approve" / "deny" with confirmation) | No way to send "the user pressed approve" as a structured message |
| Persistent active-profile across reboots | Always boots to `configs[0]` |
| Multiple named profiles (more than 3) selectable from host | Profile list is a 3-element Python list with broken long-press selection |
| Per-button icon / glyph rendering on display | OLED only renders text labels with `terminalio.FONT` |
| Device identity / multi-device disambiguation | No identity beyond stock USB descriptors |
| Firmware self-report ("ready", "busy", "error") | No protocol layer at all |
| Graceful error surfacing | Unhandled exceptions drop to REPL silently |
| Config UI for non-engineers | Editing `mappings.json` + Python files on a CIRCUITPY mount is the entire workflow |

### 7.6 README self-assessment

> *"Your code is shit." — "I know. I'm working on it."*  — `README.md`

<!-- OPUS_AGENT_END_2 -->

---

## 8. V2 Rewrite Constraints and Context

### Fixed Hardware Constraints (cannot change without new hardware)
- Raspberry Pi Pico (RP2040) — CircuitPython only (no MicroPython or bare-metal assumed)
- 8 mechanical switches on fixed GPIO pins (remappable via config, but count is fixed)
- SSD1306 128×64 OLED on I2C GP0/GP1
- USB connection to host (USB HID + USB CDC available in CircuitPython)
- No WiFi (Pico, not Pico W) — all host comms must be USB

### What V2 Must Solve
1. **Host communication** — Pico must send events to and receive commands from a host process
2. **Dynamic config** — button mappings controlled by host at runtime, not baked into firmware
3. **Action execution on host** — bash commands and TypeScript functions run on host, not Pico
4. **Configuration UI** — a TUI, webapp, or desktop app to edit all configs and see all 8 slots per profile
5. **Mode/profile system** — infinite named profiles, toggle via dedicated button or external trigger
6. **Display driven by host** — host pushes what to show on OLED (current profile name, button labels, agent state)
7. **Deploy tooling** — `/dev/sda1` (CIRCUITPY volume) needs a mount/rsync/unmount script for iteration

### What V1 Got Right (keep in V2)
- Physical 8-key layout with long-press profile switching is intuitive
- `mappings.json` for GPIO remapping is a good pattern — extend it
- OLED feedback on action is useful — expand it
- CircuitPython is the right choice for approachability and iteration speed

### V2 Action Type Model (proposed)
```typescript
type Action =
  | { type: "keypress"; key: string }          // Pico sends HID directly
  | { type: "bash"; cmd: string }              // Host daemon executes
  | { type: "function"; module: string }       // Host daemon imports + runs
```

### V2 Communication Protocol (proposed)
- **Transport**: USB CDC serial (`/dev/ttyACM1`) — JSON lines, newline-delimited
- **Pico → Host**: `{"type":"button","id":1,"event":"press"}` / `{"type":"button","id":2,"event":"hold","duration":2.3}`
- **Host → Pico**: `{"type":"display","title":"Dev Mode","hint":"1=tests 8=stop"}` / `{"type":"labels","buttons":{"1":"run","8":"deny"}}`
- **Pico → Host** on boot: `{"type":"ready","buttons":8,"display":true}`
