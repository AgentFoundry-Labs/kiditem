import { describe, expect, it } from 'vitest';
import {
  detailImageUrls,
  isMirrorableImageUrl,
  mirroredImageKey,
  normalizeImageReferenceUrl,
  pendingMirrorImages,
  preferMirroredImageUrls,
  rewriteImageHtml,
  rewriteImageUrls,
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
    ], { isOwnedUrl: (url) => url.startsWith('https://kiditem.diskn.com/') });
    expect(pending.map((image) => image.url)).toEqual([SABANGNET, 'https://pic.sabangnet.co.kr/b.png']);
  });

  it('finds img src and srcset references and rewrites only successful copies', () => {
    const html = '<picture><source srcset="https://pic.sabangnet.co.kr/a.jpg 1x, https://pic.sabangnet.co.kr/b.jpg 2x"><img alt="x" src="https://pic.sabangnet.co.kr/a.jpg" srcset=\'https://pic.sabangnet.co.kr/c.jpg 400w, https://kiditem.diskn.com/d.jpg 800w\'></picture>';
    expect(detailImageUrls(html)).toEqual([
      'https://pic.sabangnet.co.kr/a.jpg',
      'https://pic.sabangnet.co.kr/b.jpg',
      'https://pic.sabangnet.co.kr/c.jpg',
      'https://kiditem.diskn.com/d.jpg',
    ]);
    const a = `https://storage.example/a`;
    const replacements = new Map([
      ['https://pic.sabangnet.co.kr/a.jpg', a],
      ['https://pic.sabangnet.co.kr/c.jpg', 'https://storage.example/c'],
    ]);
    expect(rewriteImageUrls([
      'https://pic.sabangnet.co.kr/a.jpg',
      'https://pic.sabangnet.co.kr/b.jpg',
    ], replacements)).toEqual([a, 'https://pic.sabangnet.co.kr/b.jpg']);
    expect(rewriteImageHtml(html, replacements)).toBe('<picture><source srcset="https://storage.example/a 1x, https://pic.sabangnet.co.kr/b.jpg 2x"><img alt="x" src="https://storage.example/a" srcset=\'https://storage.example/c 400w, https://kiditem.diskn.com/d.jpg 800w\'></picture>');
  });

  it('keeps unsupported external URLs pending instead of declaring completion', () => {
    const pending = pendingMirrorImages(ORG, [{
      code: '100001',
      imageUrls: ['https://images.example.com/product.jpg'],
      detailHtml: '<img src="https://pic.sabangnet.co.kr/no-extension">',
      extraDetailHtml: ['<img src="https://pic.sabangnet.co.kr/ok.jpg">'],
    }]);
    expect(pending).toEqual([
      { url: 'https://images.example.com/product.jpg', key: null, reason: '지원하지 않는 외부 이미지 주소' },
      { url: 'https://pic.sabangnet.co.kr/no-extension', key: null, reason: '지원하지 않는 사방넷 이미지 형식' },
      { url: 'https://pic.sabangnet.co.kr/ok.jpg', key: expect.any(String) },
    ]);
    expect(normalizeImageReferenceUrl('//pic.sabangnet.co.kr/ok.jpg')).toBe('https://pic.sabangnet.co.kr/ok.jpg');
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
