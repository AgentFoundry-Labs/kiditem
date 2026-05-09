import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { usePanelStore } from '../lib/panel-store';
import { PanelSheet } from '../PanelSheet';
import type { PanelItem } from '@kiditem/shared/panel';

const mockApiPost = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: mockApiPost,
  },
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

// Radix UI Dialog renders into a portal — need a DOM container
// @radix-ui/react-dialog uses document.body as portal target by default in jsdom

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
  usePanelStore.setState({ byId, isOpen: true, connectionStatus: 'connected' });
}

describe('PanelSheet my/attention/team split', () => {
  beforeEach(() => {
    mockApiPost.mockClear();
    mockUser.value = { id: MY_USER_ID };
    usePanelStore.setState({ byId: {}, isOpen: true, connectionStatus: 'connected' });
  });

  afterEach(() => {
    mockUser.value = null;
    usePanelStore.setState({ byId: {}, isOpen: false });
  });

  it('workflow run with my actorUserId → 내 작업 section', () => {
    seedStore([makeRunItem('wf-1', MY_USER_ID)]);
    render(<PanelSheet />);
    expect(screen.getByText('내 작업')).toBeInTheDocument();
    expect(screen.getByText('워크플로우 wf-1')).toBeInTheDocument();
    // 팀 section is hidden when empty
    expect(screen.queryByText('팀')).not.toBeInTheDocument();
  });

  it('workflow run with other actorUserId → 팀 작업 section', () => {
    seedStore([makeRunItem('wf-2', OTHER_USER_ID, 'succeeded')]);
    render(<PanelSheet />);
    expect(screen.getByText('팀 작업')).toBeInTheDocument();
    expect(screen.getByText('워크플로우 wf-2')).toBeInTheDocument();
  });

  it('system alert with actorUserId null → 조직 알림 section', () => {
    seedStore([makeAlertItem('alert-1')]);
    render(<PanelSheet />);
    expect(screen.getByText('조직 알림')).toBeInTheDocument();
    expect(screen.getByText('알림 alert-1')).toBeInTheDocument();
    expect(screen.queryByText('팀 작업')).not.toBeInTheDocument();
  });

  it('내 작업 0건 → empty state placeholder shown', () => {
    // Only an attention alert item — my section should show empty placeholder
    seedStore([makeAlertItem('alert-2')]);
    render(<PanelSheet />);
    expect(screen.getByText('진행 중인 내 작업이 없습니다')).toBeInTheDocument();
  });

  it('조직 알림 0건 → empty state placeholder shown', () => {
    seedStore([makeRunItem('wf-3', MY_USER_ID)]);
    render(<PanelSheet />);
    expect(screen.getByText('조직 알림')).toBeInTheDocument();
    expect(screen.getByText('조직 알림이 없습니다')).toBeInTheDocument();
  });

  it('팀 0건 → 팀 header not rendered', () => {
    seedStore([makeRunItem('wf-4', MY_USER_ID)]);
    render(<PanelSheet />);
    expect(screen.queryByText('팀 작업')).not.toBeInTheDocument();
  });
});

describe('PanelSheet active count', () => {
  beforeEach(() => {
    mockUser.value = { id: MY_USER_ID };
    usePanelStore.setState({ byId: {}, isOpen: true, connectionStatus: 'connected' });
  });
  afterEach(() => {
    mockUser.value = null;
    usePanelStore.setState({ byId: {}, isOpen: false });
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
    render(<PanelSheet />);
    // 1 running run + 1 running operation alert = 2 active
    expect(screen.getByText('2 진행')).toBeInTheDocument();
  });

  it('signal alerts never count as active', () => {
    seedStore([makeAlertItem('signal-1')]);
    render(<PanelSheet />);
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

    render(<PanelSheet />);
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
});
