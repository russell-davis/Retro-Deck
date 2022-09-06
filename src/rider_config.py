import time

from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

###
# Debug buttons functions
# Methods for the debug profile of the RetroDeck
###

class RiderConfig:
    mode = 'Rider'

    def print_name(self, name):
        print(name)
        self.screen.set_confirm_selection(self.mode, name)

    def start(self, button_index):
        self.print_name('Start')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.R)
        time.sleep(1.5)
    
    def attach_debug(self, button_index):
        self.print_name('Attach Debug')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.F5)
        time.sleep(1.5)
        
    def stop_proj(self, button_index):
        self.print_name('Stop')
        self.kbd.send(Keycode.SHIFT, Keycode.F5)
        time.sleep(1.5)    
        

    def __init__(self, screen, kbd):
        self.screen = screen
        self.kbd = kbd
        start = {
            'name': 'start',
            'action': self.start
        }
        attach = {
            'name': 'attach_debug',
            'action': self.attach_debug
        }
        stop = {
            'name': 'stop_proj',
            'action': self.stop_proj
        }
        echo = lambda i: { 'name': 'BTN ' + str(i), 'action': self.print_name }
        
        self.config = {
            1: echo(1),
            2: start,
            3: attach,
            4: stop,
            5: echo(5),
            6: echo(6),
            7: echo(7),
            8: echo(8),
        }
