import { describe, expect, it, vi } from 'vitest';
import type { SalesProduct } from '@kiditem/shared/sales-product';

vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));
vi.mock('../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api', () => ({
  prepareMallRegistration: vi.fn(),
}));
vi.mock('../../(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: { getCurrentDetailHtml: vi.fn() },
}));

const {
  detailImageUrlsFromHtml,
  prepareRegistration,
  salesProductToMallProductDraft,
} = await import('./sales-product-registration');
const { smartstoreFormFromDraft } = await import('../../(product-pipeline)/product-pipeline/_shared/lib/smartstore-registration-form');
const { elevenstFormFromDraft } = await import('../../(product-pipeline)/product-pipeline/_shared/lib/elevenst-registration-form');

const ACCOUNT = '33333333-3333-4333-8333-333333333333';

const DETAIL_HTML = '<center><img src="http://kiditem.diskn.com/a"></center><img alt="" src=\'https://kiditem.diskn.com/b\' />';

function product(): SalesProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100300',
    ownCode: null,
    sabangnetGoodsNo: '100300',
    sourceRecordId: null,
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
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    kcStatus: 'unknown',
    status: 'active',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    optionAxes: ['색상'],
    stockManaged: false,
    imageUrls: ['https://img.example/1.jpg', 'https://img.example/2.jpg'],
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
      name: '애니멀 만능패드 (보리보리)',
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
      ? [{ masterProductId: '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c11', sellpiaCode, name: 'x', optionName: null, quantity: 1, currentStock: 3 }]
      : [],
    referenceCost: null,
    linkedChannelOptionCount: 0,
  };
}

describe('sales product → mall draft', () => {
  it('reads detail image urls out of the stored HTML', () => {
    expect(detailImageUrlsFromHtml(DETAIL_HTML)).toEqual(['http://kiditem.diskn.com/a', 'https://kiditem.diskn.com/b']);
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

  it('fills the mall form from the frozen product, its detail revision and the mall-only promo text, ignoring old product-fact keys', () => {
    const frozen = product();
    frozen.name = '동결 상품 이름';
    frozen.keywords = ['동결 키워드'];
    frozen.manufacturer = '동결 제조사';
    frozen.imageUrls = ['https://frozen.example/primary.png', 'https://frozen.example/extra.png'];
    const draft = salesProductToMallProductDraft(frozen, 'smartstore', {
      mallCategory: null,
      mallFields: { promoText: '  몰 홍보문구  ' },
      adapter: {},
      // 옛 등록 대상이 복사해 두던 상품 사실 — 새 계약에는 없고, 있어도 읽지 않는다.
      name: '옛 대상 이름',
      detailHtml: '<img src="https://stale.example/detail.png">',
      imageUrls: ['https://stale.example/primary.png'],
      keywords: ['옛 키워드'],
      promoText: '옛 홍보문구',
      manufacturer: '옛 제조사',
      noticeCategory: '035',
      noticeFields: { 사용연령: '8세 이상' },
    }, '<img src="https://frozen.example/detail.png">');
    const form = smartstoreFormFromDraft(draft, {
      quantity: 1,
      category: { id: '50000001', keyword: '동결 카테고리', label: '동결 카테고리' },
    });
    const elevenstForm = elevenstFormFromDraft(draft, { categoryPath: '대>중>소' });

    expect(form.smartstore.productName).toContain('동결 상품 이름');
    expect(form.smartstore.tags).toContain('동결키워드');
    expect(form.smartstore.notice.manufacturer).toBe('동결 제조사');
    expect(form.imageGroups.smartstore).toEqual([
      'https://frozen.example/primary.png',
      'https://frozen.example/extra.png',
    ]);
    expect(form.detailUploads).toEqual([{ url: 'https://frozen.example/detail.png' }]);
    expect(elevenstForm.rowFields.promoText).toBe('몰 홍보문구');
    expect(draft.notice.category).toBe('어린이제품');
    expect(draft.notice.fields.사용연령).not.toBe('8세 이상');
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
          detailPage: { revisionId: '88888888-8888-4888-8888-888888888888', html: DETAIL_HTML },
          registrationInput: {},
          adapterPayload: {},
        },
      },
    }, 'smartstore');

    expect(salesProductApi.get).not.toHaveBeenCalled();
    expect(draft.draft.displayName).toBe('frozen target name');
  });

  it('builds a sales-product item without a snapshot from the workspace\'s current detail, and fails only when that is empty', async () => {
    const live = product();
    const { salesProductApi } = await import('@/lib/sales-product-api');
    const { contentWorkspacesApi } = await import('../../(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api');
    vi.mocked(salesProductApi.get).mockResolvedValue(live as never);
    const item = {
      candidateId: live.id,
      name: live.name,
      salePrice: live.options[0]!.salePrice,
      thumbnailUrl: live.imageUrls[0] ?? null,
      source: 'sales_product' as const,
    };

    vi.mocked(contentWorkspacesApi.getCurrentDetailHtml).mockResolvedValue(DETAIL_HTML);
    const { draft } = await prepareRegistration(item, 'smartstore');
    expect(contentWorkspacesApi.getCurrentDetailHtml).toHaveBeenCalledWith(live.id);
    expect(draft.detailImageUrls).toEqual(['http://kiditem.diskn.com/a', 'https://kiditem.diskn.com/b']);

    vi.mocked(contentWorkspacesApi.getCurrentDetailHtml).mockResolvedValue(null);
    await expect(prepareRegistration(item, 'smartstore')).rejects.toThrow('상세 이미지가 없습니다');
  });
});
