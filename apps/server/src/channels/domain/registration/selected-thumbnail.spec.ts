import { describe, expect, it } from 'vitest';
import { SelectedThumbnailError, assertSelectedThumbnailAllowed } from './selected-thumbnail';

const DRAFT = 'https://cdn.example.com/draft/1.jpg';
const GENERATED = 'https://cdn.example.com/generated/a.png';

describe('assertSelectedThumbnailAllowed', () => {
  it('takes a photo the draft already carries', () => {
    expect(() => assertSelectedThumbnailAllowed(DRAFT, [DRAFT, GENERATED])).not.toThrow();
  });

  it('takes a thumbnail the generator made for this product', () => {
    expect(() => assertSelectedThumbnailAllowed(GENERATED, [DRAFT, GENERATED])).not.toThrow();
  });

  it('leaves an empty selection alone — 고르지 않은 것은 틀린 것이 아니다', () => {
    expect(() => assertSelectedThumbnailAllowed(null, [])).not.toThrow();
    expect(() => assertSelectedThumbnailAllowed('   ', [])).not.toThrow();
  });

  /** 다른 상품의 사진이나 손으로 적은 주소가 몰로 나가면 엉뚱한 상품이 올라간다. */
  it('⭐ refuses a URL that belongs to neither the draft nor its generated thumbnails', () => {
    const reject = () => assertSelectedThumbnailAllowed('https://cdn.example.com/other/9.jpg', [DRAFT, GENERATED]);
    expect(reject).toThrow(SelectedThumbnailError);
    expect(reject).toThrow('대표 사진');
  });

  it('⭐ refuses every URL when the product has no photo of its own yet', () => {
    expect(() => assertSelectedThumbnailAllowed(DRAFT, [])).toThrow(SelectedThumbnailError);
  });

  it('ignores surrounding blanks so a pasted value still matches', () => {
    expect(() => assertSelectedThumbnailAllowed(` ${DRAFT} `, [DRAFT])).not.toThrow();
  });
});
