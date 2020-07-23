# homebridge-vogels-motionmount

[![GitHub package.json version](https://img.shields.io/github/package-json/v/howm/homebridge-vogels-motionmount)](https://www.npmjs.com/package/@howm/homebridge-vogels-motionmount)
[![CircleCI](https://circleci.com/gh/howm/homebridge-vogels-motionmount/tree/master.svg?style=shield)](https://circleci.com/gh/howm/homebridge-vogels-motionmount/tree/master)
[![codecov](https://codecov.io/gh/howm/homebridge-vogels-motionmount/branch/master/graph/badge.svg)](https://codecov.io/gh/howm/homebridge-vogels-motionmount)

> Homebridge plugin for a basic support of Vogel's motion mount. This plugin will add a switch for each position you want to store. `On` position mean move wall mount to the given position and `Off` move to the mount to the wall.

### Install

```bash
npm install -g homebridge-vogels-motionmount 
```

### Usage

Setup the `platform` part of `~/.homebridge/config.json` like in the following example:

```json
{
  // ...
  "platforms": [
    // ...
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
  ]
}
```

- `wallDistance` is an integer value between `0` and `100` where `0` mean wall mount on the wall and `100` wall mount fully deployed.
- `orientation` is a signed integer value between `-100` and `100`, `-100` mean wall mount fully right oriented and `100` wall mount fully left oriented.
 

### Release

```bash
yarn version
yarn build
yarn publish dist --access public
```
