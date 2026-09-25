import { describe, expect, it } from 'vitest';
import {
  WingCatalogFullDetailsItemSchema,
  WingCatalogListingBasicsItemSchema,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  buildCatalogBasicProduct,
  buildCatalogDetailProduct,
  buildWingCatalogSearchBody,
  jsonByteLength,
  normalizeWingCatalogSearchResponse,
} from './parse';

// 옛 `extensions/tests/coupang-catalog-collector.test.mjs`의 목록·상세 정규화 케이스를 옮겼다(KID-354).
// 옛 HTML 상세(`buildCatalogProduct`)·discovery 매니페스트·청크 봉투는 새 런타임에 없다.

function wingApiProduct(id: number | null, overrides: Record<string, unknown> = {}) {
  return {
    vendorInventoryId: id,
    vendorId: 'A00057379',
    productName: `상품 ${id}`,
    representativeImage: `vendor_inventory/${id}.jpg`,
    productStatus: 'ON_SALE',
    vendorInventoryItems: [{ vendorInventoryItemId: Number(id) * 10, vendorItemId: null, itemName: '단품', status: 'APPROVED' }],
    ...overrides,
  };
}

function wingApiResponse(productList: unknown[], {
  page = 1,
  countPerPage = 500,
  totalCount = productList.length,
  totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / countPerPage),
}: { page?: number; countPerPage?: number; totalCount?: number; totalPages?: number } = {}) {
  return { success: true, message: null, data: { productList, pagination: { page, countPerPage, totalCount, totalPages } } };
}

