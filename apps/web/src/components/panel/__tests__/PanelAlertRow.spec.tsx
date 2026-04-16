import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelAlertRow } from '../PanelAlertRow';
import type { PanelAlertItem } from '@kiditem/shared';

const makeAlert = (overrides: Partial<PanelAlertItem> = {}): PanelAlertItem => ({
  kind: 'alert',
  id: '00000000-0000-0000-0000-000000000001',
  severity: 'info',
  type: 'internal:rules',
  title: '테스트 알림',
  message: '상세 메시지',
  productId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelAlertRow', () => {
  it('renders title and message', () => {
    render(<PanelAlertRow item={makeAlert()} />);
    expect(screen.getByText('테스트 알림')).toBeInTheDocument();
    expect(screen.getByText('상세 메시지')).toBeInTheDocument();
  });

  it('renders info icon for severity=info', () => {
    const { container } = render(<PanelAlertRow item={makeAlert({ severity: 'info' })} />);
    // lucide-react Info icon has a specific path shape; we check for svg presence in icon container
    const iconDiv = container.querySelector('.bg-blue-50');
    expect(iconDiv).toBeInTheDocument();
  });

  it('renders warning icon (amber) for severity=warning', () => {
    const { container } = render(<PanelAlertRow item={makeAlert({ severity: 'warning' })} />);
    const iconDiv = container.querySelector('.bg-amber-50');
    expect(iconDiv).toBeInTheDocument();
  });

  it('renders error icon (red) for severity=error', () => {
    const { container } = render(<PanelAlertRow item={makeAlert({ severity: 'error' })} />);
    const iconDiv = container.querySelector('.bg-red-50');
    expect(iconDiv).toBeInTheDocument();
  });

  it('renders critical icon (red-100) for severity=critical', () => {
    const { container } = render(<PanelAlertRow item={makeAlert({ severity: 'critical' })} />);
    const iconDiv = container.querySelector('.bg-red-100');
    expect(iconDiv).toBeInTheDocument();
  });

  it('renders default Bell icon for unknown severity', () => {
    const { container } = render(<PanelAlertRow item={makeAlert({ severity: 'unknown' })} />);
    const iconDiv = container.querySelector('.bg-slate-100');
    expect(iconDiv).toBeInTheDocument();
  });

  it('shows unread indicator when isRead=false', () => {
    render(<PanelAlertRow item={makeAlert({ isRead: false })} />);
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });

  it('hides unread indicator when isRead=true', () => {
    render(<PanelAlertRow item={makeAlert({ isRead: true })} />);
    expect(screen.queryByLabelText('읽지 않음')).not.toBeInTheDocument();
  });

  it('renders without message when message is null', () => {
    render(<PanelAlertRow item={makeAlert({ message: null })} />);
    expect(screen.getByText('테스트 알림')).toBeInTheDocument();
  });
});
