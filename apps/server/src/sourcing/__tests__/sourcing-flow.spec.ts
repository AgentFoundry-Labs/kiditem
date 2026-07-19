import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../application/service/sourcing.service';

function makeCandidateRepo() {
  return {
    upsertSourced: vi.fn().mockResolvedValue({ id: 'cand-1' }),
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
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/cand-1',
    }),
  };
}

function makeAlerts() {
  return { start: vi.fn().mockResolvedValue({}) };
}

function makeSellpiaSalePrices() {
  return { findSalePricesByNormalizedNames: vi.fn().mockResolvedValue([]) };
}

describe('SourcingService — candidate ingest', () => {
  let service: SourcingService;
  let repo: ReturnType<typeof makeCandidateRepo>;
  let gateway: ReturnType<typeof makeGateway>;
  let alerts: ReturnType<typeof makeAlerts>;
  let sellpiaSalePrices: ReturnType<typeof makeSellpiaSalePrices>;

  beforeEach(() => {
    repo = makeCandidateRepo();
    gateway = makeGateway();
    alerts = makeAlerts();
    sellpiaSalePrices = makeSellpiaSalePrices();
    service = new SourcingService(
      repo as any,
      gateway as any,
      alerts as any,
      {
        listRegistrationImages: vi.fn().mockResolvedValue({ primary: [], thumbnail: [], detail: [] }),
      } as any,
      sellpiaSalePrices as any,
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
    repo.upsertSourced.mockResolvedValueOnce({ id: 'candidate-1' });
    gateway.startProductGeneration.mockResolvedValueOnce({
      candidateId: 'candidate-1',
      parentOperationKey: 'product-generation:batch-1',
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
    }, 'org-1', 'user-1');

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      candidateId: 'candidate-1',
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }));
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      candidateId: 'candidate-1',
      productName: '자석 다트게임',
      imageUrls: ['https://example.com/main.jpg'],
    }));
  });

  it('quickProcessCandidate delegates product generation for an existing candidate without creating a new candidate', async () => {
    repo.findById.mockResolvedValueOnce({
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
      productPreparation: null,
    });
    gateway.startProductGeneration.mockResolvedValueOnce({
      candidateId: 'candidate-1',
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });

    const result = await service.quickProcessCandidate('candidate-1', 'org-1', 'user-1');

    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      candidateId: 'candidate-1',
      productName: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg',
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      task: 'all',
    }));
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      candidateId: 'candidate-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }));
  });

  it('quickProcessCandidate can request only thumbnail generation', async () => {
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
      productPreparation: null,
    });
    gateway.startProductGeneration.mockResolvedValueOnce({
      candidateId: 'candidate-1',
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: null,
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: null,
      href: '/product-pipeline/collected-products/candidate-1',
    });

    await service.quickProcessCandidate('candidate-1', 'org-1', 'user-1', 'thumbnail');

    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: 'candidate-1',
      task: 'thumbnail',
    }));
  });

  it('scrapeUrl delegates to gateway + raises alert', async () => {
    const result = await service.scrapeUrl('https://1688.com/item/1', 'org-1', 'user-1');
    expect(gateway.scrapeUrl).toHaveBeenCalled();
    expect(alerts.start).toHaveBeenCalled();
    expect(result.taskId).toBe('task-1');
  });

  it('scrapeUrl skips duplicate sourceUrl and returns the existing candidate link', async () => {
    repo.findActiveBySourceUrl.mockResolvedValueOnce({
      id: 'candidate-1',
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
      sourcePlatform: 'ALIBABA_1688',
      rawData: {},
      name: '이미 수집된 상품',
      description: '',
      category: null,
      tags: [],
      thumbnailUrl: null,
      imageUrl: null,
      costCny: null,
      status: 'sourced',
      promotedMasterId: null,
      rejectedReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      triggeredByUserId: 'user-1',
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });

    const result = await service.scrapeUrl('https://1688.com/item/1', 'org-1', 'user-1');

    expect(repo.findActiveBySourceUrl).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
    });
    expect(gateway.scrapeUrl).not.toHaveBeenCalled();
    expect(alerts.start).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      skipped: true,
      candidateId: 'candidate-1',
      product_id: 'candidate-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }));
  });

  it('scrapeUrlStatus returns a collected state and link for duplicate sourceUrl', async () => {
    repo.findActiveBySourceUrl.mockResolvedValueOnce({
      id: 'candidate-1',
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
      sourcePlatform: 'ALIBABA_1688',
      rawData: {},
      name: '이미 수집된 상품',
      description: '',
      category: null,
      tags: [],
      thumbnailUrl: null,
      imageUrl: null,
      costCny: null,
      status: 'sourced',
      promotedMasterId: null,
      rejectedReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      triggeredByUserId: 'user-1',
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });

    const result = await service.scrapeUrlStatus('https://1688.com/item/1', 'org-1');

    expect(result).toEqual({
      status: 'collected',
      candidateId: 'candidate-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });
  });

  it('getProduct findById null → NotFoundException', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.getProduct('cand-x', 'org-1')).rejects.toThrow('Sourcing candidate not found');
  });

  describe('getProduct 셀피아 판매가 폴백', () => {
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
      productPreparation: null,
    };

    it('후보 이름을 정규화해 인자로 받은 organizationId 로만 조회한다', async () => {
      repo.findById.mockResolvedValueOnce(candidateRow);

      await service.getProduct('cand-1', 'org-1');

      // NFKC → 소문자 → 공백 제거. Inventory 의 DB 술어와 같은 규칙이어야 한다.
      expect(sellpiaSalePrices.findSalePricesByNormalizedNames).toHaveBeenCalledWith('org-1', [
        '4000과일바구니딸깍이키링',
      ]);
    });

    it('수기 판매가가 비어 있으면 셀피아 값으로 채우고 출처를 밝힌다', async () => {
      repo.findById.mockResolvedValueOnce(candidateRow);
      sellpiaSalePrices.findSalePricesByNormalizedNames.mockResolvedValueOnce([
        { normalizedName: '4000과일바구니딸깍이키링', salePrice: 4000 },
      ]);

      const result = await service.getProduct('cand-1', 'org-1');

      expect(result.basicInfo.salePrice).toBe(4000);
      expect(result.basicInfo.salePriceSource).toBe('sellpia');
    });

    it('수기 판매가가 있으면 셀피아 매칭이 있어도 덮어쓰지 않는다', async () => {
      repo.findById.mockResolvedValueOnce({
        ...candidateRow,
        productPreparation: {
          registrationInput: { salePrice: 12900 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
      });
      sellpiaSalePrices.findSalePricesByNormalizedNames.mockResolvedValueOnce([
        { normalizedName: '4000과일바구니딸깍이키링', salePrice: 4000 },
      ]);

      const result = await service.getProduct('cand-1', 'org-1');

      expect(result.basicInfo.salePrice).toBe(12900);
      expect(result.basicInfo.salePriceSource).toBe('input');
    });

    it('매칭이 없으면 조용히 0원으로 남긴다', async () => {
      repo.findById.mockResolvedValueOnce(candidateRow);

      const result = await service.getProduct('cand-1', 'org-1');

      expect(result.basicInfo.salePrice).toBe(0);
      expect(result.basicInfo.salePriceSource).toBe('none');
    });

    it('다른 이름으로 돌아온 행은 이 후보 값으로 쓰지 않는다', async () => {
      repo.findById.mockResolvedValueOnce(candidateRow);
      sellpiaSalePrices.findSalePricesByNormalizedNames.mockResolvedValueOnce([
        { normalizedName: '전혀다른상품', salePrice: 9900 },
      ]);

      const result = await service.getProduct('cand-1', 'org-1');

      expect(result.basicInfo.salePrice).toBe(0);
      expect(result.basicInfo.salePriceSource).toBe('none');
    });

    it('이름이 공백뿐이면 조회 자체를 하지 않는다', async () => {
      repo.findById.mockResolvedValueOnce({ ...candidateRow, name: '   ' });

      const result = await service.getProduct('cand-1', 'org-1');

      expect(sellpiaSalePrices.findSalePricesByNormalizedNames).not.toHaveBeenCalled();
      expect(result.basicInfo.salePriceSource).toBe('none');
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
