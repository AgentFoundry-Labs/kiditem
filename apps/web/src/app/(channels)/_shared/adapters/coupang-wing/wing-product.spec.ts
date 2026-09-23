import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesProduct, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';

const suggestions = vi.hoisted(() => vi.fn());
vi.mock('./wing-category-resolution', () => ({ resolveWingCategories: suggestions }));

const {
  WING_DISPLAY_NAME_MAX,
  buildWingDisplayName,
  defaultWingMallValues,
  resolveWingCategoryDefault,
  resolveWingCategorySelections,
  salesProductToWingProduct,
  stripLeadingPriceCode,
  validateWingMallValues,
  wingProductForExecution,
  wingTargetInput,
} = await import('./wing-product');

const KEYRING = '[64687] 생활용품>생활소품>열쇠고리/키홀더';
const SLIME = '103112';

function product(overrides: Partial<SalesProduct> = {}): SalesProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'KID-100300',
    ownCode: null,
    sabangnetGoodsNo: null,
    sourceRecordId: null,
    sourcePlatform: null,
    sourceUrl: null,
    name: '4000선인장딸깍키링',
    shortName: null,
    englishName: null,
    printName: null,
    modelName: null,
    modelNo: null,
    brand: 'kiditem',
    manufacturer: null,
    originCountry: null,
    originRegion: null,
    keywords: ['휴대용', '열쇠고리'],
    standardCategory: '키링',
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    status: 'active',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    optionAxes: [],
    stockManaged: false,
    imageUrls: ['https://img.example/rep.jpg', 'https://img.example/2.jpg', 'https://img.example/3.jpg'],
    noticeCategory: null,
    noticeValues: [],
    certifications: [],
    kcStatus: 'unknown',
    importDeclarationNo: null,
    adminMemo: null,
    version: 3,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    options: [{
      id: '22222222-2222-4222-8222-222222222222',
      optionCode: 'KID-100300-01',
      values: [],
      alias: null,
      barcode: null,
      salePrice: 2204,
      normalPrice: 3000,
      supplyStatus: 'selling',
      safetyStock: 0,
      components: [],
    }],
    channelOverrides: [],
    channelListings: [],
    ...overrides,
  } as unknown as SalesProduct;
}

function snapshot(adapterPayload: Record<string, unknown>): TargetExecutionSnapshot {
  return {
    targetId: '33333333-3333-4333-8333-333333333333',
    targetVersion: 2,
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    kind: 'register',
    channelListingId: null,
    applyCompositionTemplate: false,
    product: product(),
    detailPage: { revisionId: '55555555-5555-4555-8555-555555555555', html: '<p>detail</p>' },
    registrationInput: { mallCategory: null, mallFields: {}, adapter: {} },
    adapterPayload,
  } as TargetExecutionSnapshot;
}

describe('WING 노출상품명 조립', () => {
  it('라이브 판매중 상품과 같은 형식으로 조립한다', () => {
    expect(buildWingDisplayName('선인장 딸깍 키링', ['휴대용', '열쇠고리', '핸드토이', '스트레스해소']))
      .toBe('선인장 딸깍 키링 1p  휴대용 열쇠고리 핸드토이 스트레스해소');
  });

  it('선행 가격 코드는 떼고 그 밖의 숫자는 두며, 중복 키워드와 잘린 조각을 남기지 않는다', () => {
    expect(stripLeadingPriceCode('3000선인장딸깍키링')).toBe('선인장딸깍키링');
    expect(stripLeadingPriceCode('2단 필통')).toBe('2단 필통');
    expect(buildWingDisplayName('선인장 딸깍 키링', ['딸깍', '휴대용', '휴 대 용'])).toBe('선인장 딸깍 키링 1p  휴대용');
    expect(buildWingDisplayName('딸깍 키링', [])).toBe('딸깍 키링');
    const long = buildWingDisplayName('키링', ['가'.repeat(40), '나'.repeat(40), '다'.repeat(40)]);
    expect(long.length).toBeLessThanOrEqual(WING_DISPLAY_NAME_MAX);
    expect(long).toBe(`키링 1p  ${'가'.repeat(40)} ${'나'.repeat(40)}`);
  });
});

