import {
  Logging,
  API,
  PlatformAccessory,
  Categories,
  HAP,
  DynamicPlatformPlugin,
  APIEvent,
  PlatformConfig,
  Service,
  CharacteristicValue,
} from 'homebridge';
import {
  retrievePositionPresets,
  PositionPreset,
  moveToPosition,
  WALL_POSITION,
} from '../helper/motionMount';

export const PLUGIN_NAME = 'homebridge-vogels-motionmount';
export const PLATFORM_NAME = 'MotionMountDynamicPlatform';

type MotionMountContext = {
  positionPresets?: PositionPreset[];
};

type MotionMountAccessory = PlatformAccessory<MotionMountContext>;

export default class MotionMountDynamicPlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;

  private readonly api: API;

  private readonly hap: HAP;

  private tvAccessory?: MotionMountAccessory;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.hap = api.hap;

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      void this.onDidFinishLaunching(config.name ?? 'MotionMount');
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('ConfigureAccessory');
    const tvService = accessory.getService(this.hap.Service.Television);
    if (!tvService) {
      this.log.warn('[configureAccessory] Not a tv accessory');
      return;
    }

    this.tvAccessory = accessory;
    this.bindTvServiceHandlers(tvService);
  }

  private async onDidFinishLaunching(displayName: string): Promise<void> {
    try {
      if (!this.tvAccessory) {
        this.tvAccessory = this.createTvAccessory(displayName);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          this.tvAccessory,
        ]);
      }
      await this.updateInputs();
    } catch (err) {
      this.log.error(
        '[didFinishLaunching]',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private bindTvServiceHandlers(tvService: Service): void {
    tvService
      .getCharacteristic(this.hap.Characteristic.Active)
      .onSet((active: CharacteristicValue): void => {
        if (active) return;
        this.drive('[setActive]', () => this.moveToWall(tvService));
      });

    tvService
      .getCharacteristic(this.hap.Characteristic.ActiveIdentifier)
      .onSet((index: CharacteristicValue): void => {
        const positionPresets = this.tvAccessory?.context.positionPresets ?? [];
        const positionPreset = positionPresets[index as number];
        if (!positionPreset) {
          this.log.warn('[setActiveIdentifier] Unknown position preset', index);
          return;
        }
        this.drive('[setActiveIdentifier]', () =>
          moveToPosition(positionPreset, this.log),
        );
      });
  }

  /**
   * Acknowledge HomeKit straight away and drive the mount afterwards.
   *
   * Reaching a mount at the edge of Bluetooth range takes the best part of a
   * minute, far longer than HomeKit waits for a write. Holding the request open
   * only makes HomeKit give up, call it a failure and send the command again,
   * piling up requests the mount cannot serve. Failures go to the log instead.
   */
  private drive(context: string, action: () => Promise<void>): void {
    void action().catch((err: unknown) => {
      this.log.error(context, err instanceof Error ? err.message : String(err));
    });
  }

  private async moveToWall(tvService: Service): Promise<void> {
    await moveToPosition(WALL_POSITION, this.log);
    tvService.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, 0);
  }

  private createTvAccessory(displayName: string): MotionMountAccessory {
    // Accessory config
    const tvAccessory: MotionMountAccessory = new this.api.platformAccessory(
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
    this.bindTvServiceHandlers(tvService);

    return tvAccessory;
  }

  private arePositionPresetsUnchanged(
    positionPresets: PositionPreset[],
  ): boolean {
    const lastKnownPositionPresets: PositionPreset[] =
      this.tvAccessory?.context.positionPresets ?? [];
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
    const tvAccessory = this.tvAccessory;
    if (!tvAccessory) throw new Error('Missing TV accessory');

    const tvService = tvAccessory.getService(this.hap.Service.Television);
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
    tvAccessory.services
      .filter(({ displayName }) => !!displayName)
      .forEach((service) => tvAccessory.removeService(service));

    positionPresets.forEach(({ label }, index) => {
      this.log.info('[updateInputs] Adding input for preset', label);
      const inputService = tvAccessory.addService(
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

    tvAccessory.context.positionPresets = positionPresets;
    return positionPresets;
  }
}
