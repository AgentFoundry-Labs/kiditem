import { describe, expect, it } from 'vitest';
import { extractEditedImageUrl } from './image-edit-result';

describe('extractEditedImageUrl', () => {
  it('reads the Agent OS image_edit output contract', () => {
    expect(extractEditedImageUrl({ image_url: 'data:image/png;base64,AAAA' })).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('reads nested output envelopes returned by polling helpers', () => {
    expect(
      extractEditedImageUrl({
        output: { image_url: 'https://cdn.example.com/out.png' },
      }),
    ).toBe('https://cdn.example.com/out.png');
  });

  it('keeps backwards compatibility with color image arrays', () => {
    expect(
      extractEditedImageUrl({
        color_images: ['https://cdn.example.com/color.png'],
      }),
    ).toBe('https://cdn.example.com/color.png');
  });
});
