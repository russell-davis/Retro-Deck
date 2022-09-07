# Retro Deck

*A programmable 8-key macro pad built on a [Raspberry Pi Pico](https://www.raspberrypi.com/products/raspberry-pi-pico/?variant=raspberry-pi-pico-w) with [CircuitPython](https://circuitpython.org/).*

### Credit where credit is due
I only adapted these designs. The real credit goes to the following people, without whom this project would not have been possible:
- Based on DaveM's [Stream Cheap](https://www.thingiverse.com/thing:2822140), the retro deck adds a slot for a screen mount to be inserted and uses a Pico instead of an Arduino Pro Micro. Dave outlines the steps to build a stream cheap [on his website](https://www.partsnotincluded.com/diy-stream-deck-mini-macro-keyboard/).
- The [Monitor](https://www.thingiverse.com/thing:3548757) was designed by TucksProjects.

## Goals I had for this project
- 3D print 8 key macro pad
- long press a key to activate a profile
- short press a key to activate the macro
- display current mode and last macro run on screen


## Bill of Materials
| Item              | Qty | Price    | Link                                                                                                                                                        |
|-------------------|-----|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Raspberry Pi Pico | 1   | 4-23 USD | [Adafruit (single)](https://www.adafruit.com/product/4864) • [Amazon (3pack)](https://www.amazon.com/dp/B08ZSKMJJD?ref=ppx_yo2ov_dt_b_product_details&th=1) |
| Switches          | 1   | 14 USD   | [Amazon](https://www.amazon.com/dp/B098BGPT6W?ref=ppx_yo2ov_dt_b_product_details&th=1)                                                                      |
| Key Caps          | 1   | 8 USD    | [Amazon](https://www.amazon.com/dp/B01M023NFK?ref=ppx_yo2ov_dt_b_product_details&th=1)                                                                      |
| Oled Screen       | 1   | 7 USD    | [Amazon](https://www.amazon.com/dp/B072Q2X2LL?psc=1&ref=ppx_yo2ov_dt_b_product_details)                                                                     |
| Threaded Inserts  | 1   | 18 USD   | [Amazon](https://www.amazon.com/dp/B08YYGRCBG?psc=1&ref=ppx_yo2ov_dt_b_product_details)                                                                     |
| Hex Socket Bolts  | 1   | 19 USD   | [Amazon](https://www.amazon.com/dp/B09D3DFHH4?psc=1&ref=ppx_yo2ov_dt_b_product_details)                                                                     |
| Development Board | 1   | 15 USD   | [Amazon](https://www.amazon.com/dp/B093GXJ64J?psc=1&ref=ppx_yo2ov_dt_b_product_details)                                                                     |


## Contributing
Any help is appreciated. If you have any questions, feel free to reach out.

If you have any suggestions or improvements, please create a [feature request here](https://github.com/russell-davis/Retro-Deck/issues/new?template=feature_request.md) or [start a pull request here](https://github.com/russell-davis/rlukedavis.com/compare/)

Likewise, bugs reports can be submitted [here](https://github.com/russell-davis/Retro-Deck/issues/new?template=bug_report.md).


## A very quick Q&A
- **Why did you use a Pico instead of an Arduino Pro Micro?**
  - I like Raspberry Pi's, hadn't used a Pico yet, and had $6. I also wanted to try out CircuitPython.
- **Can it launch apps?**
  - If you can launch it with a keyboard shortcut, then yes*.
  - *I haven't tried though. I'm primarily using it to with keyboard shortcuts that are more complicated than I want to remember.
- **Can I use it to play games?**
  - Sure, I guess. I haven't tried it yet. I imagine you'll have some ghosted keys, as this codebase is not rock solid (yet).
- **Your code is shit.**
  - I know. I'm working on it. Please contribute by starting [a feature request](https://github.com/russell-davis/Retro-Deck/issues/new?template=feature_request.md) to make it better