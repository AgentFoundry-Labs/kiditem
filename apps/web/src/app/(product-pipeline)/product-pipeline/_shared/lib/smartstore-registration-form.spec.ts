import { describe, expect, it } from 'vitest';
import {
  SMARTSTORE_DEFAULT_CATEGORY,
  SMARTSTORE_IMPORTER,
  SMARTSTORE_MAX_EXTRA_IMAGES,
  SMARTSTORE_NAME_MAX,
  SMARTSTORE_REGISTER_URL,
  SMARTSTORE_TAG_MAX,
  buildSmartstoreProductName,
  buildSmartstoreTags,
  parseSmartstoreCategory,
  smartstoreFormFromDraft,
  smartstorePricing,
} from './smartstore-registration-form';
import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 스마트스토어 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-14)에서 왔다.
 *   13660537717 `초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼`
 *               판매가 6,000 · 즉시할인 2,440 · 고시 기타 재화 품명 `6000초코파이크런치슬랑이`
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '초코파이 크런치 슬랑이',
  sellerProductName: '6000초코파이크런치슬랑이',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['왁뿌', '주물럭', '스트레스볼', '말랑이', '스퀴시'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/rep.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  notice: { category: '어린이제품', fields: { 제조국: '중국' } },
  variants: [
    {
      options: [],
      salePrice: 3560,
      listPrice: 3560,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('buildSmartstoreProductName', () => {
  it('이름 + 1p + 키워드 셋, 접두어 없음 — 실측 등록물 모양', () => {
    expect(buildSmartstoreProductName('초코파이 크런치 슬랑이', ['왁뿌', '주물럭', '스트레스볼', '말랑이'], 1))
      .toBe('초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼');
  });

  it('원본명 앞 소비자가는 떼고, 이름의 일부인 숫자와 이미 있는 낱말은 남기지 않는다', () => {
    expect(buildSmartstoreProductName('6000초코파이', ['초코파이', '왁뿌'], 1)).toBe('초코파이 1p 왁뿌');
    expect(buildSmartstoreProductName('3D 입체퍼즐', [], 2)).toBe('3D 입체퍼즐 2p');
  });

  it('⭐ 네이버가 막는 글자를 빼고 100자를 넘기지 않는다', () => {
    expect(buildSmartstoreProductName('별*모양 "키링"', ['<신상>'], 1)).toBe('별모양 키링 1p 신상');
    const long = buildSmartstoreProductName('가'.repeat(98), ['키워드'], 1);
    expect(long.length).toBeLessThanOrEqual(SMARTSTORE_NAME_MAX);
  });
});

describe('smartstorePricing', () => {
  it('⭐ 소비자가 − 즉시할인 = 우리 판매가 — 등록물 6,000 − 2,440 = 3,560', () => {
    expect(smartstorePricing(['6000초코파이크런치슬랑이'], 3560)).toEqual({ salePrice: 6000, discountWon: 2440 });
  });

  it('할인은 10원 단위로 내린다 — 실판매가가 우리 판매가 밑으로 내려가지 않는다', () => {
    const { salePrice, discountWon } = smartstorePricing(['4000말랑이'], 2415);
    expect(discountWon).toBe(1580);
    expect(salePrice - discountWon).toBeGreaterThanOrEqual(2415);
  });

  it('소비자가가 없거나 우리 가격보다 싸면 할인 없이 우리 판매가', () => {
    expect(smartstorePricing(['초코파이'], 3560)).toEqual({ salePrice: 3560, discountWon: 0 });
    expect(smartstorePricing(['3000초코파이'], 3560)).toEqual({ salePrice: 3560, discountWon: 0 });
    expect(smartstorePricing(['3D퍼즐'], 3560)).toEqual({ salePrice: 3560, discountWon: 0 });
  });

  it('원본명 여럿 중 소비자가가 있는 것을 쓴다', () => {
    expect(smartstorePricing(['초코파이 크런치', '6000초코파이'], 3560)).toEqual({ salePrice: 6000, discountWon: 2440 });
  });
});

describe('buildSmartstoreTags', () => {
  it('공백·중복을 빼고 한글 10자(30바이트) 넘는 태그는 버린다', () => {
    expect(buildSmartstoreTags(['스트레스 해소', '왁뿌', '왁뿌', '가'.repeat(11), 'a'.repeat(30)]))
      .toEqual(['스트레스해소', '왁뿌', 'a'.repeat(30)]);
  });

  it('10개까지', () => {
    expect(buildSmartstoreTags(Array.from({ length: 15 }, (_, i) => `태그${i}`))).toHaveLength(SMARTSTORE_TAG_MAX);
  });
});

describe('parseSmartstoreCategory', () => {
  it('`번호:이름` 을 받는다', () => {
    expect(parseSmartstoreCategory('50004643:기타감각발달완구'))
      .toEqual({ id: '50004643', keyword: '기타감각발달완구', label: '기타감각발달완구' });
    expect(parseSmartstoreCategory(' 50001158 | 미술놀이 ')).toMatchObject({ id: '50001158', keyword: '미술놀이' });
  });

  it('모양이 틀리면 null', () => {
    expect(parseSmartstoreCategory('기타감각발달완구')).toBeNull();
    expect(parseSmartstoreCategory('5000:완구')).toBeNull();
    expect(parseSmartstoreCategory('')).toBeNull();
  });
});

describe('smartstoreFormFromDraft', () => {
  it('⭐ 새 등록 화면 해시 — `#/products/edit/<번호>` 는 판매중 상품 수정이다', () => {
    expect(smartstoreFormFromDraft(draft()).url).toBe(SMARTSTORE_REGISTER_URL);
    expect(new URL(SMARTSTORE_REGISTER_URL).hash).toBe('#/products/create');
  });

  it('등록물 값: 카테고리 · 가격 · 브랜드 · 제조사 · 모델명 · 원산지', () => {
    const { smartstore } = smartstoreFormFromDraft(draft());
    expect(smartstore).toMatchObject({
      category: { id: SMARTSTORE_DEFAULT_CATEGORY.id, keyword: SMARTSTORE_DEFAULT_CATEGORY.keyword },
      productName: '초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼',
      salePrice: 6000,
      discountWon: 2440,
      stock: 999,
      modelName: '6000초코파이크런치슬랑이',
      brandName: 'kiditem',
      manufacturerName: '해피프랜즈',
      origin: { exposureType: 'IMPORT', firstSub: '0200', secondSub: '0200037', importer: SMARTSTORE_IMPORTER },
    });
  });

  it('고시 기타 재화 — 품명·모델명은 셀피아 원본명, 인증은 상세설명 참조, A/S 는 우리 번호', () => {
    expect(smartstoreFormFromDraft(draft()).smartstore.notice).toEqual({
      type: 'ETC',
      itemName: '6000초코파이크런치슬랑이',
      modelName: '6000초코파이크런치슬랑이',
      certificateDetails: '상세설명 참조',
      manufacturer: '해피프랜즈',
      afterServiceDirector: KIDITEM_AS_PHONE,
    });
  });

  it('KC 번호가 있으면 어린이제품 안전확인을 채우고, 인증기관은 사람이 넣는다고 말한다', () => {
    const { smartstore, manualSteps } = smartstoreFormFromDraft(draft(), { certNumber: 'CB065R1010-26001' });
    expect(smartstore.childCert).toEqual({ certId: '1041', number: 'CB065R1010-26001', companyName: '해피프랜즈' });
    expect(manualSteps.some((step) => step.includes('인증기관'))).toBe(true);
  });

  it('⭐ KC 번호가 없으면 인증을 비워 둔다 — 대상 아님을 대신 고르지 않는다', () => {
    const { smartstore, manualSteps } = smartstoreFormFromDraft(draft());
    expect(smartstore.childCert).toBeNull();
    expect(manualSteps.some((step) => step.includes('대상 아님'))).toBe(true);
  });

  it('상품 상세의 인증번호도 쓴다', () => {
    const form = smartstoreFormFromDraft(draft({ notice: { category: '어린이제품', fields: { 안전인증번호: 'CB117R352-5001' } } }));
    expect(form.smartstore.childCert?.number).toBe('CB117R352-5001');
  });

  it('국산이면 원산지를 건드리지 않는다 — 화면 기본값이 국산이다', () => {
    const form = smartstoreFormFromDraft(draft({ notice: { category: '어린이제품', fields: { 제조국: '한국' } } }));
    expect(form.smartstore.origin).toBeNull();
    expect(form.manualSteps.some((step) => step.includes('국산'))).toBe(true);
  });

  it('카테고리는 사람이 고른 것으로 바꿀 수 있다', () => {
    const { smartstore } = smartstoreFormFromDraft(draft(), {
      category: { id: '50001158', keyword: '미술놀이', label: '미술놀이' },
    });
    expect(smartstore.category).toEqual({ id: '50001158', keyword: '미술놀이' });
  });

  it('이미지는 대표가 첫 장, 중복 없이 대표 1 + 추가 9장', () => {
    const many = Array.from({ length: 14 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    const form = smartstoreFormFromDraft(draft({ additionalImageUrls: ['https://cdn.example.com/rep.jpg', ...many] }));
    expect(form.imageGroups.smartstore[0]).toBe('https://cdn.example.com/rep.jpg');
    expect(form.imageGroups.smartstore).toHaveLength(1 + SMARTSTORE_MAX_EXTRA_IMAGES);
    expect(new Set(form.imageGroups.smartstore).size).toBe(1 + SMARTSTORE_MAX_EXTRA_IMAGES);
  });

  it('상세 이미지는 확장이 네이버 사진 서버에 올리도록 원본 주소로 넘긴다', () => {
    expect(smartstoreFormFromDraft(draft()).detailUploads).toEqual([{ url: 'http://localhost:9000/kiditem/detail.jpg' }]);
  });
});