describe('판매상품 → WING 상품', () => {
  it('판매상품의 사실(사진 · 키워드 · 가격 · KID)과 확인 창의 WING 값을 합친다', () => {
    const wing = salesProductToWingProduct(product(), {
      wingCategoryKey: '64687',
      productName: '손으로 고친 노출상품명',
      sellerProductName: '',
      colorValue: '핑크',
      quantityValue: '2',
      unitWeightValue: '',
      stock: '30',
    });

    expect(wing.categoryCell).toBe(KEYRING);
    expect(wing.productName).toBe('손으로 고친 노출상품명');
    expect(wing.sellerProductName).toBe('4000선인장딸깍키링');
    expect(wing.searchKeyword).toBe('휴대용,열쇠고리');
    expect(wing.additionalImageUrls).toEqual(['https://img.example/2.jpg', 'https://img.example/3.jpg']);
    expect(wing.detailImageUrls).toEqual([]);
    expect(wing.variants).toEqual([{
      purchaseOptions: [{ type: '색상', value: '핑크' }, { type: '수량', value: '2' }],
      salePrice: 2200,
      origPrice: 3000,
      stock: 30,
      representativeImageUrl: 'https://img.example/rep.jpg',
      vendorItemCode: 'KID-100300-01',
    }]);
  });

  it('값이 없으면 노출상품명을 조립하고 옵션은 단일 · 1개, 재고는 999 로 둔다', () => {
    const wing = salesProductToWingProduct(product(), {});

    expect(wing.categoryCell).toBe('');
    expect(wing.productName).toBe('선인장딸깍키링 1p  휴대용 열쇠고리');
    expect(wing.variants[0]?.purchaseOptions).toEqual([{ type: '색상', value: '단일' }, { type: '수량', value: '1' }]);
    expect(wing.variants[0]?.stock).toBe(999);
  });
});

describe('등록 실행의 WING 상품', () => {
  it('실행이 얼린 adapterPayload 의 WING 값(카테고리 · 이름 · 옵션 · 재고 · 업체상품코드)을 쓰고 상품에서 다시 만들지 않는다', () => {
    const wing = wingProductForExecution(snapshot({
      wingProduct: {
        categoryCell: KEYRING,
        productName: '얼린 노출상품명',
        sellerProductName: '얼린 등록상품명',
        variants: [{ purchaseOptions: [{ type: '색상', value: '파랑' }], stock: 7, vendorItemCode: 'KID-FROZEN' }],
      },
      vendorItemCode: 'KID-FROZEN',
    }), { wingCategoryKey: '77390', productName: '화면 값' });

    expect(wing.categoryCell).toBe(KEYRING);
    expect(wing.productName).toBe('얼린 노출상품명');
    expect(wing.sellerProductName).toBe('얼린 등록상품명');
    expect(wing.variants[0]).toMatchObject({
      purchaseOptions: [{ type: '색상', value: '파랑' }],
      stock: 7,
      vendorItemCode: 'KID-FROZEN',
      salePrice: 2200,
      representativeImageUrl: 'https://img.example/rep.jpg',
    });
  });

  it('얼린 WING 상품에 카테고리가 없으면 실행 값의 카테고리를 쓴다(등록 마법사)', () => {
    const wing = wingProductForExecution(snapshot({ wingProduct: { productName: '이름' }, vendorItemCode: 'KID-1' }), {
      wingCategoryKey: '64687',
    });

    expect(wing.categoryCell).toBe(KEYRING);
    expect(wing.productName).toBe('이름');
    expect(wing.variants[0]?.vendorItemCode).toBe('KID-1');
  });
});

