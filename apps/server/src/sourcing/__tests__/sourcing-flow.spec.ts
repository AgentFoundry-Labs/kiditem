import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingAgentCommandService } from '../application/service/sourcing-agent-command.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';

function makeCandidateRepo() {
  return {
    upsertSourced: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    upsertSourcedWithIdempotencyReceipt: vi.fn().mockResolvedValue({ candidateId: 'cand-1' }),
    claimQuickProcess: vi.fn().mockResolvedValue({ salesProductId: DRAFT_ID }),
    mergeDescription: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    findActiveBySourceUrl: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
    listSourced: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function makeGateway() {
  return {
    scrapeUrl: vi.fn().mockResolvedValue({ taskId: 'task-1', requestId: 'request-1' }),
    notifyPromoted: vi.fn().mockResolvedValue(undefined),
    startProductGeneration: vi.fn().mockResolvedValue({
      candidateId: 'cand-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/cand-1',
    }),
  };
}

function makeScrapes() {
  return {
    startDirect: vi.fn().mockResolvedValue({ operationRunId: 'operation-1', status: 'queued' }),
    startOfficial: vi.fn(),
  };
}


/** 후보의 편집 정본(판매상품 초안). 수집이 후보를 담을 때 함께 생긴다(KID-310). */
function makeDrafts() {
  return {
    createFromSource: vi.fn(),
    findDraftIdForSource: vi.fn().mockResolvedValue(DRAFT_ID),
    findDraftIdsForSources: vi.fn().mockResolvedValue(new Map()),
    getDraft: vi.fn().mockResolvedValue(draftRow()),
    retireForSource: vi.fn(),
  };
}

const DRAFT_ID = 'draft-1';

/** 생성 prompt 가 읽는 초안 한 줄. 후보 원문이 아니라 여기 값이 정본이다. */
function draftRow() {
  return {
    id: DRAFT_ID,
    name: '자석 다트게임',
    standardCategory: '완구',
    description: '안전한 다트 보드',
    targetAudience: '초등학생',
    imageUrls: ['https://example.com/main.jpg'],
    optionAxes: ['기본'],
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    kcStatus: 'unknown' as const,
    sourceCandidateId: 'candidate-1',
  };
}

function quickProcessCandidate() {
  return {
    id: 'candidate-1',
    organizationId: 'org-1',
    sourceUrl: 'https://1688.com/item/1',
    sourcePlatform: 'ALIBABA_1688',
    rawData: {
      target: '초등학생',
      optionNames: ['기본'],
      imageUrls: ['https://example.com/raw.jpg'],
    },
    name: '자석 다트게임',
    description: '안전한 다트 보드',
    category: '완구',
    tags: ['기본'],
    thumbnailUrl: 'https://example.com/main.jpg',
    imageUrl: 'https://example.com/main.jpg',
    costCny: null,
    status: 'sourced',
    promotedMasterId: null,
    rejectedReason: null,
    rejectedAt: null,
    rejectedByUserId: null,
    triggeredByUserId: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    images: [
      {
        id: 'img-1',
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        url: 'https://example.com/main.jpg',
        storageKey: null,
        role: 'product',
        label: null,
        sortOrder: 0,
        source: 'test',
        isPrimary: true,
        isDeleted: false,
      },
    ],
    registrationTarget: null,
  };
}

describe('SourcingService — candidate ingest', () => {
  let service: SourcingService;
  let repo: ReturnType<typeof makeCandidateRepo>;
  let gateway: ReturnType<typeof makeGateway>;
  let scrapes: ReturnType<typeof makeScrapes>;
  let drafts: ReturnType<typeof makeDrafts>;
  let draftContentAssets: {
    loadRegistrationMedia: ReturnType<typeof vi.fn>;
    listRegistrationImages: ReturnType<typeof vi.fn>;
    findCurrentThumbnail: ReturnType<typeof vi.fn>;
    findCurrentThumbnails: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = makeCandidateRepo();
    gateway = makeGateway();
    scrapes = makeScrapes();
    drafts = makeDrafts();
    draftContentAssets = {
      loadRegistrationMedia: vi.fn().mockResolvedValue({
        registrationImages: { primary: [], thumbnail: [], detail: [] },
        currentThumbnail: null,
      }),
      listRegistrationImages: vi.fn().mockResolvedValue({ primary: [], thumbnail: [], detail: [] }),
      findCurrentThumbnail: vi.fn().mockResolvedValue(null),
      findCurrentThumbnails: vi.fn().mockResolvedValue(new Map()),
    };
    const agentCommands = new SourcingAgentCommandService(
      repo as any,
      gateway as any,
      drafts as any,
    );
    service = new SourcingService(
      repo as any,
      gateway as any,
      draftContentAssets as any,
      agentCommands,
      scrapes as any,
      drafts as any,
    );
  });

  it('detail page ingest → upsertSourced (new sourceUrl)', async () => {
    const result = await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '아동용 스니커즈',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        price: 15.5,
        images: ['https://img1.jpg'],
        description_images: ['https://detail-info.jpg'],
      } as any,
      'org-1', 'user-1',
    );
    expect(repo.upsertSourced).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: 'https://1688.com/item/12345',
      organizationId: 'org-1',
      name: '아동용 스니커즈',
      costCny: 15.5,
      sourcePlatform: 'ALIBABA_1688',
      triggeredByUserId: 'user-1',
      images: [expect.objectContaining({ url: 'https://img1.jpg', role: 'product', isPrimary: true, sortOrder: 0 })],
    }));
    expect(repo.upsertSourced.mock.calls[0][0].images).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ url: 'https://detail-info.jpg' })]),
    );
    expect(result.ok).toBe(true);
    expect(result.product_count).toBe(1);
  });

  it('preserves the deployed extractor price_min wire field as sourcing cost', async () => {
    await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '1688 추출 상품',
        source_url: 'https://detail.1688.com/offer/12345.html',
        source_platform: '1688',
        price_min: 0.81,
        price_max: 1.2,
        supplier_name: '공급사',
        sku_attrs: [{ name: '색상', values: ['빨강'] }],
      },
      'org-1',
      'user-1',
    );

    expect(repo.upsertSourced).toHaveBeenCalledWith(
      expect.objectContaining({ costCny: 0.81 }),
    );
    expect(repo.upsertSourced.mock.calls[0][0].rawData).toMatchObject({
      supplier_name: '공급사',
      sku_attrs: [{ name: '색상', values: ['빨강'] }],
    });
  });

  it('description page with no existing candidate → product_count 0', async () => {
    repo.mergeDescription.mockResolvedValueOnce(null);
    const result = await service.receiveExtensionData(
      { page_type: 'description', source_url: 'https://1688.com/item/99', description_text: 'desc', source_platform: '1688' } as any,
      'org-1', 'user-1',
    );
    expect(repo.mergeDescription).toHaveBeenCalled();
    expect(result.product_count).toBe(0);
  });

  it('description page with existing candidate → product_count 1', async () => {
    repo.mergeDescription.mockResolvedValueOnce({ id: 'cand-1' });
    const result = await service.receiveExtensionData(
      {
        page_type: 'description',
        source_url: 'https://1688.com/item/99',
        description_text: 'desc',
        source_platform: '1688',
        description_images: ['https://detail-x.jpg'],
      } as any,
      'org-1', 'user-1',
    );
    expect(repo.mergeDescription).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailUrl: null,
      imageUrl: null,
      images: [expect.objectContaining({
        url: 'https://detail-x.jpg',
        role: 'detail',
        isPrimary: false,
        source: 'sourcing-extension-description',
      })],
    }));
    expect(result.product_count).toBe(1);
  });

  it('search page → count only, no DB write', async () => {
    const result = await service.receiveExtensionData(
      { page_type: 'search', total_found: 42, source_platform: '1688' } as any,
      'org-1', 'user-1',
    );
    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(repo.mergeDescription).not.toHaveBeenCalled();
    expect(result.product_count).toBe(42);
  });

  it('manual product registration creates collected-product candidate', async () => {
    const result = await service.registerManualProduct(
      {
        title: '바삭바삭 수제왁스팝',
        category: '완구',
        description: '말랑한 촉감 놀이 상품',
        target: '부모 구매자',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
        optionNames: ['노란색', '분홍색'],
      },
      'org-1',
      'user-1',
    );

    expect(repo.upsertSourced).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
      name: '바삭바삭 수제왁스팝',
      category: '완구',
      tags: ['노란색', '분홍색'],
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      imageUrl: 'https://cdn.example.com/thumb.jpg',
      triggeredByUserId: 'user-1',
      images: [
        expect.objectContaining({
          url: 'https://cdn.example.com/1.jpg',
          role: 'product',
          source: 'kiditem-product-registration',
          isPrimary: true,
          sortOrder: 0,
        }),
        expect.objectContaining({
          url: 'https://cdn.example.com/2.jpg',
          role: 'product',
          source: 'kiditem-product-registration',
          isPrimary: false,
          sortOrder: 1,
        }),
      ],
    }));
    expect(repo.upsertSourced.mock.calls.at(-1)?.[0].sourceUrl).toMatch(
      /^kiditem:\/\/manual-product-registration\//,
    );
    expect(result).toMatchObject({
      ok: true,
      product_count: 1,
      candidateId: 'cand-1',
      href: '/product-pipeline/collected-products/cand-1',
    });
  });

  it('createProductGeneration creates a manual candidate and delegates AI product generation', async () => {
    repo.upsertSourcedWithIdempotencyReceipt.mockResolvedValueOnce({ candidateId: 'candidate-1' });
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });

    const result = await service.createProductGeneration({
      title: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      thumbnailUrl: 'https://example.com/main.jpg',
      imageUrls: ['https://example.com/main.jpg'],
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      productSize: '높이: 30cm',
    }, 'org-1', 'user-1', 'product-generation-key');

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      candidateId: 'candidate-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }));
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      salesProductId: DRAFT_ID,
      sourceCandidateId: 'candidate-1',
      productBrief: expect.objectContaining({
        productName: '자석 다트게임',
        imageUrls: ['https://example.com/main.jpg'],
      }),
      idempotencyKey: 'product-generation-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.product_generation',
        command: {
          title: '자석 다트게임',
          category: '완구',
          description: '안전한 다트 보드',
          target: '초등학생',
          thumbnailUrl: 'https://example.com/main.jpg',
          imageUrls: ['https://example.com/main.jpg'],
          optionNames: ['기본'],
          templateId: 'bold-vertical',
          ageGroup: 'age-8-plus',
          detailImageCount: '2',
          usageSectionMode: 'include',
          kcCertificationStatus: 'unknown',
          productSize: '높이: 30cm',
        },
      }),
    }));
  });

  it('startProductGeneration delegates product generation for an existing draft without creating a new candidate', async () => {
    repo.findById.mockResolvedValueOnce(quickProcessCandidate());
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });

    const result = await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'all',
      'quick-process-key',
    );

    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(repo.claimQuickProcess).toHaveBeenCalledWith({
      organizationId: 'org-1',
      salesProductId: DRAFT_ID,
      idempotencyKey: 'quick-process-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'all',
        templateId: 'bold-vertical',
      }),
    });
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      salesProductId: DRAFT_ID,
      sourceCandidateId: 'candidate-1',
      productBrief: expect.objectContaining({
        productName: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        target: '초등학생',
        imageUrls: ['https://example.com/main.jpg'],
        thumbnailUrl: 'https://example.com/main.jpg',
        optionNames: ['기본'],
      }),
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      task: 'all',
      idempotencyKey: 'quick-process-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'all',
        templateId: 'bold-vertical',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      candidateId: 'candidate-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }));
  });

  /**
   * 직접 작성한 초안에는 원천 기록이 없다. 편집 정본이 초안이므로 생성이 쓸 값은 다 있고,
   * 후보를 못 찾았다고 생성이 막히면 안 된다(KID-310 · ADR-0022).
   */
  it('⭐ 후보 없는 직접 작성 초안도 생성을 시작한다', async () => {
    drafts.getDraft.mockResolvedValueOnce({ ...draftRow(), sourceCandidateId: null });
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: `/product-hub/sales-products/${DRAFT_ID}`,
    });

    const result = await service.startProductGeneration(
      DRAFT_ID, 'org-1', 'user-1', 'all', 'direct-key',
    );

    // 후보를 아예 찾지 않는다 — 찾을 것이 없다.
    expect(repo.findById).not.toHaveBeenCalled();
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: DRAFT_ID,
      sourceCandidateId: null,
      productBrief: expect.objectContaining({ productName: '자석 다트게임' }),
    }));
    expect(result).toMatchObject({ ok: true, candidateId: null, salesProductId: DRAFT_ID });
  });

  it('rejects quick-process hash drift before starting direct AI work', async () => {
    repo.findById.mockResolvedValueOnce(quickProcessCandidate());
    repo.claimQuickProcess.mockRejectedValueOnce(
      new Error('owner_idempotency_input_conflict'),
    );

    await expect(service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'thumbnail',
      'quick-process-key',
    )).rejects.toMatchObject({
      status: 409,
      message: 'product_generation_idempotency_conflict',
    });
    expect(gateway.startProductGeneration).not.toHaveBeenCalled();
  });

  it('startProductGeneration can request only thumbnail generation', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'candidate-1',
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
      sourcePlatform: 'ALIBABA_1688',
      rawData: {},
      name: '자석 다트게임',
      description: '안전한 다트 보드',
      category: '완구',
      tags: [],
      thumbnailUrl: 'https://example.com/main.jpg',
      imageUrl: 'https://example.com/main.jpg',
      costCny: null,
      status: 'sourced',
      promotedMasterId: null,
      rejectedReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      triggeredByUserId: null,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
      images: [],
      registrationTarget: null,
    });
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: null,
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: null,
      href: '/product-pipeline/collected-products/candidate-1',
    });

    await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'thumbnail',
      'quick-process-thumbnail-key',
    );

    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: DRAFT_ID,
      sourceCandidateId: 'candidate-1',
      task: 'thumbnail',
      idempotencyKey: 'quick-process-thumbnail-key',
      templateId: 'bold-vertical',
    }));

    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-2',
      thumbnailGenerationId: null,
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });
    await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'detail',
      'template-change-key',
      'kids-playful',
    );
    expect(gateway.startProductGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      task: 'detail',
      templateId: 'kids-playful',
    }));
    expect(repo.claimQuickProcess).toHaveBeenLastCalledWith(expect.objectContaining({
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'detail',
        templateId: 'kids-playful',
      }),
    }));
  });

  it('getProduct findById null → NotFoundException', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.getProduct('cand-x', 'org-1')).rejects.toThrow('Sourcing candidate not found');
  });

  it('getProduct reads registration images and the current thumbnail as one media snapshot', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'cand-1',
      name: '상품',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      registrationTarget: null,
    });

    await service.getProduct('cand-1', 'org-1');

    expect(draftContentAssets.loadRegistrationMedia).toHaveBeenCalledOnce();
    expect(draftContentAssets.loadRegistrationMedia).toHaveBeenCalledWith({
      organizationId: 'org-1',
      salesProductId: DRAFT_ID,
    });
    expect(draftContentAssets.listRegistrationImages).not.toHaveBeenCalled();
    expect(draftContentAssets.findCurrentThumbnail).not.toHaveBeenCalled();
  });

  /**
   * 수집상품 상세는 이제 값을 합치지 않는다(KID-310). 편집 정본은 그 후보에서 만든 판매상품
   * 초안이고, 응답은 화면이 그 초안으로 넘어갈 id 만 준다.
   */
  describe('getProduct', () => {
    const candidateRow = {
      id: 'cand-1',
      name: '4000 과일바구니 딸깍이 키링',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      registrationTarget: null,
    };

    it('points at the selling-product draft instead of merging edited values', async () => {
      repo.findById.mockResolvedValueOnce(candidateRow);

      const result = await service.getProduct('cand-1', 'org-1');

      expect(result).toMatchObject({ id: 'cand-1', salesProductId: DRAFT_ID });
      expect(result).not.toHaveProperty('basicInfo');
    });
  });

  it('listProducts forwards platform map + sort', async () => {
    await service.listProducts({ platform: '1688', sort: 'oldest', page: 2, limit: 10 } as any, 'org-1');
    expect(repo.listSourced).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      platform: 'ALIBABA_1688',
      sort: 'oldest',
      page: 2,
      limit: 10,
    }));
  });

  it('listProducts defaults to imported and manual registration platforms only', async () => {
    await service.listProducts({ sort: 'newest', page: 1, limit: 20 } as any, 'org-1');

    expect(repo.listSourced).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      sourcePlatforms: ['ALIBABA_1688', 'ALIBABA', 'KIDITEM_PRODUCT_REGISTRATION'],
    }));
  });
});
