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
  default: ({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) => {
    const Heading = `h${headingLevel}` as const;
    return <Heading>상품 카탈로그</Heading>;
  },
}));
vi.mock('./ProductOptionsWorkspace', () => ({
  ProductOptionsWorkspace: ({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) => {
    const Heading = `h${headingLevel}` as const;
    return <Heading>상품 옵션 관리</Heading>;
  },
}));

describe('<ProductHubWorkspace>', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
  });

  it('renders the former product list without the replacement operations shell', () => {
    render(<ProductHubWorkspace />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 카탈로그' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: '상품 카탈로그' })).not.toBeInTheDocument();
    expect(screen.queryByText('상품 운영')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders the former options screen for the canonical view while retaining unrelated query state', () => {
    navigation.params = new URLSearchParams('view=options&search=shirt&page=2&filter=active');
    render(<ProductHubWorkspace />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 옵션 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '상품 카탈로그' })).not.toBeInTheDocument();
    expect(screen.queryByText('상품 운영')).not.toBeInTheDocument();
    expect(navigation.params.toString()).toBe('view=options&search=shirt&page=2&filter=active');
  });
});
