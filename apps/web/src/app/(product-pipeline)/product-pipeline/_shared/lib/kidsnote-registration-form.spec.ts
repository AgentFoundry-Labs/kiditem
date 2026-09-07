import { describe, expect, it } from 'vitest';
import {
  buildKidsnoteDisplayName,
  KIDSNOTE_ETC_NOTICE_FIELD,
  kidsnoteFormFromDraft,
} from './kidsnote-registration-form';
import type { MallProductDraft } from './mall-product-draft';

function draft(overrides: Partial<MallProductDraft> = {}): MallProductDraft {
  return {
    candidateId: 'cand-1',
    displayName: '킬러볼 스피너 키링',
    sellerProductName: '3500킬러볼스피너키링',
    brand: '노브랜드',
    maker: '해피프랜즈',
    keywords: ['스핀', '장난감', '열쇠고리'],
    representativeImageUrl: 'https://cdn/rep.jpg',
    additionalImageUrls: ['https://cdn/a1.jpg', 'https://cdn/a2.jpg', 'https://cdn/a3.jpg'],
    detailImageUrls: ['https://cdn/detail.jpg'],
    notice: { category: '어린이제품', fields: { 품명및모델명: '킬러볼 스피너 키링' } },
    variants: [{
      options: [{ type: '색상', value: '단일' }],
      salePrice: 2280,
      listPrice: 3500,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn/rep.jpg',
    }],
    sourceCategory: '완구',
    ...overrides,
  };
}

describe('buildKidsnoteDisplayName', () => {
  it('matches the shape of the products already listed', () => {
    // 실측: `[키드아이템] 킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`
    expect(buildKidsnoteDisplayName('킬러볼 스피너 키링', ['스핀', '장난감', '열쇠고리'], 1))
      .toBe('[키드아이템] 킬러볼 스피너 키링 1p 스핀 장난감 열쇠고리');
  });
});

describe('kidsnoteFormFromDraft', () => {
  it('files the product under the category the real listings use', () => {
    // 등록 1,024건 중 343건(33%)이 이 분류다.
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields).toMatchObject({ big: '2128', mid: '2129', small: '2504' });
    expect(form.fields.depth4).toBeUndefined();
  });

  it('carries the fourth level for the categories that have one', () => {
    const form = kidsnoteFormFromDraft(draft(), {
      category: '문구/시설비품 > 문구용품 > 필기구류 > 지우개/연필깎이',
    });
    expect(form.fields).toMatchObject({ big: '2136', mid: '2139', small: '2494', depth4: '2743' });
  });

  it('registers the notice as 기타, not 영유아용품', () => {
    // 실측 10건 중 9건이 1100. 카테고리를 바꾸면 field 번호가 통째로 달라진다.
    expect(kidsnoteFormFromDraft(draft()).fields.fieldset).toBe('1100');
  });

  it('writes prices with the comma format the form stores', () => {
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields.sell_prc).toBe('2,280');
    expect(form.fields.normal_prc).toBe('3,500');
  });

  it('puts the Sellpia original name — price code and all — into 품명 및 모델명', () => {
    // 실측 `3500킬러볼스피너키링`. 쿠팡은 가격코드를 떼지만 키즈노트 고시는 그대로 둔다.
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields[KIDSNOTE_ETC_NOTICE_FIELD.품명및모델명]).toBe('3500킬러볼스피너키링');
  });

  it('fills every 기타 notice slot so none is left blank', () => {
    const form = kidsnoteFormFromDraft(draft());
    for (const field of Object.values(KIDSNOTE_ETC_NOTICE_FIELD)) {
      expect(form.fields[field], field).toBeTruthy();
    }
    expect(form.fields[KIDSNOTE_ETC_NOTICE_FIELD.제조국]).toBe('중국');
    expect(form.fields[KIDSNOTE_ETC_NOTICE_FIELD.제조사]).toBe('해피프랜즈');
    expect(form.fields[KIDSNOTE_ETC_NOTICE_FIELD.수입여부]).toBe('Y');
    expect(form.fields[KIDSNOTE_ETC_NOTICE_FIELD.품질보증기준])
      .toBe('관련 법 및 소비자 분쟁 해결 기준을 따름');
  });

  it('carries the seller identity fields every listing shares', () => {
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields.field665).toBe('거영I&D');
    expect(form.fields.field666).toBe('031-908-5401');
  });

  it('applies the sales policy the listings share', () => {
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields.partner_rate).toBe('15.00');
    expect(form.fields.min_ord).toBe('1');
    expect(form.fields.max_ord).toBe('999');
    expect(form.checks).toEqual(['auto_code', 'member_sale']);
  });

  it('leaves 참고 상품명 and 요약 설명 empty like the real listings', () => {
    const form = kidsnoteFormFromDraft(draft());
    expect(form.fields.name_referer).toBeUndefined();
    expect(form.fields.content1).toBeUndefined();
  });

  it('uses the option colour when the product actually has one', () => {
    const base = kidsnoteFormFromDraft(draft());
    expect(base.fields[KIDSNOTE_ETC_NOTICE_FIELD.색상]).toBe('랜덤');
    const coloured = kidsnoteFormFromDraft(draft({
      variants: [{ ...draft().variants[0]!, options: [{ type: '색상', value: '블루' }] }],
    }));
    expect(coloured.fields[KIDSNOTE_ETC_NOTICE_FIELD.색상]).toBe('블루');
  });

  it('sends the detail image to mall hosting rather than into the HTML directly', () => {
    const form = kidsnoteFormFromDraft(draft());
    expect(form.detailUploads).toEqual([{ url: 'https://cdn/detail.jpg' }]);
    expect(form.detailHtmlTarget).toBe('content2');
  });

  it('fills at most the three image slots the form has', () => {
    expect(kidsnoteFormFromDraft(draft()).fileUploads).toEqual([
      { name: 'upfile1', url: 'https://cdn/rep.jpg' },
      { name: 'upfile2', url: 'https://cdn/a1.jpg' },
      { name: 'upfile3', url: 'https://cdn/a2.jpg' },
    ]);
  });

  it('says which category it guessed instead of hiding it', () => {
    expect(kidsnoteFormFromDraft(draft()).manualSteps.some((s) => s.includes('장난감/완구'))).toBe(true);
    expect(kidsnoteFormFromDraft(draft(), { category: '만들기 > 만들기재료 > 클레이/점토' })
      .manualSteps.some((s) => s.includes('분류를'))).toBe(false);
  });

  it('flags a missing detail image rather than registering without one', () => {
    const form = kidsnoteFormFromDraft(draft({ detailImageUrls: [] }));
    expect(form.detailUploads).toEqual([]);
    expect(form.detailHtmlTarget).toBe('');
    expect(form.manualSteps.some((s) => s.includes('상세페이지'))).toBe(true);
  });

  it('throws when the draft has no variant', () => {
    expect(() => kidsnoteFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });
});
