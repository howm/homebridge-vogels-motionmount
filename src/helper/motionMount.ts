import noble, { Peripheral } from '@abandonware/noble';
import { Logging } from 'homebridge';
import wait from 'waait';
import { hexToInt, toHex16Buffer } from './number';

const MOTION_MOUNT_SERVICE_UUIDS = ['3e6fe65ded7811e4895e00026fd5c52c'];
const MOTION_MOUNT_CHARACTERISTICS_UUIDS = [
  'c005fa0006514800b000000000000000',
  'c005fa0106514800b000000000000000',
];
const DEFAULT_RANGE_TOLERANCE = 10;
export const DEFAULT_POSITION = {
  name: 'DefaultPosition',
  wallDistance: 0,
  orientation: 0,
};

let peripheralInstance: Peripheral | null = null;
let peripheralAccessInProgress = false;
let motionMountMoving = false;
let currentPosition: Position = DEFAULT_POSITION;

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
    noble.startScanningAsync(MOTION_MOUNT_SERVICE_UUIDS, false).catch((err) => {
      log.error('[detectFirstMotionMountPeripheral] scan failure');
      reject(err);
    });
  });
}

async function getPeripheral(log: Logging): Promise<Peripheral> {
  if (peripheralInstance && !peripheralAccessInProgress) {
    log('[getPeripheral] Returning instance');
    return peripheralInstance;
  }

  while (peripheralAccessInProgress) {
    log('[getPeripheral] Waiting end of use');
    await wait(1000);
  }

  try {
    peripheralAccessInProgress = true;
    log('[getPeripheral] Detecting peripheral ...');
    peripheralInstance = await detectFirstMotionMountPeripheral(log);
    log('[getPeripheral] Peripheral detected');
    peripheralInstance.once('disconnect', () => {
      log('[getPeripheral] Disconnected, resetting instance');
      peripheralInstance = null;
      peripheralAccessInProgress = false;
    });
    log('[getPeripheral] Connecting ...');
    await peripheralInstance.connectAsync();
    log('[getPeripheral] Connection established');
    return peripheralInstance;
  } catch (err) {
    peripheralAccessInProgress = false;
    throw err;
  }
}

export async function updateCurrentPosition(log: Logging): Promise<void> {
  log('[updateCurrentPosition] Checking position');
  const peripheral = await getPeripheral(log);

  log('[updateCurrentPosition] Getting characteristics ...');
  const {
    characteristics: [wallDistanceCharacteristic, orientationCharacteristic],
  } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
    MOTION_MOUNT_SERVICE_UUIDS,
    MOTION_MOUNT_CHARACTERISTICS_UUIDS,
  );

  log('[updateCurrentPosition] Reading them ...');
  const [wallData, orientationData] = await Promise.all([
    wallDistanceCharacteristic.readAsync(),
    orientationCharacteristic.readAsync(),
  ]);
  const wallDistance = hexToInt(wallData.toString('hex'));
  const orientation = hexToInt(orientationData.toString('hex'));
  log(
    '[updateCurrentPosition] Read result for wall',
    wallDistance,
    'and for orientation',
    orientation,
  );
  log('[updateCurrentPosition] Disconnecting');
  await peripheral.disconnectAsync();

  currentPosition = {
    name: 'CurrentPosition',
    wallDistance,
    orientation,
  };
}

async function getCurrentPosition(): Promise<Position> {
  return currentPosition;
}

export async function moveToPosition(
  position: Position,
  log: Logging,
): Promise<void> {
  log('[moveToPosition] Going to', position.name);

  while (motionMountMoving) {
    await wait(1000);
  }

  motionMountMoving = true;
  const peripheral = await getPeripheral(log);

  log('[moveToPosition] Getting characteristics ...');
  const {
    characteristics: [wallDistanceCharacteristic, orientationCharacteristic],
  } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
    MOTION_MOUNT_SERVICE_UUIDS,
    MOTION_MOUNT_CHARACTERISTICS_UUIDS,
  );

  log('[moveToPosition] Setting wallDistance', position.wallDistance);
  await wallDistanceCharacteristic.writeAsync(
    toHex16Buffer(position.wallDistance),
    true,
  );
  await wait(2000);

  log('[moveToPosition] Setting orientation', position.orientation);
  if (position.wallDistance > 5) {
    await orientationCharacteristic!.writeAsync(
      toHex16Buffer(position.orientation),
      true,
    );
    await wait(2000);
  }

  log('[moveToPosition] Disconnecting');
  await peripheral.disconnectAsync();

  motionMountMoving = false;
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

export function setupPositionRetrievalInterval(log: Logging): NodeJS.Timeout {
  return setInterval(() => updateCurrentPosition(log), 20000);
}
