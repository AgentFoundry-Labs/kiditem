import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { useProductHubPageState } from './useProductHubPageState';

const pushMock = vi.hoisted(() => vi.fn());
const refetchMocks = vi.hoisted(() => ({
  list: vi.fn(),
  overview: vi.fn(),
}));
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
  useQuery: vi.fn(),
}));

describe('useProductHubPageState', () => {
  beforeEach(() => {
    pushMock.mockReset();
    navigation.pathname = '/product-hub';
    navigation.params = new URLSearchParams();
    refetchMocks.list.mockReset();
    refetchMocks.overview.mockReset();
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockImplementation((options) => {
      const params = options.queryKey.at(-1) as Record<string, string>;
      return {
        data: undefined,
        error: null,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: false,
        refetch: params.limit === '1' ? refetchMocks.overview : refetchMocks.list,
      } as unknown as ReturnType<typeof useQuery>;
    });
  });

  it('hydrates list filters and pagination from URL state', () => {
    navigation.params = new URLSearchParams(
      'view=list&search=%EC%9A%B0%EC%82%B0&inventoryFocus=imminent&activeStatus=inactive&periodDays=7&category=%EC%99%84%EA%B5%AC&abcGrade=A&dataStatus=abc&adStatus=active&page=4',
    );

    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.search).toBe('우산');
    expect(result.current.inventoryFocus).toBe('imminent');
    expect(result.current.activeStatus).toBe('inactive');
    expect(result.current.periodDays).toBe(7);
    expect(result.current.category).toBe('완구');
    expect(result.current.abcGrade).toBe('A');
    expect(result.current.dataStatusOpen).toBe(true);
    expect(result.current.adStatus).toBe('active');
    expect(result.current.page).toBe(4);
  });

  it('defaults to the selling-products view', () => {
    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.activeStatus).toBe('active');
    expect(result.current.inventoryStatus).toBe('all');
    expect(result.current.inventoryFocus).toBe('all');
    expect(result.current.periodDays).toBe(30);
  });

  it('reuses the default list response for the unfiltered command-center summary', () => {
    const listData = { total: 3, summary: { abcGradeCounts: { A: 1, B: 2, C: 0, unclassified: 0 } } };
    vi.mocked(useQuery).mockImplementation((options) => {
      const params = options.queryKey.at(-1) as Record<string, string>;
      const isOverview = params.limit === '1';
      return {
        data: isOverview ? undefined : listData,
        error: null,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: false,
        refetch: isOverview ? refetchMocks.overview : refetchMocks.list,
      } as unknown as ReturnType<typeof useQuery>;
    });

    const { result } = renderHook(() => useProductHubPageState());

    expect(vi.mocked(useQuery)).toHaveBeenCalledTimes(2);
    expect((vi.mocked(useQuery).mock.calls[1]?.[0] as { enabled?: boolean }).enabled).toBe(false);
    expect(result.current.overviewData).toBe(listData);
    expect(result.current.overviewErrorMessage).toBeNull();
  });

  it('줄 세우기를 바꿔도 위 요약 카드가 사라지지 않는다', () => {
    // 요약은 거른 전체를 센 값이라 순서와 무관하다. 줄 세우기를 조건에 넣어 두면 정렬을
    // 누를 때마다 카드가 통째로 비었다가 다시 붙고, 같은 계산이 30초마다 두 번 돈다
    // (2026-09-21 점검).
    navigation.params = new URLSearchParams('sort=revenue');
    const listData = { total: 3, summary: { abcGradeCounts: { A: 1, B: 2, C: 0, unclassified: 0 } } };
    vi.mocked(useQuery).mockImplementation((options) => {
      const params = options.queryKey.at(-1) as Record<string, string>;
      const isOverview = params.limit === '1';
      return {
        data: isOverview ? undefined : listData,
        error: null,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: false,
        refetch: isOverview ? refetchMocks.overview : refetchMocks.list,
      } as unknown as ReturnType<typeof useQuery>;
    });

    const { result } = renderHook(() => useProductHubPageState());

    expect((vi.mocked(useQuery).mock.calls[1]?.[0] as { enabled?: boolean }).enabled).toBe(false);
    expect(result.current.overviewData).toBe(listData);
  });

  it('keeps the independent overview while the default list is placeholder data', () => {
    const placeholderListData = { total: 1, summary: { abcGradeCounts: { A: 1, B: 0, C: 0, unclassified: 0 } } };
    const overviewData = { total: 3, summary: { abcGradeCounts: { A: 1, B: 2, C: 0, unclassified: 0 } } };
    vi.mocked(useQuery).mockImplementation((options) => {
      const params = options.queryKey.at(-1) as Record<string, string>;
      const isOverview = params.limit === '1';
      return {
        data: isOverview ? overviewData : placeholderListData,
        error: null,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: !isOverview,
        refetch: isOverview ? refetchMocks.overview : refetchMocks.list,
      } as unknown as ReturnType<typeof useQuery>;
    });

    const { result } = renderHook(() => useProductHubPageState());

    expect((vi.mocked(useQuery).mock.calls[1]?.[0] as { enabled?: boolean }).enabled).toBe(true);
    expect(result.current.overviewData).toBe(overviewData);
  });

  it('updates only owned list parameters and preserves the workspace view', () => {
    navigation.params = new URLSearchParams('view=list&campaign=summer&page=3');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setInventoryStatus('configuration_required'));

    expect(pushMock).toHaveBeenCalledWith(
      '/product-hub?view=list&campaign=summer&page=1&inventoryStatus=configuration_required',
    );
  });

  it('applies a command-center inventory focus and clears the low-level inventory status', () => {
    navigation.params = new URLSearchParams('view=list&inventoryStatus=sellable&page=3');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setInventoryFocus('reorder'));

    expect(pushMock).toHaveBeenCalledWith(
      '/product-hub?view=list&page=1&inventoryFocus=reorder',
    );
  });

  it('requests the product operations owner with canonical URL filters', () => {
    navigation.params = new URLSearchParams(
      'search=%EC%9A%B0%EC%82%B0&inventoryFocus=attention&activeStatus=active&periodDays=14&category=%EC%99%84%EA%B5%AC&abcGrade=B&adStatus=unconfigured&page=2',
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
        inventoryFocus: 'attention',
        adStatus: 'unconfigured',
        sort: 'latest',
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
        activeStatus: 'active',
        adStatus: 'all',
        sort: 'latest',
      },
    ]);
    expect(overviewOptions.queryFn.toString()).toContain('/api/products/masters');
  });

  it('줄 세우기를 바꾸면 주소에 남고 첫 쪽으로 돌아간다', () => {
    navigation.params = new URLSearchParams('page=4');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setSort('revenue'));
    expect(pushMock).toHaveBeenLastCalledWith('/product-hub?page=1&sort=revenue');

    // 기본값은 주소를 더럽히지 않는다.
    navigation.params = new URLSearchParams('sort=revenue&page=2');
    act(() => result.current.setSort('latest'));
    expect(pushMock).toHaveBeenLastCalledWith('/product-hub?page=1');
  });

  it('주소에 모르는 줄 세우기가 들어와도 최신 등록순으로 읽는다', () => {
    navigation.params = new URLSearchParams('sort=%EB%AA%A8%EB%A6%84');

    const { result } = renderHook(() => useProductHubPageState());

    expect(result.current.sort).toBe('latest');
  });

  it('opens the data-status modal through URL state and keeps the grade filter independent', () => {
    navigation.params = new URLSearchParams('view=list&abcGrade=A&page=4');
    const { result } = renderHook(() => useProductHubPageState());

    act(() => result.current.setDataStatusOpen(true));
    expect(pushMock).toHaveBeenLastCalledWith('/product-hub?view=list&abcGrade=A&page=4&dataStatus=abc');

    navigation.params = new URLSearchParams('view=list&dataStatus=abc&page=4');
    act(() => result.current.setAbcGrade('unclassified'));
    expect(pushMock).toHaveBeenLastCalledWith('/product-hub?view=list&abcGrade=unclassified&page=1');
  });

  it('refetches both the visible list and the independent overview after publication', async () => {
    refetchMocks.list.mockResolvedValue(undefined);
    refetchMocks.overview.mockResolvedValue(undefined);
    navigation.params = new URLSearchParams('search=umbrella');
    const { result } = renderHook(() => useProductHubPageState());

    await act(() => result.current.refetch());

    expect(refetchMocks.list).toHaveBeenCalledTimes(1);
    expect(refetchMocks.overview).toHaveBeenCalledTimes(1);
  });

  it('refetches only the visible list when it supplies the summary', async () => {
    refetchMocks.list.mockResolvedValue(undefined);
    refetchMocks.overview.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProductHubPageState());

    await act(() => result.current.refetch());

    expect(refetchMocks.list).toHaveBeenCalledTimes(1);
    expect(refetchMocks.overview).not.toHaveBeenCalled();
  });
});
