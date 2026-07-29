import { describe, expect, it } from 'vitest';
import { normalize1688ImageUrl } from './1688-image-url';

describe('normalize1688ImageUrl', () => {
  it('converts protocol-relative 1688 CDN images to HTTPS', () => {
    expect(normalize1688ImageUrl('//cbu01.alicdn.com/img/item.jpg')).toBe(
      'https://cbu01.alicdn.com/img/item.jpg',
    );
  });

  it('upgrades legacy HTTP Alibaba CDN images to HTTPS', () => {
    expect(normalize1688ImageUrl('http://img.alicdn.com/imgextra/item.jpg?x=1')).toBe(
      'https://img.alicdn.com/imgextra/item.jpg?x=1',
    );
  });

  it.each([
    'https://example.com/item.jpg',
    'data:image/png;base64,abc',
    'not-a-url',
    '',
  ])('rejects unsupported image URL %j', (value) => {
    expect(normalize1688ImageUrl(value)).toBeNull();
  });
});
