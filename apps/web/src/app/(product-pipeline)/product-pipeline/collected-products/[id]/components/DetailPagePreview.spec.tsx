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

vi.mock('../hooks/useGenerationHistory', () => ({
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
});
