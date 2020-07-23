import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
} from 'homebridge';
import {
  DEFAULT_POSITION,
  isPositioned,
  moveToPosition,
  Position,
  setupPositionRetrievalInterval,
} from '../helper/motionMount';

let Accessory: typeof PlatformAccessory;

export const PLUGIN_NAME = 'homebridge-vogels-motionmount';
export const PLATFORM_NAME = 'MotionMountDynamicPlatform';

const DEFAULT_OFF_POSITION: Position = {
  name: 'DefaultOffPosition',
  wallDistance: 0,
  orientation: 0,
};

export default class MotionMountDynamicPlatform
  implements DynamicPlatformPlugin {
  private readonly log: Logging;

  private readonly api: API;

  private readonly hap: HAP;

  private readonly positionByName: Map<string, Position> = new Map<
    string,
    Position
  >();

  private readonly accessoryByDisplayName: Map<
    string,
    PlatformAccessory
  > = new Map<string, PlatformAccessory>();

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.hap = api.hap;
    Accessory = api.platformAccessory;

    // Setup the retrieval of position
    setupPositionRetrievalInterval(log);

    const positions: Position[] = (config.positions as Position[]) || [];
    const positionNames = positions.map(
      (position: Position): string => position.name,
    );
    positions.forEach(
      (position: Position): Map<string, Position> =>
        this.positionByName.set(position.name, position),
    );

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      // Registering new added position
      this.positionByName.forEach((position: Position): void => {
        const displayName = position.name;
        if (this.accessoryByDisplayName.has(displayName)) return;

        const accessory = new Accessory(
          displayName,
          this.hap.uuid.generate(displayName),
        );

        accessory.addService(
          this.hap.Service.Switch,
          `MotionMount${displayName}`,
        );
        this.configureAccessory(accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      });

      // Clearing the unused ones
      const unusedAccessories = Array.from(
        this.accessoryByDisplayName.values(),
      ).filter(
        (accessory: PlatformAccessory): boolean =>
          !positionNames.includes(accessory.displayName),
      );

      this.log('Clearing ...', unusedAccessories.length, 'accessory(ies)');
      this.api.unregisterPlatformAccessories(
        PLUGIN_NAME,
        PLATFORM_NAME,
        unusedAccessories,
      );

      // Moving the mount to the default position:
      moveToPosition(DEFAULT_POSITION, log).catch(log.error);
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log('Configuring accessory', accessory.displayName);
    const position = this.positionByName.get(accessory.displayName)!;

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(accessory.displayName, ' identified!');
    });
    accessory
      .getService(this.hap.Service.Switch)!
      .getCharacteristic(this.hap.Characteristic.On)
      .on(
        CharacteristicEventTypes.GET,
        (callback: CharacteristicGetCallback) => {
          isPositioned(position, this.log)
            .then((positioned) => {
              this.log('[configureAccessory] Position read is', positioned);
              callback(undefined, positioned);
            })
            .catch((err) => {
              this.log.error(err);
              callback(err);
            });
        },
      )
      .on(
        CharacteristicEventTypes.SET,
        (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.log.info(`[configureAccessory] Switch state was set to:`, value);
          moveToPosition(value ? position : DEFAULT_OFF_POSITION, this.log)
            .then(() => {
              callback();
              Array.from(this.accessoryByDisplayName.values()).forEach(
                // eslint-disable-next-line no-shadow
                (platformAccessory: PlatformAccessory): void => {
                  if (platformAccessory.displayName !== accessory.displayName)
                    platformAccessory
                      .getService(this.hap.Service.Switch)!
                      .getCharacteristic(this.hap.Characteristic.On)
                      .updateValue(false);
                },
              );
            })
            .catch((err) => {
              this.log.error(err);
              callback(err);
            });
        },
      );

    this.accessoryByDisplayName.set(accessory.displayName, accessory);
  }
}
