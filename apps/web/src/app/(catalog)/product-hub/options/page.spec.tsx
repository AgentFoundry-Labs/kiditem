import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuSnapshotListResponse } from '@kiditem/shared/inventory';
import { useProductHubPageState } from '../hooks/useProductHubPageState';
import ProductHubOptionsPage from './page';

vi.mock('../hooks/useProductHubPageState', () => ({
  PAGE_SIZE: 50,
  useProductHubPageState: vi.fn(),
}));

vi.mock('../matching/page', () => ({
  default: () => <h1>상품 매칭 센터</h1>,
}));

const data: InventorySkuSnapshotListResponse = {
  items: [
    {
      masterProductId: '00000000-0000-4000-8000-000000000001',
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
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  summary: {
    totalSkus: 1,
    inStockSkus: 1,
    outOfStockSkus: 0,
    totalUnits: 12,
    pricedAssetValue: 60000,
    unpricedSkuCount: 0,
  },
  latestImport: null,
};

describe('/product-hub/options', () => {
  it('renders a dedicated Sellpia option workspace instead of the matching page', () => {
    vi.mocked(useProductHubPageState).mockReturnValue({
      activeStatus: 'active',
      data,
      errorMessage: null,
      goToPage: vi.fn(),
      handleSearch: vi.fn(),
      isFetching: false,
      isLoading: false,
      isPlaceholderData: false,
      page: 1,
      refetch: vi.fn(),
      search: '',
      setActiveStatus: vi.fn(),
      setSearch: vi.fn(),
      setStockStatus: vi.fn(),
      stockStatus: 'all',
      totalPages: 1,
    });

    render(<ProductHubOptionsPage />);

    expect(
      screen.getByRole('heading', { name: '상품 옵션 관리' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '상품 매칭 센터' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Sellpia 코드',
      '상품명',
      '옵션명',
      '바코드',
      '매입가',
      '판매가',
      '현재고',
      '상태',
      '액션',
    ]);
    expect(screen.getByText('SP-1001')).toBeInTheDocument();
    expect(screen.getByText('보라 / 120')).toBeInTheDocument();
    expect(screen.getByText('8801234567890')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('활성')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/product-hub/00000000-0000-4000-8000-000000000001',
    );
    expect(screen.queryByRole('button', { name: /수정|삭제|복원/ })).not.toBeInTheDocument();
  });

  it('connects the restored filters and refresh action to the current snapshot query', () => {
    const handleSearch = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const refetch = vi.fn();
    const setActiveStatus = vi.fn();
    const setSearch = vi.fn();
    const setStockStatus = vi.fn();

    vi.mocked(useProductHubPageState).mockReturnValue({
      activeStatus: 'active',
      data,
      errorMessage: null,
      goToPage: vi.fn(),
      handleSearch,
      isFetching: false,
      isLoading: false,
      isPlaceholderData: false,
      page: 1,
      refetch,
      search: '',
      setActiveStatus,
      setSearch,
      setStockStatus,
      stockStatus: 'all',
      totalPages: 1,
    } as ReturnType<typeof useProductHubPageState> & {
      isFetching: boolean;
      refetch: typeof refetch;
    });

    render(<ProductHubOptionsPage />);

    fireEvent.change(
      screen.getByPlaceholderText('상품코드 · 상품명 · 옵션명 · 바코드 검색'),
      { target: { value: '티셔츠' } },
    );
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(screen.getByRole('button', { name: '품절' }));
    fireEvent.click(screen.getByRole('button', { name: '비활성' }));
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    expect(setSearch).toHaveBeenCalledWith('티셔츠');
    expect(handleSearch).toHaveBeenCalledTimes(1);
    expect(setStockStatus).toHaveBeenCalledWith('out_of_stock');
    expect(setActiveStatus).toHaveBeenCalledWith('inactive');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('pages through the server-owned Sellpia snapshot', () => {
    const goToPage = vi.fn();

    vi.mocked(useProductHubPageState).mockReturnValue({
      activeStatus: 'active',
      data: { ...data, total: 120, page: 2 },
      errorMessage: null,
      goToPage,
      handleSearch: vi.fn(),
      isFetching: false,
      isLoading: false,
      isPlaceholderData: false,
      page: 2,
      refetch: vi.fn(),
      search: '',
      setActiveStatus: vi.fn(),
      setSearch: vi.fn(),
      setStockStatus: vi.fn(),
      stockStatus: 'all',
      totalPages: 3,
    });

    render(<ProductHubOptionsPage />);

    expect(screen.getByText('120건 중 51-100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(goToPage).toHaveBeenCalledWith(3);
  });
});
