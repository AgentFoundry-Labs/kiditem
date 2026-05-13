import { describe, expect, it } from 'vitest';
import { findImageContentBounds } from './image-whitespace-crop';

function makeWhiteImage(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return data;
}

function paintRect(
  data: Uint8ClampedArray,
  width: number,
  bounds: { x: number; y: number; width: number; height: number },
) {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = 12;
      data[index + 1] = 12;
      data[index + 2] = 12;
      data[index + 3] = 255;
    }
  }
}

describe('findImageContentBounds', () => {
  it('finds a content rectangle inside large white margins', () => {
    const width = 120;
    const height = 90;
    const data = makeWhiteImage(width, height);
    paintRect(data, width, { x: 20, y: 35, width: 70, height: 30 });

    expect(findImageContentBounds({ data, width, height })).toEqual({
      x: 20,
      y: 35,
      width: 70,
      height: 30,
    });
  });

  it('returns null for an all-background image', () => {
    const width = 40;
    const height = 24;
    const data = makeWhiteImage(width, height);

    expect(findImageContentBounds({ data, width, height })).toBeNull();
  });

  it('keeps requested padding inside image bounds', () => {
    const width = 60;
    const height = 50;
    const data = makeWhiteImage(width, height);
    paintRect(data, width, { x: 3, y: 4, width: 20, height: 10 });

    expect(findImageContentBounds({ data, width, height, padding: 8 })).toEqual({
      x: 0,
      y: 0,
      width: 31,
      height: 22,
    });
  });
});
