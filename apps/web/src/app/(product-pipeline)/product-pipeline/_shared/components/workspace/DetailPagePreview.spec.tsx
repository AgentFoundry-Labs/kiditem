import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import DetailPagePreview from './DetailPagePreview';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ html: null, savedAt: null })),
    fetchRaw: vi.fn(),
  },
}));

vi.mock('../../hooks/useGenerationHistory', () => ({
  useGenerationHistory: (
    _productId: string,
    initialAgentHistory: unknown[] = [],
  ) => ({
    data: initialAgentHistory,
    isLoading: false,
    error: null,
  }),
}));

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate',
  () => ({
    useKidsPlayfulGenerationList: () => ({ data: [] }),
    useBoldVerticalGenerationList: () => ({ data: [] }),
    useKidsPlayfulOne: (id?: string | null) => ({
      data: id
        ? {
          id: 'generation-1',
          productId: null,
          templateId: 'kids-playful',
          productName: '캐릭터 문어발 비눗방울',
          rawInput: {},
          result: {
            section1: {
              mainHeadline: '정상 한글 상세페이지',
              subhead: '아이들이 좋아하는 비눗방울',
            },
          },
          imageUrls: [],
          processedImages: {},
          imageProcessingStatus: 'completed',
          imageProcessingError: null,
          createdAt: '2026-05-15T12:00:00.000Z',
        }
        : undefined,
    }),
    rowToRendererData: (item: { result: unknown }) => item.result,
  }),
);

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-kids-playful-html',
  () => ({
    buildKidsPlayfulHtml: (data: { section1?: { mainHeadline?: string } }, templateCss = '') =>
      `<!doctype html><html><head><style>${templateCss}</style></head><body>${data.section1?.mainHeadline ?? ''}</body></html>`,
  }),
);

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

describe('DetailPagePreview', () => {
  it('shows an empty state when the workspace has history but no saved current detail page', () => {
    renderWithQueryClient(
      <DetailPagePreview
        productId="workspace-1"
        detailPreviewHtml="<html><body>placeholder template</body></html>"
        editedHtml={null}
        templateCss="/* compiled template css */"
        hasSavedDetailPage={false}
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '이력에는 있지만 저장 선택은 아님',
            status: 'COMPLETED',
            templateId: 'kids-playful',
            detailPageData: null,
            imageUrls: [],
            processedImages: {},
            detailPageArtifactId: 'artifact-1',
            detailPageRevisionId: null,
            errorMessage: null,
            productId: null,
            createdAt: '2026-05-15T12:00:00.000Z',
          },
        ]}
        generationHistoryQueryEnabled={false}
        detailEditorReturnHref="/product-pipeline/registered-products/workspace-1"
      />,
    );

    expect(document.querySelector('iframe[title="detail-page-preview"]')).not.toBeInTheDocument();
    expect(screen.getByText('생성된 상세페이지가 없습니다')).toBeInTheDocument();
  });

  it('renders the saved generation DTO for the workspace current detail page', async () => {
    renderWithQueryClient(
      <DetailPagePreview
        productId="workspace-1"
        detailPreviewHtml="<html><body>깨진 placeholder</body></html>"
        editedHtml={null}
        templateCss="/* compiled template css */"
        hasSavedDetailPage
        savedDetailPageGenerationId="generation-1"
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '캐릭터 문어발 비눗방울',
            status: 'COMPLETED',
            templateId: 'kids-playful',
            detailPageData: null,
            imageUrls: [],
            processedImages: {},
            detailPageArtifactId: 'artifact-1',
            detailPageRevisionId: null,
            errorMessage: null,
            productId: null,
            createdAt: '2026-05-15T12:00:00.000Z',
          },
        ]}
        generationHistoryQueryEnabled={false}
        detailEditorReturnHref="/product-pipeline/registered-products/workspace-1"
      />,
    );

    await waitFor(() => {
      const preview = document.querySelector<HTMLIFrameElement>('iframe[title="detail-page-preview"]');
      expect(preview?.getAttribute('srcdoc')).toContain('정상 한글 상세페이지');
    });
  });

  it('uses the latest completed sourcing history when no workspace current generation is selected', async () => {
    renderWithQueryClient(
      <DetailPagePreview
        productId="candidate-1"
        detailPreviewHtml="<html><body>placeholder template</body></html>"
        editedHtml={null}
        templateCss="/* compiled template css */"
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '자체 수집 생성물',
            status: 'COMPLETED',
            templateId: 'kids-playful',
            detailPageData: null,
            imageUrls: [],
            processedImages: {},
            detailPageArtifactId: 'artifact-1',
            detailPageRevisionId: null,
            errorMessage: null,
            productId: null,
            createdAt: '2026-05-15T12:00:00.000Z',
          },
        ]}
        generationHistoryQueryEnabled={false}
        detailEditorSourceCandidateId="candidate-1"
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    await waitFor(() => {
      const preview = document.querySelector<HTMLIFrameElement>('iframe[title="detail-page-preview"]');
      expect(preview?.getAttribute('srcdoc')).toContain('정상 한글 상세페이지');
    });
    expect(screen.getByRole('link', { name: '에디터에서 편집' })).toHaveAttribute(
      'href',
      '/product-pipeline/detail-pages/generation-1/editor?sourceCandidateId=candidate-1&returnTo=%2Fproduct-pipeline%2Fcollected-products%2Fcandidate-1',
    );
  });

  it('places the full detail preview before the minimap inside the preview body', async () => {
    renderWithQueryClient(
      <DetailPagePreview
        productId="candidate-1"
        detailPreviewHtml="<html><body><p>preview</p></body></html>"
        editedHtml={null}
        templateCss=""
        hasSavedDetailPage
        savedDetailPageGenerationId={null}
        initialAgentHistory={[]}
        generationHistoryQueryEnabled={false}
        detailEditorSourceCandidateId="candidate-1"
        detailEditorReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle('detail-page-preview')).toBeInTheDocument();
    });
    const preview = screen.getByTitle('detail-page-preview');
    const minimap = screen.getByTitle('detail-minimap');
    const wrapper = preview.closest('[data-testid="detail-preview-body"]');
    expect(wrapper).toContainElement(minimap);
    expect(
      Array.from(wrapper?.querySelectorAll('iframe') ?? []).map((iframe) =>
        iframe.getAttribute('title'),
      ),
    ).toEqual(['detail-page-preview', 'detail-minimap']);
  });
});
