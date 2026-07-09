import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentOsOpsPage from '../page';

vi.mock('../hooks/useAgentOffice', () => ({
  useAgentOffice: () => ({
    model: {
      nodes: [
        {
          id: 'agent-manager',
          name: 'Operator',
          agentType: 'manager',
          title: '대표실',
          status: 'idle',
          x: 18,
          y: 24,
          activeRunCount: 0,
          pendingApprovalCount: 0,
          lastActivityAt: null,
        },
      ],
      activities: [],
      totals: {
        agents: 1,
        working: 0,
        waiting: 0,
        blocked: 0,
        pendingApprovals: 0,
        runningRuns: 0,
        totalCostMicros: '0',
      },
    },
    selectedNodeId: 'agent-manager',
    setSelectedNodeId: vi.fn(),
    command: '',
    setCommand: vi.fn(),
    submitCommand: vi.fn(),
    commandPending: false,
    isPending: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('Agent OS HQ page', () => {
  it('renders the virtual office HQ shell', () => {
    render(<AgentOsOpsPage />);

    expect(screen.getByText('Agent OS HQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operator/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('직원에게 요청하기')).toBeInTheDocument();
  });
});
