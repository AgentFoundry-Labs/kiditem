import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const helperPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../coupang-ads-scraper/shared/coupang-catalog-collector.js',
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
    { externalProductId: 'p-1', registeredName: '첫 상품', primaryImageUrl: '//image.coupangcdn.com/a.jpg' },
    { externalProductId: 'p-2', registeredName: '둘째 상품', primaryImageUrl: null },
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
    },
    {
      ordinal: 1,
      externalProductId: 'p-2',
      registeredName: '둘째 상품',
      primaryImageUrl: null,
    },
  ]);
});
