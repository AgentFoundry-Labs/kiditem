import { describe, expect, it } from 'vitest';
import { buildProductBasics } from '../product-basics.presenter';

describe('buildProductBasics', () => {
  it('uses ProductPreparation registrationInput as the primary basic information source', () => {
    const result = buildProductBasics({
      candidate: {
        id: 'candidate-1',
        name: '수집 상품명',
        description: '수집 설명',
        category: '수집 카테고리',
        tags: ['수집태그'],
        rawData: { title: '원본명', optionNames: ['빨강', '파랑'] },
        thumbnailUrl: 'https://cdn.example.com/source.jpg',
        imageUrl: 'https://cdn.example.com/source.jpg',
        images: [
          { url: 'https://cdn.example.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
        ],
      },
      preparation: {
        registrationInput: {
          name: '상품 생성 입력명',
          category: '완구 > 보드게임',
          description: '상품 생성 설명',
          target: '초등학생',
          ageGroup: 'age-8-plus',
          tags: ['자석', '다트'],
          keywords: ['안전 다트'],
          optionNames: ['단품'],
          kcCertificationStatus: 'exists',
          kcCertificationNumber: 'CB061R1234-1001',
          productSize: '높이: 30cm',
          colorVariantStatus: 'multiple',
          colorVariantNames: '빨강, 파랑',
          boxSetStatus: 'box',
          boxSetQuantity: '1박스',
          salePrice: 12900,
          originalPrice: 15900,
          discountRate: 19,
          thumbnailUrls: [
            'https://cdn.example.com/selected-thumb.jpg',
            'https://cdn.example.com/preview-2.jpg',
          ],
        },
        selectedThumbnailUrl: 'https://cdn.example.com/selected-thumb.jpg',
        selectedThumbnailGenerationCandidateId: 'thumbnail-candidate-1',
        selectedDetailPageGenerationId: 'detail-generation-1',
        selectedDetailPageArtifactId: 'artifact-1',
        selectedDetailPageRevisionId: 'revision-1',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      name: '상품 생성 입력명',
      category: '완구 > 보드게임',
      description: '상품 생성 설명',
      target: '초등학생',
      ageGroup: 'age-8-plus',
      tags: ['자석', '다트'],
      keywords: ['안전 다트'],
      optionNames: ['단품'],
      kcCertificationStatus: 'exists',
      kcCertificationNumber: 'CB061R1234-1001',
      productSize: '높이: 30cm',
      colorVariantStatus: 'multiple',
      colorVariantNames: '빨강, 파랑',
      boxSetStatus: 'box',
      boxSetQuantity: '1박스',
      salePrice: 12900,
      originalPrice: 15900,
      discountRate: 19,
      thumbnailPreviewUrls: [
        'https://cdn.example.com/selected-thumb.jpg',
        'https://cdn.example.com/preview-2.jpg',
      ],
      selectedThumbnailUrl: 'https://cdn.example.com/selected-thumb.jpg',
      selectedThumbnailGenerationCandidateId: 'thumbnail-candidate-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
    }));
  });

  it('falls back to collected source data when preparation input is missing', () => {
    const result = buildProductBasics({
      candidate: {
        id: 'candidate-1',
        name: '수집 상품명',
        description: '수집 설명',
        category: '수집 카테고리',
        tags: ['태그1'],
        rawData: { optionNames: ['옵션A'] },
        thumbnailUrl: 'https://cdn.example.com/source.jpg',
        imageUrl: 'https://cdn.example.com/source.jpg',
        images: [
          { url: 'https://cdn.example.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
        ],
      },
      preparation: null,
    });

    expect(result.name).toBe('수집 상품명');
    expect(result.category).toBe('수집 카테고리');
    expect(result.tags).toEqual(['태그1']);
    expect(result.optionNames).toEqual(['옵션A']);
    expect(result.thumbnailUrls).toEqual(['https://cdn.example.com/source.jpg']);
    expect(result.thumbnailPreviewUrls).toEqual([]);
  });

  describe('salePrice 셀피아 폴백', () => {
    const candidate = {
      id: 'candidate-1',
      name: '4000과일바구니딸깍이키링',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
    };

    it('입력된 등록 판매가를 보존한다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: { salePrice: 12900 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
      });

      // 사용자가 고친 값을 폴백이 덮어쓰면 안 된다.
      expect(result.salePrice).toBe(12900);
      expect(result.salePriceSource).toBe('input');
    });

    it('등록 판매가가 없으면 자동 가격을 만들지 않는다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: { salePrice: 0 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
      });

      expect(result.salePrice).toBe(0);
      expect(result.salePriceSource).toBe('none');
    });

    it('둘 다 없으면 0원으로 남기고 추정하지 않는다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: null,
      });

      expect(result.salePrice).toBe(0);
      expect(result.salePriceSource).toBe('none');
    });
  });

  describe('rawData.manualBasics 수기 오버레이 (preparation 없는 후보 저장 경로)', () => {
    const candidate = {
      id: 'candidate-1',
      name: '4000과일바구니딸깍이키링',
      description: '수집 설명',
      category: '수집 카테고리',
      tags: ['수집태그'],
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
    };

    it('preparation 이 없으면 manualBasics 로 저장한 값을 되읽는다', () => {
      // 회귀: ProductPreparation 이 0행인 후보는 채널 계정 선택 없이 후보 자체에
      // 기본정보를 저장한다(PATCH /api/sourcing/candidates/:id/basic-info →
      // rawData.manualBasics). 프리젠터가 이 오버레이를 읽지 못하면 저장 후
      // 재진입 시 값이 사라진다.
      const result = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: {
            manualBasics: {
              keywords: ['과일바구니', '키링'],
              target: '초등학생',
              ageGroup: 'age-8-plus',
              kcCertificationStatus: 'exists',
              kcCertificationNumber: 'CB061R1234-1001',
              productSize: '높이: 5cm',
              colorVariantStatus: 'multiple',
              colorVariantNames: '핑크, 옐로',
              boxSetStatus: 'none',
              optionNames: ['단품'],
              salePrice: 4900,
              originalPrice: 5900,
              discountRate: 17,
              rocketBundleQuantity: 2,
              rocketUnitCost: 1500,
            },
          },
        },
        preparation: null,
      });

      expect(result.keywords).toEqual(['과일바구니', '키링']);
      expect(result.target).toBe('초등학생');
      expect(result.ageGroup).toBe('age-8-plus');
      expect(result.kcCertificationStatus).toBe('exists');
      expect(result.kcCertificationNumber).toBe('CB061R1234-1001');
      expect(result.productSize).toBe('높이: 5cm');
      expect(result.colorVariantStatus).toBe('multiple');
      expect(result.colorVariantNames).toBe('핑크, 옐로');
      expect(result.optionNames).toEqual(['단품']);
      expect(result.salePrice).toBe(4900);
      expect(result.salePriceSource).toBe('input');
      expect(result.originalPrice).toBe(5900);
      expect(result.discountRate).toBe(17);
      expect(result.rocketBundleQuantity).toBe(2);
      expect(result.rocketUnitCost).toBe(1500);
    });

    it('manualBasics 판매가는 셀피아 폴백보다 우선한다(수기 입력 취급)', () => {
      const result = buildProductBasics({
        candidate: { ...candidate, rawData: { manualBasics: { salePrice: 4900 } } },
        preparation: null,
      });

      expect(result.salePrice).toBe(4900);
      expect(result.salePriceSource).toBe('input');
    });

    it('preparation registrationInput 이 있으면 manualBasics 보다 우선한다', () => {
      const result = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: { manualBasics: { keywords: ['수기키워드'], salePrice: 4900 } },
        },
        preparation: {
          registrationInput: { keywords: ['등록키워드'], salePrice: 9900 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
      });

      expect(result.keywords).toEqual(['등록키워드']);
      expect(result.salePrice).toBe(9900);
    });

    it('사람이 적은 키워드가 없으면 상품 등록이 rawData.keywords 에 남긴 키워드를 쓴다', () => {
      const generated = buildProductBasics({
        candidate: {
          ...candidate,
          tags: ['단품'],
          rawData: { keywords: ['스핀', '장난감'] },
        },
        preparation: null,
      });
      expect(generated.keywords).toEqual(['스핀', '장난감']);

      const typed = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: { keywords: ['스핀'], manualBasics: { keywords: ['수기키워드'] } },
        },
        preparation: null,
      });
      expect(typed.keywords).toEqual(['수기키워드']);
    });
  });

  describe('몰별 등록 칸 값', () => {
    const candidate = {
      id: 'candidate-1',
      name: '할로윈 LED 거미줄',
      description: null,
      category: null,
      tags: [],
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
    };

    it('manualBasics 에 저장한 몰별 값을 되읽는다', () => {
      // 상품 상세에서 한 번 적어 두면 목록에서는 버튼만 누른다. 프리젠터가 이걸
      // 되읽지 못하면 매번 다시 치게 되고, 그러면 같은 상품인데 몰마다 다른 값이
      // 들어간다.
      const result = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: {
            manualBasics: {
              mallRegisterValues: {
                '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
                always: { teamPrice: '1800' },
              },
              mallRegisterShared: { certNumber: 'CB065R1579-2008' },
            },
          },
        },
        preparation: null,
      });

      expect(result.mallRegisterValues).toEqual({
        '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
        always: { teamPrice: '1800' },
      });
      expect(result.mallRegisterShared).toEqual({ certNumber: 'CB065R1579-2008' });
    });

    it('저장한 적 없으면 빈 객체다 — 없는 값을 지어내지 않는다', () => {
      const result = buildProductBasics({
        candidate: { ...candidate, rawData: {} },
        preparation: null,
      });
      expect(result.mallRegisterValues).toEqual({});
      expect(result.mallRegisterShared).toEqual({});
    });

    it('문자열이 아닌 값과 빈 몰은 버린다', () => {
      // rawData 는 무엇이든 들어올 수 있는 JSON 이다. 숫자를 그대로 내보내면
      // 프런트가 `.trim()` 에서 터진다.
      const result = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: {
            manualBasics: {
              mallRegisterValues: { '11st': { quantity: 3 }, onch: { supplyPrice: '2000' } },
              mallRegisterShared: { certNumber: ['x'] },
            },
          },
        },
        preparation: null,
      });
      expect(result.mallRegisterValues).toEqual({ onch: { supplyPrice: '2000' } });
      expect(result.mallRegisterShared).toEqual({});
    });

    it('⭐ 준비 registrationInput 에 사본이 있어도 후보 manualBasics 만 읽는다 — 송신 전 점검과 같은 문서', () => {
      const result = buildProductBasics({
        candidate: {
          ...candidate,
          rawData: {
            manualBasics: {
              mallRegisterValues: { '11st': { categoryPath: '수기' } },
              mallRegisterShared: { certNumber: 'CB065R1579-2008' },
            },
          },
        },
        preparation: {
          registrationInput: {
            mallRegisterValues: { '11st': { categoryPath: '등록준비' } },
            mallRegisterShared: { certNumber: 'OLD-COPY' },
          },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
      });
      expect(result.mallRegisterValues).toEqual({ '11st': { categoryPath: '수기' } });
      expect(result.mallRegisterShared).toEqual({ certNumber: 'CB065R1579-2008' });
    });
  });

  describe('registrationImages', () => {
    const candidate = {
      id: 'candidate-1',
      name: '수집 상품명',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: 'https://cbu01.alicdn.com/source.jpg',
      imageUrl: 'https://cbu01.alicdn.com/source.jpg',
      images: [
        { url: 'https://cbu01.alicdn.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
      ],
    };

    it('carries role-split content assets through untouched', () => {
      const result = buildProductBasics({
        candidate,
        preparation: null,
        registrationImages: {
          primary: ['http://localhost:9000/a/primary.png'],
          thumbnail: ['http://localhost:9000/a/thumb.png'],
          detail: ['http://localhost:9000/a/detail.png'],
        },
      });

      expect(result.registrationImages).toEqual({
        primary: ['http://localhost:9000/a/primary.png'],
        thumbnail: ['http://localhost:9000/a/thumb.png'],
        detail: ['http://localhost:9000/a/detail.png'],
      });
    });

    it('returns empty role buckets rather than substituting the scrape original', () => {
      const result = buildProductBasics({ candidate, preparation: null });

      expect(result.registrationImages).toEqual({ primary: [], thumbnail: [], detail: [] });
      // 폴백은 호출자 몫이다. 프리젠터가 원본 이미지를 role 자산인 척 넣으면 안 된다.
      expect(result.registrationImages.primary).not.toContain('https://cbu01.alicdn.com/source.jpg');
    });
  });

  describe('워크스페이스에 저장된 대표 썸네일', () => {
    const candidate = {
      id: 'candidate-1',
      name: '4000과일바구니딸깍이키링',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: 'https://cbu01.alicdn.com/source.jpg',
      imageUrl: 'https://cbu01.alicdn.com/source.jpg',
      images: [
        { url: 'https://cbu01.alicdn.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
      ],
    };

    it('preparation 이 없으면 워크스페이스 선택을 복원한다', () => {
      // 회귀: `ProductPreparation` 이 없는 후보는 대표를 워크스페이스에만 저장할 수
      // 있는데 프리젠터가 preparation 만 읽어서, 저장 후 재진입하면 `등록 대표`
      // 배지가 사라졌다.
      const result = buildProductBasics({
        candidate,
        preparation: null,
        workspaceThumbnailSelection: {
          url: 'http://localhost:9000/kiditem/thumbnail-generations/8cd5fe.png',
          sourceThumbnailGenerationId: 'generation-1',
          sourceThumbnailCandidateId: 'thumb-candidate-1',
        },
      });

      expect(result.selectedThumbnailUrl).toBe(
        'http://localhost:9000/kiditem/thumbnail-generations/8cd5fe.png',
      );
      expect(result.selectedThumbnailGenerationCandidateId).toBe('thumb-candidate-1');
    });

    it('preparation 대표가 있으면 그쪽이 이긴다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: {},
          selectedThumbnailUrl: 'https://cdn.example.com/preparation.png',
          selectedThumbnailGenerationCandidateId: 'prep-candidate',
          selectedDetailPageGenerationId: null,
        },
        workspaceThumbnailSelection: {
          url: 'http://localhost:9000/kiditem/thumbnail-generations/8cd5fe.png',
          sourceThumbnailGenerationId: 'generation-1',
          sourceThumbnailCandidateId: 'thumb-candidate-1',
        },
      });

      expect(result.selectedThumbnailUrl).toBe('https://cdn.example.com/preparation.png');
      // 대표가 preparation 것이면 파생 id 도 preparation 것이어야 한다.
      // 섞이면 서로 다른 이미지의 값이 한 응답에 실린다.
      expect(result.selectedThumbnailGenerationCandidateId).toBe('prep-candidate');
    });

    it('preparation 은 있는데 대표가 비었으면 워크스페이스 선택으로 채운다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: {},
          selectedThumbnailUrl: null,
          selectedThumbnailGenerationCandidateId: null,
          selectedDetailPageGenerationId: null,
        },
        workspaceThumbnailSelection: {
          url: 'http://localhost:9000/kiditem/thumbnail-generations/8cd5fe.png',
          sourceThumbnailGenerationId: 'generation-1',
          sourceThumbnailCandidateId: 'thumb-candidate-1',
        },
      });

      expect(result.selectedThumbnailUrl).toBe(
        'http://localhost:9000/kiditem/thumbnail-generations/8cd5fe.png',
      );
      expect(result.selectedThumbnailGenerationCandidateId).toBe('thumb-candidate-1');
    });

    it('저장된 선택이 없으면 원본 이미지로 대표를 지어내지 않는다', () => {
      const result = buildProductBasics({ candidate, preparation: null });

      expect(result.selectedThumbnailUrl).toBeNull();
    });
  });
});
