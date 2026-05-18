import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderDetailPageData } from '@kiditem/templates';
import { ProductWorkspaceScreen } from './ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../hooks/useProductDetail';
import { PLACEHOLDER_DATA } from '../../lib/product-workspace-types';

const { apiClientPatchMock, mobilePreviewProps, useGenerationHistoryMock, useProductDetailMock } = vi.hoisted(() => ({
  apiClientPatchMock: vi.fn(),
  mobilePreviewProps: [] as Array<{ detailHtml?: string | null }>,
  useGenerationHistoryMock: vi.fn(),
  useProductDetailMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ html: null, savedAt: null })),
    patch: (...args: unknown[]) => apiClientPatchMock(...args),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/product-pipeline/collected-products/candidate-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../hooks/useProductDetail', () => ({
  useProductDetail: (...args: unknown[]) => useProductDetailMock(...args),
}));

vi.mock('../../hooks/useGenerationHistory', () => ({
  useGenerationHistory: (...args: unknown[]) => useGenerationHistoryMock(...args),
}));

vi.mock('../../hooks/useGenerateSourcingThumbnail', () => ({
  useSourcingThumbnailGenerations: () => ({ data: [] }),
}));

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate',
  () => ({
    useAllGenerationsInProgress: () => [],
    useBoldVerticalGenerationList: () => ({ data: [] }),
    useKidsPlayfulGenerationCancel: () => ({ mutateAsync: vi.fn() }),
    useKidsPlayfulGenerationList: () => ({ data: [] }),
  }),
);

vi.mock('./detail/ProductEditHeader', () => ({
  default: () => <div data-testid="product-edit-header" />,
}));

