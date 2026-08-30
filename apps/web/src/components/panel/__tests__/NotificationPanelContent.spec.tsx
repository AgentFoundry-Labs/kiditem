import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { usePanelStore } from '../lib/panel-store';
import { NotificationPanelContent } from '../NotificationPanelContent';
import type { PanelItem } from '@kiditem/shared/panel';

const mockApiPost = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const mockRecoverStalePanelOperations = vi.hoisted(() => vi.fn(async () => []));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: mockApiPost,
  },
}));

vi.mock('../lib/panel-recovery', () => ({
  recoverStalePanelOperations: mockRecoverStalePanelOperations,
}));

// next/navigation mock
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// useAuth mock — currentUserId 주입 패턴 (`x-dev-user-id` env stub 폐기 후).
const mockUser = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser.value, isLoading: false, logout: vi.fn() }),
}));

const MY_USER_ID = 'user-mine-0000-0000-0000000000001';
const OTHER_USER_ID = 'user-other-000-0000-0000000000002';

const makeRunItem = (id: string, actorUserId: string | null, status: 'running' | 'succeeded' = 'running'): PanelItem => ({
  kind: 'run',
  id,
  source: 'workflow' as const,
  sourceId: id,
  seq: 1,
  status,
  title: `워크플로우 ${id}`,
  deepLink: `/workflows/${id}`,
  actorUserId,
  visibility: 'organization' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
});

const makeAlertItem = (id: string): PanelItem => ({
  kind: 'alert',
  id,
  alertKind: 'signal',
  status: 'open',
  severity: 'warning',
  type: 'internal:rules',
  title: `알림 ${id}`,
  message: null,
  targetType: null,
  targetId: null,
  operationKey: null,
  sourceType: null,
  sourceId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null, // alerts always null
  href: null,
  progress: null,
  metadata: {},
  readAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-04-15T00:00:00Z',
});

function seedStore(items: PanelItem[]) {
  const byId: Record<string, PanelItem> = {};
  items.forEach((item) => { byId[item.id] = item; });
  usePanelStore.setState({ byId, connectionStatus: 'connected' });
}

