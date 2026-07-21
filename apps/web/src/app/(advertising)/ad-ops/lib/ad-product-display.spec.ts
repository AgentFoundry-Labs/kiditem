import { describe, expect, it } from 'vitest';
import { displayKeyword, stripEmbeddedOptionId } from './ad-product-display';

describe('stripEmbeddedOptionId', () => {
  // Live row from the 쿠팡윙 집중광고 campaign detail grid (2026-07-17).
  it('removes the option id Coupang packs into the product name cell', () => {
    expect(
      stripEmbeddedOptionId(
        '스핀 워터건 (1p) 소형 어린이 물총 물놀이 권총 ID: 92548632917',
        '92548632917',
      ),
    ).toBe('스핀 워터건 (1p) 소형 어린이 물총 물놀이 권총');
  });

  it('leaves a name whose trailing id belongs to another option alone', () => {
    expect(
      stripEmbeddedOptionId('감정 잔디 인형 ID: 11111111111', '94878673640'),
    ).toBe('감정 잔디 인형 ID: 11111111111');
  });

  it('keeps digits that are part of the real product name', () => {
    expect(
      stripEmbeddedOptionId('워터건 펜 1p 2in1 볼펜 + 물총, 1개', '95276256765'),
    ).toBe('워터건 펜 1p 2in1 볼펜 + 물총, 1개');
  });

  it('never returns an empty name', () => {
    expect(stripEmbeddedOptionId('ID: 92548632917', '92548632917')).toBe(
      'ID: 92548632917',
    );
  });

  it('passes through when there is no option id to match', () => {
    expect(stripEmbeddedOptionId('스핀 워터건', null)).toBe('스핀 워터건');
    expect(stripEmbeddedOptionId(null, '92548632917')).toBeNull();
  });
});

describe('displayKeyword', () => {
  // The Coupang keyword column is a link, not a value. Rendering its label as
  // the row's keyword would claim data the scrape never captured.
  it('treats the 키워드 보기 link label as no keyword', () => {
    expect(displayKeyword('키워드 보기')).toBeNull();
    expect(displayKeyword(' 키워드보기 ')).toBeNull();
  });

  it('keeps a real keyword', () => {
    expect(displayKeyword('어린이 물총')).toBe('어린이 물총');
  });

  it('treats blank and missing as no keyword', () => {
    expect(displayKeyword('   ')).toBeNull();
    expect(displayKeyword(null)).toBeNull();
  });
});
