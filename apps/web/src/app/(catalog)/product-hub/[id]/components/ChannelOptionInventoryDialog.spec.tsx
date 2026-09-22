import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ChannelOptionInventoryDialog } from './ChannelOptionInventoryDialog';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), put: vi.fn() },
}));

const option = {
  id: '11111111-1111-4111-8111-111111111111',
  externalOptionId: 'option-1',
  itemName: '10개 묶음',
  inventoryComponents: [],
};
const candidate = {
  masterProductId: '22222222-2222-4222-8222-222222222222',
  code: 'SP-100',
  name: '동물 블록 낱개',
  optionName: null,
  barcode: null,
  currentStock: 85,
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ChannelOptionInventoryDialog open option={option} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('<ChannelOptionInventoryDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [candidate] });
    vi.mocked(apiClient.put).mockResolvedValue({ id: option.id });
  });

  it('atomically replaces the exact channel option inventory composition', async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Sellpia 재고 SKU 검색' }), { target: { value: 'SP-100' } });
    fireEvent.click(await screen.findByRole('button', { name: 'SP-100 구성품 추가' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'SP-100 필요 수량' }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '전체 레시피 저장' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
      `/api/channels/options/${option.id}/inventory-components`,
      { components: [{ masterProductId: candidate.masterProductId, quantity: 10 }] },
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
