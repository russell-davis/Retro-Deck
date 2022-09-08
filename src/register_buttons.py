import board
from digitalio import DigitalInOut, Direction, Pull


def create_button(pin):
    button = DigitalInOut(pin)
    button.direction = Direction.INPUT
    button.pull = Pull.UP
    return button


def setup_buttons(config):
    buttons = []
    for i in range(11, 15):
        buttons.append(create_button(getattr(board, 'GP{}'.format(i))))
    for i in range(20, 16, -1):
        buttons.append(create_button(getattr(board, 'GP{}'.format(i))))

    return buttons
