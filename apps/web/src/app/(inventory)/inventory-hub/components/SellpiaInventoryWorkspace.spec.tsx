import { fireEvent, render, screen, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '@/lib/utils';
import { SellpiaInventoryWorkspace } from './SellpiaInventoryWorkspace';

const pushMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/inventory-hub',
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
      linkedChannelOptionCount: 2,
      linkedProductCount: 1,
      linkedProducts: [{
        id: '10000000-0000-4000-8000-000000000001',
        code: 'INV-SELLPIA-100',
        name: '키즈 반팔 티셔츠',
      }],
      linkedChannelOptions: [{
        id: '20000000-0000-4000-8000-000000000001',
        masterProductId: '10000000-0000-4000-8000-000000000001',
        channelListingId: '30000000-0000-4000-8000-000000000001',
        channel: 'coupang',
        externalOptionId: '13712531060-120',
        itemName: '보라 / 120',
      }],
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
      linkedChannelOptionCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedChannelOptions: [],
      linkStatus: 'unlinked' as const,
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
  summary: {
    totalSkus: 8,
    linkedSkus: 3,
    unlinkedSkus: 5,
    inStockSkus: 1,
    outOfStockSkus: 1,
    totalUnits: 12,
    pricedAssetValue: 60000,
    unpricedSkuCount: 1,
  },
  latestImport: {
    id: '00000000-0000-4000-8000-000000000099',
    fileName: 'sellpia.xls',
    fileHash: 'a'.repeat(64),
    status: 'completed' as const,
    rowCount: 8,
    importedAt: '2026-07-14T01:00:00.000Z',
    lastVerifiedAt: null,
    verificationCount: 0,
    lastTrigger: null,
    freshnessGeneration: null,
    manualFreshExportConfirmedAt: null,
    manualFreshExportConfirmedBy: null,
    qualityReport: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-07-14T01:00:00.000Z',
    updatedAt: '2026-07-14T01:00:00.000Z',
  },
};

describe('<SellpiaInventoryWorkspace>', () => {
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

  it('renders the complete read-only Sellpia SKU table in the inventory domain', () => {
    render(<SellpiaInventoryWorkspace headingLevel={2} />);

    expect(screen.getByRole('heading', { name: '셀피아 재고', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Sellpia SKU ID', 'Sellpia 코드', '상품명', '옵션명', '바코드', '매입가', '판매가', '현재고', '상태', '연결 대상',
    ]);
    expect(screen.getByText('00000000-0000-4000-8000-000000000001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '키즈 반팔 티셔츠' })).toHaveAttribute(
      'href',
      '/product-hub/10000000-0000-4000-8000-000000000001',
    );
    expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('상품 1 · 채널 옵션 2')).toBeInTheDocument();
    expect(screen.getAllByText('미연결').length).toBeGreaterThan(0);
    expect(screen.getByText('읽기 전용')).toBeInTheDocument();
    expect(screen.getByText('현재 상태 범위 Sellpia SKU 8개')).toBeInTheDocument();
    expect(screen.getByText(
      `최근 성공 가져오기: ${formatDateTime(data.latestImport.importedAt, { dateStyle: 'medium', timeStyle: 'short' })} · 완료`,
    )).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /수정|삭제|복원/ })).not.toBeInTheDocument();
  });

  it('queries only the inventory owner with URL-authoritative filters', () => {
    navigation.params = new URLSearchParams('tab=sellpia-inventory&search=SP-1001&stockStatus=in_stock&activeStatus=all&linkStatus=linked&page=2');
    render(<SellpiaInventoryWorkspace />);

    const options = vi.mocked(useQuery).mock.calls[0]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(options.queryKey).toEqual(['inventory', 'sellpia-skus', {
      page: '2', limit: '50', stockStatus: 'in_stock', activeStatus: 'all', query: 'SP-1001', linkStatus: 'linked',
    }]);
    expect(options.queryFn.toString()).toContain('/api/inventory/sellpia-skus');
    expect(options.queryFn.toString()).not.toContain('/api/products/masters');
  });

  it('keeps the active Sellpia tab while filters and refresh remain interactive', () => {
    navigation.params = new URLSearchParams('tab=sellpia-inventory&campaign=summer');
    render(<SellpiaInventoryWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '미연결' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?tab=sellpia-inventory&campaign=summer&linkStatus=unlinked&page=1',
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '품절상품 포함' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?tab=sellpia-inventory&campaign=summer&stockStatus=all&page=1',
    );
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
