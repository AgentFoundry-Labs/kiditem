import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderDetailPageData } from '@kiditem/templates';
import {
  DRAFT_ID,
  EMPTY_REGISTRATION_MEDIA,
  draftRoutes,
  salesProductDraft,
  sourcingCandidateResponse,
} from '@/test/fixtures/sales-product-draft';
import { ProductWorkspaceScreen } from './ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../hooks/useProductDetail';
import type { ContentWorkspaceSummary } from '../../lib/content-workspaces-api';
import { PLACEHOLDER_DATA } from '../../lib/product-workspace-types';

const {
  api,
  mobilePreviewProps,
  productEditHeaderProps,
  productTabContentProps,
} = vi.hoisted(() => ({
  api: { get: vi.fn(), getParsed: vi.fn(), patch: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
  mobilePreviewProps: [] as Array<{ detailHtml?: string | null }>,
  productEditHeaderProps: [] as Array<Record<string, unknown>>,
  productTabContentProps: [] as Array<Record<string, unknown>>,
}));

// 네트워크(apiClient)만 막는다. 초안 · 작업공간 · 상세 이력 조회는 진짜 훅이 만든다(B6).
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
  usePathname: () => `/product-pipeline/collected-products/${DRAFT_ID}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./detail/ProductEditHeader', () => ({
  default: (props: Record<string, unknown>) => {
    productEditHeaderProps.push(props);
    return <div data-testid="product-edit-header" />;
  },
}));

vi.mock('./ProductTabContent', () => ({
  default: ({
    onSaveThumbnailConfiguration,
    onCommitBasicInfo,
    onCommitMallRegisterValues,
    onApplyRegistrationDetailPage,
    selectedRegistrationThumbnailUrl,
    savedDetailPageGenerationId,
    selectedDetailPageSummary,
    canSaveThumbnailConfiguration,
    thumbnailPreviewImages,
  }: {
    onSaveThumbnailConfiguration?: (input: {
      thumbnailUrls: string[];
      selectedThumbnail: {
        url: string;
        kind: 'generated' | 'source';
        assetId: string | null;
        generatedGenerationId: string | null;
      } | null;
    }) => void;
    canSaveThumbnailConfiguration?: boolean;
    thumbnailPreviewImages?: string[];
    onCommitBasicInfo?: (input: {
      name?: string;
      salePrice?: number;
    }) => void;
    onCommitMallRegisterValues?: (input: {
      mallRegisterValues?: Record<string, Record<string, string>>;
      mallRegisterShared?: Record<string, string>;
    }) => void;
    onApplyRegistrationDetailPage?: (input: {
      selectedDetailPageGenerationId: string;
    }) => void;
    selectedRegistrationThumbnailUrl?: string | null;
    savedDetailPageGenerationId?: string | null;
    selectedDetailPageSummary?: { title?: string } | null;
  }) => {
    productTabContentProps.push({
      onCommitBasicInfo,
      onApplyRegistrationDetailPage,
      canSaveThumbnailConfiguration,
      thumbnailPreviewImages,
    });
    return <div>
      <div
        data-testid="product-tab-content"
        data-selected-thumbnail={selectedRegistrationThumbnailUrl ?? ''}
        data-selected-detail-generation={savedDetailPageGenerationId ?? ''}
        data-selected-detail-title={selectedDetailPageSummary?.title ?? ''}
        data-can-save-thumbnail={canSaveThumbnailConfiguration ? 'true' : 'false'}
      />
      <button
        type="button"
        onClick={() =>
          onSaveThumbnailConfiguration?.({
            thumbnailUrls: [
              'https://cdn.example.com/preview-1.jpg',
              'https://cdn.example.com/preview-2.jpg',
            ],
            selectedThumbnail: null,
          })
        }
      >
        mock-save-thumbnail-list
      </button>
      <button
        type="button"
        onClick={() =>
          onSaveThumbnailConfiguration?.({
            thumbnailUrls: ['https://cdn.example.com/generated.jpg'],
            selectedThumbnail: {
              url: 'https://cdn.example.com/generated.jpg',
              kind: 'generated',
              assetId: 'thumbnail-asset-1',
              generatedGenerationId: 'thumbnail-generation-1',
            },
          })
        }
      >
        mock-save-thumbnail
      </button>
      <button
        type="button"
        onClick={() =>
          onSaveThumbnailConfiguration?.({
            thumbnailUrls: ['https://cdn.example.com/source.jpg'],
            selectedThumbnail: {
              url: 'https://cdn.example.com/source.jpg',
              kind: 'source',
              assetId: null,
              generatedGenerationId: null,
            },
          })
        }
      >
        mock-save-source-thumbnail
      </button>
      <button
        type="button"
        onClick={() => onCommitBasicInfo?.({ name: '수정 상품명', salePrice: 13900 })}
      >
        mock-save-basic
      </button>
      <button
        type="button"
        disabled={!onCommitMallRegisterValues}
        onClick={() => onCommitMallRegisterValues?.({
          mallRegisterValues: { '11st': { categoryPath: '문구>팬시' } },
          mallRegisterShared: { certNumber: 'CB065R1579-2008' },
        })}
      >
        mock-save-mall-values
      </button>
      <button
        type="button"
        onClick={() => onApplyRegistrationDetailPage?.({
          selectedDetailPageGenerationId: 'detail-generation-1',
        })}
      >
        mock-apply-detail
      </button>
    </div>;
  },
}));

vi.mock('./preview/MobilePreview', () => ({
  default: (props: { detailHtml?: string | null }) => {
    mobilePreviewProps.push(props);
    return (
      <div
        data-testid="mobile-preview"
        data-has-detail-html={props.detailHtml ? 'true' : 'false'}
      />
    );
  },
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

const routes = draftRoutes();
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';

function workspaceSummary(overrides: Partial<ContentWorkspaceSummary> = {}): ContentWorkspaceSummary {
  return {
    id: WORKSPACE_ID,
    ownerType: 'sales_product',
    salesProductId: DRAFT_ID,
    channelListingId: null,
    normalizedTitle: null,
    status: 'active',
    href: '',
    detailPageCount: 0,
    latestDetailPageId: null,
    latestStatus: null,
    currentDetailPageId: null,
    currentDetailPageRevisionId: null,
    currentThumbnailAsset: null,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    history: [],
    ...overrides,
  };
}

function completedDetailPage(id: string, productInfo: Array<{ key: string; value: string }> = []) {
  return {
    id,
    productId: null,
    contentWorkspaceId: WORKSPACE_ID,
    templateId: 'bold-vertical',
    productName: '자석 다트게임',
    rawInput: {},
    result: { productInfo },
    imageUrls: [],
    processedImages: {},
    imageProcessingStatus: 'completed',
    imageProcessingError: null,
    createdAt: '2026-05-18T00:00:00.000Z',
  };
}

/**
 * 수집상품 화면 하나를 서버 응답으로 차린다. `workspace` 가 `null` 이면 초안에 콘텐츠가 아직 없다.
 * 모르는 GET 은 실패시킨다 — 화면이 묻지 말아야 할 것을 물으면 테스트가 드러낸다.
 */
function serveCollectedDraft(input: {
  workspace: ContentWorkspaceSummary | null;
  candidate?: Record<string, unknown>;
  detailPages?: ReturnType<typeof completedDetailPage>[];
  draft?: Parameters<typeof salesProductDraft>[0];
}) {
  api.getParsed.mockImplementation(async (url: string) => {
    if (url === routes.draft) return salesProductDraft(input.draft);
    throw new Error(`unexpected getParsed ${url}`);
  });
  api.get.mockImplementation(async (url: string) => {
    if (url === routes.candidate) return sourcingCandidateResponse(input.candidate);
    if (url === routes.media) return EMPTY_REGISTRATION_MEDIA;
    if (url === routes.workspace) return { workspace: input.workspace };
    if (url.startsWith('/api/ai/detail-page?')) {
      const params = new URL(url, 'http://kiditem.local').searchParams;
      if (params.get('contentWorkspaceId') !== WORKSPACE_ID) throw new Error(`unscoped detail list ${url}`);
      return (input.detailPages ?? []).filter((page) => page.templateId === params.get('templateId'));
    }
    if (/^\/api\/ai\/detail-page\/[^/]+\/edited-html$/.test(url)) return { html: null, savedAt: null };
    throw new Error(`unexpected get ${url}`);
  });
}

function detailPageRequests(): string[] {
  return api.get.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/ai/detail-page?'));
}

function renderCollected() {
  return renderWithQueryClient(
    <ProductWorkspaceScreen
      productId={DRAFT_ID}
      backHref="/product-pipeline/collected-products"
      selfHref={`/product-pipeline/collected-products/${DRAFT_ID}`}
    />,
  );
}

const listingWorkspaceData: ProductWorkspaceData = {
  product: {
    id: 'listing-1',
    name: '테스트 상품',
    raw_data: null,
    image_urls: [],
    thumbnail_url: null,
    status: null,
    sourceRecordId: null,
    salesProductId: null,
    salesProductVersion: null,
  } as ProductWorkspaceData['product'],
  detailPageData: placeholderDetailPageData,
  templateCss: '',
  editState: {
    ...PLACEHOLDER_DATA,
    name: '테스트 상품',
    thumbnails: ['https://cdn.example.com/source.jpg'],
  },
};

function renderListing() {
  return renderWithQueryClient(
    <ProductWorkspaceScreen
      productId="listing-1"
      backHref="/product-pipeline/registered-products"
      selfHref="/product-pipeline/registered-products/listing-1"
      initialWorkspaceData={listingWorkspaceData}
      initialAgentHistory={[]}
      generationHistoryQueryEnabled={false}
      listingContentWorkspaceId="workspace-1"
    />,
  );
}

describe('ProductWorkspaceScreen — 수집상품(판매상품 초안) 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobilePreviewProps.length = 0;
    productEditHeaderProps.length = 0;
    productTabContentProps.length = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
    api.patch.mockResolvedValue(salesProductDraft({ version: 2 }));
    api.put.mockResolvedValue(salesProductDraft({ version: 2 }));
  });

  it('finds the draft’s workspace through the sales product and scopes every content read to it (B6)', async () => {
    serveCollectedDraft({ workspace: workspaceSummary() });
    renderCollected();

    await waitFor(() => expect(productEditHeaderProps.at(-1)?.detailGenerationContentWorkspaceId).toBe(WORKSPACE_ID));
    await waitFor(() => expect(detailPageRequests().length).toBeGreaterThan(0));
    for (const url of detailPageRequests()) {
      const params = new URL(url, 'http://kiditem.local').searchParams;
      expect(params.get('contentWorkspaceId')).toBe(WORKSPACE_ID);
      expect(params.has('sourceRecordId')).toBe(false);
      expect(params.has('productId')).toBe(false);
    }
    expect(screen.getByTestId('product-tab-content')).toHaveAttribute('data-can-save-thumbnail', 'true');
  });

  it('with no workspace yet, reads no detail pages and saves no KC number (B1)', async () => {
    serveCollectedDraft({ workspace: null });
    renderCollected();

    await screen.findByTestId('product-tab-content');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(routes.workspace));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(detailPageRequests()).toEqual([]);
    expect(api.patch).not.toHaveBeenCalled();
    expect(productEditHeaderProps.at(-1)?.detailGenerationContentWorkspaceId).toBeNull();
  });

  it('fills KC only from this workspace’s own detail pages', async () => {
    serveCollectedDraft({
      workspace: workspaceSummary(),
      detailPages: [completedDetailPage('detail-generation-1', [{ key: 'KC 인증번호', value: 'CB123R456-7001' }])],
    });
    renderCollected();

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      routes.draft,
      expect.objectContaining({ kcStatus: 'exists', certifications: [{ number: 'CB123R456-7001' }] }),
    ));
  });

  it('opens 대표 썸네일 저장 and 등록 상세페이지 적용 only once the workspace exists (B5)', async () => {
    serveCollectedDraft({ workspace: null });
    const { unmount } = renderCollected();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(routes.workspace));
    await waitFor(() => expect(screen.getByTestId('product-tab-content')).toHaveAttribute('data-can-save-thumbnail', 'false'));
    expect(productTabContentProps.at(-1)?.onApplyRegistrationDetailPage).toBeUndefined();
    unmount();

    serveCollectedDraft({ workspace: workspaceSummary() });
    renderCollected();
    await waitFor(() => expect(screen.getByTestId('product-tab-content')).toHaveAttribute('data-can-save-thumbnail', 'true'));
    expect(productTabContentProps.at(-1)?.onApplyRegistrationDetailPage).toBeDefined();
  });

  it('persists the preview list and then the representative to the draft’s workspace', async () => {
    let resolveGallery!: (value: unknown) => void;
    const galleryPromise = new Promise((resolve) => {
      resolveGallery = resolve;
    });
    api.put.mockImplementation((url: string) => (
      url.endsWith('/thumbnail-gallery') ? galleryPromise : Promise.resolve({})
    ));
    api.patch.mockResolvedValue(workspaceSummary());
    serveCollectedDraft({ workspace: workspaceSummary() });
    renderCollected();

    await waitFor(() => expect(screen.getByTestId('product-tab-content')).toHaveAttribute('data-can-save-thumbnail', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'mock-save-thumbnail' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      `/api/ai/content-workspaces/${WORKSPACE_ID}/thumbnail-gallery`,
      { thumbnailUrls: ['https://cdn.example.com/generated.jpg'] },
    ));
    // 목록이 아직 저장 중이면 대표 선택은 시작하지 않는다.
    expect(api.patch).not.toHaveBeenCalled();
    resolveGallery({ thumbnailUrls: ['https://cdn.example.com/generated.jpg'] });

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `/api/ai/content-workspaces/${WORKSPACE_ID}/current-thumbnail`,
      { assetId: 'thumbnail-asset-1' },
    ));
  });

  it('adopts a source image by the asset the gallery save wrote for its URL', async () => {
    api.put.mockResolvedValue({ thumbnailUrls: ['https://cdn.example.com/source.jpg'] });
    api.patch.mockResolvedValue({ id: 'gallery-asset-1', isCurrentThumbnail: true });
    serveCollectedDraft({ workspace: workspaceSummary() });
    renderCollected();
    const baseGet = api.get.getMockImplementation();
    api.get.mockImplementation((url: string) => (
      url === `/api/ai/content-workspaces/${WORKSPACE_ID}/thumbnail-gallery`
        ? Promise.resolve([{ id: 'gallery-asset-1', url: 'https://cdn.example.com/source.jpg', source: 'upload' }])
        : baseGet!(url)
    ));

    await waitFor(() => expect(screen.getByTestId('product-tab-content')).toHaveAttribute('data-can-save-thumbnail', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'mock-save-source-thumbnail' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `/api/ai/content-workspaces/${WORKSPACE_ID}/current-thumbnail`,
      { assetId: 'gallery-asset-1' },
    ));
  });

  it('saves basics to the sales-product draft, keeping its identity across saves', async () => {
    serveCollectedDraft({ workspace: null });
    renderCollected();

    const saveButton = await screen.findByRole('button', { name: 'mock-save-basic' });
    await waitFor(() => expect(productTabContentProps.at(-1)?.onCommitBasicInfo).toBeDefined());
    fireEvent.click(saveButton);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(routes.draft, { expectedVersion: 1, name: '수정 상품명' }));
    // salePrice 는 옵션에 있다 — 옵션을 다시 읽어 새 값을 싣는다.
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      `${routes.draft}/options`,
      expect.objectContaining({ options: [expect.objectContaining({ salePrice: 13900 })] }),
    ));
  });

  it('reads no registration target from the source record — a source record carries none (KID-313)', async () => {
    serveCollectedDraft({
      workspace: workspaceSummary(),
      candidate: {
        registrationTarget: {
          id: 'prep-1',
          sourceRecordId: 'candidate-1',
          channelAccountId: 'account-1',
          channelListingId: 'listing-1',
          status: 'registered',
          selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
          selectedThumbnailGenerationId: 'thumb-generation-1',
          selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
          selectedDetailPageGenerationId: 'detail-generation-1',
          updatedAt: '2026-05-20T01:02:03.000Z',
        },
      },
    });
    renderCollected();

    await screen.findByTestId('product-tab-content');
    // 원본 기록 응답에 무엇이 실려 와도 등록 설정은 원본 기록에서 읽지 않는다.
    await waitFor(() => expect(productEditHeaderProps.at(-1)?.registrationTarget).toBeNull());
    expect(productEditHeaderProps.at(-1)?.selectedThumbnailGenerationId).not.toBe('thumb-generation-1');
    expect(productEditHeaderProps.at(-1)?.detailGenerationContentWorkspaceId).toBe(WORKSPACE_ID);
  });

  it('shows the workspace’s own detail-page history in the summary and the side preview', async () => {
    serveCollectedDraft({
      workspace: workspaceSummary({
        currentDetailPageId: 'detail-generation-1',
        history: [{
          id: 'detail-generation-1',
          source: 'generated',
          status: 'ready',
          title: '등록에 사용할 상세페이지 버전',
          templateId: 'bold-vertical',
          generationInput: null,
          detailPageData: placeholderDetailPageData as unknown as Record<string, unknown>,
          imageUrls: [],
          processedImages: {},
          currentRevisionId: null,
          errorMessage: null,
          href: '',
          createdAt: '2026-05-17T06:05:56.000Z',
          updatedAt: '2026-05-17T06:05:56.000Z',
        }],
      }),
    });
    renderCollected();

    await waitFor(() => expect(screen.getByTestId('mobile-preview')).toHaveAttribute('data-has-detail-html', 'true'));
    expect(mobilePreviewProps.at(-1)?.detailHtml).toContain('<!DOCTYPE html>');
  });
});

describe('ProductWorkspaceScreen — 등록상품(리스팅) 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productTabContentProps.length = 0;
    api.get.mockResolvedValue({ html: null, savedAt: null });
    api.patch.mockResolvedValue({ id: 'workspace-1' });
    api.put.mockResolvedValue({ thumbnailUrls: [] });
  });

  it('is read-only for basics but keeps the listing workspace’s content actions', async () => {
    renderListing();

    await screen.findByTestId('product-tab-content');
    expect(productTabContentProps.at(-1)?.onCommitBasicInfo).toBeUndefined();
    expect(productTabContentProps.at(-1)?.onApplyRegistrationDetailPage).toBeDefined();
    // 초안이 없으니 초안 작업공간을 묻지 않는다.
    expect(api.get.mock.calls.some(([url]) => String(url).includes('by-sales-product'))).toBe(false);
  });

  it('persists a registered representative thumbnail through the listing workspace', async () => {
    renderListing();

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/ai/content-workspaces/workspace-1/current-thumbnail',
      { assetId: 'thumbnail-asset-1' },
    ));
  });
});
