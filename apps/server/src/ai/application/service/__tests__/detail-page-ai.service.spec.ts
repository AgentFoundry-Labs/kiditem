import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoldVerticalRefinerService } from '../bold-vertical-refiner.service';
import { DetailPageGenerationService } from '../detail-page-generation.service';
import { DetailPagePrefillService } from '../detail-page-prefill.service';
import { DetailPageResultRefinerService } from '../detail-page-result-refiner.service';
import { KidsPlayfulRefinerService } from '../kids-playful-refiner.service';
import type { DetailPageGenerationRepositoryPort } from '../../port/out/repository/detail-page-generation.repository.port';

const ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const WORKSPACE_ID = '22222222-2222-2222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';

function makeRepository() {
  const row = {
    id: GENERATION_ID,
    organizationId: ORGANIZATION_ID,
    generationGroupId: '44444444-4444-4444-8444-444444444444',
    contentWorkspaceId: WORKSPACE_ID,
    sourceCandidateId: null,
    contentType: 'detail_page',
    templateId: 'kids-playful',
    generationInput: {},
    generationResult: {},
    generatedTitle: '자석 다트게임',
    generatedDescription: null,
    generatedCopy: null,
    editedHtml: null,
    editedHtmlSavedAt: null,
    status: 'PROCESSING',
    retryCount: 0,
    errorMessage: null,
    triggeredByUserId: USER_ID,
    createdAt: new Date('2026-05-04T00:00:00.000Z'),
    updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    generationGroup: { id: '44444444-4444-4444-8444-444444444444', targetMasterId: null },
  };
  const repository = {
    findActiveContentWorkspace: vi.fn().mockResolvedValue(null),
    ensureRerunGenerationGroup: vi.fn(),
    openProcessingGenerationLedger: vi.fn().mockResolvedValue({
      status: 'created',
      row,
      directJobId: 'direct-job-1',
      releaseRequired: true,
    }),
    markGenerationFailed: vi.fn(),
    findRerunBase: vi.fn(),
    findImageOnlyBaseCandidates: vi.fn().mockResolvedValue([]),
    findSourceCandidate: vi.fn(),
    findSourceContentGeneration: vi.fn(),
    findSourceContentAsset: vi.fn(),
    findCancellableGeneration: vi.fn().mockResolvedValue({
      id: GENERATION_ID,
      status: 'PROCESSING',
      generationInput: {},
      generationResult: {},
    }),
    cancelDirectGeneration: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: GENERATION_ID,
      preserved: false,
    }),
  } as unknown as DetailPageGenerationRepositoryPort;
  return { repository, row };
}

function makeService() {
  const { repository, row } = makeRepository();
  const query = {
    getById: vi.fn().mockResolvedValue({
      id: row.id,
      contentWorkspaceId: WORKSPACE_ID,
      imageProcessingStatus: 'processing',
    }),
  };
  const directGenerationJobs = {
    prepareGenerate: vi.fn().mockReturnValue({
      jobType: 'detail_page_generate',
      payload: { jobType: 'detail_page_generate' },
      status: 'held',
      scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
    }),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const contentWorkspaces = {
    ensureForGeneration: vi.fn().mockResolvedValue({
      id: WORKSPACE_ID,
      displayName: '자석 다트게임',
      normalizedTitle: '자석 다트게임',
      sourceCandidateId: null,
    }),
  };
  const service = new DetailPageGenerationService(
    repository,
    {} as never,
    query as never,
    directGenerationJobs as never,
    contentWorkspaces as never,
  );
  return { service, repository, query, directGenerationJobs, contentWorkspaces, row };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    rawTitle: '자석 다트게임',
    rawCategory: '완구',
    rawDescription: '안전한 다트 보드',
    rawOptions: '기본',
    imageUrls: ['https://example.com/main.jpg'],
    heroImageMode: 'first' as const,
    templateId: 'kids-playful' as const,
    ...overrides,
  };
}

