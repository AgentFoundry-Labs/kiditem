import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductAbcBadge } from './ProductAbcBadge';

function evaluation(overrides = {}) {
  return {
    abcGrade: null,
    provisionalGrade: null,
    lifecycleStage: 'ESTABLISHED' as const,
    confidence: 'HIGH' as const,
    eligibilityReason: 'ELIGIBLE' as const,
    riskFlags: [],
    observedCompleteMonths: 12,
    observationStartMonth: '2025-07',
    periodMetricValue: 100,
    rankingValue: 100,
    grossRevenue: 200,
    grossCost: 100,
    grossProfit: 100,
    grossMarginRate: 50,
    contributionRate: 70,
    cumulativeContributionRate: 70,
    calculatedAt: '2026-07-18T00:00:00.000Z',
    sourceCapturedAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductAbcBadge', () => {
  it('renders official, lifecycle, risk, and unpublished states without calling gross profit net profit', () => {
    const { rerender } = render(<ProductAbcBadge grade="A" evaluation={evaluation({ abcGrade: 'A' })} />);
    expect(screen.getByText('A등급')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade={null} evaluation={evaluation({ lifecycleStage: 'NEW', confidence: 'LOW', observedCompleteMonths: 2 })} />);
    expect(screen.getByText('NEW · 2/3개월')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade={null} evaluation={evaluation({ lifecycleStage: 'PROVISIONAL', confidence: 'LOW', observedCompleteMonths: 4, provisionalGrade: 'B' })} />);
    expect(screen.getByText('예비 B · 4/6개월')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade={null} evaluation={evaluation({ grossProfit: -1, riskFlags: ['LOSS'] })} />);
    expect(screen.getByText('손실')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade={null} evaluation={evaluation({ grossProfit: 0, riskFlags: ['ZERO_VALUE'] })} />);
    expect(screen.getByText('가치 0')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade={null} evaluation={null} />);
    expect(screen.getByText('미분류')).toBeInTheDocument();
  });

  it('keeps lifecycle risk secondary and exposes the metric, confidence, and reason accessibly', () => {
    render(<ProductAbcBadge
      grade={null}
      compact
      showConfidence
      evaluation={evaluation({ lifecycleStage: 'NEW', confidence: 'LOW', observedCompleteMonths: 2, grossProfit: -5, riskFlags: ['LOSS'] })}
    />);

    expect(screen.getByText('NEW · 2/3개월')).toBeInTheDocument();
    expect(screen.getByText('손실')).toBeInTheDocument();
    expect(screen.getByText('낮음')).toBeInTheDocument();
    expect(screen.getByLabelText(/매출총이익 기준 · 관찰 2개월 · 신뢰도 낮음 · 상태 평가 가능/)).toBeInTheDocument();
  });
});
