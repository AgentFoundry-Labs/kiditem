import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderDetailPageData } from '@kiditem/templates';
import { ProductWorkspaceScreen } from './ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../hooks/useProductDetail';
import { PLACEHOLDER_DATA } from '../../lib/product-workspace-types';

const {
  apiClientPatchMock,
  mobilePreviewProps,
  productEditHeaderProps,
  productTabContentProps,
  useGenerationHistoryMock,
  useProductDetailMock,
} = vi.hoisted(() => ({
  apiClientPatchMock: vi.fn(),
  mobilePreviewProps: [] as Array<{ detailHtml?: string | null }>,
  productEditHeaderProps: [] as Array<Record<string, unknown>>,
  productTabContentProps: [] as Array<Record<string, unknown>>,
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
  default: (props: Record<string, unknown>) => {
    productEditHeaderProps.push(props);
    return <div data-testid="product-edit-header" />;
  },
}));

vi.mock('./ProductTabContent', () => ({
  default: ({
    onSaveThumbnailConfiguration,
    onCommitBasicInfo,
    onApplyRegistrationDetailPage,
    selectedRegistrationThumbnailUrl,
    savedDetailPageGenerationId,
    selectedDetailPageSummary,
  }: {
    onSaveThumbnailConfiguration?: (input: {
      thumbnailUrls: string[];
      selectedThumbnail: {
        url: string;
        kind: 'generated';
        generatedGenerationId: string;
        generatedCandidateId: string;
      };
    }) => void;
    onCommitBasicInfo?: (input: {
      name?: string;
      salePrice?: number;
    }) => void;
    onApplyRegistrationDetailPage?: (input: {
      selectedDetailPageGenerationId: string;
    }) => void;
    selectedRegistrationThumbnailUrl?: string | null;
    savedDetailPageGenerationId?: string | null;
    selectedDetailPageSummary?: { title?: string } | null;
  }) => {
    productTabContentProps.push({ onCommitBasicInfo, onApplyRegistrationDetailPage });
    return <div>
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
            thumbnailUrls: ['https://cdn.example.com/generated.jpg'],
            selectedThumbnail: {
              url: 'https://cdn.example.com/generated.jpg',
              kind: 'generated',
              generatedGenerationId: 'thumbnail-generation-1',
              generatedCandidateId: 'thumbnail-candidate-1',
            },
          })
        }
      >
        mock-save-thumbnail
      </button>
      <button
        type="button"
        onClick={() => onCommitBasicInfo?.({ name: '수정 상품명', salePrice: 13900 })}
      >
        mock-save-basic
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

const workspaceData: ProductWorkspaceData = {
  product: {
    id: 'candidate-1',
    name: '테스트 상품',
    raw_data: null,
    image_urls: [],
    thumbnail_url: null,
    status: 'sourced',
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
    productEditHeaderProps.length = 0;
    productTabContentProps.length = 0;
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
          channelAccountId: 'account-1',
          sourceContentWorkspaceId: 'workspace-1',
          channelListingId: 'listing-1',
          status: 'registered',
          selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
          selectedThumbnailGenerationId: 'thumb-generation-1',
          selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
          selectedDetailPageGenerationId: 'detail-generation-1',
          selectedDetailPageArtifactId: 'artifact-1',
          selectedDetailPageRevisionId: 'revision-1',
          updatedAt: '2026-05-20T01:02:03.000Z',
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
    expect(productEditHeaderProps.at(-1)?.productPreparation).toBe(
      selectedWorkspaceData.product.productPreparation,
    );
    expect(productEditHeaderProps.at(-1)?.detailGenerationContentWorkspaceId).toBe('workspace-1');
    expect(productEditHeaderProps.at(-1)?.selectedThumbnailGenerationId).toBe(
      'thumb-generation-1',
    );
    expect(productEditHeaderProps.at(-1)).not.toHaveProperty('promotedMasterId');
  });

  it('saves basic information through the canonical preparation endpoint', async () => {
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          productPreparation: {
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            channelAccountId: null,
            sourceContentWorkspaceId: null,
            channelListingId: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: null,
            selectedDetailPageArtifactId: null,
            selectedDetailPageRevisionId: null,
            updatedAt: '2026-05-20T01:02:03.000Z',
          },
        } as ProductWorkspaceData['product'],
      },
      error: null,
      isLoading: false,
    });
    apiClientPatchMock.mockResolvedValue({ id: 'prep-1' });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-basic' }));

    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
      '/api/sourcing/preparations/prep-1',
      {
        displayName: '수정 상품명',
        registrationInput: {
          name: '수정 상품명',
          salePrice: 13900,
        },
        basePreparationUpdatedAt: '2026-05-20T01:02:03.000Z',
      },
    ));
  });

  it('keeps consecutive basic saves on the same preparation identity', async () => {
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          productPreparation: {
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            channelAccountId: null,
            sourceContentWorkspaceId: null,
            channelListingId: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: null,
            selectedDetailPageArtifactId: null,
            selectedDetailPageRevisionId: null,
            updatedAt: '2026-05-20T01:02:03.000Z',
          },
        } as ProductWorkspaceData['product'],
      },
      error: null,
      isLoading: false,
    });
    apiClientPatchMock
      .mockResolvedValueOnce({ id: 'prep-1', updatedAt: '2026-05-20T01:02:04.000Z' })
      .mockResolvedValueOnce({ id: 'prep-1', updatedAt: '2026-05-20T01:02:05.000Z' });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    const saveButton = await screen.findByRole('button', { name: 'mock-save-basic' });
    fireEvent.click(saveButton);
    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(saveButton);
    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledTimes(2));

    expect(apiClientPatchMock.mock.calls[1]).toEqual([
      '/api/sourcing/preparations/prep-1',
      {
        displayName: '수정 상품명',
        registrationInput: {
          name: '수정 상품명',
          salePrice: 13900,
        },
        basePreparationUpdatedAt: '2026-05-20T01:02:03.000Z',
      },
    ]);
  });

  it('does not expose preparation-only basic or detail persistence without a preparation', async () => {
    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="listing-1"
        backHref="/product-pipeline/registered-products"
        selfHref="/product-pipeline/registered-products/listing-1"
        initialWorkspaceData={workspaceData}
        contentWorkspaceId="workspace-1"
        showCandidateActions={false}
      />,
    );

    await screen.findByTestId('product-tab-content');
    expect(productTabContentProps.at(-1)?.onCommitBasicInfo).toBeUndefined();
    expect(productTabContentProps.at(-1)?.onApplyRegistrationDetailPage).toBeUndefined();
  });

  it('persists a registered representative thumbnail through the content workspace', async () => {
    apiClientPatchMock.mockResolvedValue({ id: 'workspace-1' });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="listing-1"
        backHref="/product-pipeline/registered-products"
        selfHref="/product-pipeline/registered-products/listing-1"
        initialWorkspaceData={workspaceData}
        contentWorkspaceId="workspace-1"
        showCandidateActions={false}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail' }));

    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
      '/api/ai/content-workspaces/workspace-1/current-thumbnail',
      {
        sourceThumbnailGenerationId: 'thumbnail-generation-1',
        sourceThumbnailCandidateId: 'thumbnail-candidate-1',
      },
    ));
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
            channelAccountId: null,
            sourceContentWorkspaceId: 'workspace-1',
            channelListingId: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
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
            channelAccountId: null,
            sourceContentWorkspaceId: 'workspace-1',
            channelListingId: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
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

  it('falls back to the latest completed detail page in the side mobile preview', async () => {
    useGenerationHistoryMock.mockReturnValue({
      data: [
        {
          id: 'detail-generation-latest',
          generatedTitle: '최신 상세페이지 버전',
          status: 'COMPLETED',
          templateId: 'bold-vertical',
          detailPageData: placeholderDetailPageData,
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-latest',
          detailPageRevisionId: 'revision-latest',
          errorMessage: null,
          productId: 'candidate-1',
          createdAt: '2026-05-18T06:05:56.000Z',
        },
      ],
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
    apiClientPatchMock.mockImplementation((_url: string, body: Record<string, unknown>) => {
      if ('registrationInput' in body) return basicInfoPromise;
      return Promise.resolve({});
    });
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          productPreparation: {
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            channelAccountId: 'account-1',
            sourceContentWorkspaceId: 'workspace-1',
            channelListingId: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: null,
            selectedDetailPageArtifactId: null,
            selectedDetailPageRevisionId: null,
            updatedAt: '2026-05-20T01:02:03.000Z',
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

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail' }));

    await waitFor(() => {
      expect(apiClientPatchMock).toHaveBeenCalledTimes(1);
    });
    expect(apiClientPatchMock.mock.calls[0]).toEqual([
      '/api/sourcing/preparations/prep-1',
      expect.objectContaining({ registrationInput: expect.any(Object) }),
    ]);

    resolveBasicInfo({});

    await waitFor(() => {
      expect(apiClientPatchMock).toHaveBeenCalledTimes(2);
    });
    expect(apiClientPatchMock.mock.calls[1][0]).toBe('/api/sourcing/preparations/prep-1');
    expect(apiClientPatchMock.mock.calls[1][1]).toEqual({
      selectedThumbnailUrl: 'https://cdn.example.com/generated.jpg',
      selectedThumbnailGenerationId: 'thumbnail-generation-1',
      selectedThumbnailGenerationCandidateId: 'thumbnail-candidate-1',
    });
  });
});
