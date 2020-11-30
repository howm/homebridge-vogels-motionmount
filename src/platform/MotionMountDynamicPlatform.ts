import {
  Logging,
  API,
  PlatformAccessory,
  Categories,
  HAP,
  DynamicPlatformPlugin,
  APIEvent,
  PlatformConfig,
} from 'homebridge';
import {
  retrievePositionPresets,
  PositionPreset,
  moveToPosition,
  WALL_POSITION,
} from '../helper/motionMount';

export const PLUGIN_NAME = 'homebridge-vogels-motionmount';
export const PLATFORM_NAME = 'MotionMountDynamicPlatform';

let Accessory: typeof PlatformAccessory;

export default class MotionMountDynamicPlatform
  implements DynamicPlatformPlugin {
  private readonly log: Logging;

  private readonly api: API;

  private readonly hap: HAP;

  private tvAccessory: PlatformAccessory;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.hap = api.hap;

    Accessory = api.platformAccessory;

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
      if (!this.tvAccessory) {
        this.tvAccessory = await this.createTvAccessory(
          config.name || 'MotionMount',
        );
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          this.tvAccessory,
        ]);
      }
      await this.updateInputs();
    });
  }

  async configureAccessory(accessory: PlatformAccessory): Promise<void> {
    this.log.info('ConfigureAccessory');
    this.tvAccessory = accessory;
    const tvService = accessory.getService(this.hap.Service.Television);

    if (!tvService) {
      this.log.warn('[configureAccessory] No tv service found');
      return;
    }

    tvService
      .getCharacteristic(this.hap.Characteristic.Active)
      .on('set', async (active: number, callback: Function) => {
        if (!active) {
          await moveToPosition(WALL_POSITION, this.log);
          tvService.updateCharacteristic(
            this.hap.Characteristic.ActiveIdentifier,
            0,
          );
        }
        callback(null);
      });

    tvService
      .getCharacteristic(this.hap.Characteristic.ActiveIdentifier)
      .on('set', async (index: number, callback: Function) => {
        await moveToPosition(
          this.tvAccessory.context.positionPresets[index],
          this.log,
        );
        callback(null);
      });
  }

  private async createTvAccessory(
    displayName: string,
  ): Promise<PlatformAccessory> {
    // Accessory config
    const tvAccessory = new Accessory(
      displayName,
      this.hap.uuid.generate('homebridge:vogels-motionmount'),
    );
    tvAccessory.category = Categories.TELEVISION;

    // TV service
    const tvService = tvAccessory.addService(this.hap.Service.Television);
    tvService.setCharacteristic(
      this.hap.Characteristic.ConfiguredName,
      displayName,
    );
    tvService.setCharacteristic(
      this.hap.Characteristic.SleepDiscoveryMode,
      this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    return tvAccessory;
  }

  private arePositionPresetsUnchanged(
    positionPresets: PositionPreset[],
  ): boolean {
    const lastKnownPositionPresets: PositionPreset[] =
      this.tvAccessory.context.positionPresets || [];
    return (
      lastKnownPositionPresets.length === positionPresets.length &&
      !lastKnownPositionPresets.some(
        ({ label, hexPosition }, index) =>
          positionPresets[index].label !== label ||
          positionPresets[index].hexPosition !== hexPosition,
      )
    );
  }

  private async updateInputs(): Promise<PositionPreset[]> {
    const tvService = this.tvAccessory.getService(this.hap.Service.Television);
    if (!tvService) throw new Error('Missing TV service');

    const positionPresets: PositionPreset[] = await retrievePositionPresets(
      this.log,
    );

    if (this.arePositionPresetsUnchanged(positionPresets)) {
      this.log.info('[updateInputs] position presets unchanged');
      return positionPresets;
    }

    this.log.info('[updateInputs] Nuking all inputs');
    // Nuke presets
    this.tvAccessory.services
      .filter(({ displayName }) => !!displayName)
      .forEach((service) => this.tvAccessory.removeService(service));

    positionPresets.forEach(({ label }, index) => {
      this.log.info('[updateInputs] Adding input for preset', label);
      const inputService = this.tvAccessory.addService(
        this.hap.Service.InputSource,
        label.toLowerCase(),
        label,
      );
      inputService
        .setCharacteristic(this.hap.Characteristic.Identifier, index)
        .setCharacteristic(this.hap.Characteristic.ConfiguredName, label)
        .setCharacteristic(
          this.hap.Characteristic.IsConfigured,
          this.hap.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.hap.Characteristic.InputSourceType,
          this.hap.Characteristic.InputSourceType.OTHER,
        );

      tvService.addLinkedService(inputService);
    });

    this.tvAccessory.context.positionPresets = positionPresets;
    return positionPresets;
  }
}
