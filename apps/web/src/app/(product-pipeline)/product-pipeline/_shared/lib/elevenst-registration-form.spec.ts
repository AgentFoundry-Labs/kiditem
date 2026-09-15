import { describe, expect, it } from 'vitest';
import {
  ELEVENST_NAME_MAX,
  ELEVENST_NOTICE_TYPE,
  buildElevenstProductName,
  elevenstConsumerPrice,
  elevenstFormFromDraft,
  parseElevenstCategory,
} from './elevenst-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 11번가 폼.
 *
 * 실측 등록물 `할로윈 LED 거미줄 1p 불빛 장식`(판매가 2,590) 기준이다. 그 상품명이
 * 티처몰과 **글자까지 같아서** 상품명 규칙을 공유한다(2026-09-10).
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '3500킬러볼스피너키링',
  sellerProductName: '3500킬러볼스피너키링',
  brand: '해피프랜즈', maker: '해피프랜즈',
  keywords: ['키링', '열쇠고리', '백참', '가방키링'],
  representativeImageUrl: 'http://localhost:9000/rep.jpg',
  additionalImageUrls: [],
  detailImageUrls: ['http://localhost:9000/detail.jpg'],
  notice: { category: '어린이제품', fields: {} },
  variants: [{
    options: [], salePrice: 2280, listPrice: 3500, stock: 999,
    barcode: null, sellerSku: 'SKU-1', representativeImageUrl: '',
  }],
  ...overrides,
} as unknown as MallProductDraft);

describe('상품명', () => {
  it('소비자가를 떼고 수량을 중간에 넣는다 — 티처몰과 같은 규칙', () => {
    expect(buildElevenstProductName('3500킬러볼스피너키링', ['키링', '열쇠고리'], 1))
      .toBe('킬러볼스피너키링 1p 키링 열쇠고리');
  });

  it('100자를 넘기지 않는다 — 새 화면 상한이다', () => {
    const long = buildElevenstProductName('가'.repeat(140), [], 1);
    expect(long.length).toBeLessThanOrEqual(ELEVENST_NAME_MAX);
  });
});

describe('분류', () => {
  it('공백 없는 `>` 로 잇는다 — 올웨이즈와 다르다', () => {
    expect(parseElevenstCategory('문구/사무용품>디자인/팬시용품>기능성 팬시'))
      .toEqual(['문구/사무용품', '디자인/팬시용품', '기능성 팬시']);
  });

  it('사람이 공백을 넣어 써도 받는다', () => {
    expect(parseElevenstCategory('문구/사무용품 > 디자인/팬시용품'))
      .toEqual(['문구/사무용품', '디자인/팬시용품']);
  });
});

describe('권장 소비자가', () => {
  it('원본 상품명 앞의 숫자를 쓴다', () => {
    expect(elevenstConsumerPrice('3500킬러볼스피너키링', 2280)).toBe(3500);
  });

  it('앞 숫자가 없거나 판매가보다 작으면 판매가를 쓴다', () => {
    expect(elevenstConsumerPrice('킬러볼스피너키링', 2280)).toBe(2280);
    expect(elevenstConsumerPrice('900킬러볼', 2280)).toBe(2280);
  });
});

describe('elevenstFormFromDraft', () => {
  it('행으로 찾는 칸들을 채운다', () => {
    const f = elevenstFormFromDraft(draft(), { categoryPath: '문구/사무용품>디자인/팬시용품' });
    expect(f.rowFields.salePrice).toBe('2280');
    expect(f.rowFields.consumerPrice).toBe('3500');
    expect(f.rowFields.stock).toBe('999');
    expect(f.rowFields.sellerPrdCd).toBe('SKU-1');
  });

  it('고시 유형은 기타 재화다 — 티처몰과 같은 선택', () => {
    expect(elevenstFormFromDraft(draft()).selectorFields.noticeType).toBe(ELEVENST_NOTICE_TYPE);
  });

  it('브랜드 없음을 켠다 — 브랜드가 필수인데 우리 상품엔 없다', () => {
    expect(elevenstFormFromDraft(draft()).selectorChecks.noBrand).toBe(true);
  });

  it('상세설명 이미지를 확장에 넘긴다', () => {
    // 이걸 빼먹으면 상세설명 단계가 경고 없이 건너뛰어진다 — 티처몰에서 겪었다.
    expect(elevenstFormFromDraft(draft()).detailUploads)
      .toEqual([{ url: 'http://localhost:9000/detail.jpg' }]);
  });

  it('추가 이미지는 세 장까지만 넣고 남은 수를 알린다', () => {
    const f = elevenstFormFromDraft(draft({
      additionalImageUrls: ['a', 'b', 'c', 'd', 'e'],
    }));
    expect(f.imageGroups.additional).toEqual(['a', 'b', 'c']);
    expect(f.manualSteps.some((s) => s.includes('칸이 셋뿐'))).toBe(true);
  });

  it('분류가 비면 되돌릴 수 없다고 먼저 알린다', () => {
    const [first] = elevenstFormFromDraft(draft()).manualSteps;
    expect(first).toContain('분류를 고르지 않았습니다');
  });

  it('클린체크와 광고를 안내에 남긴다', () => {
    const steps = elevenstFormFromDraft(draft()).manualSteps.join(' ');
    expect(steps).toContain('클린체크');
    expect(steps).toContain('광고');
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => elevenstFormFromDraft(draft({ variants: [] })))
      .toThrow(/옵션\(SKU\)이 없어/);
  });
});
