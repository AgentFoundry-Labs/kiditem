import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RocketInventoryCommitmentList } from './RocketInventoryCommitmentList';

const mocks = vi.hoisted(() => ({
  settle: vi.fn(),
  release: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../hooks/use-rocket-inventory-commitments', () => ({
  useRocketInventoryCommitments: () => ({
    query: {
      isLoading: false,
      isError: false,
      data: {
        items: [{
          confirmationId: '11111111-1111-4111-8111-111111111111',
          confirmationLineId: '22222222-2222-4222-8222-222222222222',
          channelAccountId: '33333333-3333-4333-8333-333333333333',
          poNumber: 'PO-1001',
          productNo: 'P-1',
          barcode: '8801234567890',
          productName: '아주 긴 로켓 상품명 '.repeat(8),
          orderQuantity: 5,
          confirmedQuantity: 4,
          confirmedBy: { id: '44444444-4444-4444-8444-444444444444', name: 'Operator' },
          confirmedAt: '2026-07-18T00:00:00.000Z',
          requestCommitment: null,
          finalOrderCommitment: {
            id: '55555555-5555-4555-8555-555555555555',
            sourceId: '66666666-6666-4666-8666-666666666666',
            predecessorCommitmentId: '77777777-7777-4777-8777-777777777777',
            kind: 'rocket_final_order',
            status: 'active',
            unitQuantity: 4,
            inventoryGeneration: '12',
            createdBy: { id: '44444444-4444-4444-8444-444444444444', name: 'Operator' },
            createdAt: '2026-07-18T00:00:00.000Z',
            releasedBy: null,
            releasedAt: null,
            releaseReason: null,
            settledBy: null,
            settledAt: null,
            settlementReason: null,
            canRelease: true,
            canSettle: true,
            allocations: [{
              sellpiaInventorySkuId: '88888888-8888-4888-8888-888888888888',
              code: 'SP-1',
              name: 'Sellpia component',
              optionName: null,
              unitsPerItem: 1,
              quantity: 4,
              currentStock: 100,
              activeCommitmentQuantity: 80,
              availableStock: 20,
              isActive: true,
            }],
          },
          orderLineItemId: '66666666-6666-4666-8666-666666666666',
          canRelease: true,
          canSettle: true,
        }],
        nextCursor: null,
      },
      refetch: vi.fn(),
    },
    settle: { mutateAsync: mocks.settle, isPending: false },
    release: { mutateAsync: mocks.release, isPending: false },
    invalidate: mocks.invalidate,
  }),
}));

describe('<RocketInventoryCommitmentList>', () => {
  it('renders persisted stock levels in an overflow-safe table with final-order actions', () => {
    render(<RocketInventoryCommitmentList channelAccountId="33333333-3333-4333-8333-333333333333" />);

    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('table')).toHaveClass('min-w-[1420px]', 'table-fixed');
    expect(screen.getByText('SP-1: 100 / 80 /')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정산' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });
});
