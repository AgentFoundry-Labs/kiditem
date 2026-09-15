import { describe, expect, it } from 'vitest';
import {
  LOTTEON_DEFAULT_CATEGORY,
  LOTTEON_DELIVERY,
  LOTTEON_MAX_IMAGES,
  LOTTEON_NAME_MAX_BYTES,
  LOTTEON_REGISTER_URL,
  buildLotteonProductName,
  lotteonByteLength,
  lotteonCountryCode,
  lotteonFormFromDraft,
  parseLotteonCategory,
} from './lotteon-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 롯데ON 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-14)에서 왔다.
 *   LO2752728442 판매자상품명 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리` · 판매가 2280 · 재고관리 안 함
 *                고시 38: 품명 `3500킬러볼스피너키링` · 인증 해당없음 · 제조국 CN · 제조자 해피프랜즈 · A/S 031-908-5401
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'b3fab6af-07b5-49b1-ac9d-8e9b208dee20',
  displayName: '킬러볼 스피너 키링',
  sellerProductName: '3500킬러볼스피너키링',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['스핀', '장난감', '열쇠고리'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/rep.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  notice: { category: '어린이제품', fields: { 제조국: '중국' } },
  variants: [
    {
      options: [],
      salePrice: 2280,
      listPrice: 2280,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('롯데ON 판매자상품명', () => {
  it('이름 (1p) 키워드 — 실측 등록물과 글자 하나 다르지 않다', () => {
    expect(buildLotteonProductName('킬러볼 스피너 키링', ['스핀', '장난감', '열쇠고리'], 1))
      .toBe('킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리');
  });

  it('⭐ 화면처럼 UTF-8 바이트(한글 3)로 센다 — 실측 등록물이 61바이트', () => {
    expect(lotteonByteLength('킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리')).toBe(61);
  });

  it('150바이트를 넘으면 뒤 키워드부터 빼고, 이름이 넘치면 자르되 (1p) 는 남긴다', () => {
    const many = buildLotteonProductName('말랑이', Array.from({ length: 10 }, (_, i) => `키워드${i}번째긴단어`), 1);
    expect(lotteonByteLength(many)).toBeLessThanOrEqual(LOTTEON_NAME_MAX_BYTES);
    const long = buildLotteonProductName('가'.repeat(80), ['키워드'], 1);
    expect(lotteonByteLength(long)).toBeLessThanOrEqual(LOTTEON_NAME_MAX_BYTES);
    expect(long.endsWith('(1p)')).toBe(true);
  });

  it('원본명 앞 소비자가를 떼고 태그 괄호는 뺀다', () => {
    expect(buildLotteonProductName('3500킬러볼<b>키링', [], 2)).toBe('킬러볼b키링 (2p)');
  });
});

describe('롯데ON 코드', () => {
  it('표준카테고리는 BC + 8자리', () => {
    expect(parseLotteonCategory(' bc55031100 ')).toBe('BC55031100');
    expect(parseLotteonCategory('BC5503110')).toBeNull();
    expect(parseLotteonCategory('피젯토이')).toBeNull();
  });

  it('원산지 이름을 국가 코드로 — 모르면 기존 등록물처럼 중국', () => {
    expect(lotteonCountryCode('중국')).toBe('CN');
    expect(lotteonCountryCode('대한민국')).toBe('KR');
    expect(lotteonCountryCode('vn')).toBe('VN');
    expect(lotteonCountryCode('')).toBe('CN');
  });
});

describe('lotteonFormFromDraft', () => {
  it('판매자센터 주소 — 상품등록은 그 안에서 확장이 탭으로 연다', () => {
    expect(lotteonFormFromDraft(draft()).url).toBe(LOTTEON_REGISTER_URL);
  });

  it('⭐ 등록물 값: 상품명·가격·재고관리 안 함·원산지·제조사·배송·구매수량·A/S', () => {
    const { lotteon } = lotteonFormFromDraft(draft(), { category: 'BC55031100' });
    expect(lotteon).toMatchObject({
      category: 'BC55031100',
      productName: '킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리',
      salePrice: 2280,
      stockManaged: false,
      maker: '해피프랜즈',
      origin: { typeCode: 'OVS', code: 'CN' },
      purchase: { maxQty: 9999, periodDays: 1 },
      asText: '7일이내 교환, 반품 가능합니다.',
    });
    expect(lotteon.delivery).toEqual({
      costPolicy: '406468',
      extraCostPolicy: '3108763',
      shipPlace: 'PLO383047',
      returnPlace: 'PLO383047',
      courier: '0002',
      returnCourier: '0002',
      sameDay: true,
      closeTime: '1300',
      saturday: 'N',
      retrieveType: 'DGNN_RTRV',
    });
  });

  it('정보고시 38 — 품명은 셀피아 원본명, 모델명·수입자 칸은 줄 필수라 비우지 않는다', () => {
    expect(lotteonFormFromDraft(draft()).lotteon.notice).toEqual({
      groupCode: '38',
      values: {
        '0210': '3500킬러볼스피너키링',
        '0211': '해당없음',
        '1400': '해당없음',
        '0070': '해피프랜즈',
        '0071': '해피프랜즈',
        '1440': '031-908-5401',
      },
    });
  });

  it('셀피아 코드가 모델명 규칙(영문·숫자·-_+/.)에 맞으면 모델명과 고시에 쓴다', () => {
    const withSku = draft({
      variants: [{ ...draft().variants[0]!, sellerSku: '10481-1' }],
    });
    const { lotteon } = lotteonFormFromDraft(withSku);
    expect(lotteon.modelNo).toBe('10481-1');
    expect(lotteon.notice.values['0211']).toBe('10481-1');
    const korean = lotteonFormFromDraft(draft({ variants: [{ ...draft().variants[0]!, sellerSku: '킬러볼-1' }] }));
    expect(korean.lotteon.modelNo).toBe('');
  });

  it('KC 번호가 있으면 고시 인증 칸에 적고 인증정보는 사람이 넣는다고 말한다', () => {
    const { lotteon, manualSteps } = lotteonFormFromDraft(draft(), { certNumber: 'CB065R1010-26001' });
    expect(lotteon.notice.values['1400']).toBe('KC 인증 CB065R1010-26001');
    expect(manualSteps.some((step) => step.includes('인증정보'))).toBe(true);
  });

  it('국산이면 원산지 구분도 국산으로 둔다', () => {
    const { lotteon } = lotteonFormFromDraft(draft({ notice: { category: '어린이제품', fields: { 제조국: '대한민국' } } }));
    expect(lotteon.origin).toEqual({ typeCode: 'DMST', code: 'KR' });
  });

  it('분류를 비우거나 모양이 틀리면 기본 분류를 쓴다', () => {
    expect(lotteonFormFromDraft(draft()).lotteon.category).toBe(LOTTEON_DEFAULT_CATEGORY.code);
    expect(lotteonFormFromDraft(draft(), { category: '완구' }).lotteon.category).toBe(LOTTEON_DEFAULT_CATEGORY.code);
  });

  it('이미지는 대표가 첫 장, 중복 없이 10장까지', () => {
    const many = Array.from({ length: 14 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    const form = lotteonFormFromDraft(draft({ additionalImageUrls: ['https://cdn.example.com/rep.jpg', ...many] }));
    expect(form.imageGroups.lotteon[0]).toBe('https://cdn.example.com/rep.jpg');
    expect(form.imageGroups.lotteon).toHaveLength(LOTTEON_MAX_IMAGES);
    expect(new Set(form.imageGroups.lotteon).size).toBe(LOTTEON_MAX_IMAGES);
  });

  it('상세 이미지는 확장이 롯데ON 편집기 업로드로 넣도록 원본 주소로 넘기고, 배송비 정책 차이를 사람에게 알린다', () => {
    const form = lotteonFormFromDraft(draft());
    expect(form.detailUploads).toEqual([{ url: 'http://localhost:9000/kiditem/detail.jpg' }]);
    expect(form.manualSteps.some((step) => step.includes('3만원 미만'))).toBe(true);
    expect(LOTTEON_DELIVERY.costPolicy).toBe('406468');
  });
});
