import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsOperationsPanel } from './AgentOsOperationsPanel';

vi.mock('../../hooks/use-agent-os-operations', () => ({
  useAgentOsOperations: () => ({
    definitions: [{
      key: 'sourcing.collect_daily_trends',
      version: 1,
      title: '일일 트렌드 수집',
      ownerDomain: 'sourcing',
      engineType: 'composite',
      scheduleSupported: true,
    }],
    latestRuns: new Map(),
    schedules: new Map(),
    isLoading: false,
    error: null,
    startOperation: { isPending: false, mutate: vi.fn() },
    cancelOperation: { isPending: false, mutate: vi.fn() },
    retryBrowserOperation: { isPending: false, mutate: vi.fn() },
    saveSchedule: { isPending: false, mutate: vi.fn() },
  }),
}));

describe('AgentOsOperationsPanel', () => {
  it('keeps operation execution and schedule controls inside the existing Agent OS surface', () => {
    render(<AgentOsOperationsPanel />);

    expect(screen.getByRole('region', { name: 'Agent OS 작업 실행 및 예약' })).toBeInTheDocument();
    expect(screen.getByText('일일 트렌드 수집')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '실행' })).toBeInTheDocument();
    expect(screen.getByLabelText('일일 트렌드 수집 cron')).toHaveValue('0 2 * * *');
  });
});
