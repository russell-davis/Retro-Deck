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

def get_device_name(file_path):
    print("opening " + file_path)
    f = open(file_path)
    x = f.read()
    d = json.loads(x)
    return d["name"]