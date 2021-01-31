# homebridge-vogels-motionmount

[![GitHub package.json version](https://img.shields.io/github/package-json/v/howm/homebridge-vogels-motionmount)](https://www.npmjs.com/package/homebridge-vogels-motionmount)
[![GH CI Action](https://github.com/howm/homebridge-vogels-motionmount/workflows/CI/badge.svg)](https://github.com/howm/homebridge-vogels-motionmount/actions?query=workflow:CI)

> Unofficial Homebridge plugin for a basic support of Vogel's motion mount. This plugin will add a Television with inputs corresponding to the position presets stored on the mount with the official app.

### Install

```bash
npm install -g homebridge-vogels-motionmount 
```

### Usage

In your `~/.homebridge/config.json` on the platform part add your the config using the following example:

```json
{
  "platform": "MotionMountDynamicPlatform",
  "name": "MotionMount"
}
```

- `name` is optional (default to `MotionMount`)
 
Position presets are retrieved at the startup: 
 
 ![Alt text](screens/motionmount-app.png?raw=true "Motion mount official app") ![Alt text](screens/tv-accessory.png?raw=true "TV accessory")
 
### Raspberry PI bluetooth connection issues

Like many others I encountered disconnection issues with the builtin bluetooth of raspberry Pi 3/4 (@see [noble/issues/465](https://github.com/noble/noble/issues/465) and [abandonware/noble/issues/99](https://github.com/abandonware/noble/issues/99) for eg). If you use this device with an external bluetooth device do not forget to set `NOBLE_HCI_DEVICE_ID` env var accordingly (more at https://github.com/abandonware/noble#multiple-adapters-linux-specific).  

### Breaking changes

`v1.x.x` is not backward compatible with `v0.x.x`. Last versions use a TV accessory where `v0.x.x` use switches.

Prior to `v1.1.0` upgrading from `v0.x.x` to `v1.x.x` require to remove the `~/.homebridge/persist` (or `Menu -> Help -> Reset Connection` with Hoobs).

### Release

```bash
yarn version
yarn build
yarn publish dist --access public
```
