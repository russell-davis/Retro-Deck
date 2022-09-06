import board
from digitalio import DigitalInOut, Direction, Pull


def create_button(pin):
    button = DigitalInOut(pin)
    button.direction = Direction.INPUT
    button.pull = Pull.UP
    return button


def setup_buttons(config):
    buttons = []
    for i in range(10, 14):
        buttons.append(create_button(getattr(board, 'GP{}'.format(i))))
    for i in range(21, 17, -1):
        buttons.append(create_button(getattr(board, 'GP{}'.format(i))))

    return buttons
