import noble, { Peripheral } from '@abandonware/noble';
import { Logging } from 'homebridge';

const MOTION_MOUNT_SERVICE_UUID = '3e6fe65ded7811e4895e00026fd5c52c';
const MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID =
  'c005fa2106514800b000000000000000';

export interface PositionPreset {
  label: string;
  hexPosition: string;
}

export const WALL_POSITION: PositionPreset = {
  label: 'Wall',
  hexPosition: '00000000',
};

let peripheralInstance: Peripheral | null;

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export async function detectFirstMotionMountPeripheral(
  log: Logging,
): Promise<Peripheral> {
  log.info('[detectFirstMotionMountPeripheral] Removing discover listeners');
  noble.removeAllListeners('discover');

  return new Promise<Peripheral>((resolve, reject) => {
    noble.on('discover', (peripheral: Peripheral) => {
      log.info(
        '[detectFirstMotionMountPeripheral] Peripheral discovered, stopping scan',
      );
      noble
        .stopScanningAsync()
        .catch((err: unknown) =>
          log.warn(
            '[detectFirstMotionMountPeripheral] Failed to stop scan',
            toError(err).message,
          ),
        )
        .finally(() => resolve(peripheral));
    });
    log.info('[detectFirstMotionMountPeripheral] Starting scan');
    noble
      .startScanningAsync([MOTION_MOUNT_SERVICE_UUID], false)
      .catch((err: unknown) => {
        log.error('[detectFirstMotionMountPeripheral] scan failure');
        reject(toError(err));
      });
  });
}

async function getPeripheral(log: Logging): Promise<Peripheral> {
  if (!peripheralInstance) {
    log.info('[getPeripheral] Detecting peripheral ...');
    peripheralInstance = await detectFirstMotionMountPeripheral(log);
    log.info('[getPeripheral] Peripheral detected');
  }

  if (peripheralInstance.state === 'connected') {
    log.info('[getPeripheral] Already connected, returning as is');
    return peripheralInstance;
  }

  log.info('[getPeripheral] Connecting ...');
  await peripheralInstance.connectAsync();
  log.info(
    '[getPeripheral] Connection established, rssi =',
    peripheralInstance.rssi,
  );
  return peripheralInstance;
}

export async function moveToPosition(
  positionPreset: PositionPreset,
  log: Logging,
): Promise<void> {
  log.info('[moveToPosition] Going to', positionPreset.label);
  const peripheral = await getPeripheral(log);

  try {
    log.info('[moveToPosition] Getting characteristics ...');
    const { characteristics } =
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [],
        [MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID],
      );

    // The macOS binding ignores the characteristic filter and returns the whole
    // service, so never rely on the returned order: match the uuid explicitly.
    const setPositionCharacteristic = characteristics.find(
      ({ uuid }) => uuid === MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID,
    );
    if (!setPositionCharacteristic) {
      throw new Error(
        `Characteristic ${MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID} not found`,
      );
    }

    // The characteristic only advertises `write` (with response); writing it
    // without response is silently dropped by CoreBluetooth on macOS.
    await setPositionCharacteristic.writeAsync(
      Buffer.from(positionPreset.hexPosition, 'hex'),
      false,
    );
  } catch (err) {
    log.error('[moveToPosition]', toError(err).message);
  }
}

export async function retrievePositionPresets(
  log: Logging,
): Promise<PositionPreset[]> {
  log.info('[retrievedStoredPositions] Starting the retrieval');
  const peripheral = await getPeripheral(log);
  const { characteristics } =
    await peripheral.discoverAllServicesAndCharacteristicsAsync();
  // Omitting `2a00-2a05` retrieved by some devices
  const normalizedCharacteristics = characteristics.filter(({ uuid }) =>
    uuid.startsWith('c005fa'),
  );

  const positionPresets: PositionPreset[] = [WALL_POSITION];
  // Characteristics (#10-19 + #23-32) are the first part of the preset (+ 13 offset for the 2nd part)
  const presetIndexOffset = 13;
  const presetStartingIndex = 10;
  const presetEndingIndex = 19;
  for (
    let index = presetStartingIndex;
    index <= presetEndingIndex;
    index += 1
  ) {
    const [presetPartOne, presetPartTwo] = await Promise.all([
      normalizedCharacteristics[index].readAsync(),
      normalizedCharacteristics[index + presetIndexOffset].readAsync(),
    ]);
    const presetHex =
      presetPartOne.toString('hex') + presetPartTwo.toString('hex');

    // First two chars for active/inactive preset (01: active, 00: inactive)
    if (presetHex.slice(0, 2) === '01') {
      positionPresets.push({
        // 2-9 chars contain the position (2-5 hex signed wall distance and 6-9 hex signed orientation)
        hexPosition: presetHex.slice(2, 10),
        // 10-end contain the utf8 preset label
        label: Buffer.from(presetHex.substring(10), 'hex').toString('utf8'),
      });
    }
  }
  log.info('[retrievedStoredPositions] #Presets found', positionPresets.length);
  return positionPresets;
}
