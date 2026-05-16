import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../application/service/sourcing.service';

function makeCandidateRepo() {
  return {
    upsertSourced: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    mergeDescription: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    findById: vi.fn(),
    listSourced: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function makeGateway() {
  return {
    scrapeUrl: vi.fn().mockResolvedValue({ taskId: 'task-1', requestId: 'request-1' }),
    notifyPromoted: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAlerts() {
  return { start: vi.fn().mockResolvedValue({}) };
}

describe('SourcingService — candidate ingest', () => {
  let service: SourcingService;
  let repo: ReturnType<typeof makeCandidateRepo>;
  let gateway: ReturnType<typeof makeGateway>;
  let alerts: ReturnType<typeof makeAlerts>;

  beforeEach(() => {
    repo = makeCandidateRepo();
    gateway = makeGateway();
    alerts = makeAlerts();
    service = new SourcingService(repo as any, gateway as any, alerts as any);
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

  it('scrapeUrl delegates to gateway + raises alert', async () => {
    const result = await service.scrapeUrl('https://1688.com/item/1', 'org-1', 'user-1');
    expect(gateway.scrapeUrl).toHaveBeenCalled();
    expect(alerts.start).toHaveBeenCalled();
    expect(result.taskId).toBe('task-1');
  });

  it('getProduct findById null → NotFoundException', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.getProduct('cand-x', 'org-1')).rejects.toThrow('Sourcing candidate not found');
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

  it('listProducts defaults to imported and KidItem collected platforms only', async () => {
    await service.listProducts({ sort: 'newest', page: 1, limit: 20 } as any, 'org-1');

    expect(repo.listSourced).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      sourcePlatforms: ['ALIBABA_1688', 'ALIBABA', 'kiditem-detail-page', 'KIDITEM_PRODUCT_REGISTRATION'],
    }));
  });
});
