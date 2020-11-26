import padStart from 'lodash.padstart';
import { Position } from './motionMount';

/**
 * @credit https://stackoverflow.com/questions/6146177/convert-a-signed-decimal-to-hex-encoded-with-twos-complement
 */
function createToInt(size: number): (value: number) => number {
  if (size < 2) {
    throw new Error('Minimum size is 2');
  } else if (size > 64) {
    throw new Error('Maximum size is 64');
  }

  const maxValue = (1 << (size - 1)) - 1;
  const minValue = -maxValue - 1;

  return (value: number): number => {
    if (value > maxValue || value < minValue) {
      throw new Error(`Int${size} overflow`);
    }

    if (value < 0) {
      return (1 << size) + value;
    }
    return value;
  };
}

const toInt16 = createToInt(16);

export function toHex16Buffer(value: number): Buffer {
  const hexValue = padStart(toInt16(value).toString(16), 4, '0');
  return Buffer.from(hexValue, 'hex');
}

export function positionToHex16Buffer(position: Position): Buffer {
  return Buffer.from(
    padStart(toInt16(position.wallDistance).toString(16), 4, '0') +
      padStart(toInt16(position.orientation).toString(16), 4, '0'),
    'hex',
  );
}