describe('WING 값 검증 · 저장', () => {
  const valid = {
    wingCategoryKey: '64687',
    productName: '노출상품명',
    sellerProductName: '등록상품명',
    colorValue: '단일',
    quantityValue: '1',
    unitWeightValue: '',
    stock: '999',
  };

  it('카테고리 · 노출상품명 · 개당 중량 · 재고를 본다', () => {
    expect(validateWingMallValues(valid)).toEqual([]);
    expect(validateWingMallValues({ ...valid, wingCategoryKey: '' })).toContain('카테고리를 선택하세요.');
    expect(validateWingMallValues({ ...valid, productName: '' })).toContain('노출상품명을 입력하세요.');
    expect(validateWingMallValues({ ...valid, productName: '가'.repeat(101) }).join(' ')).toMatch(/100자 이하/);
    expect(validateWingMallValues({ ...valid, wingCategoryKey: SLIME })).toContain('개당 중량을 입력하세요.');
    expect(validateWingMallValues({ ...valid, stock: '-1' })).toContain('재고수량은 0 이상의 정수여야 합니다.');
  });

  it('등록 대상에는 WING 몰 값만 남긴다 — 가격 · 사진 같은 상품 사실은 싣지 않는다', () => {
    expect(wingTargetInput({ ...valid, unitWeightValue: '120g', wingCategoryKey: SLIME })).toEqual({
      wingCategoryKey: SLIME,
      wingProduct: {
        categoryCell: '[103112] 완구/취미>STEAM/학습완구>미술/점토>액체괴물/슬라임(완제품)',
        productName: '노출상품명',
        sellerProductName: '등록상품명',
        variants: [{
          purchaseOptions: [
            { type: '색상', value: '단일' },
            { type: '수량', value: '1' },
            { type: '개당 중량', value: '120g' },
          ],
          stock: 999,
        }],
      },
    });
    expect(wingTargetInput({ brand: '노브랜드' })).toBeNull();
  });

  it('확인 창 기본값은 저장된 WING 값이 상품에서 만든 값보다 앞선다', () => {
    expect(defaultWingMallValues(product(), '64687', null)).toMatchObject({
      wingCategoryKey: '64687',
      productName: '선인장딸깍키링 1p  휴대용 열쇠고리',
      sellerProductName: '4000선인장딸깍키링',
      colorValue: '단일',
      quantityValue: '1',
      stock: '999',
    });
    expect(defaultWingMallValues(product(), '64687', {
      wingCategoryKey: '77390',
      wingProduct: { productName: '저장한 이름', variants: [{ purchaseOptions: [{ type: '색상', value: '초록' }], stock: 5 }] },
    })).toMatchObject({ wingCategoryKey: '77390', productName: '저장한 이름', colorValue: '초록', stock: '5' });
  });
});

describe('WING 카테고리 기본값', () => {
  beforeEach(() => suggestions.mockReset());

  it('저장 키 → 판매상품 분류의 정확한 별칭 → 기존 쿠팡 등록상품 추천 순이다', async () => {
    await expect(resolveWingCategoryDefault(product(), '77390')).resolves.toEqual({ key: '77390', evidence: null });
    await expect(resolveWingCategoryDefault(product(), null)).resolves.toEqual({ key: '64687', evidence: null });
    expect(suggestions).not.toHaveBeenCalled();

    suggestions.mockResolvedValue(new Map([['과일바구니 딸깍이', {
      categoryCell: KEYRING,
      suggestion: { categoryCell: KEYRING, code: 64687, path: '생활용품>생활소품>열쇠고리/키홀더', leaf: '열쇠고리/키홀더', score: 0.8, confidence: 'high', basedOn: ['기존 키링'], support: 3 },
    }]]));
    await expect(resolveWingCategoryDefault(product({ name: '과일바구니 딸깍이', standardCategory: '기타' }), null)).resolves.toEqual({
      key: '64687',
      evidence: { confidence: 'high', score: 0.8, path: '생활용품>생활소품>열쇠고리/키홀더', basedOn: ['기존 키링'], applied: true },
    });
  });

  it('카테고리를 못 정하면 물총 같은 다른 카테고리로 채우지 않고 비워 둔다', async () => {
    suggestions.mockResolvedValue(new Map());
    await expect(resolveWingCategoryDefault(product({ standardCategory: '기타' }), null)).resolves.toEqual({ key: '', evidence: null });
  });

  it('일괄등록은 상품마다 정하고, 못 정한 상품이 있으면 파일을 만들지 않는다', async () => {
    suggestions.mockResolvedValue(new Map());
    await expect(resolveWingCategorySelections([product(), product({ standardCategory: '물총' })])).resolves.toEqual(['64687', '77390']);
    await expect(resolveWingCategorySelections([product({ name: '분류 안 된 상품', standardCategory: '기타' })])).rejects.toThrow(
      /WING 카테고리가 선택되지 않은 상품이 1건.*분류 안 된 상품/,
    );
  });
});
