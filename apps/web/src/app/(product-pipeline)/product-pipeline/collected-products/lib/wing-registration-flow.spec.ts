import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToExtension } from '@/lib/extension-bridge';
import {
  applyWingRegistrationOverrides,
  buildWingDisplayName,
  buildWingRegistrationOverrides,
  candidateToWingProduct,
  requireRenderedDetailImage,
  stripLeadingPriceCode,
  submitWingRegistration,
  validateWingRegistrationOverrides,
  waitForRegisteredListing,
  WING_DISPLAY_NAME_MAX,
  WING_FORM_FILL_TIMEOUT_MS,
} from './wing-registration-flow';
import type { ProductBasics, ProductDetailResponse } from './sourcing-api';
import { candidatesApi } from './sourcing-api';
import type { WingProduct } from './wing-registration-excel';

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(() => true),
  sendToExtension: vi.fn(),
}));

vi.mock('./sourcing-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sourcing-api')>();
  return {
    ...actual,
    candidatesApi: {
      ...actual.candidatesApi,
      prepareExternalWingRegistration: vi.fn().mockResolvedValue({
        executionId: '33333333-3333-4333-8333-333333333333', expectedVendorId: 'A00012345',
      }),
      startExternalWingRegistration: vi.fn().mockResolvedValue({ status: 'executing' }),
      markExternalWingRegistrationUnresolved: vi.fn().mockResolvedValue({ status: 'reconciling' }),
    },
  };
});

beforeEach(() => {
  vi.mocked(sendToExtension).mockReset();
  vi.mocked(candidatesApi.prepareExternalWingRegistration).mockClear();
  vi.mocked(candidatesApi.startExternalWingRegistration).mockClear();
  vi.mocked(candidatesApi.markExternalWingRegistrationUnresolved).mockClear();
});

const SOURCE_IMAGE = 'https://cbu01.alicdn.com/img/original-source.jpg';

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
        status: 'rendered',
        imageUrl: 'http://localhost:9000/kiditem/detail.jpg',
        outputWidth: 780,
        contentType: 'image/jpeg',
        byteLength: 1_506_469,
        revisionId: 'revision-1',
        artifactId: 'artifact-1',
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

const detail = (basicInfo: ProductBasics): ProductDetailResponse => ({
  id: 'candidate-1',
  name: '딸깍이 키링',
  status: 'sourced',
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
  productPreparation: null,
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

  // 준비(ProductPreparation)가 없는 후보는 `thumbnailPreviewUrls` 가 늘 비어 있다.
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

  it('자동 조립된 값을 모달 기본값으로 꺼낸다', () => {
    const overrides = buildWingRegistrationOverrides(product());

    expect(overrides.productName).toBe('선인장딸깍키링 1p  휴대용 열쇠고리');
    expect(overrides.sellerProductName).toBe('딸깍이 키링');
    expect(overrides.colorValue).toBe('단일');
    expect(overrides.quantityValue).toBe('1');
    expect(overrides.salePrice).toBe(2200);
    expect(overrides.stock).toBe(999);
  });

  it('사용자가 고친 값이 등록 payload 에 실린다', () => {
    const applied = applyWingRegistrationOverrides(product(), {
      productName: '  손으로 고친 노출상품명 2p  ',
      sellerProductName: '내부관리명-001',
      colorValue: '핑크',
      quantityValue: '2',
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
    // 모달이 다루지 않는 값(카테고리·상세설명·추가이미지)은 그대로 유지된다.
    expect(applied.categoryCell).toBe('[77390] 완구/취미>스포츠/야외완구>물총');
    expect(applied.detailImageUrls).toEqual(['http://localhost:9000/rendered/detail-780.jpg']);
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
    });

    expect(applied.variants[0].purchaseOptions).toEqual([{ type: '수량', value: '3' }]);
  });

  it('판매가·노출상품명·재고를 검증한다', () => {
    const base = buildWingRegistrationOverrides(product());

    expect(validateWingRegistrationOverrides(base)).toEqual([]);
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
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
    };

    await expect(
      submitWingRegistration(draft, { ...draft.overrides, salePrice: 0 }),
    ).rejects.toThrow(/판매가는 0원보다 커야 합니다/);
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('확인한 값 그대로 확장에 전달한다', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({ ok: true });
    const draft = {
      candidateId: 'candidate-1',
      product: product(),
      overrides: buildWingRegistrationOverrides(product()),
      extensionId: 'ext-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      detailImageUrl: 'http://localhost:9000/rendered/detail-780.jpg',
    };

    await submitWingRegistration(draft, {
      ...draft.overrides,
      productName: '확인한 노출상품명',
      salePrice: 4900,
      stock: 12,
    });

    const [extensionId, message] = vi.mocked(sendToExtension).mock.calls[0];
    expect(extensionId).toBe('ext-1');
    expect(message).toMatchObject({ action: 'registerToWingForm' });
    const sent = (message as { product: WingProduct }).product;
    expect(sent.productName).toBe('확인한 노출상품명');
    expect(sent.variants[0].salePrice).toBe(4900);
    expect(sent.variants[0].stock).toBe(12);
  });
});

describe('external WING pre-intent choreography', () => {
  const draft = {
    candidateId: 'candidate-1',
    extensionId: 'extension-1',
    channelAccountId: 'account-1',
    detailImageUrl: 'http://localhost:9000/detail.jpg',
    product: candidateToWingProduct(detail(basics())),
    overrides: buildWingRegistrationOverrides(candidateToWingProduct(detail(basics()))),
  };

  it('orders prepare, start, extension, then reconciles an unknown outcome with extension evidence', async () => {
    const order: string[] = [];
    vi.mocked(candidatesApi.prepareExternalWingRegistration).mockImplementation(async () => {
      order.push('prepare');
      return { executionId: '33333333-3333-4333-8333-333333333333', expectedVendorId: 'A00012345' } as never;
    });
    vi.mocked(candidatesApi.startExternalWingRegistration).mockImplementation(async () => {
      order.push('start');
      return { status: 'executing' } as never;
    });
    vi.mocked(sendToExtension).mockImplementation(async () => {
      order.push('extension');
      return {
        ok: true,
        submission: { attempted: true, status: 'unknown' },
        evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
      };
    });
    vi.mocked(candidatesApi.markExternalWingRegistrationUnresolved).mockImplementation(async () => {
      order.push('unresolved');
      return {} as never;
    });

    const result = await submitWingRegistration(draft, draft.overrides, true);
    expect(order).toEqual(['prepare', 'start', 'extension', 'unresolved']);
    expect(result.submission.evidence).toEqual({
      wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id',
    });
  });

  it('marks the durable execution unresolved when the extension throws after start', async () => {
    vi.mocked(sendToExtension).mockRejectedValue(new Error('extension disconnected'));
    await expect(submitWingRegistration(draft, draft.overrides, true)).rejects.toThrow('extension disconnected');
    expect(candidatesApi.markExternalWingRegistrationUnresolved).toHaveBeenCalledWith(
      'candidate-1',
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({ reason: 'extension_throw' }),
    );
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
