import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentOsPage from '../page';

vi.mock('../hooks/useAgentOffice', () => ({
  useAgentOffice: () => ({
    model: {
      nodes: [
        {
          id: 'agent-manager',
          name: 'Operator',
          agentType: 'manager',
          title: '대표실',
          displayName: '운영 총괄',
          responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
          status: 'idle',
          activeRunCount: 0,
          pendingApprovalCount: 0,
          lastActivityAt: null,
          trustLevel: 1,
          adapterType: 'hermes_local',
          effectiveModel: 'gpt-5.1-codex',
          capabilities: [],
        },
      ],
      capabilities: [],
      activities: [],
      totals: {
        agents: 1,
        employees: 1,
        capabilities: 0,
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

describe('Agent OS canonical page', () => {
  it('renders the virtual office HQ shell at /agent-os', () => {
    render(<AgentOsPage />);

    expect(screen.getByText('Agent OS 사무실')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /운영 총괄/ })).toHaveLength(2);
    expect(
      screen.getByRole('complementary', { name: '인력 배치' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '운영 캔버스' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '직원 프로필' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: '선택 직원 업무 지시' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: '시스템 활동 기록' }),
    ).not.toBeInTheDocument();
  });
});
