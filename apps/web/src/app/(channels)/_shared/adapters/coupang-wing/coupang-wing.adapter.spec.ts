import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelDelivery } from '@kiditem/shared/channel-registry';
import type { SalesProduct, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';
import { detectWingFormExtensionId, sendToExtensionViaPort } from '@/lib/extension-bridge';
import { salesProductApi } from '@/lib/sales-product-api';
import { renderRegistrationDetailImage } from '../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api';
import type { MallPublishItem } from '../../mall-publish-adapter';

vi.mock('@/lib/extension-bridge', () => ({
  KIDITEM_WING_FORM_PORT_NAME: 'kiditem-wing-form-v1',
  detectWingFormExtensionId: vi.fn(),
  sendToExtensionViaPort: vi.fn(),
}));
vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));
vi.mock('../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api', () => ({
  renderRegistrationDetailImage: vi.fn(),
}));

const { coupangWingAdapter } = await import('./coupang-wing.adapter');

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '55555555-5555-4555-8555-555555555555';
const CONTEXT = {
  executionId: '33333333-3333-4333-8333-333333333333',
  payloadHash: 'a'.repeat(64),
  leaseToken: '44444444-4444-4444-8444-444444444444',
};
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

function snapshot(adapterPayload: Record<string, unknown>, detailPage: TargetExecutionSnapshot['detailPage'] = {
  revisionId: REVISION_ID, html: '<p>d</p>',
}): TargetExecutionSnapshot {
  return {
    targetId: '66666666-6666-4666-8666-666666666666',
    targetVersion: 1,
    channelAccountId: '77777777-7777-4777-8777-777777777777',
    kind: 'register',
    channelListingId: null,
    applyCompositionTemplate: false,
    product: product(),
    detailPage,
    registrationInput: { mallCategory: null, mallFields: {}, adapter: {} },
    adapterPayload,
  } as TargetExecutionSnapshot;
}

function executionItem(payload: Record<string, unknown>, detailPage?: TargetExecutionSnapshot['detailPage']): MallPublishItem {
  return {
    candidateId: PRODUCT_ID,
    name: '선인장 딸깍 키링',
    salePrice: 3000,
    thumbnailUrl: null,
    source: 'sales_product',
    targetExecution: {
      ...CONTEXT,
      snapshot: snapshot(payload, detailPage),
      expectedProviderAccountId: 'A00012345',
    },
  };
}

const FROZEN = {
  wingProduct: { categoryCell: KEYRING, productName: '선인장 딸깍 키링 1p  휴대용', sellerProductName: '선인장 딸깍 키링' },
  vendorItemCode: 'KID-1-01',
  sellpiaMatch: { sellpiaInventorySkuId: 'sku-1', code: 'S-1', name: '키링', optionName: null, quantity: 1 },
  existingChannelListing: null,
};

const READY = {
  status: 'ready' as const,
  artifactId: '88888888-8888-4888-8888-888888888888',
  revisionId: REVISION_ID,
  imageUrl: 'https://cdn.example.com/detail-780.jpg',
  outputWidth: 780 as const,
  contentType: 'image/jpeg' as const,
  byteLength: 100,
};

