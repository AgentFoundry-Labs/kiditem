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

describe('DashboardGradeCards', () => {
  it('shows evidence waiting and source attention without claiming automatic work is running', () => {
    render(<DashboardGradeCards {...summary} />);

    expect(screen.getByRole('link', { name: /평가 대기.*2개/ })).toHaveAttribute(
      'href', '/product-hub?abcGrade=unclassified',
    );
    expect(screen.getByRole('link', { name: /원천 확인 필요.*4개/ })).toHaveAttribute(
      'href', '/product-hub?dataStatus=abc',
    );
    expect(screen.getByText('유효 매핑의 최초 판매일로부터 30일 경과 후 평가 가능')).toBeInTheDocument();
    expect(screen.queryByText(/유효 관측일/)).not.toBeInTheDocument();
    expect(screen.getByText('상품 관리에서 등급 새로고침을 실행하세요.')).toBeInTheDocument();
    expect(screen.queryByText(/자동 계산|자동 평가|NaN/)).not.toBeInTheDocument();
  });

  it('shows the fixed formula version without an invented activation timestamp', () => {
    render(<DashboardGradeCards {...summary} abcFormula={PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD} />);

    expect(screen.getByText(`절대평가 v${PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version} · 반감기 ${PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.halfLifeDays}일`)).toBeInTheDocument();
    expect(screen.queryByText(/활성화|Invalid Date/)).not.toBeInTheDocument();
  });
});
