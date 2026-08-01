import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const requestRefresh = vi.fn();

vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({ requestRefresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ProductProfitabilitySyncAction } from './ProductProfitabilitySyncAction';

describe('ProductProfitabilitySyncAction', () => {
  it('requests the full Sellpia scope that includes product-profit evidence', async () => {
    requestRefresh.mockResolvedValue({});
    render(<ProductProfitabilitySyncAction />);

    fireEvent.click(screen.getByRole('button', { name: '수익성 데이터 갱신' }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith(
      'manual_request',
      'full',
    ));
  });
});
