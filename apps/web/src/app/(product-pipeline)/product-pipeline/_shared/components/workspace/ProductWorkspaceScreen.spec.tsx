import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderDetailPageData } from '@kiditem/templates';
import { ProductWorkspaceScreen } from './ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../hooks/useProductDetail';
import { PLACEHOLDER_DATA } from '../../lib/product-workspace-types';

const {
  apiClientGetParsedMock,
  apiClientPatchMock,
  apiClientPutMock,
  mobilePreviewProps,
  productEditHeaderProps,
  productTabContentProps,
  useGenerationHistoryMock,
  useProductDetailMock,
} = vi.hoisted(() => ({
  apiClientGetParsedMock: vi.fn(),
  apiClientPatchMock: vi.fn(),
  apiClientPutMock: vi.fn(),
  mobilePreviewProps: [] as Array<{ detailHtml?: string | null }>,
  productEditHeaderProps: [] as Array<Record<string, unknown>>,
  productTabContentProps: [] as Array<Record<string, unknown>>,
  useGenerationHistoryMock: vi.fn(),
  useProductDetailMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ html: null, savedAt: null })),
    getParsed: (...args: unknown[]) => apiClientGetParsedMock(...args),
    patch: (...args: unknown[]) => apiClientPatchMock(...args),
    put: (...args: unknown[]) => apiClientPutMock(...args),
  },
}));

/** `SalesProductSchema.parse` 를 통과하는 최소 판매상품 초안. */
function salesProductFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    code: null,
    ownCode: null,
    sabangnetGoodsNo: null,
    sourceCandidateId: '20000000-0000-4000-8000-000000000001',
    sourcePlatform: 'ALIBABA_1688',
    sourceUrl: null,
    name: '테스트 상품',
    shortName: null,
    englishName: null,
    printName: null,
    modelName: null,
    modelNo: null,
    brand: null,
    manufacturer: null,
    originCountry: null,
    originRegion: null,
    keywords: [],
    standardCategory: null,
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    status: 'draft',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    optionAxes: [],
    stockManaged: false,
    imageUrls: [],
    detailHtml: null,
    extraDetailHtml: [],
    noticeCategory: null,
    noticeValues: [],
    certifications: [],
    kcStatus: 'unknown',
    importDeclarationNo: null,
    adminMemo: null,
    version: 1,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    options: [{
      id: '30000000-0000-4000-8000-000000000001',
      optionCode: null,
      values: [],
      optionKey: '',
      alias: null,
      barcode: null,
      salePrice: null,
      normalPrice: null,
      supplyStatus: 'selling',
      safetyStock: null,
      sortOrder: 0,
      components: [],
      linkedChannelOptionCount: 0,
    }],
    channelOverrides: [],
    channelListings: [],
    ...overrides,
  };
}

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
        kind: 'generated';
        generatedGenerationId: string;
        generatedCandidateId: string;
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

