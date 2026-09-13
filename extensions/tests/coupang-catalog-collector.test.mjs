import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PutCoupangCatalogChunkRequestSchema } from '@kiditem/shared/coupang-catalog-snapshot';

const helperPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../kiditem-os/shared/coupang-catalog-collector.js',
);

function loadHelper() {
  const context = {
    TextEncoder,
    URL,
    crypto,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  return context.KidItemCoupangCatalog;
}

test('extracts the pure oSellerProduct JSON object from Wing appData scripts', () => {
  const helper = loadHelper();
  const source = `
    const appData = {
      "locale": 'KR',
      "oSellerProduct": {
        "sellerProductId": 13189952317,
        "sellerProductName": "물총 {단품}",
        "items": [{"vendorItemId": 81038681014, "itemName": "단품"}]
      },
      "anotherField": true
    };
  `;

  assert.deepEqual(
    JSON.parse(JSON.stringify(helper.extractSellerProductFromScripts([source]))),
    {
      sellerProductId: 13189952317,
      sellerProductName: '물총 {단품}',
      items: [{ vendorItemId: 81038681014, itemName: '단품' }],
    },
  );
});

test('maps Wing seller products to the catalog snapshot contract', () => {
  const helper = loadHelper();
  const product = helper.buildCatalogProduct({
    sellerProductId: 13189952317,
    sellerProductName: '판매자 관리명',
    displayProductName: '노출 상품명',
    displayCategoryCode: 77390,
    categoryId: 6827,
    manufacture: '해피프랜즈',
    brand: 'kiditem',
    status: 'APPROVED',
    statusName: '승인완료',
    items: [
      {
        vendorItemId: 81038681014,
        sellerProductItemId: 22031298741,
        itemId: 14034788722,
        itemName: '단품',
        externalVendorSku: '101681',
        originalPrice: 0,
        salePrice: 660,
        modelNo: '',
        barcode: '',
        offerCondition: 'NEW',
        images: [
          {
            imageOrder: 0,
            imageType: 'REPRESENTATION',
            cdnPath: 'vendor_inventory/a.jpg',
          },
        ],
        attributes: [
          { attributeTypeName: '색상', attributeValueName: '파랑' },
        ],
        contents: [
          {
            contentDetails: [
              {
                content: '<img src="http://image1.coupangcdn.com/image/vendor_inventory/detail.png">',
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(product.externalProductId, '13189952317');
  assert.equal(product.registeredName, '판매자 관리명');
  assert.equal(product.displayName, '노출 상품명');
  assert.equal(product.category, '77390/6827');
  assert.equal(product.productStatus, '승인완료');
  assert.deepEqual(JSON.parse(JSON.stringify(product.options)), [
    {
      externalOptionId: '81038681014',
      optionName: '단품',
      skuStatus: 'NEW',
      salePrice: 660,
      sellerSku: '101681',
      modelNumber: null,
      barcode: null,
      attributes: [{ type: '색상', value: '파랑' }],
      media: [
        {
          sourceUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/a.jpg',
          role: 'option',
          sortOrder: 0,
          externalOptionId: '81038681014',
        },
      ],
      raw: {
        sellerProductItemId: '22031298741',
        vendorItemId: '81038681014',
        itemId: '14034788722',
        originalVendorItemId: null,
        externalVendorSku: '101681',
        originalPrice: 0,
        salePrice: 660,
        supplyPrice: null,
        maximumBuyCount: null,
        offerCondition: 'NEW',
        taxType: null,
      },
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(product.media)), [
    {
      sourceUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/a.jpg',
      role: 'primary',
      sortOrder: 0,
      externalOptionId: '81038681014',
    },
    {
      sourceUrl: 'http://image1.coupangcdn.com/image/vendor_inventory/detail.png',
      role: 'detail',
      sortOrder: 1,
      externalOptionId: '81038681014',
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(product.raw)), {
    source: 'wing_app_data',
    sellerProductId: '13189952317',
    productId: null,
    displayCategoryCode: '77390',
    categoryId: '6827',
    itemCount: 1,
    generalProductName: null,
    productOrigin: null,
    saleStartedAt: null,
    saleEndedAt: null,
    status: 'APPROVED',
    deliveryMethod: null,
    deliveryCompanyCode: null,
    deliveryChargeType: null,
    deliveryCharge: null,
    freeShipOverAmount: null,
    returnCharge: null,
  });
});

test('uses a stable lexical JSON representation and SHA-256 checksum', async () => {
  const helper = loadHelper();

  assert.equal(
    helper.stableStringify({ z: 1, a: { y: 2, x: undefined, b: true } }),
    '{"a":{"b":true,"y":2},"z":1}',
  );
  assert.equal(
    await helper.sha256Hex({ z: 1, a: { y: 2, x: undefined, b: true } }),
    '6db4cb42d4fbb91756784d71491fa09f01dae825833e98de484182cf0e347de4',
  );
});

test('derives catalog manifest pages from the exact total count', async () => {
  const helper = loadHelper();
  const records = [
    { externalProductId: 'p-1', registeredName: '첫 상품', primaryImageUrl: '//image.coupangcdn.com/a.jpg', saleStatus: '판매중' },
    { externalProductId: 'p-2', registeredName: '둘째 상품', primaryImageUrl: null, saleStatus: '판매중지' },
  ];
  const items = helper.buildDiscoveryItems(records, 1, 50);
  const manifest = await helper.buildManifest({ totalItems: 1228, pageSize: 50, firstPageItems: items });

  assert.equal(manifest.expectedPages, 25);
  assert.equal(manifest.firstPageFingerprint.length, 64);
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [
    {
      ordinal: 0,
      externalProductId: 'p-1',
      registeredName: '첫 상품',
      primaryImageUrl: 'https://image.coupangcdn.com/a.jpg',
      saleStatus: '판매중',
    },
    {
      ordinal: 1,
      externalProductId: 'p-2',
      registeredName: '둘째 상품',
      primaryImageUrl: null,
      saleStatus: '판매중지',
    },
  ]);
});

test('extracts Wing sale status from inventory row text without confusing approval status', () => {
  const helper = loadHelper();

  assert.equal(helper.saleStatusFromText('상품명\n판매상태\n판매중\n승인상태\n승인완료'), '판매중');
  assert.equal(helper.saleStatusFromText('상품명\n판매상태\n판매중지\n승인상태\n승인완료'), '판매중지');
  assert.equal(helper.saleStatusFromText('상품명\n승인상태\n승인완료'), null);
});

function wingApiProduct(id, overrides = {}) {
  return {
    vendorInventoryId: id,
    vendorId: 'A00057379',
    productName: `상품 ${id}`,
    representativeImage: `vendor_inventory/${id}.jpg`,
    productStatus: 'ON_SALE',
    ...overrides,
  };
}

function wingApiResponse(productList, {
  page = 1,
  countPerPage = 500,
  totalCount = productList.length,
  totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / countPerPage),
} = {}) {
  return {
    success: true,
    message: null,
    data: {
      productList,
      pagination: { page, countPerPage, totalCount, totalPages },
    },
  };
}

test('builds the exact fixed Wing search body and maps observed discovery fields', () => {
  const helper = loadHelper();
  assert.deepEqual(JSON.parse(JSON.stringify(helper.buildWingCatalogSearchBody(3))), {
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

  const response = helper.normalizeWingCatalogSearchResponse(
    wingApiResponse([
      wingApiProduct(11, { productStatus: 'ON_SALE' }),
      wingApiProduct(12, { productStatus: 'PARTIAL_ON_SALE' }),
      wingApiProduct(13, { productStatus: 'SUSPENDED' }),
      wingApiProduct(14, { productStatus: 'REJECTED', representativeImage: null }),
    ]),
    1,
    'A00057379',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(response.records)), [
    {
      externalProductId: '11',
      registeredName: '상품 11',
      primaryImageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/11.jpg',
      saleStatus: '판매중',
    },
    {
      externalProductId: '12',
      registeredName: '상품 12',
      primaryImageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/12.jpg',
      saleStatus: '판매중',
    },
    {
      externalProductId: '13',
      registeredName: '상품 13',
      primaryImageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/13.jpg',
      saleStatus: '판매중지',
    },
    {
      externalProductId: '14',
      registeredName: '상품 14',
      primaryImageUrl: null,
      saleStatus: null,
    },
  ]);
});

test('rejects duplicate, incomplete, wrong-account, unknown-status, and inconsistent pages', () => {
  const helper = loadHelper();
  const cases = [
    ['duplicate IDs', wingApiResponse([wingApiProduct(1), wingApiProduct(1)])],
    ['missing ID', wingApiResponse([wingApiProduct(null)])],
    ['missing title', wingApiResponse([wingApiProduct(1, { productName: '' })])],
    ['wrong vendor', wingApiResponse([wingApiProduct(1, { vendorId: 'OTHER' })])],
    ['unknown status', wingApiResponse([wingApiProduct(1, { productStatus: 'DRAFT' })])],
    ['partial page', wingApiResponse([wingApiProduct(1)], { totalCount: 2 })],
    ['wrong pagination', wingApiResponse([wingApiProduct(1)], { totalCount: 1, totalPages: 2 })],
  ];
  for (const [label, response] of cases) {
    assert.throws(
      () => helper.normalizeWingCatalogSearchResponse(response, 1, 'A00057379'),
      /Wing/,
      label,
    );
  }
});

test('fails closed for malformed basic identifiers and boolean observations', () => {
  const helper = loadHelper();
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
  ]) {
    const item = { ...base.vendorInventoryItems[0], [field]: value };
    assert.throws(
      () => helper.buildCatalogBasicProduct({ ...base, vendorInventoryItems: [item] }),
      /올바르지 않습니다/,
      field,
    );
  }
});

test('keeps a true zero-result page distinct from an authentication failure', () => {
  const helper = loadHelper();
  const empty = helper.normalizeWingCatalogSearchResponse(
    wingApiResponse([], { countPerPage: 500, totalCount: 0, totalPages: 0 }),
    1,
    'A00057379',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(empty)), {
    success: true,
    page: 1,
    pageSize: 500,
    totalItems: 0,
    totalPages: 0,
    records: [],
  });
});

test('normalizes the verified 500-row inventory envelope into complete listing basics', () => {
  const helper = loadHelper();
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
        vendorInventoryItems: [
          {
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
          },
        ],
      }],
      pagination: { page: 1, countPerPage: 500, totalCount: 1, totalPages: 1 },
    },
  };
  const response = helper.normalizeWingCatalogSearchResponse(payload, 1, 'A00057379');
  assert.equal(response.pageSize, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(response.records)), [{
    externalProductId: '3395429',
    registeredName: '목록 상품',
    primaryImageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/representative.jpg',
    saleStatus: '판매중',
  }]);
  assert.equal(response.basicProducts.length, 1);
  const [basic] = response.basicProducts;
  assert.equal(basic.productStatus, 'ON_SALE');
  assert.equal(Object.hasOwn(basic, 'saleStatus'), false);
  assert.equal(basic.raw.saleStatus, '판매중');
  assert.equal(basic.options[0].externalOptionId, '17838347');
  assert.equal(basic.options[0].vendorItemId, null);
  assert.equal(basic.options[0].stockQuantity, null);
  assert.equal(basic.options[0].sellerSku, 'SKU-1');
  assert.equal(basic.options[0].barcode, '8800000000001');
  assert.equal(basic.options[0].raw.externalOptionIdentitySource, 'inventory_item');
});

test('production listing_basics payload keeps its checksum after the shared chunk schema parse', async () => {
  const helper = loadHelper();
  const response = helper.normalizeWingCatalogSearchResponse({
    data: {
      productList: [{
        vendorInventoryId: 3395429,
        productName: '목록 상품',
        representativeImage: 'vendor_inventory/representative.jpg',
        productStatus: 'ON_SALE',
        categoryName: '완구',
        vendorInventoryItems: [{
          vendorInventoryItemId: 17838347,
          vendorItemId: null,
          itemName: '단품',
          externalSkuCode: 'SKU-1',
          barcode: '8800000000001',
          status: 'APPROVED',
          soldOut: false,
          stockQuantity: null,
          salePrice: 660,
          autoPricingActive: false,
        }],
      }],
      pagination: { page: 1, countPerPage: 500, totalCount: 1, totalPages: 1 },
    },
  }, 1, 'A00057379');
  const [payload] = helper.chunkCatalogProducts([
    { ordinal: 0, product: response.basicProducts[0] },
  ], { kind: 'listing_basics' });
  const checksum = await helper.sha256Hex(payload);
  const parsed = PutCoupangCatalogChunkRequestSchema.parse({
    kind: 'listing_basics',
    sequence: 1,
    checksum,
    itemCount: 1,
    payload,
  });

  assert.equal(parsed.payload.products[0].product.raw.saleStatus, '판매중');
  assert.equal(Object.hasOwn(parsed.payload.products[0].product, 'saleStatus'), false);
  assert.equal(await helper.sha256Hex(parsed.payload), checksum);
});

test('production full_details payload keeps its checksum after the shared chunk schema parse', async () => {
  const helper = loadHelper();
  const product = helper.buildCatalogDetailProduct({
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
      contents: [{ contentDetails: [{
        content: '<img src="vendor_inventory/detail.jpg">',
      }] }],
      images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/option.jpg' }],
    }],
  });
  const [payload] = helper.chunkCatalogProducts([
    { ordinal: 0, product },
  ], { kind: 'full_details' });
  const checksum = await helper.sha256Hex(payload);
  const parsed = PutCoupangCatalogChunkRequestSchema.parse({
    kind: 'full_details',
    sequence: 1,
    checksum,
    itemCount: 1,
    payload,
  });

  assert.equal(parsed.payload.products[0].product.options[0].externalVendorSku, 'SKU-1');
  assert.equal(parsed.payload.products[0].product.documents.length, 4);
  assert.equal(await helper.sha256Hex(parsed.payload), checksum);
});

