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
      { page_type: 'detail', title: '아동용 스니커즈', source_url: 'https://1688.com/item/12345', source_platform: '1688', price: 15.5, images: ['https://img1.jpg'] } as any,
      'org-1', 'user-1',
    );
    expect(repo.upsertSourced).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: 'https://1688.com/item/12345',
      organizationId: 'org-1',
      name: '아동용 스니커즈',
      costCny: 15.5,
      sourcePlatform: 'ALIBABA_1688',
      triggeredByUserId: 'user-1',
      images: [expect.objectContaining({ url: 'https://img1.jpg', isPrimary: true, sortOrder: 0 })],
    }));
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
      { page_type: 'description', source_url: 'https://1688.com/item/99', description_text: 'desc', source_platform: '1688', images: ['https://img-x.jpg'] } as any,
      'org-1', 'user-1',
    );
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
});
