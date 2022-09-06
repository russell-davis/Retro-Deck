from src.rider_config import RiderConfig
from src.debug_buttons_functions import DebugButtonFunctions
from src.obs_buttons import OBSConfig
from src.oled import Oled
from src.register_buttons import setup_buttons
import usb_hid
from adafruit_hid.keyboard import Keyboard
import time

# TODO: - Switch profile button
# TODO: - Companion App - Open specific apps
# TODO: - Profile for Launcher - Open specific apps
# TODO: - Profile for HomeKit actions
# TODO: - Profile for Webstorm actions


# Create the app configuration using the profile configurations
app_config = {
    "name": "RetroDeck",
    "version": "v1.0.0",
}


## Setup the system


# Setup oled display
screen = Oled(app_config)
screen.set_standby()

# create the HID
kbd = Keyboard(usb_hid.devices)

# Create the profile configurations
debug_config = DebugButtonFunctions(screen, kbd)
rider_config = RiderConfig(screen, kbd)
obs_config = OBSConfig(screen, kbd)

configs = [
    debug_config,
    rider_config,
    obs_config
]

# current config
current_config = configs[0].config

# Start listening for button presses
buttons = setup_buttons(current_config)

config_mode = False
quit_app = False

def handle_config_mode():
    screen.set_confirm_selection("Profile", "Select")
    # confirm

def handle_button_press(button):
    global config_mode
    global current_config
    config_changed = False
    key = buttons.index(button) + 1
    held_for = 0
    while not button.value:
        # if button held for 2 or more seconds, enter change to the profile at that index
        if held_for > 2:
            index = key - 1
            if configs[index]:
                cfg = configs[index]
                print("setting config to " + cfg.mode)
                cfg.print_name(key)
                current_config = cfg.config
                config_changed = True
                while not button.value:
                    time.sleep(0.01)
                    held_for += 0.01
                break
        time.sleep(0.01)
        held_for += 0.01
    print("button " + str(key) + " held for: " + str(held_for) + "s")
    
    if config_changed:
        return

    if key in current_config:
        action = current_config[key]["action"]
        if action:
            action(key)

while not quit_app:
    # perform the action for each button press
    for button in buttons:
        if not button.value:
            handle_button_press(button)
    time.sleep(0.01)  # sleep for debounce