test('detail normalization preserves null-vendor identity, value-dedup documents, and all media owners', () => {
  const helper = loadHelper();
  const product = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    sellerProductName: '상세 상품',
    displayProductName: '상세 노출명',
    status: 'APPROVED',
    statusName: '승인완료',
    items: [
      {
        sellerProductItemId: 17838347,
        vendorItemId: null,
        itemId: 1,
        itemName: '파랑',
        externalVendorSku: 'SKU-1',
        barcode: '8800000000001',
        modelNo: 'M-1',
        salePrice: 660,
        attributes: [{ attributeTypeName: '색상', attributeValueName: '파랑' }],
        notices: [{ name: '재질', value: '플라스틱' }],
        searchTags: ['물놀이', '공놀이'],
        contents: [{ contentDetails: [{ content: '<img src="vendor_inventory/shared.jpg">' }] }],
        images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/shared.jpg' }],
      },
      {
        sellerProductItemId: 17838348,
        vendorItemId: 81000000001,
        itemName: '빨강',
        externalVendorSku: 'SKU-2',
        notices: [{ name: '재질', value: '플라스틱' }],
        searchTags: ['물놀이'],
        contents: [{ contentDetails: [{ content: '<img src="vendor_inventory/shared.jpg">' }] }],
        images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/shared.jpg' }],
      },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(product.options.map((option) => option.externalOptionId))), ['17838347', '81000000001']);
  assert.equal(product.options[0].vendorItemId, null);
  assert.equal(product.options[0].modelNumber, 'M-1');
  assert.equal(product.documents.filter((document) => document.kind === 'notices').length, 1);
  assert.equal(product.documents.filter((document) => document.kind === 'searchTags').length, 2);
  assert.equal(product.media.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(product.media[0].externalOptionIds)), ['17838347', '81000000001']);
  assert.deepEqual(JSON.parse(JSON.stringify(product.media[1].externalOptionIds)), ['17838347', '81000000001']);
});

