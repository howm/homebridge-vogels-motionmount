# homebridge-vogels-motionmount

[![GitHub package.json version](https://img.shields.io/github/package-json/v/howm/homebridge-vogels-motionmount)](https://www.npmjs.com/package/@howm/homebridge-vogels-motionmount)

> Homebridge plugin for a basic support of Vogel's motion mount. This plugin will add a switch for each position you want to store. `On` position mean move wall mount to the given position and `Off` move to the mount to the wall.

### Install

```bash
npm install -g homebridge-vogels-motionmount 
```

### Usage

In your `~/.homebridge/config.json` on the platform part add your the config using the following example:

```json
{
  "platform": "MotionMountDynamicPlatform",
  "name": "MotionMountDynamicPlatform",
  "positions": [
    {
      "name": "Wall",
      "wallDistance": 0,
      "orientation": 0
    },
    {
      "name": "Kitchen",
      "wallDistance": 100,
      "orientation": -100
    },
    {
      "name": "Front",
      "wallDistance": 100,
      "orientation": 50 
    }
  ]
}
```

- `wallDistance` is an integer value between `0` and `100` where `0` mean wall mount on the wall and `100` wall mount fully deployed.
- `orientation` is a signed integer value between `-100` and `100`, `-100` mean wall mount fully right oriented and `100` wall mount fully left oriented.
 
### Raspberry PI bluetooth connection issues

Like many others I encountered disconnection issues with the builtin bluetooth of raspberry Pi 3/4 (@see [noble/issues/465](https://github.com/noble/noble/issues/465) and [abandonware/noble/issues/99](https://github.com/abandonware/noble/issues/99) for eg). If you use this device with an external bluetooth device do not forget to set `NOBLE_HCI_DEVICE_ID` env var accordingly (more at https://github.com/abandonware/noble#multiple-adapters-linux-specific).  

### Release

```bash
yarn version
yarn build
yarn publish dist --access public
```
