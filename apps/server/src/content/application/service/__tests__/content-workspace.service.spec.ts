import { describe, expect, it, vi } from 'vitest';
import type { ContentWorkspaceLifecycleRepositoryPort } from '../../port/out/repository/content-workspace-lifecycle.repository.port';
import type { DetailPageRepositoryPort } from '../../port/out/repository/detail-page.repository.port';
import { ContentWorkspaceService } from '../content-workspace.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const DETAIL_PAGE_ID = '55555555-5555-4555-8555-555555555555';

function repository(
  overrides: Partial<ContentWorkspaceLifecycleRepositoryPort> = {},
): ContentWorkspaceLifecycleRepositoryPort {
  return {
    ensureActiveWorkspace: vi.fn(),
    findActiveSalesProductWorkspaceId: vi.fn(),
    findDuplicateByNormalizedTitle: vi.fn(),
    getById: vi.fn(),
    listActive: vi.fn(),
    archive: vi.fn(),
    ...overrides,
  } as ContentWorkspaceLifecycleRepositoryPort;
}

function detailPages(overrides: Partial<DetailPageRepositoryPort> = {}): DetailPageRepositoryPort {
  return {
    runInTransaction: vi.fn(async (work) => work({} as never)),
    findById: vi.fn(),
    setCurrentRevision: vi.fn(),
    ...overrides,
  } as unknown as DetailPageRepositoryPort;
}

function service(repo: ContentWorkspaceLifecycleRepositoryPort, pages = detailPages()) {
  return new ContentWorkspaceService(repo, pages);
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    organizationId: ORG,
    ownerType: 'direct_detail_page',
    salesProductId: null,
    channelListingId: null,
    normalizedTitle: '키즈텀블러',
    status: 'active',
    currentDetailPageRevisionId: REVISION_ID,
    currentThumbnailAsset: null,
    createdByUserId: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-05-12T01:00:00.000Z'),
    updatedAt: new Date('2026-05-12T03:00:00.000Z'),
    currentDetailPageRevision: {
      id: REVISION_ID,
      detailPageId: DETAIL_PAGE_ID,
      revisionType: 'manual_edit',
      createdAt: new Date('2026-05-12T02:00:00.000Z'),
    },
    _count: { detailPages: 2 },
    detailPages: [
      detailPage({ id: 'page-new', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
      detailPage({ id: 'page-old', updatedAt: new Date('2026-05-12T02:00:00.000Z') }),
    ],
    ...overrides,
  };
}

function detailPage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-1',
    source: 'generated',
    status: 'ready',
    title: '키즈 텀블러 상세',
    templateId: 'bold-vertical',
    generationInput: {
      rawTitle: '키즈 텀블러',
      imageUrls: ['https://example.com/input.jpg'],
    },
    generationResult: {
      templateId: 'bold-vertical',
      result: { hook: { text: '키즈 텀블러' } },
      imageUrls: ['https://example.com/input.jpg'],
      processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
    },
    errorMessage: null,
    currentRevisionId: null,
    createdAt: new Date('2026-05-12T01:30:00.000Z'),
    updatedAt: new Date('2026-05-12T02:00:00.000Z'),
    ...overrides,
  };
}

