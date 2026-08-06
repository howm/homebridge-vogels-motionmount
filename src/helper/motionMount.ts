import noble, { Peripheral } from '@abandonware/noble';
import { Logging } from 'homebridge';

const MOTION_MOUNT_SERVICE_UUID = '3e6fe65ded7811e4895e00026fd5c52c';
const MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID =
  'c005fa2106514800b000000000000000';

// noble never times out on its own, so a request issued over a dead link hangs
// forever and wedges every later call. These bounds exist to break that
// deadlock, not to enforce responsiveness: a mount sitting at the edge of range
// (a Raspberry Pi a few rooms away reports around -85 dBm) routinely needs 40s
// just to connect, so they are deliberately loose.
const SCAN_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 90_000;
const DISCONNECT_TIMEOUT_MS = 10_000;
const DISCOVER_TIMEOUT_MS = 60_000;
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 30_000;

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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopScanning(log: Logging): Promise<void> {
  try {
    await noble.stopScanningAsync();
  } catch (err) {
    log.warn('[stopScanning] Failed to stop scan', toError(err).message);
  }
}

export async function detectFirstMotionMountPeripheral(
  log: Logging,
): Promise<Peripheral> {
  log.info('[detectFirstMotionMountPeripheral] Removing discover listeners');
  noble.removeAllListeners('discover');

  const discovery = new Promise<Peripheral>((resolve, reject) => {
    noble.on('discover', (peripheral: Peripheral) => {
      log.info(
        '[detectFirstMotionMountPeripheral] Peripheral discovered, stopping scan',
      );
      void stopScanning(log).finally(() => resolve(peripheral));
    });
    log.info('[detectFirstMotionMountPeripheral] Starting scan');
    noble
      .startScanningAsync([MOTION_MOUNT_SERVICE_UUID], false)
      .catch((err: unknown) => {
        log.error('[detectFirstMotionMountPeripheral] scan failure');
        reject(toError(err));
      });
  });

  try {
    return await withTimeout(discovery, SCAN_TIMEOUT_MS, 'Scan');
  } catch (err) {
    // A scan left running keeps the adapter busy and starves the next attempt.
    noble.removeAllListeners('discover');
    await stopScanning(log);
    throw toError(err);
  }
}

/**
 * Forget the cached peripheral so the next call rediscovers from scratch.
 * Disconnecting is best effort: the link is usually already gone by then.
 */
async function resetPeripheral(log: Logging): Promise<void> {
  const peripheral = peripheralInstance;
  peripheralInstance = null;
  if (!peripheral) return;

  log.info('[resetPeripheral] Dropping the cached peripheral');
  try {
    await withTimeout(
      peripheral.disconnectAsync(),
      DISCONNECT_TIMEOUT_MS,
      'Disconnect',
    );
  } catch (err) {
    log.warn('[resetPeripheral] Failed to disconnect', toError(err).message);
  }
}

async function getPeripheral(log: Logging): Promise<Peripheral> {
  if (!peripheralInstance) {
    log.info('[getPeripheral] Detecting peripheral ...');
    const peripheral = await detectFirstMotionMountPeripheral(log);
    peripheral.once('disconnect', () => {
      log.info('[getPeripheral] Peripheral disconnected, dropping it');
      if (peripheralInstance === peripheral) peripheralInstance = null;
    });
    peripheralInstance = peripheral;
    log.info('[getPeripheral] Peripheral detected');
  }

  if (peripheralInstance.state === 'connected') {
    log.info('[getPeripheral] Already connected, returning as is');
    return peripheralInstance;
  }

  log.info('[getPeripheral] Connecting ...');
  await withTimeout(
    peripheralInstance.connectAsync(),
    CONNECT_TIMEOUT_MS,
    'Connect',
  );
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

  try {
    const peripheral = await getPeripheral(log);

    log.info('[moveToPosition] Getting characteristics ...');
    const { characteristics } = await withTimeout(
      peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [],
        [MOTION_MOUNT_SET_POSITION_CHARACTERISTIC_UUID],
      ),
      DISCOVER_TIMEOUT_MS,
      'Characteristic discovery',
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
    await withTimeout(
      setPositionCharacteristic.writeAsync(
        Buffer.from(positionPreset.hexPosition, 'hex'),
        false,
      ),
      WRITE_TIMEOUT_MS,
      'Position write',
    );
    log.info('[moveToPosition] Position written');
  } catch (err) {
    const error = toError(err);
    log.error('[moveToPosition]', error.message);
    // Whatever failed, the link can no longer be trusted. Start over on the
    // next call instead of piling requests onto a half-dead connection, and let
    // the caller report the failure rather than pretending the mount moved.
    await resetPeripheral(log);
    throw error;
  }
}

export async function retrievePositionPresets(
  log: Logging,
): Promise<PositionPreset[]> {
  log.info('[retrievedStoredPositions] Starting the retrieval');

  try {
    const peripheral = await getPeripheral(log);
    const { characteristics } = await withTimeout(
      peripheral.discoverAllServicesAndCharacteristicsAsync(),
      DISCOVER_TIMEOUT_MS,
      'Service discovery',
    );
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
      const [presetPartOne, presetPartTwo] = await withTimeout(
        Promise.all([
          normalizedCharacteristics[index].readAsync(),
          normalizedCharacteristics[index + presetIndexOffset].readAsync(),
        ]),
        READ_TIMEOUT_MS,
        `Preset #${index} read`,
      );
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
    log.info(
      '[retrievedStoredPositions] #Presets found',
      positionPresets.length,
    );
    return positionPresets;
  } catch (err) {
    const error = toError(err);
    log.error('[retrievedStoredPositions]', error.message);
    await resetPeripheral(log);
    throw error;
  }
}
