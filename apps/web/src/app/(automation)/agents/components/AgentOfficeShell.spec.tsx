import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeShell } from './AgentOfficeShell';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

const model: AgentOfficeViewModel = {
  nodes: [
    {
      id: 'agent-manager',
      name: 'Operator',
      agentType: 'manager',
      title: '대표실',
      status: 'working',
      x: 18,
      y: 24,
      activeRunCount: 1,
      pendingApprovalCount: 0,
      lastActivityAt: '2026-07-09T00:00:00.000Z',
    },
  ],
  activities: [],
  totals: {
    agents: 1,
    working: 1,
    waiting: 0,
    blocked: 0,
    pendingApprovals: 0,
    runningRuns: 1,
    totalCostMicros: '0',
  },
};

describe('AgentOfficeShell', () => {
  it('preserves a null selection without falling back to the first node', () => {
    render(
      <AgentOfficeShell
        model={model}
        selectedNodeId={null}
        command=""
        commandPending={false}
        refreshing={false}
        onSelectNode={vi.fn()}
        onCommandChange={vi.fn()}
        onSubmitCommand={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('직원을 선택하세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operator/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
