import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOfficeSeat } from '../lib/agent-office-layout';
import { AgentOfficeAvatar } from './AgentOfficeAvatar';
import { makeAgentOfficeNode } from '../test-utils/agent-office-fixtures';

const baseNode = makeAgentOfficeNode({
  id: 'agent-manager',
  status: 'working',
  activeRunCount: 1,
  pendingApprovalCount: 0,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 1,
  effectiveModel: 'gpt-5.1-codex',
});

describe('AgentOfficeAvatar', () => {
  const animate = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    animate.mockReset();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects the employee and does not animate initial render', () => {
    const onSelect = vi.fn();

    render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel="실행 running"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄, 집중 중' }));
    expect(onSelect).toHaveBeenCalledWith('agent-manager');
    expect(animate).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('animates once and shows a six-second bubble after a status change', () => {
    const seat = getOfficeSeat('manager', 0);
    const { rerender } = render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={seat}
        selected={false}
        activityLabel="실행 running"
        onSelect={vi.fn()}
      />,
    );

    const waitingNode = { ...baseNode, status: 'waiting' as const };
    rerender(
      <AgentOfficeAvatar
        node={waitingNode}
        seat={seat}
        selected={false}
        activityLabel="요청 pending"
        onSelect={vi.fn()}
      />,
    );

    expect(animate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('요청 pending');

    rerender(
      <AgentOfficeAvatar
        node={waitingNode}
        seat={seat}
        selected={false}
        activityLabel="요청 pending"
        onSelect={vi.fn()}
      />,
    );
    expect(animate).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('skips motion for reduced-motion users', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const seat = getOfficeSeat('manager', 0);
    const { rerender } = render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={seat}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    rerender(
      <AgentOfficeAvatar
        node={{ ...baseNode, status: 'blocked' }}
        seat={seat}
        selected={false}
        activityLabel="승인 요청"
        onSelect={vi.fn()}
      />,
    );

    expect(animate).not.toHaveBeenCalled();
  });

  it.each([
    ['working', '집중 중'],
    ['waiting', '대기 중'],
    ['blocked', '승인 필요'],
    ['idle', '준비됨'],
    ['offline', '오프라인'],
  ] as const)('renders %s with a textual status indicator', (status, label) => {
    render(
      <AgentOfficeAvatar
        node={{ ...baseNode, status }}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: `운영 총괄, ${label}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to the default avatar asset when a role asset fails', () => {
    render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    const image = screen.getByTestId('employee-avatar-image');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', expect.stringContaining('default.png'));
  });
});
