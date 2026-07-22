import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import CreateOrderModal from './CreateOrderModal';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn() },
}));

describe('<CreateOrderModal>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the trimmed free-text supplierName field in submission', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('probe rejection'));
    render(<CreateOrderModal onClose={vi.fn()} onCreated={onCreated} />);

    await user.type(screen.getByPlaceholderText('예: 이우 XX무역'), ' 새 공급처 ');
    await user.type(screen.getByPlaceholderText('상품명'), ' 새 상품 ');
    await user.type(screen.getByPlaceholderText('단가(CNY)'), '12.5');
    await user.click(screen.getByRole('button', { name: '발주 등록' }));

    // This route-retirement contract intentionally does not claim that the
    // current item payload satisfies every backend purchase-order field.
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/purchase-orders',
      expect.objectContaining({
        action: 'create',
        supplierName: '새 공급처',
      }),
    ));
    expect(await screen.findByText('발주 생성에 실패했습니다.')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
