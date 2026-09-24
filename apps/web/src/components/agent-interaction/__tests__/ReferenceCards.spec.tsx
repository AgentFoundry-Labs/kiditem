import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceReferenceCard } from '../ResourceReferenceCard';

function renderWithQuery(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );
}

describe('Agent result reference cards', () => {
  it('links a purchase-order reference only to its verified destination without exposing its opaque ID', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'purchase_order', id: 'purchase/order?1', version: 'v7' }} />);

    expect(screen.getByRole('heading', { name: '발주서' })).toBeVisible();
    expect(screen.getByRole('link', { name: '발주서 열기' }))
      .toHaveAttribute('href', '/purchase-orders?orderId=purchase%2Forder%3F1');
    expect(screen.queryByText('purchase/order?1')).not.toBeInTheDocument();
    expect(screen.queryByText('v7')).not.toBeInTheDocument();
  });

  it('links a sales product draft to its collected-product route', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'sales_product', id: 'product/123', version: null }} />);

    expect(screen.getByRole('heading', { name: '판매상품 초안' })).toBeVisible();
    expect(screen.getByRole('link', { name: '판매상품 초안 열기' }))
      .toHaveAttribute('href', '/product-pipeline/collected-products/product%2F123');
    expect(screen.queryByText('product/123')).not.toBeInTheDocument();
  });

  it('shows a sourcing candidate without a link, because the screen opens by draft', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'sourcing_candidate', id: 'candidate/123', version: null }} />);

    expect(screen.getByRole('heading', { name: '소싱 후보' })).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps an unknown resource kind as a safe non-action card', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'internal_projection', id: 'internal-123', version: 'v9' }} />);

    expect(screen.getByRole('heading', { name: '업무 결과' })).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('internal_projection')).not.toBeInTheDocument();
    expect(screen.queryByText('internal-123')).not.toBeInTheDocument();
    expect(screen.queryByText('v9')).not.toBeInTheDocument();
  });

});
