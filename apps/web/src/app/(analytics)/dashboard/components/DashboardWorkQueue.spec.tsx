import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardAgentSummary, DashboardUrgentQueue } from './DashboardWorkQueue';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

vi.mock('@/hooks/use-agent-org', () => ({
  useAgentOrg: () => ({ snapshot: { inbox: [], stages: [] }, now: 0 }),
}));

// 비용 칸은 `/api/ai/usage` 합계를 그대로 적는다. 여기서는 그 읽기를 세워 두고 칩만 본다.
const aiUsage = vi.hoisted(() => ({ data: undefined as { totals: { costMicroUsd: number } } | undefined }));
vi.mock('../../_shared/ai-usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../_shared/ai-usage')>()),
  useAiUsage: () => aiUsage,
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

  /** 이번 달 AI 비용 — 발표된 합계만 적고, 아직 못 읽었으면 0 이 아니라 '—' 다. */
  describe('이번 달 AI 비용', () => {
    it('아직 읽지 못했으면 0 으로 적지 않는다', () => {
      aiUsage.data = undefined;
      renderWork(measured);
      expect(screen.getByText('이번 달 비용').textContent).toBe('이번 달 비용—');
    });

    it('읽은 합계를 달러로 적고 원화 어림은 hover 로만 말한다', () => {
      aiUsage.data = { totals: { costMicroUsd: 12_340_000 } };
      renderWork(measured);
      const chip = screen.getByText('이번 달 비용');
      expect(chip.textContent).toBe('이번 달 비용$12.34');
      expect(chip).toHaveAttribute('title', expect.stringContaining('약 17,153원'));
    });
  });
});