test('detail documents preserve each observed field value, including null, empty, order, and duplicates', () => {
  const helper = loadHelper();
  const product = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    items: [
      {
        sellerProductItemId: 17838347,
        vendorItemId: null,
        notices: [{ name: '재질', value: '플라스틱' }, { name: '재질', value: '플라스틱' }],
        additionalNotices: [],
        searchTags: ['첫째', '둘째', '첫째'],
        internalAttributes: null,
      },
      {
        sellerProductItemId: 17838348,
        vendorItemId: null,
        notices: [{ name: '재질', value: '플라스틱' }, { name: '재질', value: '플라스틱' }],
        additionalNotices: [],
        searchTags: ['첫째', '둘째', '첫째'],
        internalAttributes: null,
      },
    ],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(product.documents)), [
    {
      id: product.documents[0].id,
      kind: 'notices',
      value: [{ name: '재질', value: '플라스틱' }, { name: '재질', value: '플라스틱' }],
    },
    { id: product.documents[1].id, kind: 'additionalNotices', value: [] },
    { id: product.documents[2].id, kind: 'searchTags', value: ['첫째', '둘째', '첫째'] },
    { id: product.documents[3].id, kind: 'internalAttributes', value: null },
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(product.options.map((option) => option.documentIds))),
    JSON.parse(JSON.stringify([product.options[1].documentIds, product.options[1].documentIds])),
  );
  assert.equal(Object.hasOwn(product.options[0], 'externalVendorSku'), true);
  assert.equal(Object.hasOwn(product.options[0], 'sellerSku'), false);
});

