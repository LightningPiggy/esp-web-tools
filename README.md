# ESP Web Tools

This fork of ESP Web Tools for LightningPiggy supports find-and-replace of configuration values in the binary firmware.

The binary firmware files (such as Main.ino.bin) contain hard-coded configuration strings that originate from [config.h in the source code](https://github.com/LightningPiggy/lightning-piggy/blob/master/Main/config.h), which are then replaced by the values the user provides on the webpage.

For example, "REPLACETHISBYLNBITSHOST_REPLACETHISBYLNBITSHOST_REPLACETHISBYLNBITSHOST" will be replaced by the LNBits hostname that's provided by the user in the [webinstaller](http://lightningpiggy.github.io/).

The Javascript code (see src/flash.ts, compiled to dist/flash.js and then bundled into dist/webumd/install-button.js) will modify the binary firmware files on the fly, fix the XOR checksum, and then upload the firmware to the ESP32 device.

## Development

Update src/flash.ts and then run:

./script/develop

Allow flashing ESPHome or other ESP-based firmwares via the browser. Will automatically detect the board type and select a supported firmware. [See website for full documentation.](https://esphome.github.io/esp-web-tools/)

```html
<esp-web-install-button
  manifest="firmware_esphome/manifest.json"
></esp-web-install-button>
```

Example manifest:

```json
{
  "name": "ESPHome",
  "version": "2021.10.3",
  "home_assistant_domain": "esphome",
  "funding_url": "https://esphome.io/guides/supporters.html",
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-C3",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 0 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-c3.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-S2",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s2.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-S3",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s3.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP8266",
      "parts": [
        { "path": "esp8266.bin", "offset": 0 }
      ]
    }
  ]
}
```

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5001.
