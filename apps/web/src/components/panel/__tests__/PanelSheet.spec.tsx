import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePanelStore } from '../lib/panel-store';
import { PanelSheet } from '../PanelSheet';
import type { PanelItem } from '@kiditem/shared/panel';

// next/navigation mock
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  severity: 'warning',
  type: 'internal:rules',
  title: `알림 ${id}`,
  message: null,
  targetType: null,
  targetId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null, // alerts always null
  createdAt: '2026-04-15T00:00:00Z',
});

function seedStore(items: PanelItem[]) {
  const byId: Record<string, PanelItem> = {};
  items.forEach((item) => { byId[item.id] = item; });
  usePanelStore.setState({ byId, isOpen: true, connectionStatus: 'connected' });
}

describe('PanelSheet my/team split', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', MY_USER_ID);
    usePanelStore.setState({ byId: {}, isOpen: true, connectionStatus: 'connected' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('workflow run with other actorUserId → 팀 section', () => {
    seedStore([makeRunItem('wf-2', OTHER_USER_ID, 'succeeded')]);
    render(<PanelSheet />);
    expect(screen.getByText('팀')).toBeInTheDocument();
    expect(screen.getByText('워크플로우 wf-2')).toBeInTheDocument();
  });

  it('alert item (actorUserId null) → 팀 section', () => {
    seedStore([makeAlertItem('alert-1')]);
    render(<PanelSheet />);
    expect(screen.getByText('팀')).toBeInTheDocument();
    expect(screen.getByText('알림 alert-1')).toBeInTheDocument();
  });

  it('내 작업 0건 → empty state placeholder shown', () => {
    // Only a team alert item — my section should show empty placeholder
    seedStore([makeAlertItem('alert-2')]);
    render(<PanelSheet />);
    expect(screen.getByText('진행 중인 내 작업이 없습니다')).toBeInTheDocument();
  });

  it('팀 0건 → 팀 header not rendered', () => {
    seedStore([makeRunItem('wf-3', MY_USER_ID)]);
    render(<PanelSheet />);
    expect(screen.queryByText('팀')).not.toBeInTheDocument();
  });
});
