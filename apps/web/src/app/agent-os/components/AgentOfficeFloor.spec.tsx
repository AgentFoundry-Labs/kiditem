import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getOfficeSeat } from '../lib/agent-office-layout';
import { AgentOfficeFloor } from './AgentOfficeFloor';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const manager: AgentOfficeNode = {
  id: 'agent-manager',
  name: 'Operator',
  agentType: 'manager',
  title: '대표실',
  displayName: '운영 총괄',
  responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
  status: 'working',
  activeRunCount: 1,
  pendingApprovalCount: 0,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 1,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.1-codex',
  capabilities: [],
};

describe('AgentOfficeFloor', () => {
  it('renders the code-driven floor and selectable zones', () => {
    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId('office-floor-svg')).toBeInTheDocument();
    expect(screen.getAllByTestId('office-desk-fixture')).toHaveLength(7);

    const meeting = screen.getByRole('button', {
      name: '승인 및 협업 공간 구역',
    });
    fireEvent.click(meeting);
    expect(meeting).toHaveAttribute('aria-pressed', 'true');
    expect(meeting.style.width).toBe('');
    expect(meeting.style.height).toBe('');
    expect(meeting).toHaveAttribute('data-office-camera-control');
  });

  it('selects the employee assigned to a clicked desk', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });

  it('keeps desk interaction separate from zone selection', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '직원 업무 공간 구역' }));
    fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });
});
