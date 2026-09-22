import { describe, expect, it, vi } from 'vitest';
import type { SalesProduct } from '@kiditem/shared/sales-product';

vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));
vi.mock('../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api', () => ({
  prepareMallRegistration: vi.fn(),
}));

const {
  detailImageUrlsFromHtml,
  prepareRegistration,
  salesProductToMallProductDraft,
} = await import('./sales-product-registration');
const { smartstoreFormFromDraft } = await import('../../(product-pipeline)/product-pipeline/_shared/lib/smartstore-registration-form');
const { elevenstFormFromDraft } = await import('../../(product-pipeline)/product-pipeline/_shared/lib/elevenst-registration-form');

const ACCOUNT = '33333333-3333-4333-8333-333333333333';

function product(): SalesProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100300',
    ownCode: null,
    sabangnetGoodsNo: '100300',
    sourceCandidateId: null,
    name: '애니멀 만능패드',
    shortName: '만능패드',
    englishName: null,
    printName: null,
    modelName: '7747-4',
    modelNo: null,
    brand: 'kiditem',
    manufacturer: 'KY I&D',
    originCountry: '중국',
    originRegion: null,
    keywords: ['패드'],
    standardCategory: null,
    status: 'active',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    costPrice: 2000,
    salePrice: 5900,
    tagPrice: 9000,
    optionAxes: ['색상'],
    stockManaged: false,
    optionsLocked: false,
    imageUrls: ['https://img.example/1.jpg', 'https://img.example/2.jpg'],
    detailHtml: '<center><img src="http://kiditem.diskn.com/a"></center><img alt="" src=\'https://kiditem.diskn.com/b\' />',
    extraDetailHtml: [],
    noticeCategory: '023',
    noticeValues: [],
    certifications: [],
    importDeclarationNo: null,
    adminMemo: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    options: [
      option('100300-0001', '파랑', 'selling', 5900, 9000, '7747-1'),
      option('100300-0002', '노랑', 'sold_out', 6400, null, null),
      option('100300-0003', '핑크', 'unused', 5900, null, null),
    ],
    channelOverrides: [{
      id: '44444444-4444-4444-8444-444444444444',
      channelAccountId: ACCOUNT,
      mallKey: 'boribori',
      mallName: '보리보리',
      salePrice: 6200,
      priceRateBp: null,
      costPrice: null,
      name: '애니멀 만능패드 (보리보리)',
      detailHtml: null,
      promoText: null,
      noticeCategory: null,
      stockPercent: null,
      adapterValues: null,
      version: 1,
      updatedAt: '2026-09-19T00:00:00.000Z',
    }],
    channelListings: [],
  };
}

function option(code: string, value: string, supplyStatus: SalesProduct['options'][number]['supplyStatus'], salePrice: number, normalPrice: number | null, sellpiaCode: string | null): SalesProduct['options'][number] {
  return {
    id: `22222222-2222-4222-8222-2222222200${code.slice(-2)}`,
    optionCode: code,
    values: [value],
    optionKey: value,
    alias: null,
    barcode: null,
    salePrice,
    normalPrice,
    supplyStatus,
    safetyStock: null,
    sortOrder: 0,
    components: sellpiaCode
      ? [{ sellpiaInventorySkuId: '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c11', sellpiaCode, name: 'x', optionName: null, quantity: 1, currentStock: 3 }]
      : [],
    linkedChannelOptionCount: 0,
  };
}

