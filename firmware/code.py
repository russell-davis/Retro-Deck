import board
import time
import usb_cdc
import json

serial = usb_cdc.data
serial.timeout = 0


def send(msg):
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
IDS   = [1, 2, 3, 4, 5, 6, 7, 8]

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

try:
    keys = keypad.Keys(PINS, value_when_pressed=False, pull=True)
    send({'step': 'keys_ok'})
except Exception as e:
    send({'step': 'keys_error', 'err': str(e)})

send({'type': 'ready', 'version': '2.0.0-dev'})

held = set()
buf = b''
while True:
    ev = keys.events.get()
    if ev:
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
                if msg.get('type') == 'ping':
                    send({'type': 'pong', 'id': msg.get('id')})
                elif msg.get('type') == 'display' and display_ok:
                    if 'line1' in msg:
                        lbl_profile.text = str(msg['line1'])[:20]
                    if 'line2' in msg:
                        lbl_action.text = str(msg['line2'])[:20]
            except Exception:
                pass

    time.sleep(0.01)
