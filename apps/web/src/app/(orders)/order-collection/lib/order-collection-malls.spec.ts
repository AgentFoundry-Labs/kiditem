import { describe, expect, it } from 'vitest';
import { resolveOrderCollectionMallKey } from './order-collection-malls';

describe('resolveOrderCollectionMallKey', () => {
  it('uses an explicit mall key before filename inference', () => {
    expect(
      resolveOrderCollectionMallKey({
        mallKey: 'icecream-mall',
        mallName: '키드키즈',
        sourceName: 'kidkids-order.xlsx',
        fileName: 'kidkids-order.xlsx',
      }),
    ).toBe('icecream-mall');
  });

  it('infers a mall key from Korean mall labels in legacy history', () => {
    expect(
      resolveOrderCollectionMallKey({
        sourceName: '아이스크림몰_2026-06-26_브라우저수집.xlsx',
        fileName: '아이스크림몰_2026-06-26_브라우저수집.xlsx',
      }),
    ).toBe('icecream-mall');
  });

  it('returns null when a legacy history item has no mall signal', () => {
    expect(
      resolveOrderCollectionMallKey({
        sourceName: 'manual-upload.xlsx',
        fileName: 'manual-upload.xlsx',
      }),
    ).toBeNull();
  });
});