const workspaceData: ProductWorkspaceData = {
  product: {
    id: 'candidate-1',
    name: '테스트 상품',
    raw_data: null,
    image_urls: [],
    thumbnail_url: null,
    status: 'sourced',
    contentWorkspaceId: null,
    salesProductId: 'sales-product-1',
    salesProductVersion: 1,
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
    apiClientGetParsedMock.mockReset();
    apiClientGetParsedMock.mockResolvedValue(salesProductFixture());
    apiClientPatchMock.mockReset();
    apiClientPatchMock.mockResolvedValue(salesProductFixture());
    apiClientPutMock.mockReset();
    // 기본값은 `salesProductApi.replaceOptions` 응답 모양(Zod 파싱을 통과해야 한다).
    // 썸네일 갤러리 PUT(`/thumbnail-gallery`)은 이 값을 쓰지 않으므로 함께 써도 안전하다.
    apiClientPutMock.mockResolvedValue(salesProductFixture());
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
        registrationTarget: {
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
    expect(productEditHeaderProps.at(-1)?.registrationTarget).toBe(
      selectedWorkspaceData.product.registrationTarget,
    );
    expect(productEditHeaderProps.at(-1)?.detailGenerationContentWorkspaceId).toBe('workspace-1');
    expect(productEditHeaderProps.at(-1)?.selectedThumbnailGenerationId).toBe(
      'thumb-generation-1',
    );
    expect(productEditHeaderProps.at(-1)).not.toHaveProperty('promotedMasterId');
  });

  it('판매상품 초안 저장 경로로 기본정보를 저장한다', async () => {
    apiClientPutMock.mockResolvedValue(salesProductFixture({ version: 2 }));
    useProductDetailMock.mockReturnValue({ data: workspaceData, error: null, isLoading: false });

    renderWithQueryClient(
      <ProductWorkspaceScreen
        productId="candidate-1"
        backHref="/product-pipeline/collected-products"
        selfHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-basic' }));

    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
      '/api/products/sales-products/sales-product-1',
      { expectedVersion: 1, name: '수정 상품명' },
    ));
    // salePrice 는 옵션에 있다 — 기존 옵션을 다시 읽어(getParsed) 새 값을 싣는다.
    await waitFor(() => expect(apiClientGetParsedMock).toHaveBeenCalledWith(
      '/api/products/sales-products/sales-product-1', expect.anything(),
    ));
    await waitFor(() => expect(apiClientPutMock).toHaveBeenCalledWith(
      '/api/products/sales-products/sales-product-1/options',
      expect.objectContaining({
        options: [expect.objectContaining({ salePrice: 13900 })],
      }),
    ));
  });

  it('등록이 이미 시작된 뒤에도 초안은 계속 고칠 수 있다', async () => {
    // 등록 동결(RegistrationExecution)은 준비 시점 스냅샷이라, 그 뒤 초안을 고쳐도
    // 이미 보낸 실행을 바꾸지 않는다 — 초안 저장 경로를 막을 이유가 없다.
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          registrationState: 'registered',
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

    fireEvent.click(await screen.findByRole('button', { name: 'mock-save-basic' }));

    await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
      '/api/products/sales-products/sales-product-1',
      expect.objectContaining({ name: '수정 상품명' }),
    ));
  });

  it('keeps consecutive basic saves on the same sales-product identity', async () => {
    apiClientPatchMock
      .mockResolvedValueOnce(salesProductFixture({ version: 2 }))
      .mockResolvedValueOnce(salesProductFixture({ version: 3 }));
    useProductDetailMock.mockReturnValue({ data: workspaceData, error: null, isLoading: false });

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
      '/api/products/sales-products/sales-product-1',
      { expectedVersion: 1, name: '수정 상품명' },
    ]);
  });

  it('읽기 전용 목록/등록상품 화면(showCandidateActions=false)은 기본정보 저장을 열지 않는다', async () => {
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
    // 상세페이지 선택은 콘텐츠 작업공간이 갖는다 — 등록상품 보기에도 작업공간이 있으면 연다.
    expect(productTabContentProps.at(-1)?.onApplyRegistrationDetailPage).toBeDefined();
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

  // 준비(RegistrationTarget)가 없는 후보 회귀.
  // 예전에는 (1) 저장 버튼이 아예 렌더되지 않았고, (2) 대표 등록 경로가 대표 1장만
  // 저장하고 미리보기 목록을 조용히 버렸다. 그래도 성공 토스트는 떴다.
  describe('without a product preparation', () => {
    it('still offers the thumbnail configuration save when a content workspace exists', async () => {
      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={workspaceData}
          contentWorkspaceId="workspace-1"
        />,
      );

      const tab = await screen.findByTestId('product-tab-content');
      expect(tab).toHaveAttribute('data-can-save-thumbnail', 'true');
    });

    it('hides the thumbnail configuration save when nothing can receive it', async () => {
      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={workspaceData}
        />,
      );

      const tab = await screen.findByTestId('product-tab-content');
      expect(tab).toHaveAttribute('data-can-save-thumbnail', 'false');
    });

    it('persists the preview list to the workspace thumbnail gallery', async () => {
      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={workspaceData}
          contentWorkspaceId="workspace-1"
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail-list' }));

      await waitFor(() => expect(apiClientPutMock).toHaveBeenCalledWith(
        '/api/ai/content-workspaces/workspace-1/thumbnail-gallery',
        {
          thumbnailUrls: [
            'https://cdn.example.com/preview-1.jpg',
            'https://cdn.example.com/preview-2.jpg',
          ],
        },
      ));
      // 목록만 저장하는 경로는 대표 선택을 건드리지 않는다.
      expect(apiClientPatchMock).not.toHaveBeenCalled();
    });

    it('saves the preview list alongside the representative thumbnail', async () => {
      apiClientPatchMock.mockResolvedValue({ id: 'workspace-1' });

      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={workspaceData}
          contentWorkspaceId="workspace-1"
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'mock-save-thumbnail' }));

      await waitFor(() => expect(apiClientPutMock).toHaveBeenCalledWith(
        '/api/ai/content-workspaces/workspace-1/thumbnail-gallery',
        { thumbnailUrls: ['https://cdn.example.com/generated.jpg'] },
      ));
      await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
        '/api/ai/content-workspaces/workspace-1/current-thumbnail',
        {
          sourceThumbnailGenerationId: 'thumbnail-generation-1',
          sourceThumbnailCandidateId: 'thumbnail-candidate-1',
        },
      ));
    });

    it('saves basic information to the sales-product draft when no registration target exists', async () => {
      // 회귀: 등록 설정(RegistrationTarget)이 0행인 후보는 예전에 `수정` 저장 콜백이
      // 아예 제공되지 않아 기본정보가 읽기 전용이었다. 이제 채널 계정 선택 없이도
      // 판매상품 초안(PATCH /api/products/sales-products/:id)에 저장한다.
      apiClientPutMock.mockResolvedValue(salesProductFixture({ version: 2 }));

      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={workspaceData}
          contentWorkspaceId="workspace-1"
        />,
      );

      await screen.findByTestId('product-tab-content');
      expect(productTabContentProps.at(-1)?.onCommitBasicInfo).toBeDefined();

      fireEvent.click(await screen.findByRole('button', { name: 'mock-save-basic' }));

      await waitFor(() => expect(apiClientPatchMock).toHaveBeenCalledWith(
        '/api/products/sales-products/sales-product-1',
        { expectedVersion: 1, name: '수정 상품명' },
      ));
    });

    it('restores a previously saved gallery from registrationImages.thumbnail', async () => {
      renderWithQueryClient(
        <ProductWorkspaceScreen
          productId="candidate-1"
          backHref="/product-pipeline/collected-products"
          selfHref="/product-pipeline/collected-products/candidate-1"
          initialWorkspaceData={{
            ...workspaceData,
            product: {
              ...workspaceData.product,
              basicInfo: {
                thumbnailUrls: [],
                thumbnailPreviewUrls: [],
                registrationImages: {
                  primary: [],
                  thumbnail: [
                    'https://cdn.example.com/saved-1.jpg',
                    'https://cdn.example.com/saved-2.jpg',
                  ],
                  detail: [],
                },
                tags: [],
              },
            } as unknown as ProductWorkspaceData['product'],
          }}
          contentWorkspaceId="workspace-1"
        />,
      );

      await screen.findByTestId('product-tab-content');
      expect(productTabContentProps.at(-1)?.thumbnailPreviewImages).toEqual([
        'https://cdn.example.com/saved-1.jpg',
        'https://cdn.example.com/saved-2.jpg',
      ]);
    });
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
          registrationTarget: {
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
          registrationTarget: {
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

  it('waits for the thumbnail gallery to persist before registering the representative', async () => {
    let resolveGallery!: (value: unknown) => void;
    const galleryPromise = new Promise((resolve) => {
      resolveGallery = resolve;
    });
    apiClientPutMock.mockImplementation((url: string) => {
      if (url.endsWith('/thumbnail-gallery')) return galleryPromise;
      return Promise.resolve({});
    });
    apiClientPatchMock.mockResolvedValue({});
    useProductDetailMock.mockReturnValue({
      data: {
        ...workspaceData,
        product: {
          ...workspaceData.product,
          registrationTarget: {
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
      expect(apiClientPutMock).toHaveBeenCalledWith(
        '/api/ai/content-workspaces/workspace-1/thumbnail-gallery',
        { thumbnailUrls: ['https://cdn.example.com/generated.jpg'] },
      );
    });
    // 목록이 아직 저장 중이면 대표 선택은 시작하지 않는다.
    expect(apiClientPatchMock).not.toHaveBeenCalled();

    resolveGallery({ thumbnailUrls: ['https://cdn.example.com/generated.jpg'] });

    await waitFor(() => {
      expect(apiClientPatchMock).toHaveBeenCalledWith(
        '/api/ai/content-workspaces/workspace-1/current-thumbnail',
        {
          sourceThumbnailGenerationId: 'thumbnail-generation-1',
          sourceThumbnailCandidateId: 'thumbnail-candidate-1',
        },
      );
    });
  });
});
