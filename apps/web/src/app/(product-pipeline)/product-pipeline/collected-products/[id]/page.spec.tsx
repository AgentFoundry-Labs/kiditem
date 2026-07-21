import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailPage from './page';

const { productWorkspaceProps, searchParamsValue } = vi.hoisted(() => ({
  productWorkspaceProps: [] as Array<Record<string, unknown>>,
  searchParamsValue: { current: '' },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'candidate-1' }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

vi.mock('../../_shared/components/workspace/ProductWorkspaceScreen', () => ({
  ProductWorkspaceScreen: (props: Record<string, unknown>) => {
    productWorkspaceProps.push(props);
    return <div data-testid="collected-product-workspace" />;
  },
}));

describe('ProductDetailPage navigation', () => {
  beforeEach(() => {
    productWorkspaceProps.length = 0;
    searchParamsValue.current = '';
  });

  it('returns a newly generated product to the product generation page', () => {
    searchParamsValue.current = 'returnTo=%2Fproduct-pipeline%2Fproductgenerate';

    render(<ProductDetailPage />);

    expect(productWorkspaceProps.at(-1)).toEqual(expect.objectContaining({
      backHref: '/product-pipeline/productgenerate',
      selfHref:
        '/product-pipeline/collected-products/candidate-1?returnTo=%2Fproduct-pipeline%2Fproductgenerate',
    }));
  });
});
