import { fireEvent, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryWorkspace } from './InventoryWorkspace';

const pushMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => navigation.params,
}));

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useQuery: vi.fn(),
}));

vi.mock('../../_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventoryCollection: () => ({
    control: {
      state: 'idle',
      statusRead: 'current',
      running: null,
      canStop: false,
      notice: null,
      start: vi.fn(),
      stop: vi.fn(),
    },
    confirmSourceBinding: vi.fn(),
    isConfirming: false,
    state: {
      status: 'fresh',
      lastVerifiedAt: '2026-08-13T01:00:00.000Z',
      errorMessage: null,
    },
  }),
}));

const data = {
  items: [],
  total: 0,
  page: 2,
  limit: 50,
  summary: {
    totalSkus: 8,
    linkedSkus: 3,
    unlinkedSkus: 5,
    inStockSkus: 6,
    outOfStockSkus: 2,
    totalUnits: 12,
    pricedAssetValue: 60_000,
    unpricedSkuCount: 1,
  },
  latestImport: null,
};

describe('<InventoryWorkspace>', () => {
  beforeEach(() => {
    pushMock.mockReset();
    navigation.params = new URLSearchParams();
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue({
      data,
      error: null,
      isFetching: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useQuery>);
  });

  it('queries one inventory owner with URL-authoritative filters', () => {
    navigation.params = new URLSearchParams(
      'search=SP-1001&stockStatus=all&activeStatus=inactive&linkStatus=unlinked&page=2',
    );
    render(<InventoryWorkspace />);

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as { queryKey: readonly unknown[] };
    expect(options.queryKey).toEqual([
      'inventory',
      'sellpia-skus',
      {
        page: '2',
        limit: '50',
        query: 'SP-1001',
        stockStatus: 'all',
        activeStatus: 'inactive',
        linkStatus: 'unlinked',
      },
    ]);
  });

  it('preserves unrelated URL state when changing a connection filter', () => {
    navigation.params = new URLSearchParams(
      'campaign=summer&search=SP-1001&stockStatus=all&activeStatus=inactive&linkStatus=unlinked&page=2',
    );
    render(<InventoryWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '연결됨' }));

    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?campaign=summer&search=SP-1001&stockStatus=all&activeStatus=inactive&linkStatus=linked&page=1',
    );
  });

  it('marks the summary unavailable when no completed snapshot exists', () => {
    render(<InventoryWorkspace />);

    expect(screen.getAllByText('미수집')).toHaveLength(3);
    expect(screen.queryByText('8개')).not.toBeInTheDocument();
  });
});
