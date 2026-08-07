# homebridge-vogels-motionmount

[![GitHub package.json version](https://img.shields.io/github/package-json/v/howm/homebridge-vogels-motionmount)](https://www.npmjs.com/package/homebridge-vogels-motionmount)
[![GH CI Action](https://github.com/howm/homebridge-vogels-motionmount/workflows/CI/badge.svg)](https://github.com/howm/homebridge-vogels-motionmount/actions?query=workflow:CI)

> Unofficial Homebridge plugin for a basic support of Vogel's motion mount. This plugin will add a Television with inputs corresponding to the position presets stored on the mount with the official app.

> [!WARNING]
> `v2` is in **alpha**. It targets Homebridge 2.x and Node.js 22/24, and it is published under the `alpha` dist-tag: `latest` stays on `v1.2.0`, so existing installs are left alone until you opt in. See [Breaking changes](#breaking-changes).

### Install

```bash
# stable
npm install -g homebridge-vogels-motionmount

# v2 alpha
npm install -g homebridge-vogels-motionmount@alpha
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

![Alt text](screens/motionmount-app.png?raw=true 'Motion mount official app') ![Alt text](screens/tv-accessory.png?raw=true 'TV accessory')

### Requirements

- Node.js `^22` or `^24`
- Homebridge `^2.0.0`

### Bluetooth

The mount is a BLE peripheral, and the plugin only talks to it to answer a command: it scans, connects, writes, then lets go. Nothing is kept open between commands — the mount drops the link on its own shortly after it starts moving, so a cached connection is a dead one by the time the next command arrives.

Commands are also serialised and retried once from a fresh discovery, and HomeKit is acknowledged straight away rather than kept waiting: reaching a mount at the edge of range takes far longer than HomeKit waits for a write, and holding the request open only made it give up and send the command again. **Failures therefore land in the Homebridge log, not in the Home app** — check the log if a move does not happen.

#### Handing the adapter to noble (`HCI_CHANNEL_USER`)

On Linux, going through BlueZ is slow once the mount is far from the host. Setting `HCI_CHANNEL_USER=1` in the Homebridge environment hands the adapter to noble and cuts BlueZ out of the path. Measured on a Raspberry Pi against a mount at -82/-92 dBm:

|                        | via BlueZ | user channel |
| ---------------------- | --------- | ------------ |
| discover → connected   | 42s       | 205ms        |
| full preset read cycle | ~45s      | 3.6s         |

It is worth it, with strings attached:

- the adapter must be **down** (`sudo hciconfig hci0 down`) before the process binds it — the kernel refuses the user channel otherwise;
- while it is bound, BlueZ cannot use that adapter: `bluetoothctl` and any other Bluetooth plugin sharing it stop working. Use a second adapter if you need both;
- it needs `CAP_NET_ADMIN` (run as root, or `sudo setcap cap_net_raw,cap_net_admin+eip $(readlink -f $(which node))`).

Left unset, the plugin keeps using the regular BlueZ path.

#### Raspberry Pi connection issues

Like many others I encountered disconnection issues with the builtin bluetooth of Raspberry Pi 3/4 (@see [noble/issues/465](https://github.com/noble/noble/issues/465) and [abandonware/noble/issues/99](https://github.com/abandonware/noble/issues/99) for eg). If you use this device with an external bluetooth device do not forget to set `NOBLE_HCI_DEVICE_ID` env var accordingly (more at https://github.com/abandonware/noble#multiple-adapters-linux-specific).

`v2` makes a weak link far less painful on its own: it asks for a 4s supervision timeout instead of noble's hardcoded 420ms, which used to tear the link down the moment discovery started at -86 dBm.

### Breaking changes

`v2.x.x` requires Homebridge `^2.0.0` and Node.js `^22` or `^24`. Stay on `v1.2.0` if you are still running Homebridge 1.x. Beyond the platform bump, it reworks the Bluetooth layer: no connection is reused between commands, commands are serialised and retried, superseded moves are dropped, and command failures are reported in the log rather than to HomeKit.

`v1.x.x` is not backward compatible with `v0.x.x`. Last versions use a TV accessory where `v0.x.x` use switches.

Prior to `v1.1.0` upgrading from `v0.x.x` to `v1.x.x` require to remove the `~/.homebridge/persist` (or `Menu -> Help -> Reset Connection` with Hoobs).

### Development

This project uses [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

Set `DEBUG=hci,att` to trace what noble exchanges with the mount.

### Release

Tagging a `v*` commit triggers the `Release` workflow, which builds and publishes to npm. The dist-tag is derived from the version: `2.0.0-alpha.0` is published as `alpha`, `2.0.0` as `latest`.

```bash
pnpm version <major|minor|patch|prerelease>
git push --follow-tags
```

### Legal

Vogels is a registered trademarks of Vogel's Products S.A.R.L.

This project is in no way affiliated with, authorized, maintained, sponsored or endorsed by Vogels or any of its affiliates or subsidiaries.
