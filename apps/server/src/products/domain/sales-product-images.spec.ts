import { describe, expect, it } from 'vitest';
import {
  isMirrorableImageUrl,
  mirroredImageKey,
  pendingMirrorImages,
  preferMirroredImageUrls,
} from './sales-product-images';

const ORG = '11111111-1111-1111-1111-111111111111';
const SABANGNET = 'https://pic.sabangnet.co.kr/product_image/mw69839/100/wDT8y_100061_1.jpg';

describe('sales product image mirroring', () => {
  it('mirrors only Sabangnet-hosted https images, to a location fixed by the source address', () => {
    expect(isMirrorableImageUrl(SABANGNET)).toBe(true);
    expect(isMirrorableImageUrl('http://pic.sabangnet.co.kr/a.jpg')).toBe(false);
    expect(isMirrorableImageUrl('https://kiditem.diskn.com/a.jpg')).toBe(false);
    const key = mirroredImageKey(ORG, SABANGNET);
    expect(key).toMatch(new RegExp(`^sales-products/${ORG}/images/[0-9a-f]{40}\\.jpg$`));
    expect(mirroredImageKey(ORG, SABANGNET)).toBe(key);
    expect(mirroredImageKey(ORG, 'https://pic.sabangnet.co.kr/product_image/a.bmp')).toBeNull();
  });

  it('lists each pending image once, in product code order', () => {
    const pending = pendingMirrorImages(ORG, [
      { code: '100300', imageUrls: ['https://pic.sabangnet.co.kr/b.png', 'https://kiditem.diskn.com/x.jpg'] },
      { code: '100017', imageUrls: [SABANGNET, 'https://pic.sabangnet.co.kr/b.png'] },
    ]);
    expect(pending.map((image) => image.url)).toEqual([SABANGNET, 'https://pic.sabangnet.co.kr/b.png']);
  });

  it('keeps an already mirrored copy when the same Sabangnet workbook is imported again', () => {
    const mirrored = (url: string) => {
      const key = mirroredImageKey(ORG, url);
      return key ? `http://storage.local/kiditem/${key}` : null;
    };
    const copy = mirrored(SABANGNET)!;
    const other = 'https://pic.sabangnet.co.kr/product_image/mw69839/100/new_100061_2.jpg';
    expect(preferMirroredImageUrls({ incoming: [SABANGNET, other], current: [copy], mirroredUrl: mirrored }))
      .toEqual([copy, other]);
  });
});
