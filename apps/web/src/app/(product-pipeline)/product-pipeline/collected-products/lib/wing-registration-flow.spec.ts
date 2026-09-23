import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  detectWingFormExtensionId,
  sendToExtensionViaPort,
} from '@/lib/extension-bridge';
import { salesProductApi } from '@/lib/sales-product-api';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
import { buildGenerationHistoryHtml } from '../../_shared/lib/generated-detail-html';
import {
  applyWingRegistrationOverrides,
  buildWingDisplayName,
  buildWingRegistrationOverrides,
  candidateToWingProduct,
  isConfirmedWingRegistration,
  prepareWingRegistration,
  requireRenderedDetailImage,
  resolveWingCategoryKey,
  resolveWingCategoryKeyForRegistration,
  resolveWingCategorySelections,
  stripLeadingPriceCode,
  submitWingRegistration,
  validateWingRegistrationOverrides,
  waitForRegisteredListing,
  WING_DISPLAY_NAME_MAX,
  WING_FORM_FILL_TIMEOUT_MS,
} from './wing-registration-flow';
import { productsApi } from './sourcing-api';
import { registrationExecutionApi } from '../../../../(channels)/_shared/registration-execution-api';
import {
  renderCandidateDetailImageOnServer,
} from './detail-page-image-api';
import type { ProductBasics, ProductDetailResponse } from './sourcing-api';
import type { WingProduct } from './wing-registration-excel';
import { resolveWingCategories } from './wing-category-resolution';

const { getSalesProductMock, replaceSalesProductOptionsMock } = vi.hoisted(() => ({
  getSalesProductMock: vi.fn(),
  replaceSalesProductOptionsMock: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  KIDITEM_WING_FORM_PORT_NAME: 'kiditem-wing-form-v1',
  detectWingFormExtensionId: vi.fn().mockResolvedValue('extension-1'),
  isChromeExtensionRuntimeAvailable: vi.fn(() => true),
  sendToExtensionViaPort: vi.fn(),
}));

vi.mock('./detail-page-image-api', () => ({
  renderCandidateDetailImageOnServer: vi.fn(),
}));

vi.mock('@/lib/sales-product-api', () => ({
  salesProductApi: {
    get: (...args: unknown[]) => getSalesProductMock(...args),
    replaceOptions: (...args: unknown[]) => replaceSalesProductOptionsMock(...args),
  },
}));

vi.mock('../../_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: {
    get: vi.fn(),
    getForSalesProduct: vi.fn(),
  },
}));

vi.mock('../../_shared/lib/generated-detail-html', () => ({
  buildGenerationHistoryHtml: vi.fn(),
}));

vi.mock('./sourcing-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sourcing-api')>();
  return {
    ...actual,
    productsApi: {
      ...actual.productsApi,
      getDetail: vi.fn(),
    },
  };
});

// HTTP 경계만 대역으로 세운다. 울타리 호출은 이제 Channels 클라이언트 하나를 지난다(ADR-0014).
vi.mock('../../../../(channels)/_shared/registration-execution-api', () => ({
  registrationExecutionApi: {
    previewSellpiaMatch: vi.fn().mockResolvedValue({
      status: 'matched',
      reason: 'one match',
      sellpiaMatch: {
        masterProductId: '44444444-4444-4444-8444-444444444444',
        code: '10451-1', name: '3500꿀사과슬랑이', optionName: null,
        currentStock: 13, quantity: 1,
      },
      proposals: [],
    }),
    prepare: vi.fn().mockResolvedValue({
      executionId: '33333333-3333-4333-8333-333333333333', expectedVendorId: 'A00012345',
      sellpiaMatch: {
        masterProductId: '44444444-4444-4444-8444-444444444444',
        code: '10451-1', name: '3500꿀사과슬랑이', optionName: null,
        currentStock: 13, quantity: 1,
      },
      existingListing: null,
    }),
    start: vi.fn().mockResolvedValue({ status: 'executing' }),
    markUnresolved: vi.fn().mockResolvedValue({ status: 'reconciling' }),
    markNotSubmitted: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    confirm: vi.fn(),
  },
}));

