import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOperationsFullRefreshAction } from './ProductOperationsFullRefreshAction';

const mocks = vi.hoisted(() => ({
  startInventory: vi.fn(),
  collectProfitability: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventorySourceOwner: () => ({
    start: mocks.startInventory,
    isStarting: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));
vi.mock('@/lib/sellpia-product-profitability-collection', () => ({
  collectSellpiaProductProfitFromExtension: mocks.collectProfitability,
}));
vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('ProductOperationsFullRefreshAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startInventory.mockResolvedValue({ state: 'COMPLETE' });
    mocks.collectProfitability.mockResolvedValue({ state: 'COMPLETE' });
  });

  it('runs inventory and profitability independently', async () => {
    mocks.startInventory.mockRejectedValue(new Error('inventory failed'));

    render(<ProductOperationsFullRefreshAction />);
    fireEvent.click(screen.getByRole('button', { name: '상품 전체 데이터 갱신' }));

    await waitFor(() => {
      expect(mocks.startInventory).toHaveBeenCalledWith('manual_request');
      expect(mocks.collectProfitability).toHaveBeenCalledWith({ organizationId: 'org-1' });
    });
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('재고: inventory failed'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('reports success only after both source owners complete', async () => {
    render(<ProductOperationsFullRefreshAction />);
    fireEvent.click(screen.getByRole('button', { name: '상품 전체 데이터 갱신' }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '상품 전체 데이터 갱신을 완료했습니다.',
    ));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('reports a terminal inventory failure even when profitability completes', async () => {
    mocks.startInventory.mockResolvedValue({
      state: 'FAILED',
      errorMessage: 'inventory terminal failure',
    });

    render(<ProductOperationsFullRefreshAction />);
    fireEvent.click(screen.getByRole('button', { name: '상품 전체 데이터 갱신' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('재고: inventory terminal failure'),
    ));
    expect(mocks.collectProfitability).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('does not report completion while inventory remains running', async () => {
    mocks.startInventory.mockResolvedValue({ state: 'RUNNING' });

    render(<ProductOperationsFullRefreshAction />);
    fireEvent.click(screen.getByRole('button', { name: '상품 전체 데이터 갱신' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('재고: 수집이 아직 진행 중입니다.'),
    ));
    expect(mocks.collectProfitability).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
