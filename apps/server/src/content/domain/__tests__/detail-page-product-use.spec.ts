import { describe, expect, it } from 'vitest';
import {
  buildBoldVerticalUser,
  type BoldVerticalCallInput,
} from '../prompts/bold-vertical/single-call';
import {
  classifyProductUseProfile,
  formatProductUseGuidance,
  type RawProductInput,
} from '../prompts/detail-page/types';

const baseRaw: RawProductInput = {
  rawTitle: '',
  rawCategory: '',
  rawDescription: '',
  rawOptions: '',
  imageUrls: [],
};

describe('detail-page product use classification', () => {
  it('classifies bubble-pop slime as slime instead of soap bubbles', () => {
    const profile = classifyProductUseProfile({
      ...baseRaw,
      rawTitle: '퐁퐁버블팝슬라임',
    });

    expect(profile.primary).toBe('slime_squishy');
    expect(profile.secondary).toContain('water_bubble');
    expect(formatProductUseGuidance({ ...baseRaw, rawTitle: '퐁퐁버블팝슬라임' })).toContain(
      '슬라임을 물·주스·시럽 같은 액체로 만들지 말 것',
    );
  });

  it('keeps eraser-soap products on the stationery flow', () => {
    const profile = classifyProductUseProfile({
      ...baseRaw,
      rawTitle: '비누 지우개 4종세트',
    });

    expect(profile.primary).toBe('stationery');
    expect(profile.usageFlow).toContain('필기·꾸미기·정리에 사용');
  });

  it('classifies water guns and bubble toys as outdoor water/bubble products', () => {
    expect(
      classifyProductUseProfile({ ...baseRaw, rawTitle: '더블샷슈퍼워터건' }).primary,
    ).toBe('water_bubble');
    expect(
      classifyProductUseProfile({ ...baseRaw, rawTitle: '휴대용목걸이비눗방울' }).primary,
    ).toBe('water_bubble');
  });

  it('handles overlapping KidItem keywords without broad one-letter matches', () => {
    expect(classifyProductUseProfile({ ...baseRaw, rawTitle: '자석미로게임' }).primary).toBe(
      'block_puzzle_game',
    );
    expect(
      classifyProductUseProfile({ ...baseRaw, rawTitle: '상어워터건펜' }).primary,
    ).toBe('stationery');
    expect(classifyProductUseProfile({ ...baseRaw, rawTitle: '종이십자수' }).primary).toBe(
      'diy_craft',
    );
  });

  it('injects product use guidance into the KidItem bold-vertical prompt', () => {
    const input: BoldVerticalCallInput = {
      heroImageMode: 'first',
      raw: {
        ...baseRaw,
        rawTitle: 'DIY슬라임팩토리세트',
        rawCategory: '신상품코너',
        imageUrls: ['https://example.com/slime.jpg'],
      },
    };

    const prompt = buildBoldVerticalUser(input);

    expect(prompt).toContain('상품군/사용법 흐름 기준');
    expect(prompt).toContain('목록 기반 상품군: 슬라임/말랑이·촉감놀이');
    expect(prompt).toContain('보조 상품군 힌트: DIY/만들기·키우기');
    expect(prompt).toContain('플라스틱 용기·뚜껑·케이스를 주무르거나 변형하지 말 것');
  });
});
