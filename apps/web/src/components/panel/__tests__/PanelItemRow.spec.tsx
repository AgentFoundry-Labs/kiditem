import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelItemRow } from '../PanelItemRow';
import type { PanelItem } from '@kiditem/shared/panel';

// next/navigation mock
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const makeRunItem = (overrides = {}): PanelItem => ({
  kind: 'run',
  id: 'run-1',
  source: 'workflow' as const,
  sourceId: 'wf-1',
  seq: 1,
  status: 'running' as const,
  title: '워크플로우 실행',
  deepLink: '/workflows/wf-1',
  actorUserId: null,
  visibility: 'company' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

const makeAlertItem = (overrides = {}): PanelItem => ({
  kind: 'alert',
  id: '00000000-0000-0000-0000-000000000001',
  severity: 'warning',
  type: 'internal:rules',
  title: '규칙 위반 감지',
  message: '규칙 상세',
  targetType: null,
  targetId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelItemRow', () => {
  it('routes kind=run to run renderer (renders button with title)', () => {
    render(<PanelItemRow item={makeRunItem()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('워크플로우 실행')).toBeInTheDocument();
  });

  it('routes kind=alert to alert renderer (renders alert title)', () => {
    render(<PanelItemRow item={makeAlertItem()} />);
    expect(screen.getByText('규칙 위반 감지')).toBeInTheDocument();
    // "할 일로 만들기" button present when actionTaskId=null
    expect(screen.getByRole('button', { name: '할 일로 만들기' })).toBeInTheDocument();
  });
});