test('detail normalization preserves only the provider sale-start observation', () => {
  const helper = loadHelper();
  const product = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    saleStartedAt: ' 2026-04-01T14:41:57 ',
    createdOn: '2026-04-01 11:32:06',
    saleDates: { start: '2026-04-01' },
    items: [{ sellerProductItemId: 17838347 }],
  });

  assert.equal(product.raw.saleStartedAt, '2026-04-01T14:41:57');
  assert.equal(Object.hasOwn(product.raw, 'createdOn'), false);
  assert.equal(Object.hasOwn(product.raw, 'saleDates'), false);

  const absent = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    items: [{ sellerProductItemId: 17838347 }],
  });
  assert.equal(absent.raw.saleStartedAt, null);

  const invalid = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    saleStartedAt: 'not-a-date',
    items: [{ sellerProductItemId: 17838347 }],
  });
  assert.equal(invalid.raw.saleStartedAt, 'not-a-date');
});

test('repeated detail fields across 73 realistic options stay deduplicated, associated, and within product limits', () => {
  const helper = loadHelper();
  const commonContentHtml = [
    '<section class="detail-description">',
    '<h2>공통 상품 상세 설명</h2>',
    '<p>',
    '이 상품은 어린이의 안전한 놀이를 위해 제작되었습니다. '.repeat(260),
    '</p>',
    '<img src="https://image1.coupangcdn.com/image/vendor_inventory/common-detail.jpg">',
    '</section>',
  ].join('');
  const commonNotices = Array.from({ length: 14 }, (_, index) => ({
    name: `상품정보제공고시 ${index + 1}`,
    value: `공통 고시 내용 ${index + 1}`,
  }));
  const commonSearchTags = Array.from({ length: 16 }, (_, index) => `공통검색태그-${index + 1}`);
  const items = Array.from({ length: 73 }, (_, index) => ({
    sellerProductItemId: 17838347 + index,
    vendorItemId: null,
    externalVendorSku: `SKU-${index + 1}`,
    itemName: `옵션 ${index + 1}`,
    notices: commonNotices,
    searchTags: commonSearchTags,
    contents: [{ contentDetails: [{ content: commonContentHtml }] }],
    images: [{
      imageType: 'REPRESENTATION',
      cdnPath: `vendor_inventory/option-${index + 1}.jpg`,
    }],
  }));
  const sourceBytes = helper.jsonByteLength({ sellerProductId: 3395429, items });
  const noticeCount = items.reduce((total, item) => total + item.notices.length, 0);
  const tagCount = items.reduce((total, item) => total + item.searchTags.length, 0);
  assert.equal(noticeCount, 1022);
  assert.equal(tagCount, 1168);
  assert.equal(sourceBytes > 1_000_000, true);

  const product = helper.buildCatalogDetailProduct({
    sellerProductId: 3395429,
    items,
  });

  assert.equal(product.options.length, 73);
  assert.equal(product.documents.length, 3);
  assert.equal(product.documents.filter((document) => document.kind === 'notices')[0].value.length, 14);
  assert.equal(product.documents.filter((document) => document.kind === 'searchTags')[0].value.length, 16);
  assert.equal(product.documents.filter((document) => document.kind === 'contents')[0].value[0].contentDetails[0].content, commonContentHtml);
  assert.equal(product.media.length, 74);
  assert.equal(new Set(product.media.map((media) => media.sourceUrl)).size, 74);
  assert.equal(product.media.filter((media) => media.role === 'detail').length, 1);
  assert.equal(product.media.filter((media) => media.role === 'option').length, 73);
  assert.deepEqual(
    JSON.parse(JSON.stringify(product.media.find((media) => media.role === 'detail').externalOptionIds)),
    items.map((item) => String(item.sellerProductItemId)),
  );
  for (const [index, option] of product.options.entries()) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(option.documentIds)),
      JSON.parse(JSON.stringify(product.options[0].documentIds)),
    );
    assert.equal(option.externalOptionId, String(items[index].sellerProductItemId));
    assert.deepEqual(
      JSON.parse(JSON.stringify(option.documentIds.map((id) => product.documents.find((document) => document.id === id).kind))),
      ['contents', 'notices', 'searchTags'],
    );
    assert.equal(option.raw.externalOptionIdentitySource, 'inventory_item');
    const optionMedia = product.media.find((media) =>
      media.role === 'option' && media.sourceUrl.endsWith(`/option-${index + 1}.jpg`));
    assert.equal(optionMedia.sourceUrl, `https://image1.coupangcdn.com/image/vendor_inventory/option-${index + 1}.jpg`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(optionMedia.externalOptionIds)),
      [option.externalOptionId],
    );
  }
  assert.equal(helper.jsonByteLength(product) <= 512 * 1024, true);
});

