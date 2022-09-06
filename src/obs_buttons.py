import time

from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

###
# Debug buttons functions
# Methods for the debug profile of the RetroDeck
# https://docs.circuitpython.org/projects/hid/en/latest/api.html#adafruit-hid-keycode-keycode
###

class OBSConfig:
    mode = 'OBS'

    def print_name(self, name):
        print(name)
        self.screen.set_confirm_selection(self.mode, name)

    def black(self, button_index):
        self.print_name('Black')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.ONE)
        time.sleep(1.5)
    
    def starting_soon(self, button_index):
        self.print_name('Starting Soon')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.TWO)
        time.sleep(1.5)
        
    def chatting(self, button_index):
        self.print_name('Chatting')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.THREE)
        time.sleep(1.5)    
        
    def edge(self, button_index):
        self.print_name('edge')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.FOUR)
        time.sleep(1.5)
        
    def mic_toggle(self, button_index):
        self.print_name('edge')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.FIVE)
        time.sleep(1.5)
        
    def video_toggle(self, button_index):
        self.print_name('video_toggle')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.SIX)
        time.sleep(1.5)
        
    def t4w(self, button_index):
        self.print_name('T4W')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.SEVEN)
        time.sleep(1.5)
        
    def lofi(self, button_index):
        self.print_name('edge')
        self.kbd.send(Keycode.CONTROL, Keycode.ALT, Keycode.SHIFT, Keycode.EIGHT)
        time.sleep(1.5)
        

    def __init__(self, screen, kbd):
        self.screen = screen
        self.kbd = kbd
        
        echo = lambda i: { 'name': 'BTN ' + str(i), 'action': self.print_name }
        
        self.config = {
            1: {
                'name': 'black',
                'action': self.black
            },
            2: {
                'name': 'starting_soon',
                'action': self.starting_soon
            },
            3: {
                'name': 'chatting',
                'action': self.chatting
            },
            4: {
                'name': 'edge',
                'action': self.edge
            },
            5: {
                'name': 'mic_toggle',
                'action': self.mic_toggle
            },
            6: {
                'name': 'video_toggle',
                'action': self.video_toggle
            },
            7: {
                'name': 't4w',
                'action': self.t4w
            },
            8: {
                'name': 'lofi',
                'action': self.lofi
            }
        }
