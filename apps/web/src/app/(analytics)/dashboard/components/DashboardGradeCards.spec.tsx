import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import { DashboardGradeCards } from './DashboardGradeCards';

const summary = {
  gradeCount: { A: 2, B: 1, C: 1 },
  classifiedProductCount: 4,
  unclassifiedProductCount: 6,
  abcStatusCount: {
    READY: 4, INSUFFICIENT_EVIDENCE: 2, SOURCE_UNMAPPED: 1,
    SELLPIA_SOURCE_STALE: 2, AD_SOURCE_STALE: 1,
  },
  abcContributionProfit: {
    amountByGrade: { A: 12_000, B: 4_000, C: -500 },
    shareByGrade: { A: 0.77, B: 0.26, C: -0.03 },
  },
  abcFormula: null,
};

// The panel now triggers Products' recalculation, so it needs a query client.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DashboardGradeCards', () => {
  it('shows evidence waiting and source attention without claiming automatic work is running', () => {
    render(<DashboardGradeCards {...summary} refetchReads={async () => {}} asOf="상품 관리에서 새로고침한 시점" />, { wrapper });

    expect(screen.getByRole('link', { name: /평가 대기.*2개/ })).toHaveAttribute(
      'href', '/product-hub?abcGrade=unclassified',
    );
    expect(screen.getByRole('link', { name: /원천 확인 필요.*4개/ })).toHaveAttribute(
      'href', '/product-hub?dataStatus=abc',
    );
    expect(screen.getByText('유효 매핑의 최초 판매일로부터 30일 경과 후 평가 가능')).toBeInTheDocument();
    expect(screen.queryByText(/유효 관측일/)).not.toBeInTheDocument();
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
});
