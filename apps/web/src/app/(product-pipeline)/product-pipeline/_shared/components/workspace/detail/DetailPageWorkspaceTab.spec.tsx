import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import DetailPageWorkspaceTab from './DetailPageWorkspaceTab';
import type { DetailGenerationRow } from './detail-generation-rows';

const { previewProps, railProps, useGenerationHistoryMock } = vi.hoisted(() => ({
  previewProps: [] as Array<{ initialAgentHistory?: unknown[] }>,
  railProps: [] as Array<{
    rows: DetailGenerationRow[];
    selectedKey: string | null;
    onRename: (row: DetailGenerationRow) => void;
    onDuplicate: (row: DetailGenerationRow) => void;
  }>,
  useGenerationHistoryMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../hooks/useGenerationHistory', () => ({
  useGenerationHistory: (...args: unknown[]) => useGenerationHistoryMock(...args),
  useGenerationHistoryDelete: () => ({ mutate: vi.fn() }),
}));

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate',
  () => ({
    useBoldVerticalGenerationList: () => ({ data: [] }),
    useKidsPlayfulGenerationDelete: () => ({ mutate: vi.fn() }),
    useKidsPlayfulGenerationList: () => ({ data: [] }),
  }),
);

vi.mock('../../../lib/content-workspaces-api', () => ({
  contentWorkspacesApi: {
    selectCurrentDetailPage: vi.fn(),
  },
}));

vi.mock('./DetailGenerationStatusBar', () => ({
  default: () => <div data-testid="detail-generation-status-bar" />,
}));

vi.mock('./DetailPageVersionRail', () => ({
  default: (props: {
    rows: DetailGenerationRow[];
    selectedKey: string | null;
    onRename: (row: DetailGenerationRow) => void;
    onDuplicate: (row: DetailGenerationRow) => void;
  }) => {
    railProps.push(props);
    const firstRow = props.rows[0];
    return (
      <div data-testid="detail-page-version-rail">
        <span data-testid="selected-version-key">{props.selectedKey ?? 'none'}</span>
        {firstRow ? (
          <>
            <button type="button" onClick={() => props.onRename(firstRow)}>
              이름 변경 실행
            </button>
            <button type="button" onClick={() => props.onDuplicate(firstRow)}>
              복제 실행
            </button>
          </>
        ) : null}
      </div>
    );
  },
}));

vi.mock('../DetailPagePreview', () => ({
  default: (props: {
    initialAgentHistory?: unknown[];
    mobilePreviewData?: { mainImage: string };
  }) => {
    previewProps.push(props);
    return (
      <div data-testid="detail-page-preview">
        {props.mobilePreviewData?.mainImage ??
          (props.initialAgentHistory === undefined
          ? 'initial-history:undefined'
            : `initial-history:${props.initialAgentHistory.length}`)}
      </div>
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

describe('DetailPageWorkspaceTab', () => {
  beforeEach(() => {
    previewProps.length = 0;
    railProps.length = 0;
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    useGenerationHistoryMock.mockReset();
  });

  it('does not seed the preview history query with a fallback empty array before archive data resolves', () => {
    useGenerationHistoryMock.mockReturnValue({ data: undefined });

    renderWithQueryClient(
      <DetailPageWorkspaceTab
        productId="candidate-1"
        detailPreviewHtml="<html><body>placeholder</body></html>"
        editedHtml={null}
        templateCss=""
        initialAgentHistory={undefined}
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByTestId('detail-page-preview')).toHaveTextContent(
      'initial-history:undefined',
    );
    expect(previewProps.at(-1)?.initialAgentHistory).toBeUndefined();
  });

  it('passes registration mobile preview data into the detail preview', () => {
    useGenerationHistoryMock.mockReturnValue({ data: [] });

    renderWithQueryClient(
      <DetailPageWorkspaceTab
        productId="candidate-1"
        detailPreviewHtml="<html><body>placeholder</body></html>"
        editedHtml={null}
        templateCss=""
        initialAgentHistory={[]}
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
        mobilePreviewData={{
          name: '테스트 상품',
          mainImage: 'https://cdn.example.com/mobile.jpg',
          salePrice: 17000,
          originalPrice: 20000,
          discountRate: 15,
          rating: 4.7,
          reviewCount: 123,
        }}
      />,
    );

    expect(screen.getByTestId('detail-page-preview')).toHaveTextContent(
      'https://cdn.example.com/mobile.jpg',
    );
  });

  it('renames a generated detail page version through the detail-page API', async () => {
    useGenerationHistoryMock.mockReturnValue({
      data: [
        {
          id: 'generation-1',
          generatedTitle: '원본 상세페이지',
          status: 'completed',
          templateId: 'kids',
          detailPageData: {},
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: 'revision-1',
          errorMessage: null,
          productId: 'candidate-1',
          createdAt: '2026-05-16T01:00:00.000Z',
        },
      ],
    });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce(' 복제 테스트 상세 ');
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ ok: true });

    renderWithQueryClient(
      <DetailPageWorkspaceTab
        productId="candidate-1"
        detailPreviewHtml="<html><body>placeholder</body></html>"
        editedHtml={null}
        templateCss=""
        initialAgentHistory={[]}
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
        mobilePreviewData={{
          name: '테스트 상품',
          mainImage: 'https://cdn.example.com/product.jpg',
          salePrice: 17000,
          originalPrice: 20000,
          discountRate: 15,
          rating: 4.7,
          reviewCount: 123,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '이름 변경 실행' }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/api/ai/detail-page/generation-1/title',
        { title: '복제 테스트 상세' },
      );
    });
    expect(toast.success).toHaveBeenCalledWith('상세페이지 버전 이름을 변경했습니다.');
    promptSpy.mockRestore();
  });

  it('duplicates a detail page version and selects the duplicated generation', async () => {
    useGenerationHistoryMock.mockReturnValue({
      data: [
        {
          id: 'generation-1',
          generatedTitle: '원본 상세페이지',
          status: 'completed',
          templateId: 'kids',
          detailPageData: {},
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: 'revision-1',
          errorMessage: null,
          productId: 'candidate-1',
          createdAt: '2026-05-16T01:00:00.000Z',
        },
      ],
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ id: 'generation-copy' });

    renderWithQueryClient(
      <DetailPageWorkspaceTab
        productId="candidate-1"
        detailPreviewHtml="<html><body>placeholder</body></html>"
        editedHtml={null}
        templateCss=""
        initialAgentHistory={[]}
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
        mobilePreviewData={{
          name: '테스트 상품',
          mainImage: 'https://cdn.example.com/product.jpg',
          salePrice: 17000,
          originalPrice: 20000,
          discountRate: 15,
          rating: 4.7,
          reviewCount: 123,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '복제 실행' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/ai/detail-page/generation-1/duplicate',
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('selected-version-key')).toHaveTextContent(
        'agent:generation-copy',
      );
    });
    expect(toast.success).toHaveBeenCalledWith(
      '상세페이지 버전을 복제했습니다. 복제본을 선택했습니다.',
    );
  });
});
