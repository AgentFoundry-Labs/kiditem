import { describe, expect, it } from 'vitest';
import {
  TEACHERVILLE_DEFAULT_CATEGORY,
  buildTeachervilleNotice,
  buildTeachervilleProductName,
  parseTeachervilleCategory,
  teachervilleConsumerPrice,
  teachervilleFormFromDraft,
  teachervilleSupplyPrice,
} from './teacherville-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 티처몰 폼.
 *
 * 실측 등록물 둘 기준이다(2026-09-10):
 *  · 1242700 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리` — 3,500 / 2,280 / 1,824
 *  · 1243601 `할로윈 LED 거미줄 1p 불빛 장식` — 4,000 / 2,590 / 2,072
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
    barcode: null, sellerSku: null, representativeImageUrl: '',
  }],
  ...overrides,
} as unknown as MallProductDraft);

describe('상품명', () => {
  it('소비자가 접두어를 뗀다 — 올웨이즈와 반대다', () => {
    expect(buildTeachervilleProductName('3500킬러볼스피너키링', ['키링', '열쇠고리'], 1))
      .toBe('킬러볼스피너키링 (1p) 키링 열쇠고리');
  });

  it('숫자로만 된 이름은 그대로 둔다 — 떼면 남는 게 없다', () => {
    expect(buildTeachervilleProductName('3500', [], 1)).toBe('3500 (1p)');
  });
});

describe('가격', () => {
  it('공급가는 판매가에서 수수료 20% 를 뺀 값이다', () => {
    // 실측 두 건이 정확히 맞는다. 화면이 계산해 주지 않아 우리가 넣는다.
    expect(teachervilleSupplyPrice(2280)).toBe(1824);
    expect(teachervilleSupplyPrice(2590)).toBe(2072);
  });

  it('소비자가는 원본 상품명 앞의 숫자다', () => {
    expect(teachervilleConsumerPrice('3500킬러볼스피너키링', 2280)).toBe(3500);
  });

  it('앞 숫자가 없거나 판매가보다 작으면 판매가를 쓴다', () => {
    // 0 으로 두면 화면에 할인율이 이상하게 찍힌다.
    expect(teachervilleConsumerPrice('킬러볼스피너키링', 2280)).toBe(2280);
    expect(teachervilleConsumerPrice('900킬러볼', 2280)).toBe(2280);
  });
});

describe('상품정보고시', () => {
  it('서른아홉 줄을 만든다 — 품목이 주는 다섯 줄로는 모자라다', () => {
    const notice = buildTeachervilleNotice(draft(), 1);
    expect(notice.titles).toHaveLength(39);
    expect(notice.descs).toHaveLength(39);
    expect(notice.titles[0]).toBe('품명 및 모델명');
    expect(notice.titles[38]).toBe('개당 구성 수량');
  });

  it('품명은 원본 상품명, 제조사는 초안 값이다', () => {
    const notice = buildTeachervilleNotice(draft(), 1);
    expect(notice.descs[0]).toBe('3500킬러볼스피너키링');
    expect(notice.descs[1]).toBe('해피프랜즈');
    expect(notice.descs[2]).toBe('중국');
  });

  it('값이 없는 줄은 등록물이 쓰던 문구를 그대로 쓴다', () => {
    const notice = buildTeachervilleNotice(draft(), 1);
    expect(notice.descs[5]).toBe('031-908-5401');
    expect(notice.descs[6]).toBe('Y');
    expect(notice.descs[12]).toBe('1EA');
  });

  it('수량이 제품 구성과 개당 구성 수량에 들어간다', () => {
    const notice = buildTeachervilleNotice(draft(), 18);
    expect(notice.descs[15]).toBe('18P');
    expect(notice.descs[38]).toBe('18');
  });
});

describe('teachervilleFormFromDraft', () => {
  it('가격 세 칸과 재고를 채운다', () => {
    const form = teachervilleFormFromDraft(draft());
    expect(form.fields['consumerPrice[]']).toBe('3500');
    expect(form.fields['price[]']).toBe('2280');
    expect(form.fields['commissionRate[]']).toBe('1824');
    expect(form.fields['stock[]']).toBe('999');
  });

  it('간략 설명은 원본 상품명 그대로다', () => {
    // 실측이 그랬다. 가격 접두어까지 남는다 — 내부 조회용 이름이라 일부러 남긴다.
    expect(teachervilleFormFromDraft(draft()).fields.summary).toBe('3500킬러볼스피너키링');
  });

  it('키워드는 콤마 하나로 잇는다 — 칸이 하나다', () => {
    expect(teachervilleFormFromDraft(draft()).fields.keyword)
      .toBe('키링,열쇠고리,백참,가방키링');
  });

  it('고시 품목은 기타 재화다', () => {
    expect(teachervilleFormFromDraft(draft()).fields.goodsSubInfo).toBe('40');
  });

  it('분류는 이름 경로다. 기본값이 실측 등록물과 같다', () => {
    const form = teachervilleFormFromDraft(draft());
    expect(form.categoryPaths).toEqual([['티처몰', '학급운영']]);
    expect(parseTeachervilleCategory(TEACHERVILLE_DEFAULT_CATEGORY))
      .toEqual(['티처몰', '학급운영']);
  });

  it('상세설명은 숨은 contents 칸에 넣는다', () => {
    expect(teachervilleFormFromDraft(draft()).detailHtmlTarget).toBe('contents');
  });

  it('상세설명 이미지를 확장에 넘긴다', () => {
    // 이걸 빼먹으면 확장이 넣을 것이 없어 상세설명 단계를 통째로 건너뛴다.
    // 상품 설명이 빈 채로 남는데 경고도 안 나온다 — 실제로 이렇게 놓쳤다.
    const form = teachervilleFormFromDraft(draft({
      detailImageUrls: ['http://localhost:9000/detail.jpg'],
    }));
    expect(form.detailUploads).toEqual([{ url: 'http://localhost:9000/detail.jpg' }]);
  });

  it('대표 다음에 추가 이미지를 상품컷으로 넘긴다', () => {
    // 한 장이 한 상품컷이다. 몰이 올린 파일에서 일곱 크기를 만든다.
    const form = teachervilleFormFromDraft(draft({
      representativeImageUrl: 'http://localhost:9000/rep.jpg',
      additionalImageUrls: ['http://localhost:9000/a1.jpg', 'http://localhost:9000/a2.jpg'],
    }));
    expect(form.imageGroups.photos).toEqual([
      'http://localhost:9000/rep.jpg',
      'http://localhost:9000/a1.jpg',
      'http://localhost:9000/a2.jpg',
    ]);
  });

  it('사진이 하나도 없으면 알린다', () => {
    const form = teachervilleFormFromDraft(draft({
      representativeImageUrl: '', additionalImageUrls: [],
    }));
    expect(form.imageGroups.photos).toEqual([]);
    expect(form.manualSteps[0]).toContain('상품 사진이 없습니다');
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => teachervilleFormFromDraft(draft({ variants: [] })))
      .toThrow(/옵션\(SKU\)이 없어/);
  });
});
