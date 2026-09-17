import { describe, expect, it } from 'vitest';
import {
  ALWAYZ_SHIPPING_COMPANY,
  alwayzFormFromDraft,
  buildAlwayzProductName,
  parseAlwayzCategory,
} from './alwayz-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 올웨이즈 폼.
 *
 * 실측 등록물 `[키드아이템] 2500 우탄이 말랑 주물럭 1P` 기준이다(2026-09-10).
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '2500우탄이말랑주물럭',
  sellerProductName: '2500우탄이말랑주물럭',
  brand: '해피프렌즈', maker: '해피프렌즈',
  keywords: ['말랑이', '주물럭', '스트레스볼'],
  representativeImageUrl: 'http://localhost:9000/rep.jpg',
  additionalImageUrls: ['http://localhost:9000/a1.jpg', 'http://localhost:9000/a2.jpg'],
  detailImageUrls: ['http://localhost:9000/detail.jpg'],
  notice: { category: '어린이제품', fields: {} },
  variants: [{
    options: [], salePrice: 2500, listPrice: 2500, stock: 999,
    barcode: null, sellerSku: null, representativeImageUrl: '',
  }],
  ...overrides,
} as unknown as MallProductDraft);

describe('alwayzFormFromDraft', () => {
  it('상품명은 접두어 + 원본명 + 수량이다', () => {
    expect(buildAlwayzProductName('2500우탄이말랑주물럭', 1))
      .toBe('[키드아이템] 2500우탄이말랑주물럭 1P');
  });

  it('소비자가 접두어를 떼지 않는다 — 몰마다 상품명이 다르다', () => {
    // 도매꾹·아트공구는 뗀다. 올웨이즈 등록물은 그 숫자를 그대로 달고 있다.
    const form = alwayzFormFromDraft(draft(), { teamPrice: 1800 });
    expect(form.selectorFields.productName).toContain('2500우탄이말랑주물럭');
  });

  it('가격이 둘이다 — 개별구매가는 우리 판매가, 팀구매가는 사람이 정한다', () => {
    const form = alwayzFormFromDraft(draft(), { teamPrice: 1800 });
    expect(form.selectorFields.individualPrice).toBe('2500');
    expect(form.selectorFields.teamPrice).toBe('1800');
  });

  it('팀구매가가 없으면 비워 두고 알린다 — 구매자에게 보이는 값이다', () => {
    const form = alwayzFormFromDraft(draft());
    expect(form.selectorFields.teamPrice).toBe('');
    expect(form.manualSteps.some((s) => s.includes('팀구매가'))).toBe(true);
  });

  it('옵션 없는 상품은 단품으로 넣는다', () => {
    const form = alwayzFormFromDraft(draft(), { teamPrice: 1800 });
    expect(form.selectorFields.optionName).toBe('단품');
    expect(form.selectorFields.optionDetail).toBe('단품');
  });

  it('키워드는 콤마로 잇는다 — 이 몰은 칸이 하나다', () => {
    expect(alwayzFormFromDraft(draft(), { teamPrice: 1800 }).selectorFields.keyword)
      .toBe('말랑이,주물럭,스트레스볼');
  });

  it('택배사는 이름이 곧 값이다 — 수정 화면의 숫자 코드와 다르다', () => {
    expect(alwayzFormFromDraft(draft(), { teamPrice: 1800 }).selectorFields.shippingCompany)
      .toBe(ALWAYZ_SHIPPING_COMPANY);
  });

  it('이미지를 대표·추가·상세 세 칸으로 나눈다', () => {
    // 위지윅 에디터가 없다. 상세설명도 이미지 파일이다.
    const form = alwayzFormFromDraft(draft(), { teamPrice: 1800 });
    expect(form.imageGroups.representative).toHaveLength(1);
    expect(form.imageGroups.additional).toHaveLength(2);
    expect(form.imageGroups.detail).toHaveLength(1);
  });

  it('분류는 이름 경로로 쪼갠다', () => {
    expect(parseAlwayzCategory('완구/취미 > DIY > 피젯스피너DIY'))
      .toEqual(['완구/취미', 'DIY', '피젯스피너DIY']);
  });

  it('분류 이름에 슬래시가 있어도 나뉘지 않는다', () => {
    // `완구/취미` 처럼 이름에 `/` 가 들어간다. 구분자는 `>` 뿐이다.
    expect(parseAlwayzCategory('문구/오피스 > 사무기기')).toEqual(['문구/오피스', '사무기기']);
  });

  it('분류를 안 주면 비워 두고 알린다', () => {
    const form = alwayzFormFromDraft(draft(), { teamPrice: 1800 });
    expect(form.categoryPaths).toEqual([]);
    expect(form.manualSteps.some((s) => s.includes('분류를 고르지'))).toBe(true);
  });

  it('폼 요소가 없는 화면이다', () => {
    // React 트리라 `<form>` 이 없다. 확장이 `body` 를 기준점으로 쓴다.
    expect(alwayzFormFromDraft(draft(), { teamPrice: 1800 }).formId).toBe('body');
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => alwayzFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });
});
