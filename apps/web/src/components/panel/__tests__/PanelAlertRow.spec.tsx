import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelAlertRow } from '../PanelAlertRow';
import type { PanelAlertItem } from '@kiditem/shared';

vi.mock('../PromoteToTaskModal', () => ({
  PromoteToTaskModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="promote-modal" onClick={onClose}>모달</div> : null,
}));

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

  it('renders "할 일로 만들기" button when actionTaskId is null', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    expect(screen.getByRole('button', { name: '할 일로 만들기' })).toBeInTheDocument();
  });

  it('does not render button when actionTaskId is set', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: 'uuid-1234' })} />);
    expect(screen.queryByRole('button', { name: '할 일로 만들기' })).not.toBeInTheDocument();
  });

  it('renders linked badge when actionTaskId is set', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: 'uuid-1234' })} />);
    expect(screen.getByText('← 할 일 목록에 있음')).toBeInTheDocument();
  });

  it('does not render linked badge when actionTaskId is null', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    expect(screen.queryByText('← 할 일 목록에 있음')).not.toBeInTheDocument();
  });

  it('opens PromoteToTaskModal when button is clicked', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    expect(screen.queryByTestId('promote-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '할 일로 만들기' }));
    expect(screen.getByTestId('promote-modal')).toBeInTheDocument();
  });

  it('closes modal when onClose is called', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    fireEvent.click(screen.getByRole('button', { name: '할 일로 만들기' }));
    expect(screen.getByTestId('promote-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('promote-modal'));
    expect(screen.queryByTestId('promote-modal')).not.toBeInTheDocument();
  });

  it('button click does not propagate to row', () => {
    const rowClickSpy = vi.fn();
    const { container } = render(
      <div onClick={rowClickSpy}>
        <PanelAlertRow item={makeAlert({ actionTaskId: null })} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: '할 일로 만들기' }));
    expect(rowClickSpy).not.toHaveBeenCalled();
    // container click should still propagate normally
    fireEvent.click(container.querySelector('.group')!);
    expect(rowClickSpy).toHaveBeenCalledTimes(1);
  });

  it('button has aria-label for keyboard accessibility', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    const btn = screen.getByRole('button', { name: '할 일로 만들기' });
    expect(btn).toHaveAttribute('aria-label', '할 일로 만들기');
  });

  it('button is natively focusable (no tabIndex=-1)', () => {
    render(<PanelAlertRow item={makeAlert({ actionTaskId: null })} />);
    const btn = screen.getByRole('button', { name: '할 일로 만들기' });
    expect(btn.tabIndex).not.toBe(-1);
  });
});