describe('coupangWingAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectWingFormExtensionId).mockResolvedValue('ext-1');
    vi.mocked(renderRegistrationDetailImage).mockResolvedValue(READY);
    vi.mocked(salesProductApi.get).mockResolvedValue(product());
  });

  it('reaches the mall the way the channel registry says: an admin form', () => {
    expect(coupangWingAdapter.mode).toBe(channelDelivery('coupang'));
    expect(coupangWingAdapter.mode).toBe('form');
    expect(coupangWingAdapter.confirmation?.sellpiaMatch).toBe(true);
  });

  it('inside a registration execution, fills the WING form from the frozen payload and presses [상품등록] with the execution context', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: true,
      submission: { attempted: true, clicked: true, ok: true, status: 'registered', externalListingId: '427011919' },
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    const outcome = await coupangWingAdapter.send({ items: [executionItem(FROZEN)], values: {} });

    expect(renderRegistrationDetailImage).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, detailPageRevisionId: REVISION_ID });
    expect(salesProductApi.get).not.toHaveBeenCalled();
    const [extensionId, portName, message] = vi.mocked(sendToExtensionViaPort).mock.calls[0]!;
    expect([extensionId, portName]).toEqual(['ext-1', 'kiditem-wing-form-v1']);
    expect(message).toMatchObject({
      action: 'registerToWingForm',
      submit: true,
      executionContext: CONTEXT,
      expectedVendorId: 'A00012345',
      product: {
        categoryCell: KEYRING,
        productName: '선인장 딸깍 키링 1p  휴대용',
        detailImageUrls: ['https://cdn.example.com/detail-780.jpg'],
      },
    });
    expect((message as { product: { variants: Array<{ vendorItemCode: string }> } }).product.variants[0]?.vendorItemCode).toBe('KID-1-01');
    expect(outcome).toMatchObject({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: '427011919',
      confirmed: false,
      providerEvidence: { providerAccountId: 'A00012345', externalListingId: '427011919' },
    });
  });

  it('keeps an unconfirmed submit unknown — submitted, not accepted, no provider evidence', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: true,
      submission: { attempted: true, clicked: true, ok: false, status: 'unknown', error: '완료 안내를 확인하지 못했습니다.' },
      evidence: { wingVendorId: 'A00012345' },
    });

    const outcome = await coupangWingAdapter.send({ items: [executionItem(FROZEN)], values: {} });

    expect(outcome).toMatchObject({ submitted: true, accepted: null, error: '완료 안내를 확인하지 못했습니다.' });
    expect(outcome.providerEvidence).toBeUndefined();
  });

  it('reports a fill failure as not submitted', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({ ok: false, error: '옵션 행을 만들지 못했습니다.' });

    const outcome = await coupangWingAdapter.send({ items: [executionItem(FROZEN)], values: {} });

    expect(outcome).toMatchObject({ ok: false, submitted: false, error: '옵션 행을 만들지 못했습니다.' });
  });

  it('does not open WING when the account already lists the same Sellpia code — the operator confirms that listing', async () => {
    const outcome = await coupangWingAdapter.send({
      items: [executionItem({ ...FROZEN, existingChannelListing: { externalListingId: '900001', displayName: '기존', status: null } })],
      values: {},
    });

    expect(sendToExtensionViaPort).not.toHaveBeenCalled();
    expect(outcome.submitted).toBeUndefined();
    expect(outcome.error).toContain('900001');
  });

  it('reports not submitted, without opening WING, when the detail image cannot be rendered', async () => {
    vi.mocked(renderRegistrationDetailImage).mockResolvedValue({ status: 'missing', reason: 'empty_html', message: '상세 HTML 이 비어 있습니다.' });

    const outcome = await coupangWingAdapter.send({ items: [executionItem(FROZEN)], values: {} });

    expect(sendToExtensionViaPort).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, submitted: false });
    expect(outcome.error).toContain('상세 HTML 이 비어 있습니다.');
  });

  it('without an execution, only fills the form: no submit, no context, the chosen account’s seller id', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({ ok: true, submission: { attempted: false } });
    const item: MallPublishItem = {
      candidateId: 'record-1', source: 'candidate', salesProductId: PRODUCT_ID, name: '선인장 딸깍 키링', salePrice: 3000, thumbnailUrl: null,
    };

    const outcome = await coupangWingAdapter.send({
      items: [item],
      values: { wingCategoryKey: '64687', productName: '고친 이름', sellerProductName: '관리명', colorValue: '단일', quantityValue: '1', stock: '10' },
      channelAccount: { id: 'account-1', vendorId: 'A00012345' },
    });

    expect(salesProductApi.get).toHaveBeenCalledWith(PRODUCT_ID);
    expect(renderRegistrationDetailImage).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, detailPageRevisionId: null });
    const message = vi.mocked(sendToExtensionViaPort).mock.calls[0]![2] as Record<string, unknown>;
    expect(message).toMatchObject({ submit: false, expectedVendorId: 'A00012345', product: { productName: '고친 이름', categoryCell: KEYRING } });
    expect(message).not.toHaveProperty('executionContext');
    expect(outcome).toMatchObject({ ok: true, submitted: false, confirmed: false });
    expect(outcome.manualSteps.join(' ')).not.toContain('직접 등록하세요');
  });

  it('blocks a registration execution without a detail page or a WING category before any provider IO', () => {
    expect(coupangWingAdapter.validate(executionItem(FROZEN, null), {})).toContain(
      '상세페이지가 없습니다. 저장한 상세페이지가 있는 상품만 쿠팡 WING 에 올립니다.',
    );
    expect(coupangWingAdapter.validate(executionItem({ ...FROZEN, wingProduct: { productName: 'x' } }), {}).join(' '))
      .toContain('WING 카테고리');
    expect(coupangWingAdapter.validate(executionItem(FROZEN), {})).toEqual([]);
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
