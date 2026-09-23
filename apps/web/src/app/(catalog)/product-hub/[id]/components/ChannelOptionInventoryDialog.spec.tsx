import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { ChannelOptionInventoryDialog } from './ChannelOptionInventoryDialog';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), put: vi.fn() },
}));

const option = {
  id: '11111111-1111-4111-8111-111111111111',
  externalOptionId: 'option-1',
  itemName: '10개 묶음',
  inventoryComponents: [{
    id: '33333333-3333-4333-8333-333333333333',
    masterProductId: '44444444-4444-4444-8444-444444444444',
    code: 'SP-OLD',
    name: '이전 구성품',
    optionName: null,
    currentStock: 3,
    quantity: 2,
  }],
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
      {
        expectedComponents: [{ masterProductId: '44444444-4444-4444-8444-444444444444', quantity: 2 }],
        components: [
          { masterProductId: '44444444-4444-4444-8444-444444444444', quantity: 2 },
          { masterProductId: candidate.masterProductId, quantity: 10 },
        ],
      },
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks the operator to refresh when the recipe changed elsewhere', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce(new ApiError(409, 'Conflict', 'recipe changed'));
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '전체 레시피 저장' }));

    expect(await screen.findByText('다른 곳에서 구성이 바뀌었습니다. 새로고침 후 다시 적용하세요.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
