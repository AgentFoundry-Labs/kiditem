import { describe, expect, it } from 'vitest';
import {
  buildWingDisplayName,
  candidateToWingProduct,
  requireRenderedDetailImage,
  stripLeadingPriceCode,
  WING_DISPLAY_NAME_MAX,
  WING_FORM_FILL_TIMEOUT_MS,
} from './wing-registration-flow';
import type { ProductBasics, ProductDetailResponse } from './sourcing-api';

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
