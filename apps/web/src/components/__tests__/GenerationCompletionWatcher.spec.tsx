import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { PanelAlertItem } from '@kiditem/shared/panel';
import GenerationCompletionWatcher from '../GenerationCompletionWatcher';
import { usePanelStore } from '../panel/lib/panel-store';

const mockPush = vi.hoisted(() => vi.fn());

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
    useKidsPlayfulGenerationList: () => ({ data: [] }),
    useBoldVerticalGenerationList: () => ({ data: [] }),
  }),
);

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeDetailPageAlert(
  status: PanelAlertItem['status'],
  overrides: Partial<PanelAlertItem> = {},
): PanelAlertItem {
  return {
    kind: 'alert',
    id: '00000000-0000-0000-0000-000000000245',
    alertKind: 'operation',
    status,
    severity: 'info',
    type: 'detail_page_generation',
    title: '상세페이지 생성: 매직 큐브 퍼즐',
    message: null,
    targetType: 'sourcing_candidate',
    targetId: '00000000-0000-0000-0000-000000000001',
    operationKey: 'detail-page:generation-245',
    sourceType: 'content_generation',
    sourceId: 'generation-245',
    isRead: false,
    actionTaskId: null,
    actorUserId: '00000000-0000-0000-0000-000000000002',
    href: '/product-pipeline/detail-pages/generation-245/editor',
    progress: status === 'running' ? 0.5 : null,
    metadata: {
      generatedTitle: '매직 큐브 퍼즐',
      templateId: 'kids-playful',
    },
    readAt: null,
    startedAt: '2026-05-18T14:54:08.249Z',
    finishedAt: status === 'running' ? null : '2026-05-18T14:56:24.511Z',
    createdAt: '2026-05-18T14:54:08.253Z',
    ...overrides,
  };
}

describe('GenerationCompletionWatcher', () => {
  beforeEach(() => {
    mockPush.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.error).mockReset();
    usePanelStore.setState({ byId: {}, lastSeq: 0, isOpen: false });
  });

  it('shows the detail-page completion toast as soon as the panel alert completes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const runningAlert = makeDetailPageAlert('running');
    usePanelStore.setState({ byId: { [runningAlert.id]: runningAlert } });

    render(<GenerationCompletionWatcher />, { wrapper: wrapper(queryClient) });

    await waitFor(() => {
      expect(toast.success).not.toHaveBeenCalled();
    });

    const completedAlert = makeDetailPageAlert('succeeded');
    act(() => {
      usePanelStore.getState().upsertItem(completedAlert);
    });

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
    expect(mockPush).toHaveBeenCalledWith('/product-pipeline/detail-pages/generation-245/editor');
  });
});
