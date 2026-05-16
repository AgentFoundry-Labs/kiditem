import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import GenerationHistoryTab from './GenerationHistoryTab';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ html: null, savedAt: null })),
    post: vi.fn(),
    patch: vi.fn(async () => ({ id: 'workspace-1' })),
  },
}));

import { apiClient } from '@/lib/api-client';

vi.mock('../../hooks/useGenerationHistory', () => ({
  useGenerationHistory: (
    _productId: string,
    initialAgentHistory: unknown[] = [],
  ) => ({
    data: initialAgentHistory,
    isLoading: false,
    error: null,
  }),
  useGenerationHistoryDelete: () => ({ mutate: vi.fn() }),
}));

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate',
  () => ({
    useKidsPlayfulGenerationList: () => ({ data: [] }),
    useBoldVerticalGenerationList: () => ({ data: [] }),
    useKidsPlayfulGenerationDelete: () => ({ mutate: vi.fn() }),
    useKidsPlayfulOne: () => ({
      data: {
        id: 'generation-1',
        productId: null,
        templateId: 'kids-playful',
        productName: '캐릭터 문어발 비눗방울',
        rawInput: {},
        result: {
          section1: {
            mainHeadline: '정상 이력 상세페이지',
            subhead: '선택한 이력 미리보기',
          },
        },
        imageUrls: [],
        processedImages: {},
        imageProcessingStatus: 'completed',
        imageProcessingError: null,
        createdAt: '2026-05-15T12:00:00.000Z',
      },
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

describe('GenerationHistoryTab', () => {
  it('does not preview generated or source templates before a history row is selected', () => {
    renderWithQueryClient(
      <GenerationHistoryTab
        productId="workspace-1"
        templateCss="/* compiled template css */"
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '최신 상세페이지',
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
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
      />,
    );

    expect(document.querySelector('iframe[title="history-preview"]')).not.toBeInTheDocument();
    expect(screen.getByText('생성 결과 선택 필요')).toBeInTheDocument();
    expect(screen.getByText('미리볼 생성 결과가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('등록할 상세페이지를 선택하세요')).toBeInTheDocument();
  });

  it('does not fall back to the source template when no history row is selected', () => {
    renderWithQueryClient(
      <GenerationHistoryTab
        productId="workspace-1"
        templateCss="/* compiled template css */"
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        initialAgentHistory={[]}
        generationHistoryQueryEnabled={false}
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
      />,
    );

    expect(document.querySelector('iframe[title="history-preview"]')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('원본 템플릿');
    expect(screen.getByText('아직 생성 이력이 없습니다')).toBeInTheDocument();
  });

  it('previews the fresh generation DTO when a registration workspace history row lacks embedded detail data', async () => {
    renderWithQueryClient(
      <GenerationHistoryTab
        productId="workspace-1"
        templateCss="/* compiled template css */"
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
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
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('캐릭터 문어발 비눗방울'));

    await waitFor(() => {
      const preview = document.querySelector<HTMLIFrameElement>('iframe[title="history-preview"]');
      expect(preview?.getAttribute('srcdoc')).toContain('정상 이력 상세페이지');
    });
  });

  it('persists registration detail selection against the workspace current pointer', async () => {
    const onSelectAgent = vi.fn();
    renderWithQueryClient(
      <GenerationHistoryTab
        productId="workspace-1"
        registrationWorkspaceId="workspace-1"
        templateCss="/* compiled template css */"
        selectedKidsPlayfulId={null}
        selectedBoldVerticalId={null}
        selectedAgentId={null}
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '저장할 상세페이지',
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
        onSelectKidsPlayful={vi.fn()}
        onSelectBoldVertical={vi.fn()}
        onSelectAgent={onSelectAgent}
      />,
    );

    fireEvent.click(screen.getByText('저장할 상세페이지'));
    fireEvent.click(screen.getByRole('button', { name: /등록 상세로 적용/ }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/api/ai/registration-workspaces/workspace-1/current-detail-page',
        { contentGenerationId: 'generation-1' },
      );
    });
    expect(onSelectAgent).toHaveBeenCalledWith('generation-1');
  });
});
