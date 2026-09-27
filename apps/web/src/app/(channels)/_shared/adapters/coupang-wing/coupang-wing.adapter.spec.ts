import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelDelivery } from '@kiditem/shared/channel-registry';
import type { SalesProduct } from '@kiditem/shared/sales-product';
import { salesProductApi } from '@/lib/sales-product-api';
import { renderRegistrationDetailImage } from '../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api';
import type { MallPublishItem } from '../../mall-publish-adapter';

vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));
vi.mock('../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api', () => ({
  renderRegistrationDetailImage: vi.fn(),
}));

const { coupangWingAdapter } = await import('./coupang-wing.adapter');

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '55555555-5555-4555-8555-555555555555';
const KEYRING = '[64687] 생활용품>생활소품>열쇠고리/키홀더';

function product(): SalesProduct {
  return {
    id: PRODUCT_ID,
    name: '선인장 딸깍 키링',
    keywords: ['휴대용'],
    imageUrls: ['https://img.example/rep.jpg'],
    colorVariantNames: [],
    standardCategory: '키링',
    options: [{ supplyStatus: 'selling', salePrice: 3000, normalPrice: null, optionCode: 'KID-1-01' }],
  } as unknown as SalesProduct;
}

const READY = {
  status: 'ready' as const,
  artifactId: '88888888-8888-4888-8888-888888888888',
  revisionId: REVISION_ID,
  imageUrl: 'https://cdn.example.com/detail-780.jpg',
  outputWidth: 780 as const,
  contentType: 'image/jpeg' as const,
  byteLength: 100,
};

const VALUES = {
  wingCategoryKey: '64687', productName: '고친 이름', sellerProductName: '관리명', colorValue: '단일', quantityValue: '1', stock: '10',
};

const targetItem: MallPublishItem = {
  candidateId: PRODUCT_ID, name: '선인장 딸깍 키링', salePrice: 3000, thumbnailUrl: null, source: 'sales_product',
  detailPageRevisionId: REVISION_ID,
};

describe('coupangWingAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(renderRegistrationDetailImage).mockResolvedValue(READY);
    vi.mocked(salesProductApi.get).mockResolvedValue(product());
  });

  it('reaches the mall the way the channel registry says: an admin form', () => {
    expect(coupangWingAdapter.mode).toBe(channelDelivery('coupang'));
    expect(coupangWingAdapter.mode).toBe('form');
    expect(coupangWingAdapter.confirmation?.sellpiaMatch).toBe(true);
  });

  it('⭐ builds the WING form instruction from the sales product, the confirmed values and the target’s detail revision — nothing else', async () => {
    const form = await coupangWingAdapter.buildForm({ item: targetItem, values: VALUES });

    expect(salesProductApi.get).toHaveBeenCalledWith(PRODUCT_ID);
    expect(renderRegistrationDetailImage).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, detailPageRevisionId: REVISION_ID });
    // 리더 결정: WING 폼은 평평하다 — 서버 freezeForm이 categoryCell·variants를 최상위에서 읽는다(`product` 래퍼 없음).
    expect(form).not.toHaveProperty('product');
    expect(form).toMatchObject({
      categoryCell: KEYRING,
      productName: '고친 이름',
      sellerProductName: '관리명',
      detailImageUrls: ['https://cdn.example.com/detail-780.jpg'],
      variants: [expect.objectContaining({
        purchaseOptions: [{ type: '색상', value: '단일' }, { type: '수량', value: '1' }],
        stock: 10,
        salePrice: 3000,
        vendorItemCode: 'KID-1-01',
        representativeImageUrl: 'https://img.example/rep.jpg',
      })],
    });
    // 판매자 ID 대조·업체상품코드·기존 리스팅 차단은 서버 plan 몫이다 — 폼 지시에 싣지 않는다.
    expect(form).not.toHaveProperty('expectedVendorId');
    expect(form).not.toHaveProperty('executionContext');
  });

  it('a quick fill (candidate item) reads the draft sales product and the workspace’s current detail', async () => {
    const item: MallPublishItem = {
      candidateId: 'record-1', source: 'candidate', salesProductId: PRODUCT_ID, name: '선인장 딸깍 키링', salePrice: 3000, thumbnailUrl: null,
    };
    await coupangWingAdapter.buildForm({ item, values: VALUES, channelAccount: { id: 'account-1', vendorId: 'A00012345' } });
    expect(salesProductApi.get).toHaveBeenCalledWith(PRODUCT_ID);
    expect(renderRegistrationDetailImage).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, detailPageRevisionId: null });
  });

  it('refuses to build a form, before any extension call, when the detail image cannot be rendered', async () => {
    vi.mocked(renderRegistrationDetailImage).mockResolvedValue({ status: 'missing', reason: 'empty_html', message: '상세 HTML 이 비어 있습니다.' });
    await expect(coupangWingAdapter.buildForm({ item: targetItem, values: VALUES })).rejects.toThrow('상세 HTML 이 비어 있습니다.');
  });

  it('refuses a WING product that fails its own rules (no category)', async () => {
    await expect(coupangWingAdapter.buildForm({ item: targetItem, values: { ...VALUES, wingCategoryKey: '' } })).rejects.toThrow();
  });

  it('says the Coupang adapter’s own rejections in the operator’s words', () => {
    expect(coupangWingAdapter.describeError?.('A Wing registration registers exactly one option.')).toContain('옵션 하나');
  });

  it('stores only WING values on the registration target, never product facts', () => {
    const stored = coupangWingAdapter.adapterTargetInput?.({
      wingCategoryKey: '64687', productName: '이름', sellerProductName: '관리명', colorValue: '단일', quantityValue: '1', stock: '10',
    });
    expect(stored).toEqual({
      wingCategoryKey: '64687',
      wingProduct: {
        categoryCell: KEYRING,
        productName: '이름',
        sellerProductName: '관리명',
        variants: [{ purchaseOptions: [{ type: '색상', value: '단일' }, { type: '수량', value: '1' }], stock: 10 }],
      },
    });
    expect(JSON.stringify(stored)).not.toMatch(/salePrice|imageUrl/i);
  });
});
