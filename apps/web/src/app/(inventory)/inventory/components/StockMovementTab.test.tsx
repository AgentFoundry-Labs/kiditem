import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionListItem } from '@kiditem/shared/inventory';

vi.mock('../lib/inventory-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory-api')>('../lib/inventory-api');
  return {
    ...actual,
    fetchAllTransactionsInWindow: vi.fn(),
  };
});

import { fetchAllTransactionsInWindow } from '../lib/inventory-api';
import { StockMovementTab } from './StockMovementTab';

const fetchAllMock = vi.mocked(fetchAllTransactionsInWindow);

function tx(partial: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    optionId: '00000000-0000-4000-8000-000000000099',
    optionName: 'opt',
    type: 'RECEIVE',
    quantity: 0,
    stockDelta: 0,
    unitCost: 0,
    totalCost: 0,
    warehouseId: null,
    relatedId: null,
    relatedType: null,
    note: null,
    createdBy: null,
    createdAt: '2026-04-15T00:00:00.000Z',
    ...partial,
  };
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StockMovementTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchAllMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<StockMovementTab>', () => {
  it('fetches the full window via fetchAllTransactionsInWindow with a single {from,to} (no separate summary call)', async () => {
    fetchAllMock.mockResolvedValue([]);
    renderTab();

    await waitFor(() => expect(fetchAllMock).toHaveBeenCalled());
    const arg = fetchAllMock.mock.calls[0][0];
    expect(arg).toEqual(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    // Both bounds must be ISO8601 — proves we are NOT sending a date-only `from` while
    // pulling summary off a rolling Date.now() - days endpoint.
    expect(arg.from).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(arg.to).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('derives summary KPIs and ADJUST adjustments from the same fetched rows using stockDelta', async () => {
    fetchAllMock.mockResolvedValue([
      tx({ id: 'r1', type: 'RECEIVE', quantity: 5, stockDelta: 5, totalCost: 500 }),
      tx({ id: 'i1', type: 'ISSUE', quantity: 3, stockDelta: -3, totalCost: 300 }),
      // Negative ADJUST: stockDelta is the only signed source. Summing tx.quantity
      // would render this as a +3 ledger row even though stock went down.
      tx({ id: 'a1', type: 'ADJUST', quantity: -3, stockDelta: -3 }),
    ]);

    renderTab();

    // Summary card shows in-quantity from RECEIVE rows.
    await screen.findByText('5', { selector: '.text-green-700' });
    // 출고 수량 card.
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);

    // Table net (inQty - outQty + adjustQty) = 5 - 3 + (-3) = -1. With unsigned ADJUST,
    // this would be 5 - 3 + 3 = +5, so this assertion locks in stockDelta usage.
    await waitFor(() => {
      const cells = Array.from(document.querySelectorAll('td'));
      const netCell = cells.find((c) => c.textContent?.trim() === '-1');
      expect(netCell).toBeDefined();
    });
  });
});