describe('Wing 목록 검색', () => {
  it('builds the exact fixed Wing search body (500 per page, deleted products excluded)', () => {
    expect(buildWingCatalogSearchBody(3)).toEqual({
      searchKeywordType: 'ALL',
      searchKeywords: '',
      salesMethod: 'ALL',
      productStatus: ['ALL'],
      stockSearchType: 'ALL',
      shippingFeeSearchType: 'ALL',
      displayCategoryCodes: [],
      listingStartTime: null,
      listingEndTime: null,
      saleEndDateSearchType: 'ALL',
      bundledShippingSearchType: 'ALL',
      displayDeletedProduct: false,
      shippingMethod: 'ALL',
      exposureStatus: 'ALL',
      sortMethod: 'SORT_BY_ITEM_LEVEL_UNIT_SOLD',
      countPerPage: 500,
      page: 3,
      locale: 'ko_KR',
      coupangAttributeOptimized: false,
      upBundleSearchOption: 'ALL',
      exposureStatuses: [],
      qualityEnhanceTypes: [],
    });
  });

  it('maps all observed Wing product statuses onto the list sale status', () => {
    const page = normalizeWingCatalogSearchResponse(wingApiResponse([
      wingApiProduct(11, { productStatus: 'ON_SALE' }),
      wingApiProduct(12, { productStatus: 'PARTIAL_ON_SALE' }),
      wingApiProduct(13, { productStatus: 'SUSPENDED' }),
      wingApiProduct(14, { productStatus: 'REJECTED', representativeImage: null }),
    ]), 1, 'A00057379');
    expect(page.products.map((product) => [product.externalProductId, product.raw.saleStatus])).toEqual([
      ['11', '판매중'], ['12', '판매중'], ['13', '판매중지'], ['14', null],
    ]);
    expect(page.products[0]!.media).toEqual([
      { sourceUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/11.jpg', role: 'primary', sortOrder: 0, externalOptionId: null },
    ]);
    expect(page.products[3]!.media).toEqual([]);
  });

  it('rejects duplicate, incomplete, wrong-account, unknown-status, and inconsistent pages', () => {
    const cases: Array<[string, unknown]> = [
      ['duplicate IDs', wingApiResponse([wingApiProduct(1), wingApiProduct(1)])],
      ['missing ID', wingApiResponse([wingApiProduct(null)])],
      ['missing title', wingApiResponse([wingApiProduct(1, { productName: '' })])],
      ['wrong vendor', wingApiResponse([wingApiProduct(1, { vendorId: 'OTHER' })])],
      ['unknown status', wingApiResponse([wingApiProduct(1, { productStatus: 'DRAFT' })])],
      ['partial page', wingApiResponse([wingApiProduct(1)], { totalCount: 2 })],
      ['wrong pagination', wingApiResponse([wingApiProduct(1)], { totalCount: 1, totalPages: 2 })],
      ['no inventory items', wingApiResponse([wingApiProduct(1, { vendorInventoryItems: [] })])],
    ];
    for (const [label, response] of cases) {
      expect(() => normalizeWingCatalogSearchResponse(response, 1, 'A00057379'), label).toThrow(/Wing/);
    }
  });

  it('fails closed for malformed basic identifiers and boolean observations', () => {
    const base = {
      vendorInventoryId: 1,
      productName: '상품 1',
      productStatus: 'ON_SALE',
      vendorInventoryItems: [{ vendorInventoryItemId: 11, vendorItemId: null }],
    };
    for (const [field, value] of [
      ['vendorInventoryItemId', { bad: true }],
      ['vendorItemId', { bad: true }],
      ['skuId', { bad: true }],
      ['soldOut', 'false'],
      ['autoPricingActive', 'false'],
    ] as const) {
      const item = { ...base.vendorInventoryItems[0], [field]: value };
      expect(() => buildCatalogBasicProduct({ ...base, vendorInventoryItems: [item] }), field).toThrow(/올바르지 않습니다/);
    }
  });

  it('keeps a true zero-result page distinct from a failure', () => {
    expect(normalizeWingCatalogSearchResponse(wingApiResponse([], { totalCount: 0, totalPages: 0 }), 1, 'A00057379')).toEqual({
      page: 1, pageSize: 500, totalItems: 0, totalPages: 0, products: [],
    });
  });

  it('normalizes the verified 500-row inventory envelope into complete listing basics the server accepts', () => {
    const payload = {
      data: {
        productList: [{
          vendorInventoryId: 3395429,
          productName: '  목록 상품  ',
          representativeImage: 'vendor_inventory/representative.jpg',
          productStatus: 'ON_SALE',
          categoryName: '완구',
          displayCategoryCode: 77390,
          categoryId: 6827,
          manufacture: '제조사',
          brand: '브랜드',
          saleDates: { start: '2025-01-01', end: null },
          createdOn: '2025-01-01T00:00:00Z',
          modifiedOn: '2025-01-02T00:00:00Z',
          vendorInventoryItems: [{
            vendorInventoryItemId: 17838347,
            vendorItemId: null,
            skuId: 101,
            itemName: '단품',
            externalSkuCode: 'SKU-1',
            barcode: '8800000000001',
            status: 'APPROVED',
            soldOut: false,
            qcOperationStatus: 'PASS',
            approvalStatus: 'APPROVED',
            stockQuantity: null,
            salePrice: 660,
            autoPricingActive: false,
            exposureStatuses: ['EXPOSED'],
          }],
        }],
        pagination: { page: 1, countPerPage: 500, totalCount: 1, totalPages: 1 },
      },
    };
    const page = normalizeWingCatalogSearchResponse(payload, 1, 'A00057379');
    expect(page).toMatchObject({ pageSize: 500, totalItems: 1, totalPages: 1 });
    const [basic] = page.products;
    expect(basic).toMatchObject({ externalProductId: '3395429', registeredName: '목록 상품', productStatus: 'ON_SALE' });
    expect(Object.hasOwn(basic!, 'saleStatus')).toBe(false);
    expect(basic!.raw).toMatchObject({ saleStatus: '판매중', modifiedOn: '2025-01-02T00:00:00Z' });
    expect(basic!.options[0]).toMatchObject({
      externalOptionId: '17838347', vendorItemId: null, stockQuantity: null, sellerSku: 'SKU-1', barcode: '8800000000001',
      raw: { externalOptionIdentitySource: 'inventory_item' },
    });
    // 서버 청크 원소 스키마를 그대로 지난다(모양 변환 없음).
    expect(WingCatalogListingBasicsItemSchema.parse(basic)).toEqual(basic);
  });
});

describe('Wing 상세 정규화', () => {
  it('produces a full_details element the server accepts unchanged', () => {
    const product = buildCatalogDetailProduct({
      sellerProductId: 3395429,
      status: 'APPROVED',
      statusName: '승인완료',
      items: [{
        sellerProductItemId: 17838347,
        vendorItemId: null,
        externalVendorSku: 'SKU-1',
        barcode: '8800000000001',
        modelNo: 'MODEL-1',
        attributes: [{ attributeTypeName: '색상', attributeValueName: '파랑' }],
        notices: [{ name: '재질', value: '플라스틱' }],
        additionalNotices: [],
        searchTags: ['물놀이', '공놀이'],
        contents: [{ contentDetails: [{ content: '<img src="vendor_inventory/detail.jpg">' }] }],
        images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/option.jpg' }],
      }],
    });
    expect(product.options[0]!.externalVendorSku).toBe('SKU-1');
    expect(product.documents).toHaveLength(4);
    expect(WingCatalogFullDetailsItemSchema.parse(product)).toEqual(product);
  });

  it('preserves null-vendor identity, value-dedup documents, and all media owners', () => {
    const product = buildCatalogDetailProduct({
      sellerProductId: 3395429,
      status: 'APPROVED',
      items: [
        {
          sellerProductItemId: 17838347,
          vendorItemId: null,
          itemId: 1,
          modelNo: 'M-1',
          notices: [{ name: '재질', value: '플라스틱' }],
          searchTags: ['물놀이', '공놀이'],
          contents: [{ contentDetails: [{ content: '<img src="vendor_inventory/shared.jpg">' }] }],
          images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/shared.jpg' }],
        },
        {
          sellerProductItemId: 17838348,
          vendorItemId: 81000000001,
          notices: [{ name: '재질', value: '플라스틱' }],
          searchTags: ['물놀이'],
          contents: [{ contentDetails: [{ content: '<img src="vendor_inventory/shared.jpg">' }] }],
          images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/shared.jpg' }],
        },
      ],
    });
    expect(product.options.map((option) => option.externalOptionId)).toEqual(['17838347', '81000000001']);
    expect(product.options[0]).toMatchObject({ vendorItemId: null, modelNumber: 'M-1' });
    expect(product.documents.filter((document) => document.kind === 'notices')).toHaveLength(1);
    expect(product.documents.filter((document) => document.kind === 'searchTags')).toHaveLength(2);
    expect(product.media).toHaveLength(2);
    expect(product.media.map((media) => media.externalOptionIds)).toEqual([
      ['17838347', '81000000001'], ['17838347', '81000000001'],
    ]);
  });

  it('documents preserve each observed field value, including null, empty, order, and duplicates', () => {
    const item = (sellerProductItemId: number) => ({
      sellerProductItemId,
      vendorItemId: null,
      notices: [{ name: '재질', value: '플라스틱' }, { name: '재질', value: '플라스틱' }],
      additionalNotices: [],
      searchTags: ['첫째', '둘째', '첫째'],
      internalAttributes: null,
    });
    const product = buildCatalogDetailProduct({ sellerProductId: 3395429, items: [item(17838347), item(17838348)] });
    expect(product.documents.map(({ kind, value }) => ({ kind, value }))).toEqual([
      { kind: 'notices', value: [{ name: '재질', value: '플라스틱' }, { name: '재질', value: '플라스틱' }] },
      { kind: 'additionalNotices', value: [] },
      { kind: 'searchTags', value: ['첫째', '둘째', '첫째'] },
      { kind: 'internalAttributes', value: null },
    ]);
    expect(product.options[0]!.documentIds).toEqual(product.options[1]!.documentIds);
    expect(Object.hasOwn(product.options[0]!, 'externalVendorSku')).toBe(true);
    expect(Object.hasOwn(product.options[0]!, 'sellerSku')).toBe(false);
  });

  it('preserves only the provider sale-start observation', () => {
    const product = buildCatalogDetailProduct({
      sellerProductId: 3395429,
      saleStartedAt: ' 2026-04-01T14:41:57 ',
      createdOn: '2026-04-01 11:32:06',
      saleDates: { start: '2026-04-01' },
      items: [{ sellerProductItemId: 17838347 }],
    });
    expect(product.raw.saleStartedAt).toBe('2026-04-01T14:41:57');
    expect(Object.hasOwn(product.raw, 'createdOn')).toBe(false);
    expect(Object.hasOwn(product.raw, 'saleDates')).toBe(false);
    expect(buildCatalogDetailProduct({ sellerProductId: 3395429, items: [{ sellerProductItemId: 17838347 }] }).raw.saleStartedAt).toBeNull();
  });

  it('repeated detail fields across 73 realistic options stay deduplicated, associated, and within product limits', () => {
    const commonContentHtml = [
      '<section class="detail-description"><h2>공통 상품 상세 설명</h2><p>',
      '이 상품은 어린이의 안전한 놀이를 위해 제작되었습니다. '.repeat(260),
      '</p><img src="https://image1.coupangcdn.com/image/vendor_inventory/common-detail.jpg"></section>',
    ].join('');
    const commonNotices = Array.from({ length: 14 }, (_, index) => ({ name: `상품정보제공고시 ${index + 1}`, value: `공통 고시 내용 ${index + 1}` }));
    const commonSearchTags = Array.from({ length: 16 }, (_, index) => `공통검색태그-${index + 1}`);
    const items = Array.from({ length: 73 }, (_, index) => ({
      sellerProductItemId: 17838347 + index,
      vendorItemId: null,
      externalVendorSku: `SKU-${index + 1}`,
      notices: commonNotices,
      searchTags: commonSearchTags,
      contents: [{ contentDetails: [{ content: commonContentHtml }] }],
      images: [{ imageType: 'REPRESENTATION', cdnPath: `vendor_inventory/option-${index + 1}.jpg` }],
    }));
    expect(jsonByteLength({ sellerProductId: 3395429, items })).toBeGreaterThan(1_000_000);

    const product = buildCatalogDetailProduct({ sellerProductId: 3395429, items });
    expect(product.options).toHaveLength(73);
    expect(product.documents).toHaveLength(3);
    expect(product.media).toHaveLength(74);
    expect(product.media.filter((media) => media.role === 'detail')).toHaveLength(1);
    expect(product.media.find((media) => media.role === 'detail')!.externalOptionIds)
      .toEqual(items.map((item) => String(item.sellerProductItemId)));
    for (const option of product.options) {
      expect(option.documentIds).toEqual(product.options[0]!.documentIds);
      expect(option.raw?.externalOptionIdentitySource).toBe('inventory_item');
    }
    expect(jsonByteLength(product)).toBeLessThanOrEqual(512 * 1024);
  });

  it('enforces the media limit for each option owner', () => {
    const items = [{
      sellerProductItemId: '99000000101',
      vendorItemId: null,
      images: Array.from({ length: 101 }, (_, index) => ({ cdnPath: `https://image1.coupangcdn.com/image/vendor_inventory/overflow-${index + 1}.jpg` })),
    }];
    expect(() => buildCatalogDetailProduct({ sellerProductId: 99000000002, items })).toThrow(/미디어가 허용 개수를 초과했습니다/);
  });

  it('preserves provider registrationType on the option raw', () => {
    for (const registrationType of ['NORMAL', 'RFM']) {
      const product = buildCatalogDetailProduct({ sellerProductId: 123, items: [{ vendorItemId: 456, sellerProductItemId: 789, registrationType }] });
      expect(product.options[0]!.raw?.registrationType).toBe(registrationType);
    }
  });
});