describe('sales product → mall draft', () => {
  it('reads detail image urls out of the stored HTML', () => {
    expect(detailImageUrlsFromHtml(product().detailHtml)).toEqual(['http://kiditem.diskn.com/a', 'https://kiditem.diskn.com/b']);
    expect(detailImageUrlsFromHtml(null)).toEqual([]);
  });

  it('sends every option in use, sold-out options with zero stock, and the mall price and name', () => {
    const draft = salesProductToMallProductDraft(product(), 'boribori');
    expect(draft.displayName).toBe('애니멀 만능패드 (보리보리)');
    expect(draft.variants.map((variant) => [variant.options, variant.salePrice, variant.stock, variant.sellerSku])).toEqual([
      [[{ type: '색상', value: '파랑' }], 6200, 999, '100300-0001'],
      [[{ type: '색상', value: '노랑' }], 6200, 0, '100300-0002'],
    ]);
    expect(draft.variants[0]!.listPrice).toBe(9000);
    expect(draft.notice.category).toBe('어린이제품');
    expect(draft.notice.fields.제조자).toBe('KY I&D');
  });

  it('uses the issued selling-option code for a bundle instead of its first source code', () => {
    const row = product();
    row.options[0]!.optionCode = 'KID00000300';
    row.options[0]!.components[0]!.sellpiaCode = 'KID00000100';
    row.options[0]!.components[0]!.quantity = 2;
    expect(salesProductToMallProductDraft(row, 'kidsnote').variants[0]!.sellerSku).toBe('KID00000300');
  });

  it('uses the product values on a mall without per-mall values', () => {
    const draft = salesProductToMallProductDraft(product(), 'kidsnote');
    expect(draft.displayName).toBe('애니멀 만능패드');
    expect(draft.variants[0]!.salePrice).toBe(5900);
    expect(draft.representativeImageUrl).toBe('https://img.example/1.jpg');
    expect(draft.additionalImageUrls).toEqual(['https://img.example/2.jpg']);
  });

  it('puts frozen target name, content, notice, and images into the actual mall form payload', () => {
    const draft = salesProductToMallProductDraft(product(), 'smartstore', {
      name: '동결 대상 이름',
      detailHtml: '<img src="https://frozen.example/detail.png">',
      imageUrls: ['https://frozen.example/primary.png', 'https://frozen.example/extra.png'],
      keywords: ['동결 키워드'],
      promoText: '동결 홍보문구',
      manufacturer: '동결 제조사',
      noticeFields: { 사용연령: '8세 이상' },
    });
    const form = smartstoreFormFromDraft(draft, {
      quantity: 1,
      category: { id: '50000001', keyword: '동결 카테고리', label: '동결 카테고리' },
    });
    const elevenstForm = elevenstFormFromDraft(draft, { categoryPath: '대>중>소' });

    expect(form.smartstore.productName).toContain('동결 대상 이름');
    expect(form.smartstore.tags).toContain('동결키워드');
    expect(form.smartstore.notice.manufacturer).toBe('동결 제조사');
    expect(form.imageGroups.smartstore).toEqual([
      'https://frozen.example/primary.png',
      'https://frozen.example/extra.png',
    ]);
    expect(form.detailUploads).toEqual([{ url: 'https://frozen.example/detail.png' }]);
    expect(elevenstForm.rowFields.promoText).toBe('동결 홍보문구');
  });

  it('does not re-read live sales-product data for a target execution', async () => {
    const liveProduct = product();
    liveProduct.name = 'live edit after target freeze';
    const targetProduct = product();
    targetProduct.name = 'frozen target name';
    const { salesProductApi } = await import('@/lib/sales-product-api');
    vi.mocked(salesProductApi.get).mockResolvedValue(liveProduct as never);

    const draft = await prepareRegistration({
      candidateId: targetProduct.id,
      name: targetProduct.name,
      salePrice: targetProduct.options[0]!.salePrice,
      thumbnailUrl: targetProduct.imageUrls[0] ?? null,
      source: 'sales_product',
      targetExecution: {
        executionId: '55555555-5555-4555-8555-555555555555',
        payloadHash: 'frozen-hash',
        leaseToken: '66666666-6666-4666-8666-666666666666',
        snapshot: {
          targetId: '77777777-7777-4777-8777-777777777777',
          targetVersion: 1,
          channelAccountId: ACCOUNT,
          kind: 'register',
          channelListingId: null,
          applyCompositionTemplate: false,
          product: targetProduct,
          registrationInput: {},
          supplyPrices: targetProduct.options.map((option) => ({
            salesProductOptionId: option.id,
            supplyPrice: null,
          })),
        },
      },
    }, 'smartstore');

    expect(salesProductApi.get).not.toHaveBeenCalled();
    expect(draft.draft.displayName).toBe('frozen target name');
  });
});
