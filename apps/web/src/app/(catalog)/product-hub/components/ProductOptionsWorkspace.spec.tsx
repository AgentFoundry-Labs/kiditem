import { fireEvent, render, screen, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOptionsWorkspace } from './ProductOptionsWorkspace';

const pushMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/product-hub/options',
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => navigation.params,
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));

const data = {
  items: [
    {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
      code: 'SP-1001',
      name: '키즈 반팔 티셔츠',
      optionName: '보라 / 120',
      barcode: '8801234567890',
      currentStock: 12,
      purchasePrice: 5000,
      salePrice: 8900,
      isActive: true,
      stockValue: 60000,
      lastImportRunId: null,
      lastImportedAt: '2026-07-14T01:00:00.000Z',
      linkedVariantCount: 2,
      linkedProductCount: 1,
      linkedProducts: [{
        id: '10000000-0000-4000-8000-000000000001',
        code: 'KI-1001',
        name: '키즈 반팔 티셔츠',
      }],
      linkedVariants: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          masterProductId: '10000000-0000-4000-8000-000000000001',
          code: 'KI-1001-PURPLE-120',
          name: '보라 / 120',
          optionLabel: '색상: 보라 / 사이즈: 120',
        },
        {
          id: '20000000-0000-4000-8000-000000000002',
          masterProductId: '10000000-0000-4000-8000-000000000001',
          code: 'KI-1001-PURPLE-130',
          name: '보라 / 130',
          optionLabel: '색상: 보라 / 사이즈: 130',
        },
      ],
      linkStatus: 'linked' as const,
    },
    {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000002',
      code: 'SP-1002',
      name: '미연결 재고',
      optionName: null,
      barcode: null,
      currentStock: 0,
      purchasePrice: null,
      salePrice: null,
      isActive: true,
      stockValue: null,
      lastImportRunId: null,
      lastImportedAt: '2026-07-14T01:00:00.000Z',
      linkedVariantCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedVariants: [],
      linkStatus: 'unlinked' as const,
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
  summary: { totalSkus: 2, inStockSkus: 1, outOfStockSkus: 1, totalUnits: 12, pricedAssetValue: 60000, unpricedSkuCount: 1 },
  latestImport: null,
};

describe('<ProductOptionsWorkspace>', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
    pushMock.mockReset();
    refetchMock.mockReset();
    navigation.params = new URLSearchParams();
    vi.mocked(useQuery).mockReturnValue({
      data,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useQuery>);
  });

  it('renders every linked and unlinked Sellpia SKU in a dedicated read-only table', () => {
    render(<ProductOptionsWorkspace headingLevel={1} />);

    expect(screen.getByRole('heading', { name: '셀피아 재고', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Sellpia SKU ID', 'Sellpia 코드', '상품명', '옵션명', '바코드', '매입가', '판매가', '현재고', '상태', '연결 대상',
    ]);
    expect(screen.getByText('00000000-0000-4000-8000-000000000001')).toBeInTheDocument();
    expect(screen.getByText('SP-1001')).toBeInTheDocument();
    expect(screen.getByText('SP-1002')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'KI-1001 · 키즈 반팔 티셔츠' })).toHaveAttribute(
      'href',
      '/product-hub/10000000-0000-4000-8000-000000000001',
    );
    expect(screen.getByRole('link', { name: 'KI-1001-PURPLE-120 · 보라 / 120' })).toHaveAttribute(
      'href',
      '/product-hub/10000000-0000-4000-8000-000000000001#variant-20000000-0000-4000-8000-000000000001',
    );
    expect(within(screen.getByRole('table')).getByText('상품 1 · 옵션 2')).toBeInTheDocument();
    expect(screen.getAllByText('미연결').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /수정|삭제|복원/ })).not.toBeInTheDocument();
    expect(vi.mocked(useQuery).mock.calls[0]?.[0].queryKey).toEqual([
      'inventory', 'sellpia-skus',
      { page: '1', limit: '50', stockStatus: 'all', activeStatus: 'all' },
    ]);
  });

  it('queries only the Sellpia inventory owner with URL-authoritative link filters', () => {
    navigation.params = new URLSearchParams('search=SP-1001&stockStatus=in_stock&activeStatus=all&linkStatus=linked&page=2');
    render(<ProductOptionsWorkspace />);

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };
    expect(options.queryKey).toEqual(['inventory', 'sellpia-skus', {
      page: '2', limit: '50', stockStatus: 'in_stock', activeStatus: 'all', query: 'SP-1001', linkStatus: 'linked',
    }]);
    expect(options.queryFn.toString()).toContain('/api/inventory/sellpia-skus');
    expect(options.queryFn.toString()).not.toContain('/api/products/masters');
  });

  it('keeps filters, refresh, and server paging interactive', () => {
    navigation.params = new URLSearchParams('campaign=summer');
    render(<ProductOptionsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '미연결' }));
    expect(pushMock).toHaveBeenCalledWith('/product-hub/options?campaign=summer&linkStatus=unlinked&page=1');
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
