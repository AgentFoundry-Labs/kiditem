import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../application/service/sourcing.service';

function makePrisma() {
  return {
    masterProduct: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    masterProductImage: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeProductsCatalog() {
  return {
    createMaster: vi.fn().mockResolvedValue({ id: 'prod-created' }),
  };
}

function makeAgentGateway() {
  return {
    scrapeUrl: vi.fn().mockResolvedValue({ taskId: 'task-1', requestId: 'request-1' }),
    generateDetailPage: vi.fn().mockResolvedValue({ taskId: 'detail-1' }),
  };
}

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
  };
}

describe('SourcingService — extension data ingestion', () => {
  let service: SourcingService;
  let prisma: ReturnType<typeof makePrisma>;
  let productsCatalog: ReturnType<typeof makeProductsCatalog>;
  let agentGateway: ReturnType<typeof makeAgentGateway>;
  let operationAlerts: ReturnType<typeof makeOperationAlerts>;

  beforeEach(() => {
    prisma = makePrisma();
    productsCatalog = makeProductsCatalog();
    agentGateway = makeAgentGateway();
    operationAlerts = makeOperationAlerts();
    service = new SourcingService(
      prisma as any,
      productsCatalog as any,
      agentGateway as any,
      operationAlerts as any,
    );
  });

  it('receiveExtensionData with new source_url → creates a master through SOURCING_PRODUCTS_CATALOG_PORT', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue(null);

    const result = await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '아동용 스니커즈',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        price: 15.5,
        images: ['https://img1.jpg'],
      },
      'organization-1',
    );

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://1688.com/item/12345', organizationId: 'organization-1', isDeleted: false },
      select: { id: true, rawData: true },
    });
    expect(productsCatalog.createMaster).toHaveBeenCalledWith(
      'organization-1',
      expect.objectContaining({
        name: '아동용 스니커즈',
        sourceUrl: 'https://1688.com/item/12345',
        images: [expect.objectContaining({ url: 'https://img1.jpg', isPrimary: true })],
      }),
    );
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-created', organizationId: 'organization-1' },
      data: { rawData: expect.objectContaining({ images: ['https://img1.jpg'] }) },
    });
    expect(result.ok).toBe(true);
  });

  it('receiveExtensionData with existing source_url → updates existing product', async () => {
    const existing = { id: 'prod-existing' };
    prisma.masterProduct.findFirst.mockResolvedValue(existing);
    prisma.masterProduct.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '아동용 스니커즈 (업데이트)',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        price: 18.0,
      },
      'organization-1',
    );

    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existing', organizationId: 'organization-1', isDeleted: false },
        data: expect.objectContaining({
          name: '아동용 스니커즈 (업데이트)',
          costCny: 18.0,
        }),
      }),
    );
    expect(productsCatalog.createMaster).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('price parsing: priceRange "¥12.5-¥25.0" format → extracts minimum cost', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue({ id: 'prod-existing' });
    prisma.masterProduct.updateMany.mockResolvedValue({ count: 1 });

    await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '키즈 바람막이',
        source_url: 'https://1688.com/item/99999',
        source_platform: '1688',
        priceRange: '12.5-25.0',
      },
      'organization-1',
    );

    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existing', organizationId: 'organization-1', isDeleted: false },
        data: expect.objectContaining({
          costCny: 12.5,
        }),
      }),
    );
  });

  it('organizationId scopes source_url lookup before updating a matched product', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue({ id: 'prod-3' });
    prisma.masterProduct.updateMany.mockResolvedValue({ count: 1 });

    await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '유아 모자',
        source_url: 'https://alibaba.com/product/abc',
        source_platform: 'alibaba',
        price: 8.0,
      },
      'organization-A',
    );

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://alibaba.com/product/abc', organizationId: 'organization-A', isDeleted: false },
      select: { id: true, rawData: true },
    });
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-3', organizationId: 'organization-A', isDeleted: false },
        data: expect.objectContaining({
          name: '유아 모자',
          costCny: 8.0,
        }),
      }),
    );
    expect(productsCatalog.createMaster).not.toHaveBeenCalled();
  });

  it('search page type → returns product_count from total_found, does not create product', async () => {
    const result = await service.receiveExtensionData(
      {
        page_type: 'search',
        source_platform: '1688',
        total_found: 42,
      },
      'organization-1',
    );

    expect(prisma.masterProduct.findFirst).not.toHaveBeenCalled();
    expect(productsCatalog.createMaster).not.toHaveBeenCalled();
    expect(result.product_count).toBe(42);
    expect(result.ok).toBe(true);
  });

  it('description page type → merges description images into existing rawData', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue({
      id: 'prod-existing',
      rawData: { title: '기존 상품', images: ['https://main.jpg'] },
      description: '',
      thumbnailUrl: null,
      imageUrl: null,
    });
    prisma.masterProduct.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.receiveExtensionData(
      {
        page_type: 'description',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        description_text: '상세 설명',
        description_images: ['//desc.jpg'],
      },
      'organization-1',
    );

    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existing', organizationId: 'organization-1', isDeleted: false },
        data: expect.objectContaining({
          description: '상세 설명',
          rawData: expect.objectContaining({
            images: ['https://main.jpg', 'https://desc.jpg'],
            description_images: ['https://desc.jpg'],
          }),
        }),
      }),
    );
    expect(result.product_count).toBe(1);
  });

  it('scrapeUrl → delegates to SourcingAgentGatewayPort with organizationId scope and threads triggeredByUserId', async () => {
    const result = await service.scrapeUrl(
      'https://1688.com/item/77',
      'organization-2',
      'user-7',
    );

    expect(agentGateway.scrapeUrl).toHaveBeenCalledWith({
      organizationId: 'organization-2',
      url: 'https://1688.com/item/77',
      triggeredByUserId: 'user-7',
    });
    expect(result.taskId).toBe('task-1');
    expect(result.ok).toBe(true);
  });

  it('scrapeUrl → opens a producer-owned operation alert keyed by agent_run_request:<requestId> when the gateway returns a requestId', async () => {
    agentGateway.scrapeUrl.mockResolvedValue({ taskId: 'task-x', requestId: 'request-x' });

    await service.scrapeUrl('https://1688.com/item/88', 'organization-3', 'user-9');

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'organization-3',
        operationKey: 'sourcing-scrape:request-x',
        type: 'sourcing_scrape_url',
        sourceType: 'agent_run_request',
        sourceId: 'request-x',
        actorUserId: 'user-9',
        href: '/sourcing',
        metadata: expect.objectContaining({
          agentType: 'sourcing',
          url: 'https://1688.com/item/88',
        }),
      }),
    );
  });

  it('scrapeUrl → does NOT open an operation alert when the gateway returned only a runId (no requestId)', async () => {
    agentGateway.scrapeUrl.mockResolvedValue({ taskId: 'run-only' });

    const result = await service.scrapeUrl(
      'https://1688.com/item/99',
      'organization-4',
      'user-9',
    );

    expect(result.taskId).toBe('run-only');
    expect(operationAlerts.start).not.toHaveBeenCalled();
  });

  it('scrapeUrl → forwards null triggeredByUserId for system-driven calls', async () => {
    await service.scrapeUrl('https://1688.com/item/55', 'organization-5', null);

    expect(agentGateway.scrapeUrl).toHaveBeenCalledWith({
      organizationId: 'organization-5',
      url: 'https://1688.com/item/55',
      triggeredByUserId: null,
    });
  });

  it('generateDetailPage is disabled until sourced candidates can be promoted to masters', async () => {
    await expect(
      service.generateDetailPage('prod-1', { mode: 'draft' }, 'organization-1'),
    ).rejects.toThrow('Sourcing detail-page Agent OS generation is disabled');

    expect(prisma.masterProduct.findFirst).not.toHaveBeenCalled();
    expect(agentGateway.generateDetailPage).not.toHaveBeenCalled();
  });
});
