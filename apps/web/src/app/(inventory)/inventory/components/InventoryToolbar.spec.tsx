import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryToolbar } from './InventoryToolbar';

vi.mock('../../_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventoryCollection: () => ({
    control: {
      state: 'idle',
      statusRead: 'current',
      running: null,
      canStop: false,
      notice: null,
      start: vi.fn(),
      stop: vi.fn(),
    },
    confirmSourceBinding: vi.fn(),
    isConfirming: false,
    state: {
      status: 'fresh',
      lastVerifiedAt: '2026-07-30T06:03:27.000Z',
      errorMessage: null,
    },
  }),
}));

describe('InventoryToolbar', () => {
  it('owns inventory actions and guidance without duplicating list filters', () => {
    render(
      <InventoryToolbar
        latestImportAt={null}
        busy={false}
        onBarcodePrint={vi.fn()}
        onExcel={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '재고 관리' })).toBeInTheDocument();
    expect(screen.getByText('최신')).toBeInTheDocument();
    expect(screen.queryByText('재고/발주 관리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '셀피아 재고 동기화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '바코드 출력' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '엑셀' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '품절상품 포함' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정/ })).not.toBeInTheDocument();
  });
});
