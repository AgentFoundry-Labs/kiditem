import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import ReturnTransfers from './ReturnTransfers';

vi.mock('./SellpiaMasterProductPicker', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('00000000-0000-4000-8000-000000000001')}>반품 SKU 선택</button>
  ),
}));

afterEach(() => vi.restoreAllMocks());

function renderReturnTransfers({ readOnly = false }: { readOnly?: boolean } = {}) {
  vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReturnTransfers readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

describe('ReturnTransfers', () => {
  it('records the physical Sellpia inventory SKU without claiming a stock increase', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([] as never);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReturnTransfers /></QueryClientProvider>);

    await userEvent.click(screen.getByRole('button', { name: '반품 기록 추가' }));
    await userEvent.click(screen.getByRole('button', { name: '반품 SKU 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));

    expect(post).toHaveBeenCalledWith('/api/return-transfers', expect.objectContaining({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
    }));
    expect(post).not.toHaveBeenCalledWith('/api/return-transfers', expect.objectContaining({
      masterProductId: expect.anything(),
    }));
    expect(screen.getByText(/Sellpia 반영 전까지 현재고는 바뀌지 않습니다/)).toBeInTheDocument();
  });

  it('hides record creation when readOnly is true', () => {
    renderReturnTransfers({ readOnly: true });

    expect(screen.queryByRole('button', { name: '반품 기록 추가' })).not.toBeInTheDocument();
  });

  it('renders a placeholder when the linked Sellpia inventory SKU is missing', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([{
      id: 'return-transfer-1',
      rtNumber: 'RT-1',
      sellpiaInventorySkuId: 'missing-sellpia-sku-2',
      quantity: 2,
      status: 'pending',
      condition: 'good',
      notes: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      sellpiaInventorySku: null,
    }] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><ReturnTransfers /></QueryClientProvider>);

    expect(await screen.findByText('상품 연결 없음')).toBeInTheDocument();
    expect(screen.getByText('Sellpia SKU ID: missing-sellpia-sku-2')).toBeInTheDocument();
  });

  it('renders the physical Sellpia inventory SKU returned by the return API', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([{
      id: 'return-transfer-1',
      rtNumber: 'RT-1',
      sellpiaInventorySkuId: 'sellpia-sku-1',
      quantity: 2,
      status: 'pending',
      condition: 'good',
      notes: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      sellpiaInventorySku: {
        id: 'sellpia-sku-1',
        code: 'SP-FINAL-2',
        name: '최종 반품 상품',
        optionName: null,
        barcode: null,
      },
    }] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><ReturnTransfers /></QueryClientProvider>);

    expect(await screen.findByText('SP-FINAL-2 · 옵션 없음')).toBeInTheDocument();
  });
});