function boldVerticalResult() {
  return {
    hook: {
      subtext: '이달의 추천',
      text: '키즈 장난감',
      titleSub: '즐거운 놀이',
      description: '아이와 함께 즐기는 놀이',
      imageIndex: 0,
      bannerImageIndex: null,
    },
    section: {
      name: '놀이 포인트',
      title: '핵심 장점',
      subtitle: '가볍게 즐기는 실내놀이',
    },
    keyPoints: [
      { title: '쉬운 사용', description: '아이도 쉽게 다룰 수 있어요', imageIndex: 0 },
      { title: '가벼운 무게', description: '들고 놀기 부담이 없어요', imageIndex: 0 },
      { title: '선물 추천', description: '특별한 날 선물로 좋아요', imageIndex: 0 },
    ],
    size: { subtitle: '상세페이지 참고', imageIndices: [] },
    color: { subtitle: '혼합 색상', imageIndices: [] },
    usage: { subtitle: '간단하게 바로 사용', imageIndices: [] },
    detailImageIndices: [0, 1, 2],
    productInfo: [
      { key: '제품명', value: '키즈 장난감' },
      { key: '재질', value: '플라스틱' },
      { key: '색상', value: '혼합 색상' },
    ],
  };
}

function makeResultRefiner(packageImageIndices: number[]) {
  const heroImages = {
    inferPackageImagePositions: vi.fn().mockResolvedValue(packageImageIndices),
  };
  return new DetailPageResultRefinerService(
    new BoldVerticalRefinerService(heroImages as never),
    new KidsPlayfulRefinerService(heroImages as never),
  );
}

function boldVerticalRawInput(imageUrls: string[]) {
  return {
    rawTitle: '퐁퐁 버블팝슬라임',
    rawCategory: '완구',
    rawDescription: '박스/세트 정보: 있음\n박스/세트 구분: 박스',
    rawOptions: '색상 구성: 여러 색상\n박스/세트 정보: 있음\n1박스 수량: 12',
    imageUrls,
    templateId: 'bold-vertical' as const,
    detailImageCount: '3' as const,
    usageSectionMode: 'include' as const,
  };
}

