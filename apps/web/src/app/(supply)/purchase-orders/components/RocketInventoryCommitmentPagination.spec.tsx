import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InventoryCommitmentRead,
  RocketPurchaseCommitmentListItem,
} from '@kiditem/shared/inventory-commitment';
import { RocketInventoryCommitmentList } from './RocketInventoryCommitmentList';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  release: vi.fn(),
  settle: vi.fn(),
}));

vi.mock('../lib/rocket-inventory-commitment-api', () => ({
  listRocketInventoryCommitments: api.list,
  releaseRocketFinalOrderCommitments: api.release,
  settleRocketFinalOrderCommitments: api.settle,
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_CURSOR = '22222222-2222-4222-8222-222222222222';
const ACTIVE_COMMITMENT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = { id: '44444444-4444-4444-8444-444444444444', name: 'Operator' };

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function commitment(
  id: string,
  status: 'active' | 'released',
): InventoryCommitmentRead {
  return {
    id,
    sourceId: '55555555-5555-4555-8555-555555555555',
    predecessorCommitmentId: null,
    kind: 'rocket_final_order',
    status,
    unitQuantity: 1,
    inventoryGeneration: '12',
    createdBy: ACTOR,
    createdAt: '2026-07-18T00:00:00.000Z',
    releasedBy: status === 'released' ? ACTOR : null,
    releasedAt: status === 'released' ? '2026-07-19T00:00:00.000Z' : null,
    releaseReason: status === 'released' ? '이미 종료' : null,
    settledBy: null,
    settledAt: null,
    settlementReason: null,
    canRelease: status === 'active',
    canSettle: status === 'active',
    allocations: [
      {
        sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666',
        code: 'SP-1',
        name: 'Sellpia component',
        optionName: null,
        unitsPerItem: 1,
        quantity: 1,
        currentStock: 10,
        activeCommitmentQuantity: status === 'active' ? 1 : 0,
        availableStock: status === 'active' ? 9 : 10,
        isActive: true,
      },
    ],
  };
}

function item(
  index: number,
  status: 'active' | 'released',
): RocketPurchaseCommitmentListItem {
  const active = status === 'active';
  return {
    confirmationId: uuid(100 + index),
    confirmationLineId: uuid(200 + index),
    channelAccountId: ACCOUNT_ID,
    poNumber: active ? 'PO-OLDER-ACTIVE' : `PO-NEWER-${index}`,
    productNo: `P-${index}`,
    barcode: `880000000${String(index).padStart(3, '0')}`,
    productName: active ? '오래된 활성 약정 상품' : `종료 상품 ${index}`,
    orderQuantity: 1,
    confirmedQuantity: 1,
    confirmedBy: ACTOR,
    confirmedAt: '2026-07-18T00:00:00.000Z',
    requestCommitment: null,
    finalOrderCommitment: commitment(
      active ? ACTIVE_COMMITMENT_ID : uuid(300 + index),
      status,
    ),
    orderLineItemId: uuid(400 + index),
    canRelease: active,
    canSettle: active,
  };
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RocketInventoryCommitmentList
        channelAccountId={ACCOUNT_ID}
        channelAccountLabel="로켓 1호점"
      />
    </QueryClientProvider>,
  );
}

describe('<RocketInventoryCommitmentList /> cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.release.mockResolvedValue({
      affectedCommitmentIds: [ACTIVE_COMMITMENT_ID],
    });
    api.settle.mockResolvedValue({
      affectedCommitmentIds: [ACTIVE_COMMITMENT_ID],
    });
  });

  it('reaches and releases an older active commitment behind 50 inactive rows after remount', async () => {
    api.list.mockImplementation(async (input: { cursor?: string }) => {
      if (!input.cursor) {
        return {
          items: Array.from({ length: 50 }, (_, index) =>
            item(index + 1, 'released'),
          ),
          nextCursor: NEXT_CURSOR,
        };
      }
      return {
        items: [item(51, 'active')],
        nextCursor: null,
      };
    });
    const user = userEvent.setup();
    const firstRender = renderList();

    await user.click(
      await screen.findByRole('button', { name: '이전 약정 더 불러오기' }),
    );
    expect(await screen.findByText('PO-OLDER-ACTIVE')).toBeInTheDocument();
    firstRender.unmount();

    renderList();
    await user.click(
      await screen.findByRole('button', { name: '이전 약정 더 불러오기' }),
    );
    expect(await screen.findByText('PO-OLDER-ACTIVE')).toBeInTheDocument();

    expect(api.list).toHaveBeenNthCalledWith(1, {
      channelAccountId: ACCOUNT_ID,
      limit: 50,
    });
    expect(api.list).toHaveBeenNthCalledWith(2, {
      channelAccountId: ACCOUNT_ID,
      cursor: NEXT_CURSOR,
      limit: 50,
    });
    expect(api.list).toHaveBeenNthCalledWith(3, {
      channelAccountId: ACCOUNT_ID,
      limit: 50,
    });
    expect(api.list).toHaveBeenNthCalledWith(4, {
      channelAccountId: ACCOUNT_ID,
      cursor: NEXT_CURSOR,
      limit: 50,
    });

    await user.type(
      screen.getByRole('textbox', { name: 'PO-OLDER-ACTIVE 약정 처리 사유' }),
      '오발주 취소',
    );
    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(api.release.mock.calls[0]?.[0]).toEqual({
        commitmentIds: [ACTIVE_COMMITMENT_ID],
        reason: '오발주 취소',
      }),
    );
  });
});
