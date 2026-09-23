import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { KidsPlayfulGenerationItem } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import GenerationCompletionWatcher from '../GenerationCompletionWatcher';

const mockPush = vi.hoisted(() => vi.fn());
const mockGenerationLists = vi.hoisted(() => ({
  kids: [] as KidsPlayfulGenerationItem[],
  bold: [] as KidsPlayfulGenerationItem[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate',
  () => ({
    useKidsPlayfulGenerationList: () => ({ data: mockGenerationLists.kids }),
    useBoldVerticalGenerationList: () => ({ data: mockGenerationLists.bold }),
  }),
);

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeGeneration(
  imageProcessingStatus: KidsPlayfulGenerationItem['imageProcessingStatus'],
  contentWorkspaceId: string | null = null,
): KidsPlayfulGenerationItem {
  return {
    id: 'generation-245',
    productId: null,
    contentWorkspaceId,
    templateId: 'kids-playful',
    productName: '매직 큐브 퍼즐',
    rawInput: {
      sourceReferences: [
        { sourceType: 'sourcing_candidate', sourceCandidateId: 'candidate-245' },
      ],
    },
    result: {} as KidsPlayfulGenerationItem['result'],
    imageUrls: [],
    processedImages: {},
    imageProcessingStatus,
    imageProcessingError: imageProcessingStatus === 'failed' ? '생성 실패' : null,
    createdAt: '2026-05-18T14:54:08.253Z',
  };
}

describe('GenerationCompletionWatcher', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGenerationLists.kids = [];
    mockGenerationLists.bold = [];
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('shows a completion toast when the generation source status becomes terminal', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockGenerationLists.kids = [makeGeneration('processing')];
    const view = render(<GenerationCompletionWatcher />, { wrapper: wrapper(queryClient) });

    mockGenerationLists.kids = [makeGeneration('completed')];
    view.rerender(<GenerationCompletionWatcher />);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '매직 큐브 퍼즐 생성 완료',
        expect.objectContaining({
          description: 'Trend Vertical - 상세페이지로 이동하시겠습니까?',
          action: expect.objectContaining({ label: '상세페이지로 이동' }),
        }),
      );
    });

    const toastOptions = vi.mocked(toast.success).mock.calls[0][1] as {
      action: { onClick: () => void };
    };
    toastOptions.action.onClick();
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/product-pipeline/detail-pages/generation-245/editor'),
    );
  });

  it('does not send the editor back to a registered-product page built from a content workspace id', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockGenerationLists.kids = [makeGeneration('processing', 'workspace-1')];
    const view = render(<GenerationCompletionWatcher />, { wrapper: wrapper(queryClient) });

    mockGenerationLists.kids = [makeGeneration('completed', 'workspace-1')];
    view.rerender(<GenerationCompletionWatcher />);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const toastOptions = vi.mocked(toast.success).mock.calls[0][1] as { action: { onClick: () => void } };
    toastOptions.action.onClick();
    // 등록상품 화면 주소는 리스팅 id 로 연다 — 작업공간 id 로 만들면 열리지 않는 주소가 된다.
    expect(mockPush).toHaveBeenCalledWith('/product-pipeline/detail-pages/generation-245/editor');
  });

  it('shows a failure toast with the source error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockGenerationLists.kids = [makeGeneration('pending')];
    const view = render(<GenerationCompletionWatcher />, { wrapper: wrapper(queryClient) });

    mockGenerationLists.kids = [makeGeneration('failed')];
    view.rerender(<GenerationCompletionWatcher />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        '매직 큐브 퍼즐 생성 실패',
        expect.objectContaining({ description: '생성 실패' }),
      );
    });
  });
});
