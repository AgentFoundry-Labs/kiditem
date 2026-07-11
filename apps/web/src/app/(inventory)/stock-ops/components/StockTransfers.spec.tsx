import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import StockTransfers from './StockTransfers';

vi.mock('./InventorySkuPicker', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('00000000-0000-4000-8000-000000000001')}>재고 SKU 선택</button>
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe('StockTransfers', () => {
  it('creates a record with inventorySkuId and explains that Sellpia stock is unchanged', async () => {
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
      inventorySkuId: '00000000-0000-4000-8000-000000000001',
    }));
    expect(screen.getByText(/Sellpia 현재고는 변경하지 않습니다/)).toBeInTheDocument();
  });
});
