import board
import json
from digitalio import DigitalInOut, Direction, Pull


def create_button(pin):
    button = DigitalInOut(pin)
    button.direction = Direction.INPUT
    button.pull = Pull.UP
    return button


def setup_buttons(mapping = ""):
    buttons = []
    if not mapping:
        print('no mapping provided')
        for i in range(10, 14):
            buttons.append(create_button(getattr(board, 'GP{}'.format(i))))
        for i in range(21, 17, -1):
            buttons.append(create_button(getattr(board, 'GP{}'.format(i))))
    else:
        #If there is a mappings.json file on the device, parse it and use it.
        # allows for easy config of pin/button mapping per device without changing source
        print('loading provided mapping')
        jsonObject = json.loads(mapping)
        for val in jsonObject["mappings"]:
            print("Pin " + 'GP{}'.format(val["Pin"]) + " = Button " + str(val["Button"]))
            buttons.insert(val["Button"] - 1, create_button(getattr(board, 'GP{}'.format(val["Pin"]))))

    return buttons
