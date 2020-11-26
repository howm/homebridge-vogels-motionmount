import noble, { Peripheral } from '@abandonware/noble';
import { Logging } from 'homebridge';
import { positionToHex16Buffer } from './number';

const MOTION_MOUNT_SERVICE_UUID = '3e6fe65ded7811e4895e00026fd5c52c';
const MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID =
  'c005fa2106514800b000000000000000';

const DEFAULT_RANGE_TOLERANCE = 10;
export const DEFAULT_POSITION = {
  name: 'DefaultPosition',
  wallDistance: 0,
  orientation: 0,
};

let currentPosition: Position = DEFAULT_POSITION;
let peripheralInstance: Peripheral | null;

export interface Position {
  name: string;
  wallDistance: number;
  orientation: number;
}

export async function detectFirstMotionMountPeripheral(
  log: Logging,
): Promise<Peripheral> {
  log('[detectFirstMotionMountPeripheral] Removing discover listeners');
  noble.removeAllListeners('discover');

  return new Promise((resolve, reject) => {
    noble.on('discover', async (peripheral: Peripheral) => {
      log(
        '[detectFirstMotionMountPeripheral] Peripheral discovered, stopping scan',
      );
      await noble.stopScanningAsync();
      resolve(peripheral);
    });
    log('[detectFirstMotionMountPeripheral] Starting scan');
    noble
      .startScanningAsync([MOTION_MOUNT_SERVICE_UUID], false)
      .catch((err) => {
        log.error('[detectFirstMotionMountPeripheral] scan failure');
        reject(err);
      });
  });
}

async function getPeripheral(log: Logging): Promise<Peripheral> {
  if (!peripheralInstance) {
    log('[getPeripheral] Detecting peripheral ...');
    peripheralInstance = await detectFirstMotionMountPeripheral(log);
    log('[getPeripheral] Peripheral detected');
  }

  if (peripheralInstance.state === 'connected') {
    log('[getPeripheral] Already connected, returning as is');
    return peripheralInstance;
  }

  log('[getPeripheral] Connecting ...');
  await peripheralInstance.connectAsync();
  log(
    '[getPeripheral] Connection established, rssi =',
    peripheralInstance.rssi,
  );
  return peripheralInstance;
}

async function getCurrentPosition(): Promise<Position> {
  return currentPosition;
}

export async function moveToPosition(
  position: Position,
  log: Logging,
): Promise<void> {
  log('[moveToPosition] Going to', position.name);
  const peripheral = await getPeripheral(log);

  try {
    log('[moveToPosition] Getting characteristics ...');
    const {
      characteristics: [setPositionCharacteristic],
    } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [],
      [MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID],
    );

    await setPositionCharacteristic.writeAsync(
      positionToHex16Buffer(position),
      true,
    );

    currentPosition = position;
  } catch (err) {
    log.error('[moveToPosition]', err.message);
  }
}

export async function isPositioned(
  position: Position,
  log: Logging,
  rangeTolerance = DEFAULT_RANGE_TOLERANCE,
): Promise<boolean> {
  log('[isPositioned] Checking position', position.name);

  const { wallDistance, orientation } = await getCurrentPosition();

  return (
    wallDistance > position.wallDistance - rangeTolerance &&
    wallDistance < position.wallDistance + rangeTolerance &&
    orientation > position.orientation - rangeTolerance &&
    orientation < position.orientation + rangeTolerance
  );
}
