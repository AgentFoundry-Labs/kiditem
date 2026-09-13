import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import { DashboardGradeCards } from './DashboardGradeCards';

const summary = {
  gradeCount: { A: 2, B: 1, C: 1 },
  classifiedProductCount: 4,
  abcStatusCount: {
    READY: 4, INSUFFICIENT_EVIDENCE: 2, SOURCE_UNMAPPED: 1,
    SELLPIA_SOURCE_STALE: 2, AD_SOURCE_STALE: 1,
  },
  abcContributionProfit: {
    amountByGrade: { A: 12_000, B: 4_000, C: -500 },
    shareByGrade: { A: 0.77, B: 0.26, C: -0.03 },
    basis: { publicationRevision: null, officialCutoffDate: null, publishedAt: null, sellpiaSourceImportRunId: null, advertisingSourceImportRunId: null, mappingGeneration: null, includedProductCount: 0, withheldProductCount: 0, denominator: 15_500 },
  },
  abcFormula: null,
};
const unavailableAbcBasis = {
  kind: 'snapshot' as const,
  measured: false,
  asOf: null,
  requiredAsOf: '2026-08-31',
  observedAt: null,
  sources: ['products', 'product_abc'],
  withheldCount: 4,
};

// The panel now triggers Products' recalculation, so it needs a query client.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DashboardGradeCards', () => {
  /**
   * The panel is three grades. It used to carry two more cells — 평가 대기 and
   * 원천 확인 필요 — which counted populations rather than grades, and 원천 확인
   * 필요 published the same number the attention rail already showed as ABC
   * 미분류. A count an operator has to act on belongs in the rail.
   */
  it('keeps grade, denominator, and ready counts unavailable without ABC evidence', () => {
    render(<DashboardGradeCards {...summary} basis={unavailableAbcBasis} refetchReads={async () => {}} />, { wrapper });

    for (const grade of ['A', 'B', 'C']) {
      const cell = screen.getByRole('link', { name: new RegExp(`^${grade}등급`) });
      expect(cell).toHaveAccessibleName(/미수집/);
      expect(cell).toHaveTextContent(`${grade}—`);
    }
    expect(screen.getByRole('link', { name: '계산 완료 —' })).toBeInTheDocument();
    expect(screen.queryByText('평가 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('원천 확인 필요')).not.toBeInTheDocument();
    // Which calculation produced these grades identifies the panel; it is not
    // a caption under it.
    expect(screen.getByRole('heading', { name: '수익성 ABC' }))
      .toHaveAttribute('title', '상품 관리에서 등급 새로고침을 실행하세요.');
    expect(screen.queryByText(/자동 계산|자동 평가|NaN/)).not.toBeInTheDocument();
  });

  it('shows the fixed formula version without an invented activation timestamp', () => {
    render(<DashboardGradeCards {...summary} abcFormula={PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD} refetchReads={async () => {}} asOf="상품 관리에서 새로고침한 시점" />, { wrapper });

    expect(screen.getByRole('heading', { name: '수익성 ABC' })).toHaveAttribute(
      'title',
      `절대평가 v${PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version} · 반감기 ${PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.halfLifeDays}일`,
    );
    expect(screen.queryByText(/활성화|Invalid Date/)).not.toBeInTheDocument();
  });

  it('withholds contribution without its basis and discloses the owner publication when measured', () => {
    const { rerender } = render(
      <DashboardGradeCards {...summary} refetchReads={async () => {}} />,
      { wrapper },
    );
    expect(screen.getByRole('link', { name: /A등급/ })).toHaveAccessibleName(/가중 영업이익 미수집/);

    const measured = {
      kind: 'snapshot' as const,
      measured: true,
      asOf: '2026-08-31',
      requiredAsOf: '2026-08-31',
      observedAt: '2026-09-01T00:00:00.000Z',
      sources: ['products', 'product_abc'],
      withheldCount: 1,
    };
    rerender(
      <DashboardGradeCards
        {...summary}
        abcFormula={PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD}
        abcContributionProfit={{
          ...summary.abcContributionProfit,
          basis: {
            ...summary.abcContributionProfit.basis,
            publicationRevision: 7,
            officialCutoffDate: '2026-08-31',
            includedProductCount: 1,
            withheldProductCount: 1,
          },
        }}
        contributionBasis={measured}
        basis={measured}
        refetchReads={async () => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /A등급/ })).toHaveAccessibleName(/12,000원/);
    fireEvent.click(screen.getByRole('button', { name: '수익성 ABC 근거 안내' }));
    expect(screen.getByTestId('abc-contribution-evidence')).toHaveTextContent(
      '공표 r7 · 2026-08-31 · 산식 v2 · 포함 1개 · 보류 1개',
    );
  });
});
