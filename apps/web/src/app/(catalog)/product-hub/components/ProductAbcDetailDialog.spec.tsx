import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MasterProductOperationsMetadata } from '@kiditem/shared/product-operations';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductAbcDetailDialog } from './ProductAbcDetailDialog';

describe('ProductAbcDetailDialog', () => {
  it('explains automatic profitability ABC evidence and temporary zero cost components', () => {
    render(
      <ProductAbcDetailDialog
        open
        onOpenChange={() => undefined}
        product={product()}
      />,
    );

    expect(screen.getByText('상품 이익 = 매출 − 주문 시점 매입액 − 광고비 − 판매 수수료 − 출고물류비 − 반품손실 − 기타 변동비')).toBeInTheDocument();
    expect(screen.getByText(/원천 연결 전까지 0원\(미적용\)/)).toBeInTheDocument();
    expect(screen.getByText('수익 데이터 관찰')).toBeInTheDocument();
    expect(screen.queryByText('주문 원천')).not.toBeInTheDocument();
    expect(screen.getAllByText(/0원 · NOT_APPLIED/)).toHaveLength(4);
    expect(screen.getByText(/ABC_V1 · v1 · 반감기 90일 · 학습 표본 100개/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품 상세 보기' })).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
  });
});

function product(): MasterProductOperationsMetadata {
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
    abcEvaluation: productAbcEvaluation(),
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
  };
}
