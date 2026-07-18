import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { useProductHubPageState } from './useProductHubPageState';

const pushMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: '/product-hub',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => navigation.params,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    error: null,
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  })),
}));

describe('useProductHubPageState', () => {
  beforeEach(() => {
    pushMock.mockReset();
    navigation.pathname = '/product-hub';
    navigation.params = new URLSearchParams();
    vi.mocked(useQuery).mockClear();
  });

  it('hydrates list filters and pagination from URL state', () => {
    navigation.params = new URLSearchParams(
      'view=list&search=%EC%9A%B0%EC%82%B0&inventoryStatus=out_of_stock&activeStatus=inactive&periodDays=7&category=%EC%99%84%EA%B5%AC&abcGrade=A&adStatus=active&page=4',
    );

    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.search).toBe('우산');
    expect(result.current.inventoryStatus).toBe('out_of_stock');
    expect(result.current.activeStatus).toBe('inactive');
    expect(result.current.periodDays).toBe(7);
    expect(result.current.category).toBe('완구');
    expect(result.current.abcGrade).toBe('A');
    expect(result.current.adStatus).toBe('active');
    expect(result.current.page).toBe(4);
  });

  it('defaults to the staged all-products view', () => {
    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.activeStatus).toBe('all');
    expect(result.current.inventoryStatus).toBe('all');
    expect(result.current.periodDays).toBe(30);
  });

  it('updates only owned list parameters and preserves the workspace view', () => {
    navigation.params = new URLSearchParams('view=list&campaign=summer&page=3');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setInventoryStatus('configuration_required'));

    expect(pushMock).toHaveBeenCalledWith(
      '/product-hub?view=list&campaign=summer&page=1&inventoryStatus=configuration_required',
    );
  });

  it('requests the product operations owner with canonical URL filters', () => {
    navigation.params = new URLSearchParams(
      'search=%EC%9A%B0%EC%82%B0&inventoryStatus=review_required&activeStatus=active&periodDays=14&category=%EC%99%84%EA%B5%AC&abcGrade=B&adStatus=unconfigured&page=2',
    );

    renderHook(() => useProductHubPageState());

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(options.queryKey).toEqual([
      'products',
      'operations',
      'list',
      {
        page: '2',
        limit: '50',
        periodDays: '14',
        activeStatus: 'active',
        inventoryStatus: 'review_required',
        adStatus: 'unconfigured',
        query: '우산',
        category: '완구',
        abcGrade: 'B',
      },
    ]);

    const apiSource = options.queryFn.toString();
    expect(apiSource).toContain('/api/products/masters');
    expect(apiSource).not.toContain('/api/inventory/sellpia-skus');
  });

  it('requests an unfiltered overview independently from list filters', () => {
    navigation.params = new URLSearchParams(
      'search=%EC%9A%B0%EC%82%B0&inventoryStatus=out_of_stock&activeStatus=inactive&periodDays=7&category=%EC%99%84%EA%B5%AC&abcGrade=A&adStatus=active&page=4',
    );

    renderHook(() => useProductHubPageState());

    expect(useQuery).toHaveBeenCalledTimes(2);
    const overviewOptions = vi.mocked(useQuery).mock.calls[1]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(overviewOptions.queryKey).toEqual([
      'products',
      'operations',
      'list',
      {
        page: '1',
        limit: '1',
        periodDays: '7',
        activeStatus: 'all',
        adStatus: 'all',
      },
    ]);
    expect(overviewOptions.queryFn.toString()).toContain('/api/products/masters');
  });
});
