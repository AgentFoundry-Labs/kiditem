import { describe, expect, it } from 'vitest';
import {
  candidateToWingProduct,
  requireRenderedDetailImage,
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

  it('저장된 썸네일이 없으면 워크스페이스에 보이는 상품 이미지로 추가이미지를 채운다', () => {
    // 저장을 누르지 않았거나 preparation 이 없어 저장 경로가 막힌 후보는
    // thumbnailPreviewUrls / registrationImages.thumbnail 이 모두 비어 0/9 가 됐다.
    // 사용자는 썸네일 탭에 뜬 이미지가 그대로 들어갈 것을 기대한다.
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

    // 대표이미지는 제외하고 나머지가 추가이미지가 된다.
    expect(product.additionalImageUrls).toEqual([
      'http://localhost:9000/img/b.png',
      'http://localhost:9000/img/c.png',
    ]);
  });

  it('저장된 썸네일이 있으면 그쪽이 우선이고 화면 이미지로 덮이지 않는다', () => {
    const product = candidateToWingProduct(
      detail(basics({
        selectedThumbnailUrl: 'http://localhost:9000/img/a.png',
        thumbnailUrls: [
          'http://localhost:9000/img/a.png',
          'http://localhost:9000/img/ignored.png',
        ],
        thumbnailPreviewUrls: ['http://localhost:9000/saved/picked.png'],
        registrationImages: { primary: [], thumbnail: [], detail: [] },
      })),
      undefined,
      '[64687] 생활용품>생활소품>열쇠고리/키홀더',
    );

    expect(product.additionalImageUrls).toEqual(['http://localhost:9000/saved/picked.png']);
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
