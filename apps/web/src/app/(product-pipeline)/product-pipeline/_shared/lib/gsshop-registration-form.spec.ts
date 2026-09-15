import { describe, expect, it } from 'vitest';
import {
  GSSHOP_DEFAULT_CATEGORY,
  GSSHOP_DEFAULT_SECTION,
  GSSHOP_EXPOSURE_NAME_MAX_BYTES,
  GSSHOP_INVOICE_NAME_MAX_BYTES,
  GSSHOP_MAX_IMAGES,
  GSSHOP_REGISTER_URL,
  buildGsshopExposureName,
  buildGsshopInvoiceName,
  gsshopByteLength,
  gsshopFormFromDraft,
  gsshopSupplierProductCode,
  gsshopSupplyPrice,
  parseGsshopCategory,
  parseGsshopSection,
} from './gsshop-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * GS샵 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-14)에서 왔다.
 *   1128331771 노출 `땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더 가방 장식 악세사리`
 *              송장 `땅콩 말랑 키링 (1p) 열쇠고리` · 판매 830 · 수수료율 20 · 공급 664 · 고시 품명 `1200땅콩말랑키링`
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'b3fab6af-07b5-49b1-ac9d-8e9b208dee20',
  displayName: '땅콩 말랑 키링',
  sellerProductName: '1200땅콩말랑키링',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['열쇠고리', '가꾸', '백참', '키보드', '키홀더', '가방 장식', '악세사리'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/rep.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  notice: { category: '어린이제품', fields: { 제조국: '중국' } },
  variants: [
    {
      options: [],
      salePrice: 830,
      listPrice: 830,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('GS샵 상품명', () => {
  it('노출상품명 = 이름 (1p) 키워드 — 실측 등록물 모양', () => {
    expect(buildGsshopExposureName('땅콩 말랑 키링', ['열쇠고리', '가꾸', '백참', '키보드', '키홀더'], 1))
      .toBe('땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더');
  });

  it('⭐ 송장상품명은 30바이트(한글 2) — 실측 `땅콩 말랑 키링 (1p) 열쇠고리` 가 28', () => {
    const name = buildGsshopInvoiceName('땅콩 말랑 키링', ['열쇠고리', '가꾸'], 1);
    expect(name).toBe('땅콩 말랑 키링 (1p) 열쇠고리');
    expect(gsshopByteLength(name)).toBe(28);
  });

  it('넘치면 키워드를 빼고, 그래도 넘치면 이름을 잘라 (1p) 는 남긴다', () => {
    const long = buildGsshopInvoiceName('아주아주긴이름의말랑말랑키링', ['열쇠고리'], 1);
    expect(gsshopByteLength(long)).toBeLessThanOrEqual(GSSHOP_INVOICE_NAME_MAX_BYTES);
    expect(long.endsWith('(1p)')).toBe(true);
    const exposure = buildGsshopExposureName('가'.repeat(70), ['키워드하나', '키워드둘'], 1);
    expect(gsshopByteLength(exposure)).toBeLessThanOrEqual(GSSHOP_EXPOSURE_NAME_MAX_BYTES);
  });

  it('원본명 앞 소비자가와 화면이 막는 글자를 뺀다', () => {
    expect(buildGsshopExposureName('1200땅콩"키링"', ['별*모양'], 1)).toBe('땅콩키링 (1p) 별모양');
    expect(buildGsshopInvoiceName("땅콩:키링's", [], 1)).toBe('땅콩키링s (1p)');
  });
});

describe('GS샵 코드·가격', () => {
  it('협력사 상품코드는 후보 번호에서 만든다 — 같은 상품은 늘 같은 코드, 20자 이내', () => {
    const code = gsshopSupplierProductCode('b3fab6af-07b5-49b1-ac9d-8e9b208dee20');
    expect(code).toBe('KIDB3FAB6AF07B5');
    expect(code).toMatch(/^[A-Za-z0-9]{1,20}$/);
  });

  it('공급가 = 판매가 × (1 − 수수료율) — 등록물 830 → 664', () => {
    expect(gsshopSupplyPrice(830)).toBe(664);
    expect(gsshopSupplyPrice(0)).toBe(0);
  });

  it('분류 코드·매장번호 모양을 본다', () => {
    expect(parseGsshopCategory(' b35012701 ')).toBe('B35012701');
    expect(parseGsshopCategory('B3501270')).toBeNull();
    expect(parseGsshopSection('1662165')).toBe('1662165');
    expect(parseGsshopSection('피규어')).toBeNull();
  });
});

describe('gsshopFormFromDraft', () => {
  it('새 등록 화면 주소 — /update·/copy 는 판매중 상품이다', () => {
    expect(gsshopFormFromDraft(draft()).url).toBe(GSSHOP_REGISTER_URL);
  });

  it('⭐ 등록물 값: 분류·전시·브랜드·가격·구성·배송', () => {
    const { gsshop } = gsshopFormFromDraft(draft());
    expect(gsshop).toMatchObject({
      category: GSSHOP_DEFAULT_CATEGORY.code,
      sectionId: GSSHOP_DEFAULT_SECTION.id,
      supplierProductCode: 'KIDB3FAB6AF07B5',
      // 등록물 노출상품명과 글자 하나 다르지 않다.
      exposureName: '땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더 가방 장식 악세사리',
      invoiceName: '땅콩 말랑 키링 (1p) 열쇠고리',
      brand: { code: '244211', name: '키드아이템' },
      modelName: '1200땅콩말랑키링',
      composition: { content: '땅콩 말랑 키링', packageCount: 1, maker: '해피프랜즈', origin: '중국' },
      salePrice: 830,
      marginRate: 20,
      stock: 999,
      safeStock: 5,
    });
    expect(gsshop.delivery).toMatchObject({
      courier: 'DH', convenienceReturn: 'N', fee: 3000, freeOver: 30000, returnFee: 3000, exchangeFee: 6000,
      refundType: '10', shipAddress: '0001', returnAddress: '0001', bundle: 'A01', weight: 'A02', length: 'B02',
    });
    expect(gsshop.delivery.remote).toEqual({ fee: 3000, returnFee: 3000, exchangeFee: 3000 });
  });

  it('정보고시 기타 재화 — 품명은 셀피아 원본명, 인증은 해당없음', () => {
    expect(gsshopFormFromDraft(draft()).gsshop.notice).toEqual({
      groupCode: '43',
      values: { 43026: '1200땅콩말랑키링', 43141: '해당없음', 43142: '중국', 43004: '해피프랜즈' },
    });
  });

  it('KC 번호가 있으면 고시 인증 칸에 적고 인증정보는 사람이 넣는다고 말한다', () => {
    const { gsshop, manualSteps } = gsshopFormFromDraft(draft(), { certNumber: 'CB065R1010-26001' });
    expect(gsshop.notice.values['43141']).toBe('KC 인증 CB065R1010-26001');
    expect(manualSteps.some((step) => step.includes('인증/허가'))).toBe(true);
  });

  it('사람이 고른 분류·전시·코드로 바꿀 수 있고, 모양이 틀린 값은 기본값을 쓴다', () => {
    const custom = gsshopFormFromDraft(draft(), { category: 'B35011303', sectionId: '1663196', supplierProductCode: 'MY-CODE_1' });
    expect(custom.gsshop).toMatchObject({ category: 'B35011303', sectionId: '1663196', supplierProductCode: 'MY-CODE_1' });
    const broken = gsshopFormFromDraft(draft(), { category: '완구', sectionId: 'x' });
    expect(broken.gsshop).toMatchObject({ category: GSSHOP_DEFAULT_CATEGORY.code, sectionId: GSSHOP_DEFAULT_SECTION.id });
  });

  it('이미지는 대표가 첫 장, 중복 없이 8장까지', () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    const form = gsshopFormFromDraft(draft({ additionalImageUrls: ['https://cdn.example.com/rep.jpg', ...many] }));
    expect(form.imageGroups.gsshop[0]).toBe('https://cdn.example.com/rep.jpg');
    expect(form.imageGroups.gsshop).toHaveLength(GSSHOP_MAX_IMAGES);
    expect(new Set(form.imageGroups.gsshop).size).toBe(GSSHOP_MAX_IMAGES);
  });

  it('기술서 사진은 확장이 GS 편집기 업로드로 올리도록 원본 주소로 넘긴다', () => {
    expect(gsshopFormFromDraft(draft()).detailUploads).toEqual([{ url: 'http://localhost:9000/kiditem/detail.jpg' }]);
  });
});
