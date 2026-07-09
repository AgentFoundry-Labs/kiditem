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
});
