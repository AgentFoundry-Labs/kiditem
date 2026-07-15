import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductHubWorkspace } from './ProductHubWorkspace';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/product-hub',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

vi.mock('./ProductsPageContent', () => ({
  default: () => <div>product list workspace</div>,
}));
vi.mock('./ProductOptionsWorkspace', () => ({
  ProductOptionsWorkspace: () => <div>product options workspace</div>,
}));

describe('<ProductHubWorkspace>', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
  });

  it('switches list/options from the URL and unmounts the inactive query surface', () => {
    navigation.params = new URLSearchParams('view=options&query=shirt');
    render(<ProductHubWorkspace />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('product options workspace')).toBeInTheDocument();
    expect(screen.queryByText('product list workspace')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
});