vi.mock('./wing-category-resolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wing-category-resolution')>();
  return {
    ...actual,
    resolveWingCategories: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(sendToExtensionViaPort).mockReset();
  vi.mocked(registrationExecutionApi.previewSellpiaMatch).mockClear();
  vi.mocked(registrationExecutionApi.prepare).mockClear();
  vi.mocked(registrationExecutionApi.start).mockClear();
  vi.mocked(registrationExecutionApi.markUnresolved).mockClear();
  vi.mocked(detectWingFormExtensionId).mockResolvedValue('extension-1');
  vi.mocked(productsApi.getDetail).mockReset();
  getSalesProductMock.mockReset();
  replaceSalesProductOptionsMock.mockReset();
  getSalesProductMock.mockImplementation(async (salesProductId: string) => ({
    id: salesProductId,
    sourceRecordId: 'candidate-1',
    status: 'active',
    version: 1,
    optionAxes: [],
    options: [{
      id: 'sales-option-1', optionCode: null, values: [], alias: null, barcode: null,
      salePrice: 2200, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
      components: [],
    }],
  }));
  vi.mocked(renderCandidateDetailImageOnServer).mockReset();
  vi.mocked(contentWorkspacesApi.getForSalesProduct).mockReset();
  vi.mocked(buildGenerationHistoryHtml).mockReset();
  vi.mocked(resolveWingCategories).mockResolvedValue(new Map());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SOURCE_IMAGE = 'https://cbu01.alicdn.com/img/original-source.jpg';

const PREPARED_WING_RESPONSE = {
  executionId: '33333333-3333-4333-8333-333333333333',
  expectedVendorId: 'A00012345',
  sellpiaMatch: {
    masterProductId: '44444444-4444-4444-8444-444444444444',
    code: '10451-1',
    name: '3500꿀사과슬랑이',
    optionName: null,
    currentStock: 13,
    quantity: 1,
  },
  existingListing: null,
};

const basics = (overrides: Partial<ProductBasics> = {}): ProductBasics => ({
  name: '딸깍이 키링',
  category: '완구',
  description: '',
  target: '',
  ageGroup: '',
  tags: [],
  keywords: [],
  optionNames: [],
  kcCertificationStatus: '',
  kcCertificationNumber: '',
  kcCertificationImageUrl: '',
  productSize: '',
  colorVariantStatus: '',
  colorVariantNames: '',
  boxSetStatus: '',
  boxSetQuantity: '',
  originalPrice: 0,
  salePrice: 2200,
  discountRate: 0,
  rocketBundleQuantity: 0,
  rocketUnitCost: 0,
  thumbnailUrls: [SOURCE_IMAGE],
  registrationImages: { primary: [], thumbnail: [], detail: [] },
  selectedThumbnailUrl: null,
  selectedThumbnailGenerationId: null,
  selectedThumbnailGenerationCandidateId: null,
  selectedDetailPageGenerationId: null,
  selectedDetailPageArtifactId: null,
  selectedDetailPageRevisionId: null,
  ...overrides,
});

describe('direct WING form handoff', () => {
  it('allows enough time for sequential image uploads before timing out the extension reply', () => {
    expect(WING_FORM_FILL_TIMEOUT_MS).toBe(180_000);
  });

  it('requires the saved detail page before opening the WING form', () => {
    expect(
      requireRenderedDetailImage({
        status: 'ready',
        imageUrl: 'http://localhost:9000/kiditem/detail.jpg',
        outputWidth: 780,
        contentType: 'image/jpeg',
        byteLength: 1_506_469,
        revisionId: '55555555-5555-4555-8555-555555555555',
        artifactId: '88888888-8888-4888-8888-888888888888',
      }),
    ).toBe('http://localhost:9000/kiditem/detail.jpg');

    expect(() =>
      requireRenderedDetailImage({
        status: 'missing',
        reason: 'no_saved_detail_page',
        message: '저장된 상세페이지가 없습니다.',
      }),
    ).toThrow(/저장한 상세페이지가 준비된 상품만/);
  });
});

describe('direct WING account selection', () => {
  const renderedDetail = {
    status: 'ready' as const,
    imageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
    outputWidth: 780,
    contentType: 'image/jpeg',
    byteLength: 100,
    revisionId: '55555555-5555-4555-8555-555555555555',
    artifactId: '88888888-8888-4888-8888-888888888888',
  };

  it('uses the account already bound to the product preparation regardless of list order', async () => {
    const prepared = detail(basics());
    prepared.registrationTarget = {
      id: '44444444-4444-4444-8444-444444444444',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      registrationInput: {},
    } as ProductDetailResponse['registrationTarget'];
    vi.mocked(productsApi.getDetail).mockResolvedValue(prepared);
    vi.mocked(renderCandidateDetailImageOnServer).mockResolvedValue(renderedDetail);
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
      { id: '22222222-2222-4222-8222-222222222222', channel: 'coupang', name: 'Wing B' },
      { id: '11111111-1111-4111-8111-111111111111', channel: 'coupang', name: 'Wing A' },
    ]);

    const result = await prepareWingRegistration('sales-product-1');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready result');
    const draft = result.draft;

    expect(productsApi.getDetail).toHaveBeenCalledWith('sales-product-1');
    expect(draft.channelAccountId).toBe('11111111-1111-4111-8111-111111111111');
    expect(draft.salesProductId).toBe('sales-product-1');
  });

  it('requires an explicit choice when an unprepared product has multiple Coupang accounts', async () => {
    vi.mocked(productsApi.getDetail).mockResolvedValue(detail(basics()));
    vi.mocked(renderCandidateDetailImageOnServer).mockResolvedValue(renderedDetail);
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111', channel: 'coupang', name: 'Wing A' },
      { id: '22222222-2222-4222-8222-222222222222', channel: 'coupang', name: 'Wing B' },
    ]);

    const result = await prepareWingRegistration('sales-product-1');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready result');
    const draft = result.draft;

    expect(draft.channelAccountId).toBe('');
    expect(draft.channelAccounts.map((account) => account.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('automatically saves the latest generated detail page before retrying WING rendering', async () => {
    const product = detail(basics());
    const contentWorkspaceId = '44444444-4444-4444-8444-444444444444';
    vi.mocked(productsApi.getDetail).mockResolvedValue(product);
    vi.mocked(renderCandidateDetailImageOnServer)
      .mockResolvedValueOnce({
        status: 'missing',
        reason: 'no_saved_detail_page',
        message: '저장된 상세페이지가 없습니다.',
      })
      .mockResolvedValueOnce(renderedDetail);
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue({
      id: contentWorkspaceId,
      ownerType: 'sourcing_candidate',
      salesProductId: product.id,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: product.name,
      normalizedTitle: product.name,
      status: 'active',
      href: '',
      generationCount: 1,
      latestGenerationId: '55555555-5555-4555-8555-555555555555',
      latestStatus: 'READY',
      currentDetailPageArtifactId: '66666666-6666-4666-8666-666666666666',
      currentDetailPageRevisionId: null,
      currentDetailPageGenerationId: '55555555-5555-4555-8555-555555555555',
      currentThumbnailSelection: null,
      createdAt: '2026-07-25T03:13:40.804Z',
      updatedAt: '2026-07-25T03:17:38.618Z',
      history: [{
        id: '55555555-5555-4555-8555-555555555555',
        contentType: 'detail_page',
        status: 'READY',
        generatedTitle: product.name,
        templateId: 'kids-playful',
        generationInput: {},
        detailPageData: { hook: { headline: product.name } },
        imageUrls: [],
        processedImages: {},
        detailPageArtifactId: '66666666-6666-4666-8666-666666666666',
        href: '',
        createdAt: '2026-07-25T03:13:40.804Z',
        updatedAt: '2026-07-25T03:17:38.618Z',
      }],
    });
    vi.mocked(buildGenerationHistoryHtml).mockReturnValue(
      '<!DOCTYPE html><html><body><section>saved detail</section></body></html>',
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('/* template css */'),
    }));
    const saveRequest = vi.spyOn(apiClient, 'post').mockResolvedValue({
      html: '<!DOCTYPE html><html><body><section>saved detail</section></body></html>',
      savedAt: '2026-07-25T03:30:00.000Z',
      assetUrlMap: {},
    });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111', channel: 'coupang', name: 'Wing A' },
    ]);

    const result = await prepareWingRegistration(product.id);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready result');
    const draft = result.draft;

    expect(saveRequest).toHaveBeenCalledWith(
      '/api/ai/detail-page/55555555-5555-4555-8555-555555555555/edited-html',
      { html: '<!DOCTYPE html><html><body><section>saved detail</section></body></html>' },
    );
    expect(renderCandidateDetailImageOnServer).toHaveBeenCalledTimes(2);
    expect(draft.detailImageUrl).toBe(renderedDetail.imageUrl);
  });

  it('surfaces a server renderer failure without loading channel accounts or opening Wing', async () => {
    vi.mocked(productsApi.getDetail).mockResolvedValue(detail(basics()));
    vi.mocked(renderCandidateDetailImageOnServer).mockRejectedValue(
      new Error('상세페이지 서버 렌더링에 실패했습니다.'),
    );
    const get = vi.spyOn(apiClient, 'get');

    await expect(prepareWingRegistration('sales-product-1')).rejects.toThrow(
      '상세페이지 서버 렌더링에 실패했습니다.',
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('uses the server-rendered artifact and builds exactly one detail image', async () => {
    vi.mocked(productsApi.getDetail).mockResolvedValue(detail(basics()));
    vi.mocked(renderCandidateDetailImageOnServer).mockResolvedValue({
      ...renderedDetail,
      imageUrl: 'https://cdn.example.com/detail.jpg',
    });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111', channel: 'coupang', name: 'Wing A' },
    ]);
    const onRenderProgress = vi.fn();

    const result = await prepareWingRegistration('candidate-1', undefined, {
      onRenderProgress,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready result');
    expect(result.draft.product.detailImageUrls).toEqual([
      'https://cdn.example.com/detail.jpg',
    ]);
    expect(onRenderProgress).toHaveBeenNthCalledWith(1, 'rendering');
    expect(onRenderProgress).toHaveBeenNthCalledWith(2, 'finalizing');
    expect(sendToExtensionViaPort).not.toHaveBeenCalled();
  });

  it('확장이 응답하지 않으면 후보 데이터를 읽기 전에 멈춘다', async () => {
    // 문구는 "없다"가 아니라 "응답하지 않는다"여야 한다. MV3 서비스워커는 잠들고,
    // 없는 확장과 잠든 확장을 같은 말로 뭉개면 사람은 멀쩡한 확장을 계속 리로드한다.
    vi.mocked(detectWingFormExtensionId).mockResolvedValue(null);

    await expect(prepareWingRegistration('sales-product-1')).rejects.toThrow(
      /응답하지 않습니다[\s\S]*잠깐 뒤 한 번 더/,
    );
    expect(productsApi.getDetail).not.toHaveBeenCalled();
  });
});

const detail = (basicInfo: ProductBasics): ProductDetailResponse => ({
  id: 'sales-product-1',
  name: '딸깍이 키링',
  status: 'sourced',
  sourceRecordId: 'candidate-1',
  sourcePlatform: 'ALIBABA_1688',
  source_platform: 'ALIBABA_1688',
  source_url: null,
  thumbnailUrl: SOURCE_IMAGE,
  thumbnail_url: SOURCE_IMAGE,
  price_krw: 2200,
  cost_cny: null,
  image_count: 1,
  is_processed: false,
  raw_data: null,
  processed_data: null,
  image_urls: [SOURCE_IMAGE],
  images: [{ url: SOURCE_IMAGE }],
  basicInfo,
  registrationTarget: null,
  salesProductId: 'sales-product-1',
  registrationImages: { primary: [], thumbnail: [], detail: [] },
  currentThumbnail: null,
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: '2026-07-19T00:00:00.000Z',
} as ProductDetailResponse);

describe('candidateToWingProduct — content_assets.role image mapping', () => {
  it('maps role assets onto representative / additional / detail slots', () => {
    const product = candidateToWingProduct(
      detail(basics({
        selectedThumbnailUrl: 'http://localhost:9000/thumb/selected.png',
        registrationImages: {
          primary: ['http://localhost:9000/assets/primary.png'],
          thumbnail: [
            'http://localhost:9000/assets/thumb-1.png',
            'http://localhost:9000/assets/thumb-2.png',
          ],
          detail: ['http://localhost:9000/assets/detail-1.png'],
        },
      })),
      undefined,
      '[77390] 완구/취미>스포츠/야외완구>물총',
      'http://localhost:9000/rendered/detail-780.jpg',
    );

    expect(product.variants[0].representativeImageUrl).toBe(
      'http://localhost:9000/assets/primary.png',
    );
    expect(product.additionalImageUrls).toEqual([
      'http://localhost:9000/assets/thumb-1.png',
      'http://localhost:9000/assets/thumb-2.png',
    ]);
    // 상세설명 = 렌더된 긴 이미지 1장. role=detail 섹션 이미지는 쓰지 않는다.
    expect(product.detailImageUrls).toEqual(['http://localhost:9000/rendered/detail-780.jpg']);
  });

  it('저장된 썸네일이 없으면 상품 이미지로 채우지 않고 비워 둔다', () => {
    // 추가이미지 = 저장된 **썸네일 구성**에서 대표 1장을 뺀 나머지다.
    // 상품 이미지(thumbnailUrls) 전체를 밀어 넣는 폴백은 사용자가 거부한 동작이다.
    // 비어 있으면 저장이 안 된 것이고, 고칠 곳은 저장 경로지 이 읽기 로직이 아니다.
    const product = candidateToWingProduct(
      detail(basics({
        selectedThumbnailUrl: 'http://localhost:9000/img/a.png',
        thumbnailUrls: [
          'http://localhost:9000/img/a.png',
          'http://localhost:9000/img/b.png',
          'http://localhost:9000/img/c.png',
        ],
        thumbnailPreviewUrls: [],
        registrationImages: { primary: [], thumbnail: [], detail: [] },
      })),
      undefined,
      '[64687] 생활용품>생활소품>열쇠고리/키홀더',
    );

    expect(product.additionalImageUrls).toEqual([]);
  });

  it('저장된 썸네일에서 대표 1장을 뺀 나머지가 추가이미지가 된다', () => {
    const product = candidateToWingProduct(
      detail(basics({
        selectedThumbnailUrl: 'http://localhost:9000/saved/rep.png',
        // 상품 이미지는 추가이미지 소스가 아니다 — 섞여 들어오면 안 된다.
        thumbnailUrls: [
          'http://localhost:9000/img/a.png',
          'http://localhost:9000/img/ignored.png',
        ],
        thumbnailPreviewUrls: [
          'http://localhost:9000/saved/rep.png',
          'http://localhost:9000/saved/picked-1.png',
          'http://localhost:9000/saved/picked-2.png',
        ],
        registrationImages: { primary: [], thumbnail: [], detail: [] },
      })),
      undefined,
      '[64687] 생활용품>생활소품>열쇠고리/키홀더',
    );

    expect(product.additionalImageUrls).toEqual([
      'http://localhost:9000/saved/picked-1.png',
      'http://localhost:9000/saved/picked-2.png',
    ]);
  });

  it('never uses role=detail section images as the Coupang detail description', () => {
    const product = candidateToWingProduct(
      detail(basics({
        registrationImages: {
          primary: ['http://localhost:9000/assets/primary.png'],
          thumbnail: [],
          detail: [
            'http://localhost:9000/assets/detail-1.png',
            'http://localhost:9000/assets/detail-2.png',
          ],
        },
      })),
    );

    expect(product.detailImageUrls).toEqual([]);
  });

  it('never lets the scrape original outrank a role=primary asset', () => {
    const product = candidateToWingProduct(
      detail(basics({
        registrationImages: {
          primary: ['http://localhost:9000/assets/primary.png'],
          thumbnail: [],
          detail: [],
        },
      })),
    );

    expect(product.variants[0].representativeImageUrl).not.toBe(SOURCE_IMAGE);
    expect(product.variants[0].representativeImageUrl).toBe(
      'http://localhost:9000/assets/primary.png',
    );
  });

  // 준비(RegistrationTarget)가 없는 후보는 `thumbnailPreviewUrls` 가 늘 비어 있다.
  // 그래서 워크스페이스 썸네일 갤러리(ContentAsset role='thumbnail')가 추가이미지의
  // 유일한 소스다 — 이게 비면 추가이미지가 0/9 로 남는다.
  it('fills additional images from the workspace gallery when no preparation exists', () => {
    const product = candidateToWingProduct(
      detail(basics({
        thumbnailPreviewUrls: undefined,
        registrationImages: {
          primary: ['http://localhost:9000/assets/primary.png'],
          thumbnail: [
            'http://localhost:9000/gallery/1.png',
            'http://localhost:9000/gallery/2.png',
          ],
          detail: [],
        },
      })),
    );

    expect(product.additionalImageUrls).toEqual([
      'http://localhost:9000/gallery/1.png',
      'http://localhost:9000/gallery/2.png',
    ]);
  });

  it('caps additional images at the Coupang limit of 9', () => {
    const thumbnails = Array.from({ length: 12 }, (_, i) => `http://localhost:9000/t/${i}.png`);
    const product = candidateToWingProduct(
      detail(basics({
        registrationImages: {
          primary: ['http://localhost:9000/assets/primary.png'],
          thumbnail: thumbnails,
          detail: [],
        },
      })),
    );

    expect(product.additionalImageUrls).toHaveLength(9);
  });

  it('falls back to the collected images when no role asset exists', () => {
    const product = candidateToWingProduct(detail(basics()));

    expect(product.variants[0].representativeImageUrl).toBe(SOURCE_IMAGE);
    // 렌더된 상세 이미지가 없으면 상세설명은 비운다 — 원본 스크랩본을 상세페이지로 쓰지 않는다.
    expect(product.detailImageUrls).toEqual([]);
    expect(product.additionalImageUrls).toEqual([]);
  });

  it('tolerates a response that predates the registrationImages field', () => {
    const stale = basics();
    delete (stale as Partial<ProductBasics>).registrationImages;

    const product = candidateToWingProduct(detail(stale));

    expect(product.variants[0].representativeImageUrl).toBe(SOURCE_IMAGE);
  });
});

describe('WING 노출상품명 조립', () => {
  it('라이브 판매중 상품과 같은 형식으로 조립한다', () => {
    // 실측 기준: `선인장 딸깍 키링 1p  휴대용 열쇠고리 핸드토이 스트레스해소`
    expect(
      buildWingDisplayName('선인장 딸깍 키링', ['휴대용', '열쇠고리', '핸드토이', '스트레스해소']),
    ).toBe('선인장 딸깍 키링 1p  휴대용 열쇠고리 핸드토이 스트레스해소');
  });

  it('선행 가격 코드를 노출상품명에서 제거한다', () => {
    expect(buildWingDisplayName('4000과일바구니딸깍이키링', ['열쇠고리'])).toBe(
      '과일바구니딸깍이키링 1p  열쇠고리',
    );
    expect(stripLeadingPriceCode('3000선인장딸깍키링')).toBe('선인장딸깍키링');
  });

  it('선행 가격이 아닌 숫자는 건드리지 않는다', () => {
    expect(stripLeadingPriceCode('2단 필통')).toBe('2단 필통');
    expect(stripLeadingPriceCode('3000')).toBe('3000');
    expect(stripLeadingPriceCode('12345678키링')).toBe('12345678키링');
  });

  it('수량을 {n}p 토큰으로 넣는다', () => {
    expect(buildWingDisplayName('딸깍 키링', ['열쇠고리'], 3)).toBe('딸깍 키링 3p  열쇠고리');
    expect(buildWingDisplayName('딸깍 키링', ['열쇠고리'], 0)).toBe('딸깍 키링 1p  열쇠고리');
  });

  it('상품명에 이미 있는 키워드와 중복 키워드는 뺀다', () => {
    expect(
      buildWingDisplayName('선인장 딸깍 키링', ['딸깍', '휴대용', '휴 대 용', '열쇠고리']),
    ).toBe('선인장 딸깍 키링 1p  휴대용 열쇠고리');
  });

  it('키워드가 없으면 형식을 지어내지 않고 선행 가격만 뗀 원본을 쓴다', () => {
    expect(buildWingDisplayName('4000과일바구니딸깍이키링', [])).toBe('과일바구니딸깍이키링');
    expect(buildWingDisplayName('딸깍 키링', ['', '   '])).toBe('딸깍 키링');
  });

  it('100자를 넘기지 않고, 잘린 키워드 조각을 남기지 않는다', () => {
    const long = buildWingDisplayName('키링', ['가'.repeat(40), '나'.repeat(40), '다'.repeat(40)]);

    expect(long.length).toBeLessThanOrEqual(WING_DISPLAY_NAME_MAX);
    expect(long).toBe(`키링 1p  ${'가'.repeat(40)} ${'나'.repeat(40)}`);
  });

  it('상품명만으로 100자를 넘으면 잘라낸다', () => {
    const name = '가'.repeat(140);

    expect(buildWingDisplayName(name, ['열쇠고리'])).toHaveLength(WING_DISPLAY_NAME_MAX);
    expect(buildWingDisplayName(name, [])).toHaveLength(WING_DISPLAY_NAME_MAX);
  });

  it('수집상품 매핑은 노출상품명만 다듬고 등록상품명은 원본을 유지한다', () => {
    const product = candidateToWingProduct(
      detail(basics({ name: '4000선인장딸깍키링', keywords: ['휴대용', '열쇠고리'] })),
    );

    expect(product.productName).toBe('선인장딸깍키링 1p  휴대용 열쇠고리');
    // 등록상품명(판매자관리용)은 수집 원본(`detail.name`)을 다듬지 않고 그대로 쓴다.
    expect(product.sellerProductName).toBe('딸깍이 키링');
  });
});

/**
 * 등록 확인 모달 → 확장 payload.
 *
 * 모달만 띄우고 원본 값을 보내면 확인 절차가 장식이 된다. 고친 값이 실제로
 * `registerToWingForm` payload 에 실려야 한다.
 */
describe('쿠팡 등록 확인 모달 값 반영', () => {
  const product = (): WingProduct =>
    candidateToWingProduct(
      detail(basics({ name: '4000선인장딸깍키링', keywords: ['휴대용', '열쇠고리'] })),
      undefined,
      '[77390] 완구/취미>스포츠/야외완구>물총',
      'http://localhost:9000/rendered/detail-780.jpg',
    );

  it('저장된 카테고리 키를 수집상품 카테고리보다 우선한다', () => {
    const saved = detail(basics({ category: '물총' }));
    saved.registrationTarget = {
      registrationInput: { wingCategoryKey: '64687' },
    } as ProductDetailResponse['registrationTarget'];

    expect(resolveWingCategoryKey(saved)).toBe('64687');
  });

  it('저장 키가 없으면 수집상품 카테고리의 정확한 별칭만 사용한다', () => {
    expect(resolveWingCategoryKey(detail(basics({ category: '키링' })))).toBe('64687');
    expect(resolveWingCategoryKey(detail(basics({ category: '과일바구니 딸깍이' })))).toBe('');
  });

  it('저장 키와 정확한 별칭이 없으면 기존 쿠팡 등록상품 기반 추천을 자동 적용한다', async () => {
    vi.mocked(resolveWingCategories).mockResolvedValue(new Map([
      ['과일바구니 딸깍이', {
        categoryCell: '[64687] 생활용품>생활소품>열쇠고리/키홀더',
        suggestion: {
          categoryCell: '[64687] 생활용품>생활소품>열쇠고리/키홀더',
          code: 64687,
          path: '생활용품>생활소품>열쇠고리/키홀더',
          leaf: '열쇠고리/키홀더',
          score: 0.8,
          confidence: 'high',
          basedOn: ['기존 키링'],
          support: 3,
        },
      }],
    ]));

    await expect(
      resolveWingCategoryKeyForRegistration(
        detail(basics({ name: '과일바구니 딸깍이', category: '기타' })),
      ),
    ).resolves.toBe('64687');
  });

  it('저장 키와 정확한 별칭은 추천 API보다 우선한다', async () => {
    vi.mocked(resolveWingCategories).mockClear();
    await expect(
      resolveWingCategoryKeyForRegistration(detail(basics({ category: '키링' }))),
    ).resolves.toBe('64687');
    expect(resolveWingCategories).not.toHaveBeenCalled();
  });

  it('카테고리가 없을 때 물총 카테고리로 대체하지 않는다', () => {
    expect(candidateToWingProduct(detail(basics())).categoryCell).toBe('');
  });

  it('일괄등록에서 상품별 카테고리를 독립적으로 결정한다', async () => {
    vi.mocked(resolveWingCategories).mockClear();
    const saved = detail(basics({ name: '저장 키링', category: '물총' }));
    saved.registrationTarget = {
      registrationInput: { wingCategoryKey: '64687' },
    } as ProductDetailResponse['registrationTarget'];
    const aliased = detail(basics({ name: '원본 물총', category: '물총' }));

    await expect(resolveWingCategorySelections([saved, aliased])).resolves.toEqual([
      '64687',
      '77390',
    ]);
    expect(resolveWingCategories).not.toHaveBeenCalled();
  });

  it('일괄등록에서 미선택 상품이 있으면 일부 엑셀을 만들지 않는다', async () => {
    const unresolved = detail(basics({ name: '분류 안 된 상품', category: '기타' }));

    await expect(resolveWingCategorySelections([unresolved])).rejects.toThrow(
      /WING 카테고리가 선택되지 않은 상품이 1건.*분류 안 된 상품.*카테고리를 먼저 선택/,
    );
  });

  it('자동 조립된 값을 모달 기본값으로 꺼낸다', () => {
    const overrides = buildWingRegistrationOverrides(product());

    expect(overrides.categoryKey).toBe('77390');
    expect(overrides.productName).toBe('선인장딸깍키링 1p  휴대용 열쇠고리');
    expect(overrides.sellerProductName).toBe('딸깍이 키링');
    expect(overrides.colorValue).toBe('단일');
    expect(overrides.quantityValue).toBe('1');
    expect(overrides.unitWeightValue).toBe('');
    expect(overrides.salePrice).toBe(2200);
    expect(overrides.stock).toBe(999);
  });

  it('상품명에 카테고리 단어가 있어도 정확한 별칭 선택 없이는 미선택으로 둔다', () => {
    const unresolved = product();
    unresolved.categoryCell = '';
    unresolved.productName = '과일바구니 딸깍이 키링 3종';
    unresolved.sellerProductName = '키링 기획상품';

    expect(buildWingRegistrationOverrides(unresolved).categoryKey).toBe('');
  });

  it('사용자가 고친 값이 등록 payload 에 실린다', () => {
    const applied = applyWingRegistrationOverrides(product(), {
      categoryKey: '64687',
      productName: '  손으로 고친 노출상품명 2p  ',
      sellerProductName: '내부관리명-001',
      colorValue: '핑크',
      quantityValue: '2',
      unitWeightValue: '',
      salePrice: 3900,
      origPrice: 5900,
      stock: 30,
    });

    expect(applied.productName).toBe('손으로 고친 노출상품명 2p');
    expect(applied.sellerProductName).toBe('내부관리명-001');
    expect(applied.variants[0].purchaseOptions).toEqual([
      { type: '색상', value: '핑크' },
      { type: '수량', value: '2' },
    ]);
    expect(applied.variants[0].salePrice).toBe(3900);
    expect(applied.variants[0].origPrice).toBe(5900);
    expect(applied.variants[0].stock).toBe(30);
    expect(applied.categoryCell).toBe('[64687] 생활용품>생활소품>열쇠고리/키홀더');
    expect(applied.detailImageUrls).toEqual(['http://localhost:9000/rendered/detail-780.jpg']);
  });

  it('카테고리를 바꿔도 상품별 구매옵션과 고시정보는 보존한다', () => {
    const original = product();
    original.variants[0].purchaseOptions.push({ type: '개당 중량', value: '120g' });
    original.noticeCategory = '기타 재화';
    original.noticeValues = ['사용자가 고친 품명', '대한민국'];

    const applied = applyWingRegistrationOverrides(original, {
      ...buildWingRegistrationOverrides(original),
      categoryKey: '64687',
    });

    expect(applied.variants[0].purchaseOptions).toEqual([
      { type: '색상', value: '단일' },
      { type: '수량', value: '1' },
      { type: '개당 중량', value: '120g' },
    ]);
    expect(applied.noticeCategory).toBe('기타 재화');
    expect(applied.noticeValues).toEqual(['사용자가 고친 품명', '대한민국']);
  });

  it('슬라임 카테고리는 개당 중량을 필수로 받고 WING 구매옵션에 반영한다', () => {
    const original = product();
    const base = buildWingRegistrationOverrides(original);

    expect(validateWingRegistrationOverrides({
      ...base,
      categoryKey: '103112',
      unitWeightValue: '',
    })).toContain('개당 중량을 입력하세요.');

    const applied = applyWingRegistrationOverrides(original, {
      ...base,
      categoryKey: '103112',
      unitWeightValue: '120g',
    });

    expect(applied.variants[0].purchaseOptions).toEqual([
      { type: '색상', value: '단일' },
      { type: '수량', value: '1' },
      { type: '개당 중량', value: '120g' },
    ]);
  });

  it('정상가를 비우면 판매가를 할인율 기준가로 쓴다', () => {
    const applied = applyWingRegistrationOverrides(product(), {
      ...buildWingRegistrationOverrides(product()),
      salePrice: 3900,
      origPrice: 0,
    });

    expect(applied.variants[0].origPrice).toBe(3900);
  });

  it('빈 옵션값은 옵션 자체를 뺀다 (빈 문자열 옵션은 WING 에서 무효)', () => {
    const applied = applyWingRegistrationOverrides(product(), {
      ...buildWingRegistrationOverrides(product()),
      colorValue: '  ',
      quantityValue: '3',
      unitWeightValue: '',
    });

    expect(applied.variants[0].purchaseOptions).toEqual([{ type: '수량', value: '3' }]);
  });

  it('판매가·노출상품명·재고를 검증한다', () => {
    const base = buildWingRegistrationOverrides(product());

    expect(validateWingRegistrationOverrides(base)).toEqual([]);
    expect(validateWingRegistrationOverrides({ ...base, categoryKey: '' })).toContain(
      '카테고리를 선택하세요.',
    );
    expect(validateWingRegistrationOverrides({ ...base, salePrice: 0 })).toContain(
      '판매가는 0원보다 커야 합니다.',
    );
    expect(validateWingRegistrationOverrides({ ...base, salePrice: 3905 })).toContain(
      '판매가는 10원 단위여야 합니다.',
    );
    expect(validateWingRegistrationOverrides({ ...base, stock: -1 })).toContain(
      '재고수량은 0 이상의 정수여야 합니다.',
    );
    expect(validateWingRegistrationOverrides({ ...base, productName: '' })).toContain(
      '노출상품명을 입력하세요.',
    );
    expect(
      validateWingRegistrationOverrides({ ...base, productName: '가'.repeat(101) }).join(' '),
    ).toMatch(/노출상품명은 100자 이하/);
  });

  it('검증에 걸리는 값은 확장으로 나가지 않는다', async () => {
    const draft = {
      candidateId: 'candidate-1',
      salesProductId: 'sales-product-1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sellpiaMatchPreview: {
        status: 'matched' as const,
        reason: 'one match',
        sellpiaMatch: PREPARED_WING_RESPONSE.sellpiaMatch,
        proposals: [],
      },
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
      registrationInput: { salePrice: 2200, category: '키링' },
    };

    await expect(
      submitWingRegistration(draft, { ...draft.overrides, salePrice: 0 }),
    ).rejects.toThrow(/판매가는 0원보다 커야 합니다/);
    expect(sendToExtensionViaPort).not.toHaveBeenCalled();
  });

  it('확인한 값 그대로 확장에 전달한다', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValueOnce({ ok: true });
    const draft = {
      candidateId: 'candidate-1',
      salesProductId: 'sales-product-1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sellpiaMatchPreview: {
        status: 'matched' as const,
        reason: 'one match',
        sellpiaMatch: PREPARED_WING_RESPONSE.sellpiaMatch,
        proposals: [],
      },
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
      registrationInput: { salePrice: 2200, category: '키링' },
    };

    await submitWingRegistration(draft, {
      ...draft.overrides,
      productName: '확인한 노출상품명',
      salePrice: 4900,
      stock: 12,
    });

    const [extensionId, portName, message] = vi.mocked(sendToExtensionViaPort).mock.calls[0];
    expect(extensionId).toBe('ext-1');
    expect(portName).toBe('kiditem-wing-form-v1');
    expect(message).toMatchObject({ action: 'registerToWingForm' });
    const sent = (message as { product: WingProduct }).product;
    expect(sent.productName).toBe('확인한 노출상품명');
    expect(sent.variants[0].salePrice).toBe(4900);
    expect(sent.variants[0].stock).toBe(12);
    expect(registrationExecutionApi.prepare).toHaveBeenCalledWith(
      'sales-product-1',
      expect.objectContaining({
        masterProductId: '44444444-4444-4444-8444-444444444444',
        sellpiaQuantity: 1,
        registrationInput: expect.objectContaining({
          salePrice: 2200,
          category: '키링',
          wingCategoryKey: '77390',
        }),
      }),
    );
  });

  it('syncs the confirmed Wing price onto the existing sales-product draft before opening the fence', async () => {
    // 수집 시점부터 초안이 있다(ADR-0022) — 만들지 않고, 확인한 가격을 그 초안의
    // 판매 옵션에 실어 둔다. 새로 만드는 것이 아니라 이미 있는 초안을 고친다.
    vi.mocked(sendToExtensionViaPort).mockResolvedValueOnce({ ok: true });
    getSalesProductMock.mockResolvedValueOnce({
      id: 'sales-product-1',
      sourceRecordId: 'candidate-1',
      status: 'draft',
      version: 3,
      optionAxes: [],
      options: [{
        id: 'sales-option-1', optionCode: null, values: [], alias: null, barcode: null,
        salePrice: null, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
        components: [],
      }],
    });
    const draft = {
      candidateId: 'candidate-1',
      salesProductId: 'sales-product-1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sellpiaMatchPreview: {
        status: 'matched' as const,
        reason: 'one match',
        sellpiaMatch: PREPARED_WING_RESPONSE.sellpiaMatch,
        proposals: [],
      },
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
      registrationInput: { salePrice: 2200, category: '키링' },
    };

    await submitWingRegistration(draft, { ...draft.overrides, salePrice: 4900 });

    expect(getSalesProductMock).toHaveBeenCalledWith('sales-product-1');
    expect(replaceSalesProductOptionsMock).toHaveBeenCalledWith('sales-product-1', {
      expectedVersion: 3,
      optionAxes: [],
      options: [expect.objectContaining({ id: 'sales-option-1', salePrice: 4900 })],
    });
    expect(replaceSalesProductOptionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(registrationExecutionApi.prepare).mock.invocationCallOrder[0]!,
    );
  });

  it('leaves the draft alone when it already carries the confirmed price', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValueOnce({ ok: true });
    // beforeEach 기본값이 이미 2200원짜리 selling 옵션을 준다 — product() 기본 판매가와 같다.
    const draft = {
      candidateId: 'candidate-1',
      salesProductId: 'sales-product-1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sellpiaMatchPreview: {
        status: 'matched' as const,
        reason: 'one match',
        sellpiaMatch: PREPARED_WING_RESPONSE.sellpiaMatch,
        proposals: [],
      },
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
      registrationInput: { salePrice: 2200, category: '키링' },
    };

    await submitWingRegistration(draft, draft.overrides);

    expect(getSalesProductMock).toHaveBeenCalledWith('sales-product-1');
    expect(replaceSalesProductOptionsMock).not.toHaveBeenCalled();
  });
});