describe('DetailPageGenerationService', () => {
  beforeEach(() => {
    process.env.AI_TEXT_MODEL = 'gemini-test';
    process.env.AI_IMAGE_MODEL = 'gemini-image-test';
    process.env.AI_IMAGE_ANALYSIS_MODEL = 'gemini-vision-test';
  });

  it('opens a processing row and releases one direct job without an operation wrapper', async () => {
    const { service, repository, directGenerationJobs, query } = makeService();

    await expect(service.generate(input(), ORGANIZATION_ID, USER_ID)).resolves.toMatchObject({
      id: GENERATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
    });
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
      rawTitle: '자석 다트게임',
      sourceReferences: [],
    }));
    expect(directGenerationJobs.prepareGenerate).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ templateId: 'kids-playful' }),
    }));
    expect(directGenerationJobs.release).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      jobId: 'direct-job-1',
    });
    expect(query.getById).toHaveBeenCalledWith(GENERATION_ID, ORGANIZATION_ID);
  });

  it('reuses an admitted product-generation child without releasing a non-held direct job', async () => {
    const { service, repository, directGenerationJobs } = makeService();
    vi.mocked(repository.openProcessingGenerationLedger).mockResolvedValueOnce({
      status: 'existing',
      row: makeRepository().row,
      directJobId: 'direct-job-1',
      releaseRequired: false,
    });

    await service.generate(
      input(),
      ORGANIZATION_ID,
      USER_ID,
      {
        generationId: GENERATION_ID,
        requestHash: 'a'.repeat(64),
      },
    );

    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        productGenerationIdentity: {
          generationId: GENERATION_ID,
          requestHash: 'a'.repeat(64),
        },
        rawInput: expect.objectContaining({
          productGenerationRequestHash: 'a'.repeat(64),
        }),
      }),
    );
    expect(directGenerationJobs.release).not.toHaveBeenCalled();
  });

  it('uses an existing organization-scoped workspace instead of creating one', async () => {
    const { service, repository, contentWorkspaces } = makeService();
    vi.mocked(repository.findActiveContentWorkspace).mockResolvedValueOnce({
      id: WORKSPACE_ID,
      sourceCandidateId: 'candidate-1',
      displayName: '기존 작업공간',
      normalizedTitle: '기존 작업공간',
    });

    await service.generate(input({ contentWorkspaceId: WORKSPACE_ID }), ORGANIZATION_ID, USER_ID);

    expect(repository.findActiveContentWorkspace).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
    });
    expect(contentWorkspaces.ensureForGeneration).not.toHaveBeenCalled();
  });

  it('cancels the direct job and generation atomically through the detail-page owner', async () => {
    const { service, repository } = makeService();

    await expect(service.cancelGeneration({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      actorUserId: USER_ID,
      reason: '사용자 요청',
    })).resolves.toEqual({
      status: 'cancelled',
      generationId: GENERATION_ID,
      preserved: false,
    });
    expect(repository.cancelDirectGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      reason: '사용자 요청',
    });
  });

  it('requires at least one image before creating a direct job', async () => {
    const { service, repository, directGenerationJobs } = makeService();

    await expect(service.generate(input({ imageUrls: [] }), ORGANIZATION_ID, USER_ID))
      .rejects.toThrow('상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.');
    expect(repository.openProcessingGenerationLedger).not.toHaveBeenCalled();
    expect(directGenerationJobs.prepareGenerate).not.toHaveBeenCalled();
  });

  it('uses the newest non-image detail-page generation as the base for image-only runs', async () => {
    const { service, repository, directGenerationJobs } = makeService();
    const imageOnlyBase = {
      id: '55555555-5555-4555-8555-555555555555',
      templateId: 'bold-vertical',
      generatedTitle: 'old image run',
      generationInput: { generationMode: 'image' },
      generationResult: { templateId: 'bold-vertical', result: { hook: { text: 'old' } } },
    };
    const draftBase = {
      id: '66666666-6666-4666-8666-666666666666',
      templateId: 'bold-vertical',
      generatedTitle: 'old draft run',
      generationInput: { generationMode: 'draft' },
      generationResult: { templateId: 'bold-vertical', result: { hook: { text: 'copy' } } },
    };
    vi.mocked(repository.findSourceCandidate).mockResolvedValueOnce({
      id: CANDIDATE_ID,
      name: '소싱 후보 상품',
    });
    vi.mocked(repository.findImageOnlyBaseCandidates).mockResolvedValueOnce(
      [imageOnlyBase, draftBase] as never,
    );

    await service.generate(
      input({
        templateId: 'bold-vertical',
        generationMode: 'image',
        sourceReferences: [
          { sourceType: 'sourcing_candidate', sourceCandidateId: CANDIDATE_ID },
        ],
      }) as never,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(repository.findImageOnlyBaseCandidates).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: CANDIDATE_ID,
      contentWorkspaceId: WORKSPACE_ID,
      templateId: 'bold-vertical',
    });
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCandidateId: CANDIDATE_ID,
        rawInput: expect.objectContaining({
          generationMode: 'image',
          baseContentGenerationId: draftBase.id,
        }),
      }),
    );
    expect(directGenerationJobs.prepareGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ existingResult: draftBase.generationResult.result }),
      }),
    );
  });

  it('uses content workspace history as the base for image-only runs without a candidate', async () => {
    const { service, repository, contentWorkspaces } = makeService();
    const base = {
      id: '77777777-7777-4777-8777-777777777777',
      templateId: 'bold-vertical',
      generatedTitle: 'workspace draft',
      generationInput: { generationMode: 'draft' },
      generationResult: { templateId: 'bold-vertical', result: { hook: { text: 'copy' } } },
    };
    vi.mocked(repository.findImageOnlyBaseCandidates).mockResolvedValueOnce([base] as never);

    await service.generate(
      input({ templateId: 'bold-vertical', generationMode: 'image' }) as never,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(contentWorkspaces.ensureForGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      rawTitle: '자석 다트게임',
      sourceCandidateId: null,
    });
    expect(repository.findImageOnlyBaseCandidates).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: null,
      contentWorkspaceId: WORKSPACE_ID,
      templateId: 'bold-vertical',
    });
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        contentWorkspaceId: WORKSPACE_ID,
        sourceCandidateId: null,
        rawInput: expect.objectContaining({ baseContentGenerationId: base.id }),
      }),
    );
  });

  it('passes the validated primary sourcing candidate to the durable generation owner', async () => {
    const { service, repository } = makeService();
    vi.mocked(repository.findSourceCandidate).mockResolvedValueOnce({
      id: CANDIDATE_ID,
      name: '소싱 후보 상품',
    });

    await service.generate(
      input({
        sourceReferences: [
          { sourceType: 'sourcing_candidate', sourceCandidateId: CANDIDATE_ID },
        ],
      }) as never,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(repository.findSourceCandidate).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: CANDIDATE_ID,
    });
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCandidateId: CANDIDATE_ID,
        rawInput: expect.objectContaining({
          sourceReferences: [
            {
              sourceType: 'sourcing_candidate',
              sourceCandidateId: CANDIDATE_ID,
              label: '소싱 후보 상품',
            },
          ],
        }),
        sourceReferences: [
          {
            sourceType: 'sourcing_candidate',
            sourceCandidateId: CANDIDATE_ID,
            label: '소싱 후보 상품',
          },
        ],
      }),
    );
  });

  it('creates a product-less content workspace without a collected candidate', async () => {
    const { service, repository, contentWorkspaces } = makeService();

    await service.generate(input(), ORGANIZATION_ID, USER_ID);

    expect(contentWorkspaces.ensureForGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      rawTitle: '자석 다트게임',
      sourceCandidateId: null,
    });
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        contentWorkspaceId: WORKSPACE_ID,
        sourceCandidateId: null,
      }),
    );
  });

  it('appends to an existing workspace and carries its source candidate forward', async () => {
    const { service, repository, contentWorkspaces } = makeService();
    vi.mocked(repository.findActiveContentWorkspace).mockResolvedValueOnce({
      id: WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
      displayName: '기존 작업공간',
      normalizedTitle: '기존 작업공간',
    });

    await service.generate(
      input({ contentWorkspaceId: WORKSPACE_ID }) as never,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(contentWorkspaces.ensureForGeneration).not.toHaveBeenCalled();
    expect(repository.openProcessingGenerationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        contentWorkspaceId: WORKSPACE_ID,
        sourceCandidateId: CANDIDATE_ID,
        sourceReferences: [
          {
            sourceType: 'sourcing_candidate',
            sourceCandidateId: CANDIDATE_ID,
            label: '기존 작업공간',
          },
        ],
      }),
    );
  });

  it('keeps an inferred package image out of ordinary bold-vertical sections', async () => {
    const refiner = makeResultRefiner([3]);
    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: { ...boldVerticalResult().hook, imageIndex: 3 },
        keyPoints: [{ title: '박스 구성', description: '구성을 확인하세요', imageIndex: 3 }],
        size: { ...boldVerticalResult().size, imageIndices: [3] },
        usage: {
          subtitle: '1. 포장을 열고 젤리를 꺼내세요\n2. 쫄깃하게 즐겨보세요',
          imageIndices: [3],
        },
        detailImageIndices: [0, 3],
        packageImageIndices: [2],
        packageLabel: '1박스 12개입 구성',
      } as never,
      boldVerticalRawInput([
        'https://example.com/product-main.jpg',
        'https://example.com/product-detail.jpg',
        'https://example.com/color-row.jpg',
        'https://example.com/retail-box.jpg',
      ]) as never,
    );

    expect(parsed.packageImageIndices).toEqual([3]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.keyPoints[0]?.imageIndex).toBeNull();
    expect(parsed.size.imageIndices).toEqual([]);
    expect(parsed.usage.imageIndices).toEqual([]);
    expect(parsed.detailImageIndices).toEqual([0]);
  });

  it('prefers an inferred display box over an LLM package/color collision', async () => {
    const refiner = makeResultRefiner([0]);
    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: { ...boldVerticalResult().hook, imageIndex: 0 },
        color: {
          subtitle: '옐로우 / 퍼플 / 블루 / 핑크 4가지 색상',
          imageIndices: [3],
        },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 마음껏 만지고 늘리며 즐기세요',
          imageIndices: [0, 1],
        },
        detailImageIndices: [0, 1, 2, 3],
        packageImageIndices: [3],
        packageLabel: '1박스 12개입 구성',
      } as never,
      boldVerticalRawInput([
        'https://example.com/display-box.jpg',
        'https://example.com/hand-product.jpg',
        'https://example.com/usage-shot.jpg',
        'https://example.com/color-lineup.jpg',
      ]) as never,
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.color.imageIndices).toEqual([3]);
    expect(parsed.usage.imageIndices).toEqual([1]);
    expect(parsed.detailImageIndices).toEqual([1, 2, 3]);
  });

  it('repairs package/color collisions when package inference has no confident hit', async () => {
    const refiner = makeResultRefiner([]);
    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: { ...boldVerticalResult().hook, imageIndex: 0 },
        color: {
          subtitle: '옐로우 / 퍼플 / 블루 / 핑크 4가지 색상',
          imageIndices: [3],
        },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 마음껏 만지고 늘리며 즐기세요',
          imageIndices: [0, 1],
        },
        detailImageIndices: [0, 1, 2, 3],
        packageImageIndices: [3],
        packageLabel: '1박스 12개입 구성',
      } as never,
      boldVerticalRawInput([
        'https://example.com/display-box.jpg',
        'https://example.com/hand-product.jpg',
        'https://example.com/usage-shot.jpg',
        'https://example.com/color-lineup.jpg',
      ]) as never,
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.color.imageIndices).toEqual([3]);
    expect(parsed.usage.imageIndices).toEqual([1]);
    expect(parsed.detailImageIndices).toEqual([1, 2]);
  });

  it('does not treat package-opening usage photos as package images', async () => {
    const refiner = makeResultRefiner([]);
    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        color: { subtitle: '', imageIndices: [] },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 손으로 주무르며 버블팝을 즐기세요',
          imageIndices: [1, 2],
        },
        detailImageIndices: [1, 2],
        packageImageIndices: [0],
        packageLabel: '1박스 12개입 구성',
      } as never,
      boldVerticalRawInput([
        'https://example.com/display-box.jpg',
        'https://example.com/hand-product.jpg',
        'https://example.com/detail-shot.jpg',
      ]) as never,
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.usage.imageIndices).toEqual([1, 2]);
    expect(parsed.detailImageIndices).toEqual([1, 2]);
  });

  it('prefills direct generator fields from a product name', async () => {
    const completion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: '생활용품/리빙 > 휴대용 비눗방울 > 목걸이형',
          keyword: '아이 목걸이 비눗방울',
          target: '부모 구매자',
          features: ['목에 걸고 다니기 쉬운 휴대형', '아이도 쉽게 사용하는 놀이', '선물하기 좋은 구성'],
          options: ['노란색', '빨간색', '초록색'],
          extraNotes: '사용연령과 안전표시 확인',
        }),
      }),
    };
    const prefill = new DetailPagePrefillService(completion as never);

    const result = await prefill.prefill({
      rawTitle: '휴대용목걸이비눗방울',
      imageUrls: ['https://example.com/image.jpg'],
    }, ORGANIZATION_ID);

    expect(completion.complete).toHaveBeenCalledWith(expect.objectContaining({
      responseMimeType: 'application/json',
      temperature: 0.45,
      model: 'gemini-test',
    }));
    expect(result.category).toBe('생활용품/리빙 > 휴대용 비눗방울 > 목걸이형');
    expect(result.description).toContain('1. 목에 걸고 다니기 쉬운 휴대형');
    expect(result.options).toEqual(['노란색', '빨간색', '초록색']);
  });

  it('normalizes prefill target arrays from the model into one string', async () => {
    const completion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: '완구/취미 > 만들기/창의놀이 > 놀이세트',
          keyword: '키즈 놀이세트',
          target: ['부모 구매자', '선물 구매자'],
          features: ['아이들이 쉽게 사용하는 놀이 상품', '실내외 활동에 어울리는 구성', '선물용으로 설명하기 쉬운 패키지'],
          options: [],
          extraNotes: '',
        }),
      }),
    };
    const prefill = new DetailPagePrefillService(completion as never);

    await expect(prefill.prefill({ rawTitle: '키즈 놀이 세트' }, ORGANIZATION_ID))
      .resolves.toMatchObject({ target: '부모 구매자, 선물 구매자' });
  });
});
