import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MasterProductOperationsMetadata } from '@kiditem/shared/product-operations';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductAbcDetailDialog } from './ProductAbcDetailDialog';

describe('ProductAbcDetailDialog', () => {
  it('shows the retained official evaluation beside live source and contribution data', () => {
    render(
      <ProductAbcDetailDialog
        open
        onOpenChange={() => undefined}
        product={product()}
      />,
    );

    expect(screen.getByText('공식 등급 기준일')).toBeInTheDocument();
    expect(screen.getByText('표시 데이터 기준일')).toBeInTheDocument();
    expect(screen.getByText('수익 데이터 관찰')).toBeInTheDocument();
    expect(screen.queryByText('주문 원천')).not.toBeInTheDocument();
    expect(screen.getByText(/PRODUCT_ABC_ABSOLUTE · v2 · 반감기 90일/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품 상세 보기' })).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
  });
});

function product(): MasterProductOperationsMetadata {
  const evaluation = productAbcEvaluation();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'KI-1',
    displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-1' },
    name: '자동 평가 상품',
    description: null,
    category: null,
    brand: null,
    tags: [],
    imageUrls: [],
    displayImageUrls: [],
    abcGrade: 'A',
    abcEvaluation: evaluation,
    abc: {
      abcGrade: 'A',
      evaluation,
      displayStatus: 'READY',
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: '2026-08-01T00:00:00.000Z',
      actualCutoffDate: '2026-08-31',
      sources: {
        sellpia: source('READY'),
        advertising: source('READY'),
        mapping: { status: 'READY', mappingGeneration: '7' },
      },
    },
    contribution: {
      masterProductId: '11111111-1111-4111-8111-111111111111',
      revenue: 220_000,
      operatingProfit: 125_000,
      salesContribution: 1,
      positiveOperatingProfitContribution: 1,
      lossImpact: null,
      salesRank: 1,
      positiveOperatingProfitRank: 1,
      lossRank: null,
      cumulativeSalesContribution: 1,
      cumulativePositiveOperatingProfitContribution: 1,
      cumulativeLossImpact: null,
      metricCompleteness: { sales: true, operatingProfit: true },
    },
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
  };
}

function source(status: 'READY') {
  return {
    status,
    sourceImportRunId: '11111111-1111-4111-8111-111111111112',
    generation: '7',
    coverageStartDate: '2026-01-01',
    coverageEndDate: '2026-08-31',
    actualCutoffDate: '2026-08-31',
    capturedAt: '2026-09-01T00:00:00.000Z',
    latestAttemptState: 'COMPLETE' as const,
    errorCode: null,
  };
}