describe('external WING pre-intent choreography', () => {
  const registrationProduct = candidateToWingProduct(
    detail(basics()),
    undefined,
    '[77390] 완구/취미>스포츠/야외완구>물총',
  );
  const draft = {
    candidateId: 'candidate-1',
    salesProductId: 'sales-product-1',
    idempotencyKey: '33333333-3333-4333-8333-333333333333',
    extensionId: 'extension-1',
    channelAccountId: 'account-1',
    sellpiaMatchPreview: {
      status: 'matched' as const,
      reason: 'one match',
      sellpiaMatch: PREPARED_WING_RESPONSE.sellpiaMatch,
      proposals: [],
    },
    detailImageUrl: 'http://localhost:9000/detail.jpg',
    registrationInput: {},
    product: registrationProduct,
    overrides: buildWingRegistrationOverrides(registrationProduct),
  };

  it('sends the server-verified real Sellpia code as the WING vendor item code', async () => {
    vi.mocked(registrationExecutionApi.prepare).mockResolvedValue({
      executionId: '33333333-3333-4333-8333-333333333333',
      expectedVendorId: 'A00012345',
      sellpiaMatch: {
        masterProductId: '44444444-4444-4444-8444-444444444444',
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: null,
    } as never);
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: true,
      submission: { attempted: false },
    });

    await submitWingRegistration(draft, draft.overrides, false);

    const message = vi.mocked(sendToExtensionViaPort).mock.calls[0]?.[2] as {
      product: WingProduct;
    };
    expect(message.product.variants[0]?.vendorItemCode).toBe('10451-1');
  });

  it('폼 채움이 실패하면 자동 실행이 꺼진 경우 장부를 닫는다', async () => {
    // 자동 실행이 꺼진 경로에서는 확장이 '상품등록' 버튼을 누를 수 없다. 그러니
    // 채우다 멈춘 것은 마켓에 아무것도 안 올라갔다는 뜻이다. 닫지 않으면 그 상품은
    // "An active registration preparation already exists." 로 영영 막힌다.
    vi.mocked(registrationExecutionApi.prepare).mockResolvedValue({
      executionId: '55555555-5555-4555-8555-555555555555',
      expectedVendorId: 'A00012345',
      sellpiaMatch: {
        masterProductId: '44444444-4444-4444-8444-444444444444',
        code: '10451-1', name: '3500꿀사과슬랑이', optionName: null,
        currentStock: 13, quantity: 1,
      },
      existingListing: null,
    } as never);
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: false,
      error: '쿠팡 WING 옵션값을 옵션 목록으로 생성하지 못했습니다.',
    });

    await expect(submitWingRegistration(draft, draft.overrides, false)).rejects.toThrow(/옵션 목록/);

    expect(registrationExecutionApi.markNotSubmitted).toHaveBeenCalledWith(
      draft.salesProductId,
      '55555555-5555-4555-8555-555555555555',
      expect.objectContaining({ attempted: false }),
    );
    // 제출을 시도조차 못 했으므로 미해결로 남기지 않는다.
    expect(registrationExecutionApi.markUnresolved).not.toHaveBeenCalled();
  });

  it('returns an existing Coupang listing for canonical confirmation without opening the extension', async () => {
    vi.mocked(registrationExecutionApi.prepare).mockResolvedValue({
      executionId: '33333333-3333-4333-8333-333333333333',
      expectedVendorId: 'A00012345',
      sellpiaMatch: {
        masterProductId: '44444444-4444-4444-8444-444444444444',
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: {
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      },
    } as never);

    await expect(submitWingRegistration(draft, draft.overrides, false)).resolves.toMatchObject({
      submission: {
        attempted: true,
        ok: true,
        status: 'registered',
        externalListingId: '427011919',
        executionId: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(sendToExtensionViaPort).not.toHaveBeenCalled();
    expect(registrationExecutionApi.start).not.toHaveBeenCalled();
  });

  it('orders prepare, start, extension, then reconciles an unknown outcome with extension evidence', async () => {
    const order: string[] = [];
    vi.mocked(registrationExecutionApi.prepare).mockImplementation(async () => {
      order.push('prepare');
      return PREPARED_WING_RESPONSE as never;
    });
    vi.mocked(registrationExecutionApi.start).mockImplementation(async () => {
      order.push('start');
      return { status: 'executing' } as never;
    });
    vi.mocked(sendToExtensionViaPort).mockImplementation(async () => {
      order.push('extension');
      return {
        ok: true,
        submission: { attempted: true, status: 'unknown' },
        evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
      };
    });
    vi.mocked(registrationExecutionApi.markUnresolved).mockImplementation(async () => {
      order.push('unresolved');
      return {} as never;
    });

    const result = await submitWingRegistration(draft, draft.overrides, true);
    expect(order).toEqual(['prepare', 'start', 'extension', 'unresolved']);
    expect(result.submission.evidence).toEqual({
      wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id',
    });
  });

  it('keeps manual form fill in not-attempted state until the user actually submits in WING', async () => {
    const order: string[] = [];
    vi.mocked(registrationExecutionApi.prepare).mockImplementation(async () => {
      order.push('prepare');
      return PREPARED_WING_RESPONSE as never;
    });
    vi.mocked(registrationExecutionApi.start).mockImplementation(async () => {
      order.push('start');
      return { status: 'executing' } as never;
    });
    vi.mocked(sendToExtensionViaPort).mockImplementation(async () => {
      order.push('extension');
      return {
        ok: true,
        submission: { attempted: false },
        evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
      };
    });

    const result = await submitWingRegistration(draft, draft.overrides, false);

    expect(order).toEqual(['prepare', 'extension']);
    expect(result.submission).toMatchObject({
      attempted: false,
      executionId: '33333333-3333-4333-8333-333333333333',
    });
    expect(registrationExecutionApi.markUnresolved).not.toHaveBeenCalled();
  });

  it('accepts a registered product id for server verification even when browser evidence is absent', () => {
    expect(isConfirmedWingRegistration({
      attempted: true,
      ok: true,
      status: 'registered',
      externalListingId: '427011919',
    })).toBe(true);
  });

  it('marks the durable execution unresolved when the extension throws after start', async () => {
    vi.mocked(sendToExtensionViaPort).mockRejectedValue(new Error('extension disconnected'));
    await expect(submitWingRegistration(draft, draft.overrides, true)).rejects.toThrow('extension disconnected');
    expect(registrationExecutionApi.markUnresolved).toHaveBeenCalledWith(
      'sales-product-1',
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({ reason: 'extension_throw' }),
    );
  });

  it('reuses the modal draft idempotency key across a retry after prepare fails', async () => {
    vi.mocked(registrationExecutionApi.prepare)
      .mockRejectedValueOnce(new Error('prepare response lost'))
      .mockResolvedValueOnce(PREPARED_WING_RESPONSE as never);
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: true,
      submission: { attempted: false },
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });
    await expect(submitWingRegistration(draft, draft.overrides, true)).rejects.toThrow('prepare response lost');
    await submitWingRegistration(draft, draft.overrides, true);
    expect(registrationExecutionApi.prepare).toHaveBeenNthCalledWith(
      1, 'sales-product-1', expect.objectContaining({ idempotencyKey: draft.idempotencyKey }),
    );
    expect(registrationExecutionApi.prepare).toHaveBeenNthCalledWith(
      2, 'sales-product-1', expect.objectContaining({ idempotencyKey: draft.idempotencyKey }),
    );
  });

  it('rotates the modal idempotency key when the canonical payload changes', async () => {
    vi.mocked(sendToExtensionViaPort).mockResolvedValue({
      ok: true,
      submission: { attempted: false },
    });

    await submitWingRegistration(draft, draft.overrides, false);
    await submitWingRegistration(draft, {
      ...draft.overrides,
      productName: '사용자가 수정한 노출상품명',
    }, false);

    const firstKey = vi.mocked(registrationExecutionApi.prepare).mock.calls[0]?.[1].idempotencyKey;
    const secondKey = vi.mocked(registrationExecutionApi.prepare).mock.calls[1]?.[1].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});

describe('waitForRegisteredListing', () => {
  const noSleep = () => Promise.resolve();

  it('등록상품ID 가 목록 조회에 나타나면 true 를 돌려준다', async () => {
    const fetchListings = vi.fn().mockResolvedValue({ items: [{ externalId: '16311492950' }] });
    await expect(
      waitForRegisteredListing('16311492950', { fetchListings, sleep: noSleep }),
    ).resolves.toBe(true);
    expect(fetchListings).toHaveBeenCalledWith('16311492950');
  });

  it('처음엔 비어 있어도 나타날 때까지 폴링한다', async () => {
    const fetchListings = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [{ externalId: '16311492950' }] });
    await expect(
      waitForRegisteredListing('16311492950', { fetchListings, sleep: noSleep }),
    ).resolves.toBe(true);
    expect(fetchListings).toHaveBeenCalledTimes(3);
  });

  // 쿠팡 등록은 이미 끝났다. 목록에 못 떠도 예외를 던져 등록 실패처럼 보이게 하지 않는다.
  it('제한 시간 안에 못 찾으면 던지지 않고 false 를 돌려준다', async () => {
    const fetchListings = vi.fn().mockResolvedValue({ items: [] });
    await expect(
      waitForRegisteredListing('16311492950', {
        fetchListings,
        sleep: noSleep,
        intervalMs: 10,
        timeoutMs: 30,
      }),
    ).resolves.toBe(false);
    expect(fetchListings).toHaveBeenCalledTimes(3);
  });

  it('다른 등록상품ID 만 돌아오면 성공으로 치지 않는다', async () => {
    const fetchListings = vi.fn().mockResolvedValue({ items: [{ externalId: '16302076562' }] });
    await expect(
      waitForRegisteredListing('16311492950', {
        fetchListings,
        sleep: noSleep,
        intervalMs: 10,
        timeoutMs: 10,
      }),
    ).resolves.toBe(false);
  });

  it('조회가 실패해도 재시도한다', async () => {
    const fetchListings = vi
      .fn()
      .mockRejectedValueOnce(new Error('네트워크 오류'))
      .mockResolvedValue({ items: [{ externalId: '16311492950' }] });
    await expect(
      waitForRegisteredListing('16311492950', { fetchListings, sleep: noSleep }),
    ).resolves.toBe(true);
  });

  it('빈 등록상품ID 는 조회하지 않는다', async () => {
    const fetchListings = vi.fn();
    await expect(
      waitForRegisteredListing('  ', { fetchListings, sleep: noSleep }),
    ).resolves.toBe(false);
    expect(fetchListings).not.toHaveBeenCalled();
  });
});
