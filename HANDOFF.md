# Retro Deck V2 Rewrite

## What This Is

The Retro Deck is a physical 8-key macro pad built on a Raspberry Pi Pico running CircuitPython. The original codebase was written before the owner knew what they were doing — it works, but it's messy and limited. This V2 rewrite starts from scratch with a clear goal: turn the Retro Deck into a first-class **agent tool** — a physical peripheral that can trigger, interact with, and be controlled by Claude Code agents or other AI workflows.

## Goal for This Session

Design and implement the V2 architecture. The rewrite should be clean, intentional CircuitPython — but more importantly, the device should be capable of acting as a hardware input/output bridge for agent-driven workflows. What that means exactly is an open question to explore with the user at session start.

## Decisions Already Made

- **Branch**: `feature/v2-rewrite` (on `russell-davis/Retro-Deck`)
- **Hardware**: Raspberry Pi Pico, 8 mechanical switches, OLED display, CircuitPython
- **Scope**: Full rewrite — don't salvage the old `code.py`, start clean
- **Direction**: Make it an "agent tool" — the device should be useful as part of an AI/Claude workflow, not just a standalone macro pad

## What's Been Done

- Cloned repo to `~/Work/retro-deck`
- Created branch `feature/v2-rewrite`

## Start Here

1. Read the existing `code.py` and `example-mappings.json` to understand what V1 did
2. Read `src/` and `lib/` to see what modules exist
3. Ask the user: **"What does 'agent tool' mean to you here?"** — does the Pico talk to the host over serial USB? Does it trigger webhooks? Does it register as a HID device that sends signals to a running agent? The answer shapes the entire architecture.
4. Once direction is clear, design the V2 module structure before writing any code

## Open Questions

- What is the communication model? (USB serial, HID, USB CDC, webhook, other?)
- Should the device be host-driven (agent sends commands to Pico) or device-driven (Pico sends events to agent)?
- Does the OLED display get driven by the Pico itself, or can the host push display content?
- Should profiles/macros still exist in V2, or is the key mapping entirely agent-controlled?
- Config format: keep JSON, or move to something simpler/more expressive?

## References

- Original repo: `https://github.com/russell-davis/Retro-Deck`
- Existing code: `code.py`, `example-mappings.json`, `src/`, `lib/`
- CircuitPython docs: `https://docs.circuitpython.org`
- Device is currently plugged in at `/dev/sda1` (label: `CIRCUITPY`) — not auto-mounted