test('synthetic 73-option media-cap reproducer records 74 detail URLs and exact input owners', async () => {
  const helper = loadHelper();
  const optionCount = 73;
  const optionIds = Array.from({ length: optionCount }, (_, index) => String(99000000001 + index));
  const sharedDetailUrl = 'https://image1.coupangcdn.com/image/vendor_inventory/synthetic-shared-detail.jpg';
  const uniqueDetailUrls = Array.from({ length: optionCount }, (_, index) =>
    `https://image1.coupangcdn.com/image/vendor_inventory/synthetic-detail-${index + 1}.jpg`);
  const optionImageUrls = Array.from({ length: optionCount }, (_, index) =>
    `https://image1.coupangcdn.com/image/vendor_inventory/synthetic-option-${index + 1}.jpg`);
  const items = optionIds.map((sellerProductItemId, index) => ({
    sellerProductItemId,
    vendorItemId: null,
    contents: [{ contentDetails: [{
      content: `<img src="${sharedDetailUrl}"><img src="${uniqueDetailUrls[index]}">`,
    }] }],
    images: [{ imageType: 'REPRESENTATION', cdnPath: optionImageUrls[index] }],
  }));

  const expectedDetailOwners = new Map([
    [sharedDetailUrl, optionIds],
    ...uniqueDetailUrls.map((sourceUrl, index) => [sourceUrl, [optionIds[index]]]),
  ]);
  const expectedOptionOwners = new Map(
    optionImageUrls.map((sourceUrl, index) => [sourceUrl, [optionIds[index]]]),
  );
  const detailUrlSet = new Set(expectedDetailOwners.keys());
  const optionImageSet = new Set(expectedOptionOwners.keys());
  const expectedNormalizedMediaCount = detailUrlSet.size + optionImageSet.size;
  const perOptionMediaCounts = items.map((item) =>
    item.images.length + item.contents[0].contentDetails[0].content.match(/<img /g).length);

  // This is a synthetic reproducer, not a claim about the captured provider
  // payload. Record the known normalization shape before exercising the
  // existing product-level guard.
  assert.equal(items.length, optionCount);
  assert.equal(detailUrlSet.size, 74);
  assert.equal(optionImageSet.size, 73);
  assert.equal(expectedNormalizedMediaCount, 147);
  assert.equal(expectedNormalizedMediaCount > 100, true);
  assert.equal(Math.max(...perOptionMediaCounts), 3);
  assert.equal(perOptionMediaCounts.every((count) => count <= 100), true);
  assert.deepEqual(expectedDetailOwners.get(sharedDetailUrl), optionIds);
  for (const [index, sourceUrl] of uniqueDetailUrls.entries()) {
    assert.deepEqual(expectedDetailOwners.get(sourceUrl), [optionIds[index]]);
    assert.deepEqual(expectedOptionOwners.get(optionImageUrls[index]), [optionIds[index]]);
  }

  const product = helper.buildCatalogDetailProduct({
    sellerProductId: 99000000000,
    items,
  });
  assert.equal(product.options.length, optionCount);
  assert.equal(product.media.length, expectedNormalizedMediaCount);
  assert.equal(product.media.filter((media) => media.role === 'detail').length, 74);
  assert.equal(product.media.filter((media) => media.role === 'option').length, 73);
  for (const [sourceUrl, owners] of expectedDetailOwners) {
    const media = product.media.find((item) =>
      item.role === 'detail' && item.sourceUrl === sourceUrl);
    assert.ok(media);
    assert.deepEqual(JSON.parse(JSON.stringify(media.externalOptionIds)), owners);
  }
  for (const [sourceUrl, owners] of expectedOptionOwners) {
    const media = product.media.find((item) =>
      item.role === 'option' && item.sourceUrl === sourceUrl);
    assert.ok(media);
    assert.deepEqual(JSON.parse(JSON.stringify(media.externalOptionIds)), owners);
  }
  assert.equal(helper.jsonByteLength(product) <= 512 * 1024, true);

  const [payload] = helper.chunkCatalogProducts([
    { ordinal: 0, product },
  ], { kind: 'full_details' });
  const checksum = await helper.sha256Hex(payload);
  const parsed = PutCoupangCatalogChunkRequestSchema.parse({
    kind: 'full_details',
    sequence: 1,
    checksum,
    itemCount: 1,
    payload,
  });
  assert.equal(parsed.payload.products[0].product.media.length, expectedNormalizedMediaCount);
  assert.equal(await helper.sha256Hex(parsed.payload), checksum);
});

