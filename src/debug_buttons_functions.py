import time

from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

###
# Debug buttons functions
# Methods for the debug profile of the RetroDeck
###

class DebugButtonFunctions:
    mode = 'debug'

    def print_name(self, name):
        print(name)
        self.screen.set_confirm_selection(self.mode, name)

    # define methods for starting the project and stopping the project
    def start_project(self, button_index):
        self.print_name('Start Project')
        time.sleep(3)

    def stop_project(self, button_index):
        self.print_name('Stop Project')
        self.kbd.send(Keycode.CONTROL, Keycode.F2)
        time.sleep(1.5)

    # define methods for navigate the project files left and right
    def previous_file(self, button_index):
        self.print_name('Prev File')
        self.kbd.send(Keycode.CONTROL, Keycode.SHIFT, Keycode.TAB)
        time.sleep(0.3)

    def next_file(self, button_index):
        self.print_name('Next File')
        self.kbd.send(Keycode.CONTROL, Keycode.TAB)
        time.sleep(0.3)

    def lock_screen(self, button_index):
        self.print_name('Lock Screen')
        self.kbd.send(Keycode.WINDOWS, Keycode.L)
        time.sleep(1.5)

    def __init__(self, screen, kbd):
        self.screen = screen
        self.kbd = kbd
        self.config = {
            1: {
                'name': 'BTN 1',
                'action': self.print_name
            },
            2: {
                'name': 'BTN 2',
                'action': self.print_name
            },
            3: {
                'name': 'BTN 3',
                'action': self.print_name
            },
            4: {
                'name': 'BTN 4',
                'action': self.print_name
            },
            5: {
                'name': 'BTN 5',
                'action': self.print_name
            },
            6: {
                'name': 'BTN 6',
                'action': self.print_name
            },
            7: {
                'name': 'BTN 7',
                'action': self.print_name
            },
            8: {
                'name': 'BTN 8',
                'action': self.print_name
            }
        }
