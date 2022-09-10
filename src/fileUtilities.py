import json
import os

name = "fileUtilities"

def file_exists(filename):
    file_exists = False
    try:
        os.stat(filename)
        file_exists = True
    except OSError:
        file_exists = False

    return file_exists