describe('ContentWorkspaceService', () => {
  it('creates a channel-listing workspace owner without a title and projects its listing', async () => {
    const repo = repository({
      ensureActiveWorkspace: vi.fn().mockResolvedValue({ id: WORKSPACE_ID }),
      getById: vi.fn().mockResolvedValue(workspace({
        ownerType: 'channel_listing',
        channelListingId: 'listing-1',
        normalizedTitle: null,
        currentThumbnailAsset: { id: 'asset-1', url: 'https://cdn.example.com/thumb.png' },
      })),
    });
    const contentWorkspaces = service(repo);

    await contentWorkspaces.createWorkspace({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: 'Kids rain boots',
      salesProductId: null,
      channelListingId: 'listing-1',
    });

    expect(repo.ensureActiveWorkspace).toHaveBeenCalledWith({
      organizationId: ORG,
      ownerType: 'channel_listing',
      salesProductId: null,
      channelListingId: 'listing-1',
      normalizedTitle: null,
      createdByUserId: 'user-1',
    });
    const summary = await contentWorkspaces.get(ORG, WORKSPACE_ID);
    expect(summary).toMatchObject({
      channelListingId: 'listing-1',
      normalizedTitle: null,
      currentThumbnailAsset: { id: 'asset-1', url: 'https://cdn.example.com/thumb.png' },
    });
    expect(summary).not.toHaveProperty('displayName');
    expect(summary).not.toHaveProperty('originWorkspaceId');
  });

  it('keys only a product-less direct workspace by its normalized title', async () => {
    const repo = repository({ ensureActiveWorkspace: vi.fn().mockResolvedValue({ id: WORKSPACE_ID }) });
    const contentWorkspaces = service(repo);

    await expect(contentWorkspaces.ensureForGeneration({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: ' 키즈   터치등 ',
      salesProductId: null,
    })).resolves.toEqual({ id: WORKSPACE_ID });
    await contentWorkspaces.ensureForGeneration({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: '키즈 터치등',
      salesProductId: 'product-1',
    });

    expect(repo.ensureActiveWorkspace).toHaveBeenNthCalledWith(1, {
      organizationId: ORG,
      ownerType: 'direct_detail_page',
      salesProductId: null,
      channelListingId: null,
      normalizedTitle: '키즈터치등',
      createdByUserId: 'user-1',
    });
    expect(repo.ensureActiveWorkspace).toHaveBeenNthCalledWith(2, {
      organizationId: ORG,
      ownerType: 'sales_product',
      salesProductId: 'product-1',
      channelListingId: null,
      normalizedTitle: null,
      createdByUserId: 'user-1',
    });
  });

  it('creates a content workspace without detail pages', async () => {
    const repo = repository({
      ensureActiveWorkspace: vi.fn().mockResolvedValue({ id: WORKSPACE_ID }),
      getById: vi.fn().mockResolvedValue(workspace({
        normalizedTitle: '키즈컵',
        currentDetailPageRevisionId: null,
        currentDetailPageRevision: null,
        detailPages: [],
        _count: { detailPages: 0 },
      })),
    });

    await expect(service(repo).createWorkspace({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: '키즈 컵',
      salesProductId: null,
    })).resolves.toMatchObject({
      id: WORKSPACE_ID,
      normalizedTitle: '키즈컵',
      detailPageCount: 0,
      latestDetailPageId: null,
      latestStatus: null,
      currentDetailPageId: null,
      currentDetailPageRevisionId: null,
      history: [],
    });
  });

  it('finds duplicate normalized titles without expanding detail-page history', async () => {
    const repo = repository({
      findDuplicateByNormalizedTitle: vi.fn().mockResolvedValue(workspace()),
    });

    await expect(service(repo).checkDuplicate(ORG, '  키즈   텀블러  ')).resolves.toMatchObject({
      exists: true,
      workspace: {
        id: WORKSPACE_ID,
        normalizedTitle: '키즈텀블러',
        detailPageCount: 2,
        latestDetailPageId: null,
        history: [],
        currentDetailPageId: DETAIL_PAGE_ID,
        currentDetailPageRevisionId: REVISION_ID,
      },
    });
    expect(repo.findDuplicateByNormalizedTitle).toHaveBeenCalledWith({ organizationId: ORG, normalizedTitle: '키즈텀블러' });
  });

  it('lists a workspace as one card whose history rows are its detail pages, keyed by detail page id', async () => {
    const repo = repository({
      listActive: vi.fn().mockResolvedValue({
        total: 1,
        rows: [
          workspace({
            detailPages: [
              detailPage({ id: 'page-new', status: 'ready', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
              detailPage({
                id: 'page-old',
                source: 'uploaded',
                status: 'ready',
                generationResult: {},
                currentRevisionId: REVISION_ID,
                updatedAt: new Date('2026-05-12T02:00:00.000Z'),
              }),
            ],
          }),
        ],
      }),
    });

    await expect(service(repo).list(ORG)).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: WORKSPACE_ID,
          href: `/product-pipeline/registered-products/${WORKSPACE_ID}`,
          detailPageCount: 2,
          latestDetailPageId: 'page-new',
          latestStatus: 'ready',
          history: [
            {
              id: 'page-new',
              source: 'generated',
              status: 'ready',
              detailPageData: { hook: { text: '키즈 텀블러' } },
              imageUrls: ['https://example.com/input.jpg'],
              processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
              href: `/product-pipeline/detail-pages/page-new/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${WORKSPACE_ID}`,
            },
            { id: 'page-old', source: 'uploaded', detailPageData: null, currentRevisionId: REVISION_ID },
          ],
        },
      ],
    });
    expect(repo.listActive).toHaveBeenCalledWith({
      organizationId: ORG, status: 'active', normalizedTitle: null, page: 1, limit: 24,
    });
  });

  it('selects a detail page as the current one by moving the pointer to that page\'s current revision', async () => {
    const selectedRevisionId = '77777777-7777-4777-8777-777777777777';
    const repo = repository({ getById: vi.fn().mockResolvedValue(workspace()) });
    const pages = detailPages({
      findById: vi.fn().mockResolvedValue({ id: DETAIL_PAGE_ID, contentWorkspaceId: WORKSPACE_ID, currentRevisionId: selectedRevisionId }),
    });

    await service(repo, pages).selectCurrentDetailPage({ organizationId: ORG, workspaceId: WORKSPACE_ID, detailPageId: DETAIL_PAGE_ID });

    expect(pages.setCurrentRevision).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG, contentWorkspaceId: WORKSPACE_ID, revisionId: selectedRevisionId,
    });
  });

  it('refuses to select a page of another workspace or a page with nothing saved yet', async () => {
    const repo = repository({ getById: vi.fn().mockResolvedValue(workspace()) });
    const foreign = detailPages({
      findById: vi.fn().mockResolvedValue({ id: DETAIL_PAGE_ID, contentWorkspaceId: 'other-workspace', currentRevisionId: REVISION_ID }),
    });
    const unsaved = detailPages({
      findById: vi.fn().mockResolvedValue({ id: DETAIL_PAGE_ID, contentWorkspaceId: WORKSPACE_ID, currentRevisionId: null }),
    });
    const input = { organizationId: ORG, workspaceId: WORKSPACE_ID, detailPageId: DETAIL_PAGE_ID };

    await expect(service(repo, foreign).selectCurrentDetailPage(input)).rejects.toThrow('Detail page not found');
    await expect(service(repo, unsaved).selectCurrentDetailPage(input)).rejects.toThrow('Detail page has no saved revision yet');
    expect(foreign.setCurrentRevision).not.toHaveBeenCalled();
    expect(unsaved.setCurrentRevision).not.toHaveBeenCalled();
  });
});

