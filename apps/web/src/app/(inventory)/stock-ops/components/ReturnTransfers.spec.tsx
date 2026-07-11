import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import ReturnTransfers from './ReturnTransfers';

vi.mock('./InventorySkuPicker', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('00000000-0000-4000-8000-000000000001')}>반품 SKU 선택</button>
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe('ReturnTransfers', () => {
  it('records the physical InventorySku without claiming a stock increase', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReturnTransfers /></QueryClientProvider>);

    await userEvent.click(screen.getByRole('button', { name: '반품 기록 추가' }));
    await userEvent.click(screen.getByRole('button', { name: '반품 SKU 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));

    expect(post).toHaveBeenCalledWith('/api/return-transfers', expect.objectContaining({
      inventorySkuId: '00000000-0000-4000-8000-000000000001',
    }));
    expect(screen.getByText(/Sellpia 반영 전까지 현재고는 바뀌지 않습니다/)).toBeInTheDocument();
  });
});
