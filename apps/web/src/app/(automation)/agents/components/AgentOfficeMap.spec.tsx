import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeMap } from './AgentOfficeMap';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const nodes: AgentOfficeNode[] = [
  {
    id: 'agent-manager',
    name: 'Operator',
    agentType: 'manager',
    title: '대표실',
    status: 'working',
    x: 20,
    y: 30,
    activeRunCount: 1,
    pendingApprovalCount: 0,
    lastActivityAt: '2026-07-09T00:00:00.000Z',
  },
  {
    id: 'agent-qa',
    name: 'QA',
    agentType: 'reviewer',
    title: '검수실',
    status: 'idle',
    x: 78,
    y: 52,
    activeRunCount: 0,
    pendingApprovalCount: 0,
    lastActivityAt: '2026-07-09T01:00:00.000Z',
  },
];

describe('AgentOfficeMap', () => {
  it('renders staff nodes and notifies selection', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Operator/ }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });

  it('keeps a true no-selection state when selectedNodeId is null', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Operator/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /QA/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('anchors edge nodes inward so they stay visible on narrow screens', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Operator/ })).toHaveStyle({
      left: '20%',
      marginLeft: '0px',
      marginTop: '-37px',
    });
    expect(screen.getByRole('button', { name: /QA/ })).toHaveStyle({
      left: '78%',
      marginLeft: '-142px',
      marginTop: '-37px',
    });
  });
});
