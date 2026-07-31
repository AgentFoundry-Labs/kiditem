import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductAbcDetailDialog } from './ProductAbcDetailDialog';

describe('ProductAbcDetailDialog', () => {
  it('explains gross-profit ABC evidence, lifecycle confidence, and data-quality reasons', () => {
    render(
      <ProductAbcDetailDialog
        open
        onOpenChange={() => undefined}
        product={{
          id: '11111111-1111-4111-8111-111111111111',
          code: 'KI-1',
          displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-1' },
          name: '관찰 상품',
          description: null,
          category: null,
          brand: null,
          tags: [],
          imageUrls: [],
          displayImageUrls: [],
          abcGrade: null,
          abcEvaluation: {
            abcGrade: null,
            provisionalGrade: 'B',
            lifecycleStage: 'PROVISIONAL',
            confidence: 'LOW',
            eligibilityReason: 'MISSING_COST',
            riskFlags: ['LIMITED_HISTORY'],
            observedCompleteMonths: 4,
            observationStartMonth: '2026-04',
            periodMetricValue: null,
            rankingValue: null,
            grossRevenue: 120_000,
            grossCost: null,
            grossProfit: null,
            grossMarginRate: null,
            contributionRate: null,
            cumulativeContributionRate: null,
            calculatedAt: '2026-08-01T00:00:00.000Z',
            sourceCapturedAt: '2026-07-31T00:00:00.000Z',
          },
          profitTag: null,
          adTier: null,
          adBudgetLimit: null,
          healthScore: null,
          healthUpdatedAt: null,
          isActive: true,
        }}
      />,
    );

    expect(screen.getByText('매출총이익 = 결제금액 - 주문 시점 매입금액')).toBeInTheDocument();
    expect(screen.getByText('광고비·마켓 수수료·배송비·반품비는 포함하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByText('예비 등급')).toBeInTheDocument();
    expect(screen.getAllByText('낮음')).toHaveLength(2);
    expect(screen.getByText('주문 시점 원가 누락')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품 상세 보기' })).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
    expect(screen.queryByText(/순이익/)).not.toBeInTheDocument();
  });
});
