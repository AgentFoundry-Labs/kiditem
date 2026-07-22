import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import StockTransfers from './StockTransfers';

vi.mock('./SellpiaMasterProductPicker', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('00000000-0000-4000-8000-000000000001')}>재고 SKU 선택</button>
  ),
}));

afterEach(() => vi.restoreAllMocks());

function renderStockTransfers({ readOnly = false }: { readOnly?: boolean } = {}) {
  vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StockTransfers readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

describe('StockTransfers', () => {
  it('reads warehouses and preserves their exact IDs when creating a record', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/warehouses') return [
        { id: '00000000-0000-4000-8000-000000000010', name: 'A', code: 'A' },
        { id: '00000000-0000-4000-8000-000000000011', name: 'B', code: 'B' },
      ] as never;
      return [] as never;
    });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    const addButton = screen.getByRole('button', { name: '이관 기록 추가' });
    await waitFor(() => expect(addButton).toBeEnabled());
    expect(get).toHaveBeenCalledWith('/api/warehouses');

    await userEvent.click(addButton);
    await userEvent.click(screen.getByRole('button', { name: '재고 SKU 선택' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '출발 창고' }),
      '00000000-0000-4000-8000-000000000010',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '도착 창고' }),
      '00000000-0000-4000-8000-000000000011',
    );
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));

    expect(post).toHaveBeenCalledWith('/api/stock-transfers', expect.objectContaining({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
      fromWarehouseId: '00000000-0000-4000-8000-000000000010',
      toWarehouseId: '00000000-0000-4000-8000-000000000011',
    }));
    expect(post).not.toHaveBeenCalledWith('/api/stock-transfers', expect.objectContaining({
      masterProductId: expect.anything(),
    }));
    expect(screen.getByText(/Sellpia 현재고는 변경하지 않습니다/)).toBeInTheDocument();
  });

  it('explains API provisioning only after a successful empty warehouse read', async () => {
    let resolveWarehouses: ((warehouses: never) => void) | undefined;
    const warehouseResponse = new Promise<never>((resolve) => {
      resolveWarehouses = resolve;
    });
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/warehouses') return warehouseResponse;
      return [] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/warehouses'));
    expect(screen.queryByText(/관리자가 \/api\/warehouses API로/)).not.toBeInTheDocument();

    resolveWarehouses?.([] as never);

    expect(await screen.findByText(/관리자가 \/api\/warehouses API로 창고를 먼저 등록해야 합니다/)).toBeInTheDocument();
  });

  it('disables record creation and cannot open a form when no warehouses exist', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/warehouses'));
    const emptyStatus = await screen.findByRole('status');
    expect(emptyStatus).toHaveTextContent('등록된 창고가 없습니다');
    const addButton = screen.getByRole('button', { name: '이관 기록 추가' });
    expect(addButton).toBeDisabled();
    await userEvent.click(addButton);
    expect(screen.queryByRole('heading', { name: '이관 기록 추가' })).not.toBeInTheDocument();
  });

  it('enables record creation when one warehouse exists', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/warehouses') {
        return [{ id: 'warehouse-1', name: 'A 창고', code: 'A' }] as never;
      }
      return [] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    const addButton = screen.getByRole('button', { name: '이관 기록 추가' });
    await waitFor(() => expect(addButton).toBeEnabled());
    await userEvent.click(addButton);
    expect(screen.getByRole('heading', { name: '이관 기록 추가' })).toBeInTheDocument();
  });

  it('explains a failed warehouse read and recovers through one retry control', async () => {
    let warehouseAttempts = 0;
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path !== '/api/warehouses') return [] as never;
      warehouseAttempts += 1;
      if (warehouseAttempts === 1) throw new Error('warehouse read failed');
      return [
        { id: 'warehouse-1', name: 'A 창고', code: 'A' },
        { id: 'warehouse-2', name: 'B 창고', code: 'B' },
      ] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('창고 목록을 불러오지 못했습니다');
    expect(client.getQueryCache().find({ queryKey: queryKeys.warehouses.all })?.meta)
      .toEqual({ suppressGlobalErrorToast: true });
    const addButton = screen.getByRole('button', { name: '이관 기록 추가' });
    expect(addButton).toBeDisabled();
    const retryButton = screen.getByRole('button', { name: '창고 다시 불러오기' });

    await userEvent.click(retryButton);

    await waitFor(() => expect(warehouseAttempts).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(addButton).toBeEnabled();
  });

  it('keeps cached warehouses usable when a background refetch fails', async () => {
    const warehouses = [{ id: 'warehouse-1', name: 'A 창고', code: 'A' }];
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/warehouses') throw new Error('warehouse refresh failed');
      return [] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.warehouses.all, warehouses);

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/warehouses'));
    const warning = await screen.findByRole('status');
    expect(warning).toHaveTextContent('기존 창고 목록을 사용 중입니다');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '창고 다시 불러오기' })).toBeEnabled();
    const addButton = screen.getByRole('button', { name: '이관 기록 추가' });
    expect(addButton).toBeEnabled();

    await userEvent.click(addButton);

    expect(screen.getByRole('heading', { name: '이관 기록 추가' })).toBeInTheDocument();
  });

  it('hides record creation when readOnly is true', () => {
    renderStockTransfers({ readOnly: true });

    expect(screen.queryByRole('button', { name: '이관 기록 추가' })).not.toBeInTheDocument();
  });

  it('renders a placeholder when the linked Sellpia inventory SKU is missing', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/stock-transfers') return [{
        id: 'transfer-1',
        sellpiaInventorySkuId: 'missing-sellpia-sku-1',
        quantity: 3,
        status: 'pending',
        notes: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        sellpiaInventorySku: null,
        fromWarehouse: { id: 'warehouse-1', name: 'A 창고' },
        toWarehouse: { id: 'warehouse-2', name: 'B 창고' },
      }] as never;
      return [] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    expect(await screen.findByText('상품 연결 없음')).toBeInTheDocument();
    expect(screen.getByText('Sellpia SKU ID: missing-sellpia-sku-1')).toBeInTheDocument();
  });

  it('renders the physical Sellpia inventory SKU returned by the transfer API', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/stock-transfers') return [{
        id: 'transfer-1',
        sellpiaInventorySkuId: 'sellpia-sku-1',
        quantity: 3,
        status: 'pending',
        notes: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        sellpiaInventorySku: {
          id: 'sellpia-sku-1',
          code: 'SP-FINAL-1',
          name: '최종 Sellpia 상품',
          optionName: '파랑',
          barcode: null,
        },
        fromWarehouse: { id: 'warehouse-1', name: 'A 창고' },
        toWarehouse: { id: 'warehouse-2', name: 'B 창고' },
      }] as never;
      return [] as never;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    expect(await screen.findByText('SP-FINAL-1 · 파랑')).toBeInTheDocument();
  });

  it('does not request form-only warehouses when readOnly is true', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><StockTransfers readOnly /></QueryClientProvider>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/stock-transfers'));
    expect(get).not.toHaveBeenCalledWith('/api/warehouses');
  });
});
