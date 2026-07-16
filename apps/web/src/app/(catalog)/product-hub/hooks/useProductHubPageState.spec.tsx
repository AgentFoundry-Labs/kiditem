import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  useQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));

describe('useProductHubPageState', () => {
  beforeEach(() => {
    pushMock.mockReset();
    navigation.pathname = '/product-hub';
    navigation.params = new URLSearchParams();
  });

  it('hydrates list filters and pagination from URL state', () => {
    navigation.params = new URLSearchParams(
      'view=list&search=%EC%9A%B0%EC%82%B0&stockStatus=out_of_stock&activeStatus=inactive&page=4',
    );

    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.search).toBe('우산');
    expect(result.current.stockStatus).toBe('out_of_stock');
    expect(result.current.activeStatus).toBe('inactive');
    expect(result.current.page).toBe(4);
  });

  it('defaults to the staged all-products view', () => {
    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.activeStatus).toBe('all');
    expect(result.current.stockStatus).toBe('all');
  });

  it('updates only owned list parameters and preserves the workspace view', () => {
    navigation.params = new URLSearchParams('view=list&campaign=summer&page=3');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setStockStatus('in_stock'));

    expect(pushMock).toHaveBeenCalledWith(
      '/product-hub?view=list&campaign=summer&page=1&stockStatus=in_stock',
    );
  });
});
