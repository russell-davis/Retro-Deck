import terminalio
from adafruit_display_text import label
import displayio
import board
import busio
import time
import adafruit_displayio_ssd1306

WIDTH = 128
HEIGHT = 64  # Change to 64 if needed
BORDER = 1


# create a class for the oled display
class Oled:
    def __init__(self, app_config):
        self.app_config = app_config
        self.current_scene = None
        print("Starting up OLED")

        # release the display
        displayio.release_displays()

        SDA = board.GP0
        SCL = board.GP1
        i2c = busio.I2C(SCL, SDA)

        if (i2c.try_lock()):
            i2c.unlock()
        print()

        # Create the I2C interface.
        display_bus = displayio.I2CDisplay(i2c, device_address=60)
        self.screen = adafruit_displayio_ssd1306.SSD1306(display_bus, width=WIDTH, height=HEIGHT)

        time.sleep(0.05)

        self.set_logo()

    def set_logo(self):
        scene = displayio.Group()
        logoLabel = label.Label(
            terminalio.FONT,
            scale=2,
            text="RetroDeck",
            x=15,
            y=HEIGHT // 2,
        )
        scene.append(logoLabel)
        self.screen.show(scene)
        time.sleep(0.3)
        scene.pop()

    def set_standby(self):
        if self.current_scene:
            self.current_scene.pop()

        self.current_scene = displayio.Group()
        lbl1 = label.Label(
            terminalio.FONT,
            scale=1,
            text=self.app_config['name'] + " " + self.app_config['version'],
            x=0,
            y=4,
        )
        self.current_scene.append(lbl1)

        lbl2 = label.Label(
            terminalio.FONT,
            scale=1,
            text="MODE: STANDBY",
            x=0,
            y=20,
        )
        self.current_scene.append(lbl2)
        self.screen.show(self.current_scene)

    def set_confirm_selection(self, mode, selection_name):
        if self.current_scene:
            self.current_scene.pop()

        self.current_scene = displayio.Group()
        lbl1 = label.Label(
            terminalio.FONT,
            scale=1,
            text=self.app_config['name'] + " " + self.app_config['version'],
            x=0,
            y=4,
        )
        self.current_scene.append(lbl1)

        lbl2 = label.Label(
            terminalio.FONT,
            scale=1,
            text="Mode: " + mode,
            x=0,
            y=20,
        )
        self.current_scene.append(lbl2)

        confirm = "{}".format(selection_name).upper()
        lbl3 = label.Label(
            terminalio.FONT,
            scale=2,
            text=confirm,
            x=0,
            y=44,
        )
        self.current_scene.append(lbl3)

        self.screen.show(self.current_scene)

