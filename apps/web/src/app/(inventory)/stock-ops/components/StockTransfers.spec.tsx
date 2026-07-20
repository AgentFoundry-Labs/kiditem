import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
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
  it('creates a record with sellpiaInventorySkuId and explains that Sellpia stock is unchanged', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      if (path === '/api/warehouses') return [
        { id: '00000000-0000-4000-8000-000000000010', name: 'A', code: 'A' },
        { id: '00000000-0000-4000-8000-000000000011', name: 'B', code: 'B' },
      ] as never;
      return [] as never;
    });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StockTransfers /></QueryClientProvider>);

    await userEvent.click(screen.getByRole('button', { name: '이관 기록 추가' }));
    await userEvent.click(screen.getByRole('button', { name: '재고 SKU 선택' }));
    const warehouseSelects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(warehouseSelects[0], '00000000-0000-4000-8000-000000000010');
    await userEvent.selectOptions(warehouseSelects[1], '00000000-0000-4000-8000-000000000011');
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));

    expect(post).toHaveBeenCalledWith('/api/stock-transfers', expect.objectContaining({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
    }));
    expect(post).not.toHaveBeenCalledWith('/api/stock-transfers', expect.objectContaining({
      masterProductId: expect.anything(),
    }));
    expect(screen.getByText(/Sellpia 현재고는 변경하지 않습니다/)).toBeInTheDocument();
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