describe('ContentWorkspaceService.getForSalesProduct', () => {
  const SALES_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';

  it('answers null for a draft that has no workspace yet, without creating one', async () => {
    const repo = repository({ findActiveSalesProductWorkspaceId: vi.fn().mockResolvedValue(null) });
    const contentWorkspaces = service(repo);

    await expect(contentWorkspaces.getForSalesProduct(ORG, SALES_PRODUCT_ID)).resolves.toEqual({ workspace: null });
    expect(repo.ensureActiveWorkspace).not.toHaveBeenCalled();
    expect(repo.getById).not.toHaveBeenCalled();
  });

  it('returns the summary of the draft workspace', async () => {
    const repo = repository({
      findActiveSalesProductWorkspaceId: vi.fn().mockResolvedValue(WORKSPACE_ID),
      getById: vi.fn().mockResolvedValue(workspace({ ownerType: 'sales_product', salesProductId: SALES_PRODUCT_ID })),
    });
    const contentWorkspaces = service(repo);

    const result = await contentWorkspaces.getForSalesProduct(ORG, SALES_PRODUCT_ID);
    expect(result.workspace).toMatchObject({ id: WORKSPACE_ID, salesProductId: SALES_PRODUCT_ID });
    expect(repo.findActiveSalesProductWorkspaceId).toHaveBeenCalledWith({ organizationId: ORG, salesProductId: SALES_PRODUCT_ID });
  });
});
