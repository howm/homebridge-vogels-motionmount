import padStart from 'lodash.padstart';

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

export function hexToInt(hex: string): number {
  let num = parseInt(hex, 16);
  const maxVal = 2 ** ((hex.length / 2) * 8);
  if (num > maxVal / 2 - 1) {
    num -= maxVal;
  }
  return num;
}