describe('NotificationPanelContent unified notification list', () => {
  beforeEach(() => {
    mockApiPost.mockClear();
    mockRecoverStalePanelOperations.mockClear();
    mockRecoverStalePanelOperations.mockImplementation(async () =>
      Object.values(usePanelStore.getState().byId),
    );
    mockUser.value = { id: MY_USER_ID };
    usePanelStore.setState({ byId: {}, connectionStatus: 'connected' });
  });

  afterEach(() => {
    mockUser.value = null;
    usePanelStore.setState({ byId: {} });
  });

  it('renders run and alert items in one list without dedicated work sections', () => {
    seedStore([
      makeRunItem('wf-1', MY_USER_ID),
      makeRunItem('wf-2', OTHER_USER_ID, 'succeeded'),
      makeAlertItem('alert-1'),
    ]);
    render(<NotificationPanelContent />);

    expect(screen.getByText('워크플로우 wf-1')).toBeInTheDocument();
    expect(screen.getByText('워크플로우 wf-2')).toBeInTheDocument();
    expect(screen.getByText('알림 alert-1')).toBeInTheDocument();
    expect(screen.queryByText('내 작업')).not.toBeInTheDocument();
    expect(screen.queryByText('조직 알림')).not.toBeInTheDocument();
    expect(screen.queryByText('팀 작업')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows one empty state when no notifications exist', () => {
    seedStore([]);
    render(<NotificationPanelContent />);

    expect(screen.getByText('표시할 알림이 없습니다')).toBeInTheDocument();
  });
});

describe('NotificationPanelContent active count', () => {
  beforeEach(() => {
    mockApiPost.mockClear();
    mockRecoverStalePanelOperations.mockClear();
    mockRecoverStalePanelOperations.mockImplementation(async () =>
      Object.values(usePanelStore.getState().byId),
    );
    mockUser.value = { id: MY_USER_ID };
    usePanelStore.setState({ byId: {}, connectionStatus: 'connected' });
  });
  afterEach(() => {
    mockUser.value = null;
    usePanelStore.setState({ byId: {} });
  });

  const makeOperationAlert = (
    id: string,
    status: 'running' | 'succeeded' | 'failed',
  ): PanelItem => ({
    ...makeAlertItem(id),
    alertKind: 'operation',
    status,
  });

  it('counts running operation alerts in the header progress badge', () => {
    seedStore([
      makeRunItem('wf-1', MY_USER_ID, 'running'),
      makeOperationAlert('op-1', 'running'),
      makeOperationAlert('op-2', 'succeeded'), // not active
    ]);
    render(<NotificationPanelContent />);
    // 1 running run + 1 running operation alert = 2 active
    expect(screen.getByText('2 진행')).toBeInTheDocument();
  });

  it('runs stale operation recovery when the panel opens even while connected', async () => {
    seedStore([
      {
        ...makeAlertItem('op-running'),
        alertKind: 'operation' as const,
        status: 'running',
        operationKey: 'thumbnail-analysis:batch:stale',
        sourceType: 'browser_batch',
      },
    ]);
    usePanelStore.setState({ lastSeq: 7, connectionStatus: 'connected' });

    render(<NotificationPanelContent />);

    await waitFor(() => {
      expect(mockRecoverStalePanelOperations).toHaveBeenCalledWith(7);
    });
  });

  it('signal alerts never count as active', () => {
    seedStore([makeAlertItem('signal-1')]);
    render(<NotificationPanelContent />);
    // signal alerts → recent only, no progress badge shown
    expect(screen.queryByText(/진행$/)).not.toBeInTheDocument();
  });

  it('clears dismissable alerts but keeps running operations', async () => {
    const runningOperation = {
      ...makeAlertItem('op-running'),
      alertKind: 'operation' as const,
      status: 'running',
    };
    seedStore([
      makeAlertItem('signal-1'),
      { ...makeAlertItem('op-done'), alertKind: 'operation' as const, status: 'succeeded' },
      runningOperation,
    ]);

    render(<NotificationPanelContent />);
    screen.getByRole('button', { name: '완료 알림 정리' }).click();

    await waitFor(() => {
      expect(usePanelStore.getState().byId['signal-1']).toBeUndefined();
      expect(usePanelStore.getState().byId['op-done']).toBeUndefined();
    });
    expect(usePanelStore.getState().byId['op-running']).toBeDefined();
    expect(mockApiPost).toHaveBeenCalledWith('/api/alerts/signal-1/dismiss');
    expect(mockApiPost).toHaveBeenCalledWith('/api/alerts/op-done/dismiss');
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/alerts/op-running/dismiss');
  });

  it('hides active workflow runs from this browser without touching alerts', () => {
    const runningOperation = {
      ...makeAlertItem('op-running'),
      alertKind: 'operation' as const,
      status: 'running' as const,
    };
    seedStore([
      makeRunItem('wf-running', MY_USER_ID, 'running'),
      runningOperation,
    ]);

    render(<NotificationPanelContent />);
    screen.getByRole('button', { name: '진행 중 워크플로우 화면에서 정리' }).click();

    expect(usePanelStore.getState().byId['wf-running']).toBeUndefined();
    expect(usePanelStore.getState().byId['op-running']).toBeDefined();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('clears every currently visible row from the panel', async () => {
    const runningOperation = {
      ...makeAlertItem('op-running'),
      alertKind: 'operation' as const,
      status: 'running' as const,
    };
    seedStore([
      makeRunItem('wf-running', MY_USER_ID, 'running'),
      makeRunItem('wf-done', MY_USER_ID, 'succeeded'),
      makeAlertItem('signal-1'),
      runningOperation,
    ]);

    render(<NotificationPanelContent />);
    screen.getByRole('button', { name: '현재 알림 모두 정리' }).click();

    await waitFor(() => expect(usePanelStore.getState().byId).toEqual({}));
    expect(mockApiPost).toHaveBeenCalledWith('/api/alerts/signal-1/dismiss');
    expect(mockApiPost).toHaveBeenCalledWith('/api/alerts/op-running/dismiss');
  });
});