vi.mock('./ProductTabContent', () => ({
  default: ({
    onSaveThumbnailConfiguration,
    selectedRegistrationThumbnailUrl,
    savedDetailPageGenerationId,
    selectedDetailPageSummary,
  }: {
    onSaveThumbnailConfiguration?: (input: {
      thumbnailUrls: string[];
      selectedThumbnail: {
        url: string;
        kind: 'source';
        generatedCandidateId: null;
      };
    }) => void;
    selectedRegistrationThumbnailUrl?: string | null;
    savedDetailPageGenerationId?: string | null;
    selectedDetailPageSummary?: { title?: string } | null;
  }) => (
    <div>
      <div
        data-testid="product-tab-content"
        data-selected-thumbnail={selectedRegistrationThumbnailUrl ?? ''}
        data-selected-detail-generation={savedDetailPageGenerationId ?? ''}
        data-selected-detail-title={selectedDetailPageSummary?.title ?? ''}
      />
      <button
        type="button"
        onClick={() =>
          onSaveThumbnailConfiguration?.({
            thumbnailUrls: ['https://cdn.example.com/source.jpg'],
            selectedThumbnail: {
              url: 'https://cdn.example.com/source.jpg',
              kind: 'source',
              generatedCandidateId: null,
            },
          })
        }
      >
        mock-save-thumbnail
      </button>
    </div>
  ),
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

const workspaceData: ProductWorkspaceData = {
  product: {
    id: 'candidate-1',
    name: '테스트 상품',
    raw_data: null,
    image_urls: [],
    thumbnail_url: null,
    status: 'collected',
  } as ProductWorkspaceData['product'],
  detailPageData: placeholderDetailPageData,
  editedHtml: null,
  templateCss: '',
  editState: {
    ...PLACEHOLDER_DATA,
    name: '테스트 상품',
    thumbnails: ['https://cdn.example.com/source.jpg'],
  },
};

describe('ProductWorkspaceScreen', () => {
  beforeEach(() => {
    apiClientPatchMock.mockReset();
    mobilePreviewProps.length = 0;
    useGenerationHistoryMock.mockReturnValue({ data: [] });
    useProductDetailMock.mockReset();
  });

  it('keeps hook order stable when product data loads after the loading view', async () => {
    useProductDetailMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
    });

    const { rerender } = renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByText(/상품 정보를 불러오고 있습니다/)).toBeInTheDocument();

    useProductDetailMock.mockReturnValue({
      data: workspaceData,
      error: null,
      isLoading: false,
    });

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('product-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-preview')).toBeInTheDocument();
  });

  it('initializes registration selection from the current product preparation', async () => {
    const selectedWorkspaceData: ProductWorkspaceData = {
      ...workspaceData,
      product: {
        ...workspaceData.product,
        productPreparation: {
          id: 'prep-1',
          sourceCandidateId: 'candidate-1',
          masterId: 'master-1',
          contentWorkspaceId: 'workspace-1',
          status: 'product_registered',
          selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
          selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
          selectedDetailPageGenerationId: 'detail-generation-1',
          selectedDetailPageArtifactId: 'artifact-1',
          selectedDetailPageRevisionId: 'revision-1',
        },
      } as ProductWorkspaceData['product'],
    };
    useProductDetailMock.mockReturnValue({
      data: selectedWorkspaceData,
      error: null,
      isLoading: false,
    });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    const tab = await screen.findByTestId('product-tab-content');
    expect(tab).toHaveAttribute('data-selected-thumbnail', 'https://cdn.example.com/generated-thumb.png');
    expect(tab).toHaveAttribute('data-selected-detail-generation', 'detail-generation-1');
  });

  it('passes the selected detail page version summary into the basic tab content', async () => {
    useGenerationHistoryMock.mockReturnValue({
      data: [
        {
          id: 'detail-generation-1',
          generatedTitle: '등록에 사용할 상세페이지 버전',
          status: 'COMPLETED',
          templateId: 'bold-vertical',
          detailPageData: null,
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: 'revision-1',
          errorMessage: null,
          productId: 'candidate-1',
          createdAt: '2026-05-17T06:05:56.000Z',
        },
      ],
    });
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          productPreparation: {
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            masterId: null,
            contentWorkspaceId: 'workspace-1',
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: 'detail-generation-1',
            selectedDetailPageArtifactId: 'artifact-1',
            selectedDetailPageRevisionId: 'revision-1',
          },
        } as ProductWorkspaceData['product'],
      },
      error: null,
      isLoading: false,
    });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    const tab = await screen.findByTestId('product-tab-content');
    expect(tab).toHaveAttribute('data-selected-detail-title', '등록에 사용할 상세페이지 버전');
  });

  it('passes selected detail page html into the side mobile preview', async () => {
    useGenerationHistoryMock.mockReturnValue({
      data: [
        {
          id: 'detail-generation-1',
          generatedTitle: '등록에 사용할 상세페이지 버전',
          status: 'COMPLETED',
          templateId: 'bold-vertical',
          detailPageData: placeholderDetailPageData,
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: 'revision-1',
          errorMessage: null,
          productId: 'candidate-1',
          createdAt: '2026-05-17T06:05:56.000Z',
        },
      ],
    });
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          productPreparation: {
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            masterId: null,
            contentWorkspaceId: 'workspace-1',
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: 'detail-generation-1',
            selectedDetailPageArtifactId: 'artifact-1',
            selectedDetailPageRevisionId: 'revision-1',
          },
        } as ProductWorkspaceData['product'],
      },
      error: null,
      isLoading: false,
    });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(await screen.findByTestId('mobile-preview')).toHaveAttribute(
      'data-has-detail-html',
      'true',
    );
    expect(mobilePreviewProps.at(-1)?.detailHtml).toContain('<!DOCTYPE html>');
  });

  it('waits for thumbnail preview order persistence before registering the representative', async () => {
    let resolveBasicInfo!: (value: unknown) => void;
    const basicInfoPromise = new Promise((resolve) => {
      resolveBasicInfo = resolve;
    });
    apiClientPatchMock.mockImplementation((url: string) => {
      if (url.includes('/preparation/basic-info')) return basicInfoPromise;
      return Promise.resolve({});
    });
    useProductDetailMock.mockReturnValue({
      data: workspaceData,
      error: null,
      isLoading: false,
    });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail' }));

    await waitFor(() => {
      expect(apiClientPatchMock).toHaveBeenCalledTimes(1);
    });
    expect(apiClientPatchMock.mock.calls[0][0]).toContain('/preparation/basic-info');

    resolveBasicInfo({});

    await waitFor(() => {
      expect(apiClientPatchMock).toHaveBeenCalledTimes(2);
    });
    expect(apiClientPatchMock.mock.calls[1][0]).toContain('/preparation/thumbnail');
  });
});
