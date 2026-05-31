# V2 Slice 5 — Reliability + Diagnostics

## Why

Two issues block daily use of the Retro Deck:

1. **Keyboard "hijacking."** The host emits keypresses via two separate `ydotool`
   processes (press, wait 30 ms, release — `dispatch.ts`). If anything interrupts
   that window (release process error, an overlapping double-fire, the daemon
   dying mid-press) a modifier (Ctrl/Shift/**Super**) is left held *down at the
   virtual-keyboard level, system-wide*. Every later keystroke then carries the
   stuck modifier — the device appears to "hijack" the whole keyboard.

2. **Mis-calibrated input.** Long/short presses fire more than once and chords
   behave inconsistently. Three root causes:
   - **No chord decision window.** Pressing 1+3 "together" sends `press 3 held=[]`
     then `press 1 held=[3]`; the host fires the single-button "3" action *and*
     the "1+3" chord, order depending on which switch lands first.
   - **No tap/hold/double-tap concept.** The device sends raw press/release; the
     host fires on every press. Hold slots aren't wired.
   - **One event per 10 ms loop.** The firmware drains only a single keypad event
     per `time.sleep(0.01)` tick, so near-simultaneous presses are serialized
     ~10 ms apart — it *manufactures* gaps that corrupt chord detection.
   - We can't currently distinguish "device emitted 2" from "host saw 1 twice"
     because there is no sequence number on the wire.

We will not guess thresholds. We instrument first, measure the real limits
(serial throughput, keypad debounce floor, injection latency), then build the
smart input engine on measured values.

## Non-goals (this slice)

- The smart tap/hold/double-tap/chord classifier (Slice 6 — needs data first).
- Replacing ydotool with a self-managed uinput device (future hardening note below).

## Deliverables

### A. Keyboard reliability (`host/src/server/keyboard.ts`, `dispatch.ts`)
- `emitChord(codes)` — press + release in **one** `ydotool key` invocation, so a
  modifier can never be stranded between two processes.
- `releaseAllModifiers()` — best-effort release of all L/R modifier codes.
- Call `releaseAllModifiers()` on daemon startup (clears leaks from a prior crash).
- `POST /api/panic` + a UI "release all keys" control.

### B. Instrumented firmware (`firmware/code.py`)
- Monotonic `seq` on every outbound message → host detects drops (seq gap) and
  duplicates (seq repeat).
- Drain the **entire** keypad event queue each loop; tighten loop to ~1 ms.
- `ready` reports `version`, `buttons`, `pins`, `debounce_ms`.
- Runtime `config` command: `heartbeat_ms` (0 = off, default), `debounce_ms`
  (recreates `keypad.Keys`). Instrumentation is opt-in; the device is quiet in
  normal use.
- `ping`/`pong` echoes the host timestamp (`ht`) so the host measures round-trip
  latency with no clock sync.
- Backward compatible: extra fields are ignored by the existing host paths.

### C. Deploy tooling (`host/scripts/deploy.ts`, `bun run deploy`)
- Find CIRCUITPY by filesystem label (never a hardcoded path), mount via
  `udisksctl` if needed, copy `firmware/code.py` + `firmware/boot.py`, rsync
  `lib/`, `sync`. `--eject` to unmount. Target < 10 s.

### D. Diagnostics core + CLI + web tab (`host/src/server/diagnostics.ts`, `scripts/diag.ts`, client `Diagnostics` tab)
- Shared analyzer: per-button state, inter-press gaps, press→release durations,
  dropped/duplicate frames (via seq), device-`t`-vs-host-arrival latency + jitter,
  sustained events/sec, ping/pong RTT.
- Scripted test routines: tap×N, hold, double-tap, rapid-fire, two-button chord,
  all-buttons, and a ping stress test to find the serial ceiling.
- CLI for remote/SSH use; web tab for live timeline + gauges. Both consume the
  same core and can replay a recorded capture (so it's testable without hardware).

### E. Smart input engine — Slice 6, deferred
Host-side classifier (debounce floor, chord window, double-tap gap, hold
duration) tuned from Slice 5 measurements.

## Future hardening note
ydotool injects through `ydotoold`'s virtual keyboard, which outlives our daemon —
that's why a leaked modifier persists. A self-managed `/dev/uinput` device owned
by the daemon process would let the kernel auto-release all keys the instant the
daemon exits. Tracked for a later slice.
