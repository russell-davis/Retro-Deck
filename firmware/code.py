import board
import time
import usb_cdc
import json

serial = usb_cdc.data
serial.timeout = 0

VERSION = '2.1.0-diag'

_seq = 0


def send(msg):
    # Stamp every outbound message with a monotonic sequence number so the host
    # can detect dropped (seq gap) and duplicated (seq repeat) frames.
    global _seq
    _seq += 1
    msg['seq'] = _seq
    serial.write((json.dumps(msg) + '\n').encode('utf-8'))


send({'step': 'serial_ok'})

import keypad
send({'step': 'keypad_imported'})

import displayio
import busio
import terminalio
import adafruit_displayio_ssd1306
from adafruit_display_text import label
send({'step': 'display_libs_imported'})

PINS = [board.GP10, board.GP11, board.GP12, board.GP13,
        board.GP21, board.GP20, board.GP19, board.GP18]
IDS = [1, 2, 3, 4, 5, 6, 7, 8]

DEFAULT_DEBOUNCE_MS = 20

lbl_profile = None
lbl_action = None
display_ok = False

try:
    displayio.release_displays()
    send({'step': 'displays_released'})

    i2c = busio.I2C(board.GP1, board.GP0)
    send({'step': 'i2c_ok'})

    bus = displayio.I2CDisplay(i2c, device_address=0x3C)
    send({'step': 'i2c_display_ok'})

    display = adafruit_displayio_ssd1306.SSD1306(bus, width=128, height=64)
    send({'step': 'ssd1306_ok'})

    group = displayio.Group()
    lbl_profile = label.Label(terminalio.FONT, text="V2 ready", x=4, y=8)
    lbl_action = label.Label(terminalio.FONT, text="press a button", x=4, y=24)
    group.append(lbl_profile)
    group.append(lbl_action)
    display.show(group)
    send({'step': 'display_shown'})

    display_ok = True
except Exception as e:
    lbl_profile = None
    lbl_action = None
    display_ok = False
    send({'step': 'display_error', 'err': str(e)})

debounce_ms = DEFAULT_DEBOUNCE_MS
keys = None


def make_keys(ms):
    return keypad.Keys(PINS, value_when_pressed=False, pull=True, interval=ms / 1000)


try:
    keys = make_keys(debounce_ms)
    send({'step': 'keys_ok'})
except Exception as e:
    send({'step': 'keys_error', 'err': str(e)})

send({
    'type': 'ready',
    'version': VERSION,
    'buttons': len(IDS),
    'pins': ['GP10', 'GP11', 'GP12', 'GP13', 'GP21', 'GP20', 'GP19', 'GP18'],
    'debounce_ms': debounce_ms,
})

held = set()
buf = b''
heartbeat_ms = 0          # 0 = off; host enables it for diagnostics
last_tick = time.monotonic()


def apply_config(msg):
    global heartbeat_ms, debounce_ms, keys
    if 'heartbeat_ms' in msg:
        try:
            heartbeat_ms = int(msg['heartbeat_ms'])
        except Exception:
            pass
    if 'debounce_ms' in msg:
        try:
            new_ms = int(msg['debounce_ms'])
            if keys is not None:
                keys.deinit()
            debounce_ms = new_ms
            keys = make_keys(debounce_ms)
        except Exception as e:
            send({'type': 'error', 'where': 'config.debounce', 'err': str(e)})
    send({'type': 'config.ok', 'heartbeat_ms': heartbeat_ms, 'debounce_ms': debounce_ms})


while True:
    # Drain the ENTIRE keypad queue each loop. The old firmware took one event
    # per 10 ms tick, serializing near-simultaneous presses ~10 ms apart and
    # corrupting chord timing. Here every queued event is emitted immediately.
    if keys is not None:
        while True:
            ev = keys.events.get()
            if ev is None:
                break
            t = int(time.monotonic() * 1000)
            btn = IDS[ev.key_number]
            if ev.pressed:
                others = list(held)
                held.add(btn)
                send({'type': 'button.press', 'id': btn, 'held': others, 't': t})
            else:
                held.discard(btn)
                send({'type': 'button.release', 'id': btn, 't': t})

    if serial.in_waiting:
        buf += serial.read(serial.in_waiting)
        while b'\n' in buf:
            line, buf = buf.split(b'\n', 1)
            try:
                msg = json.loads(line)
                mtype = msg.get('type')
                if mtype == 'ping':
                    # Echo the host timestamp (ht) so the host can compute RTT.
                    send({'type': 'pong', 'id': msg.get('id'), 'ht': msg.get('ht'),
                          't': int(time.monotonic() * 1000)})
                elif mtype == 'display' and display_ok:
                    if 'line1' in msg:
                        lbl_profile.text = str(msg['line1'])[:20]
                    if 'line2' in msg:
                        lbl_action.text = str(msg['line2'])[:20]
                elif mtype == 'config':
                    apply_config(msg)
            except Exception:
                pass

    if heartbeat_ms:
        now = time.monotonic()
        if (now - last_tick) * 1000 >= heartbeat_ms:
            last_tick = now
            send({'type': 'tick', 't': int(now * 1000)})

    time.sleep(0.001)