test('detail normalization enforces the media limit for each option owner', () => {
  const helper = loadHelper();
  const items = [{
    sellerProductItemId: '99000000101',
    vendorItemId: null,
    images: Array.from({ length: 101 }, (_, index) => ({
      imageType: 'REPRESENTATION',
      cdnPath: 'https://image1.coupangcdn.com/image/vendor_inventory/overflow-' +
        (index + 1) + '.jpg',
    })),
  }];

  assert.throws(
    () => helper.buildCatalogDetailProduct({ sellerProductId: 99000000002, items }),
    /미디어가 허용 개수를 초과했습니다/,
  );
});

test('splits stage products by deterministic byte size and rejects oversized products', () => {
  const helper = loadHelper();
  const products = Array.from({ length: 3 }, (_, ordinal) => ({
    ordinal,
    product: { externalProductId: String(ordinal), value: 'x'.repeat(120) },
  }));
  const chunks = helper.chunkCatalogProducts(products, { kind: 'listing_basics', maxBytes: 400 });
  assert.deepEqual(JSON.parse(JSON.stringify(chunks.map((chunk) => chunk.products.map((item) => item.ordinal)))), [[0], [1], [2]]);
  assert.throws(
    () => helper.chunkCatalogProducts([{ ordinal: 0, product: { externalProductId: 'x', value: 'x'.repeat(600_000) } }], { kind: 'full_details' }),
    /허용 크기|exceed/i,
  );
});

test('caps stage chunks at 20 products even when byte size permits more', () => {
  const helper = loadHelper();
  const products = Array.from({ length: 21 }, (_, ordinal) => ({
    ordinal,
    product: { externalProductId: String(ordinal) },
  }));
  const chunks = helper.chunkCatalogProducts(products, { kind: 'full_details' });
  assert.deepEqual(JSON.parse(JSON.stringify(chunks.map((chunk) => chunk.products.length))), [20, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(chunks.map((chunk) => chunk.startOrdinal))), [0, 20]);
});
