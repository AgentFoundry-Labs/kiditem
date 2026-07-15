import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type { PanelAlertItem } from '@kiditem/shared/panel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import { DashboardSidePanel } from './DashboardSidePanel';

const mockApiPatch = vi.hoisted(() => vi.fn(async () => ({})));
const mockCancelOperation = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    status: 'cancelled',
    message: '중단 요청이 반영되었습니다.',
    operationKey: 'operation-key-1',
    affected: {
      workflowRunIds: [],
      agentRunRequestIds: [],
      agentRunIds: [],
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
      directAiJobIds: [],
    },
    preserved: {
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    },
    warnings: [],
  })),
);
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: mockApiPatch,
  },
}));

vi.mock('@/lib/operation-cancellation', () => ({
  cancelOperation: mockCancelOperation,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const makeAlert = (
  overrides: Partial<DashboardAlertItem> & { operationKey?: string | null } = {},
) =>
  ({
    id: 'alert-1',
    kind: 'operation',
    status: 'running',
    type: 'thumbnail_generation',
    severity: 'info',
    title: '썸네일 자동 생성',
    message: '진행 중',
    sourceType: 'thumbnail_generation',
    href: '/product-pipeline/thumbnail-generation',
    progress: 0.5,
    targetType: null,
    targetId: null,
    isRead: false,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    operationKey: 'operation-key-1',
    ...overrides,
  }) as DashboardAlertItem & { operationKey?: string | null };

const makePanelAlert = (overrides: Partial<PanelAlertItem> = {}): PanelAlertItem => ({
  kind: 'alert',
  id: '11111111-1111-1111-1111-111111111111',
  alertKind: 'operation',
  status: 'running',
  severity: 'info',
  type: 'thumbnail_generation',
  title: '패널 알림',
  message: '패널 스토어 기준',
  targetType: null,
  targetId: null,
  operationKey: 'operation-key-1',
  sourceType: 'thumbnail_generation',
  sourceId: '22222222-2222-2222-2222-222222222222',
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  href: '/product-pipeline/thumbnail-generation',
  progress: 0.5,
  metadata: {},
  readAt: null,
  startedAt: '2026-05-17T00:00:00.000Z',
  finishedAt: null,
  createdAt: '2026-05-17T00:00:00.000Z',
  ...overrides,
});

describe('DashboardSidePanel', () => {
  beforeEach(() => {
    mockApiPatch.mockClear();
    mockCancelOperation.mockClear();
    mockToastError.mockClear();
    usePanelStore.setState({
      byId: {},
      lastSeq: 0,
      hasHydrated: false,
      isOpen: false,
      connectionStatus: 'disconnected',
    });
  });

  it('offers a stop action for running operation alerts with an operation key', () => {
    render(<DashboardSidePanel alerts={[makeAlert()]} queryClient={makeQueryClient()} />);

    expect(screen.getByRole('button', { name: '작업 중단' })).toBeInTheDocument();
  });

  it('cancels the operation through the common cancellation API', async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<DashboardSidePanel alerts={[makeAlert()]} queryClient={queryClient} />);

    fireEvent.click(screen.getByRole('button', { name: '작업 중단' }));
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mockCancelOperation).toHaveBeenCalledWith({
        targetType: 'operation_key',
        operationKey: 'operation-key-1',
        reason: '사용자 요청',
      });
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it('uses hydrated panel alerts instead of stale dashboard inventory alerts', async () => {
    const panelAlert = makePanelAlert({ isRead: true, readAt: '2026-05-17T00:01:00.000Z' });
    act(() => {
      usePanelStore.getState().handleSnapshot([panelAlert], true);
    });

    render(<DashboardSidePanel alerts={[makeAlert({ title: '오래된 대시보드 알림' })]} queryClient={makeQueryClient()} />);

    expect(screen.getByText('패널 알림')).toBeInTheDocument();
    expect(screen.queryByText('오래된 대시보드 알림')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체 읽음' })).not.toBeInTheDocument();

    act(() => {
      usePanelStore.getState().dismissItem(panelAlert.id);
    });

    await waitFor(() => {
      expect(screen.queryByText('패널 알림')).not.toBeInTheDocument();
    });
    expect(screen.getByText('표시할 알림이 없습니다')).toBeInTheDocument();
  });

  it('marks hydrated panel alerts as read without removing recent panel rows', async () => {
    const panelAlert = makePanelAlert();
    act(() => {
      usePanelStore.getState().handleSnapshot([panelAlert], true);
    });

    render(<DashboardSidePanel alerts={[]} queryClient={makeQueryClient()} />);

    fireEvent.click(screen.getByRole('button', { name: '전체 읽음' }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/alerts/read-all', {});
    });
    expect(screen.getByText('패널 알림')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체 읽음' })).not.toBeInTheDocument();
    const stored = usePanelStore.getState().byId[panelAlert.id];
    expect(stored?.kind === 'alert' ? stored.isRead : false).toBe(true);
  });

  it('routes legacy stock-low alerts to factual Sellpia zero-stock status', () => {
    render(
      <DashboardSidePanel
        alerts={[makeAlert({ type: 'stock_low', href: null })]}
        queryClient={makeQueryClient()}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/inventory-hub?tab=attention&view=sellpia-zero',
    );
  });
});
