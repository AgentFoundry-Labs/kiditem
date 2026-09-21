import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardAgentSummary, DashboardUrgentQueue } from './DashboardWorkQueue';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

vi.mock('@/hooks/use-agent-org', () => ({
  useAgentOrg: () => ({ snapshot: { inbox: [], stages: [] }, now: 0 }),
}));

const measured: DashboardFindings = {
  productSalesCapturedAt: null,
  reorderProductCount: 0,
  reorderSuggestions: [],
  salesDecline: { month: '2026-08', count: 0, keyProductLimit: 30, items: [] },
  registrationFailures: { count: 0, byChannel: [] },
};

function renderWork(findings: DashboardFindings | undefined, findingsError = false, findingsLoading = false) {
  render(<>
    <DashboardAgentSummary findings={findings} findingsError={findingsError} findingsLoading={findingsLoading} />
    <DashboardUrgentQueue findings={findings} findingsError={findingsError} findingsLoading={findingsLoading} />
  </>);
}

function moneyChip() { return screen.getByText('돈 새는 일').textContent; }

describe('Dashboard work read states', () => {
  it('does not turn failed findings, even cached zero, into an empty successful queue', () => {
    renderWork(measured, true);
    expect(moneyChip()).toBe('돈 새는 일—');
    expect(screen.getByText('내 결정').textContent).toBe('내 결정—');
    expect(screen.getByText(/업무 조회 실패/)).toBeInTheDocument();
    expect(screen.queryByText('지금 손이 필요한 일이 없습니다.')).not.toBeInTheDocument();
  });

  it('keeps initial loading unknown', () => {
    renderWork(undefined, false, true);
    expect(moneyChip()).toBe('돈 새는 일—');
    expect(screen.getByText('업무를 확인하고 있습니다')).toBeInTheDocument();
  });

  it('keeps successful but unmeasured depletion unknown', () => {
    renderWork({ ...measured, reorderSuggestions: null, salesDecline: { ...measured.salesDecline, count: null } });
    expect(moneyChip()).toBe('돈 새는 일—');
    expect(screen.getByText('판단할 수집 근거가 부족합니다')).toBeInTheDocument();
  });

  it('shows a measured zero and the empty queue only after complete successful reads', () => {
    renderWork(measured);
    expect(moneyChip()).toBe('돈 새는 일0');
    expect(screen.getByText('내 결정').textContent).toBe('내 결정0');
    expect(screen.getByText('지금 손이 필요한 일이 없습니다.')).toBeInTheDocument();
  });
});
