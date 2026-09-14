import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductAbcDetailDialog } from './ProductAbcDetailDialog';
import type { MasterProductOperationsMetadata } from '@kiditem/shared/product-operations';

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
    expect(screen.getByText('계산 완료')).toBeInTheDocument();
    expect(screen.getByText('매핑 최신 · 현재 세대 7 · 근거 세대 7')).toBeInTheDocument();
    expect(screen.queryByText(/\bREADY\b/)).not.toBeInTheDocument();
    expect(screen.queryByText('주문 원천')).not.toBeInTheDocument();
    expect(screen.getByText(/PRODUCT_ABC_ABSOLUTE · v2 · 반감기 90일/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품 상세 보기' })).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
  });

  it('labels a retained completed source with the shared stale readiness word', () => {
    const value = product();
    value.abc.sources.sellpia = {
      ...value.abc.sources.sellpia,
      ready: false,
      actualCutoff: '2026-08-31',
      latestComplete: { actualCutoff: '2026-08-31' },
    };

    render(
      <ProductAbcDetailDialog
        open
        onOpenChange={() => undefined}
        product={value}
      />,
    );

    expect(screen.getByText('갱신 필요 · 2026-08-31까지')).toBeInTheDocument();
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
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: '2026-08-01T00:00:00.000Z',
      actualCutoffDate: '2026-08-31',
      sources: {
        sellpia: source(),
        advertising: source(),
        mapping: {
          valid: true,
          currentMappingGeneration: '7',
          evidenceMappingGeneration: '7',
        },
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
    adBudgetLimit: null,
    isActive: true,
  };
}

function source() {
  return {
    ready: true,
    requiredCutoff: '2026-08-31',
    actualCutoff: '2026-08-31',
    latestAttempt: { state: 'COMPLETE' as const },
    latestComplete: { actualCutoff: '2026-08-31' },
  };
}
