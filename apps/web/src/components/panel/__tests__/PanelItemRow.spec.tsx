import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelItemRow } from '../PanelItemRow';
import type { PanelItem } from '@kiditem/shared/panel';

const makeRunItem = (overrides = {}): PanelItem => ({
  kind: 'run',
  id: 'run-1',
  source: 'workflow' as const,
  sourceId: 'wf-1',
  seq: 1,
  status: 'running' as const,
  title: '워크플로우 실행',
  deepLink: '/workflows',
  actorUserId: null,
  visibility: 'organization' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

const makeAlertItem = (overrides = {}): PanelItem => ({
  kind: 'alert',
  id: '00000000-0000-0000-0000-000000000001',
  alertKind: 'signal',
  status: 'open',
  severity: 'warning',
  type: 'internal:rules',
  title: '규칙 위반 감지',
  message: '규칙 상세',
  targetType: null,
  targetId: null,
  operationKey: null,
  sourceType: null,
  sourceId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  readAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelItemRow', () => {
  it('renders a run in the common notification row with local hide control', () => {
    render(<PanelItemRow item={makeRunItem()} />);

    expect(screen.getByRole('link', { name: '이동' })).toHaveAttribute('href', '/workflows');
    expect(screen.getByText('워크플로우 실행')).toBeInTheDocument();
    expect(screen.getByLabelText('상태: 진행 중')).toBeInTheDocument();
    expect(screen.getByText('워크플로우')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '워크플로우 화면에서 숨기기' }))
      .toBeInTheDocument();
  });

  it('renders an OperationRun panel source through the common row contract', () => {
    render(<PanelItemRow item={makeRunItem({ source: 'operation', subtitle: '실행 중' })} />);

    expect(screen.getByText('실행 중')).toBeInTheDocument();
  });

  it('does not offer local hiding for a terminal run', () => {
    render(<PanelItemRow item={makeRunItem({ status: 'succeeded' })} />);

    expect(screen.queryByRole('button', { name: '워크플로우 화면에서 숨기기' }))
      .not.toBeInTheDocument();
  });

  it('routes kind=alert to the alert renderer', () => {
    render(<PanelItemRow item={makeAlertItem()} />);
    expect(screen.getByText('규칙 위반 감지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '할 일로 만들기' })).toBeInTheDocument();
  });
});
