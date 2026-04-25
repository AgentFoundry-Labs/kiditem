import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionListItem, TransactionListResponse } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { fetchAllTransactionsInWindow } from './inventory-api';

function makeTx(suffix: string): TransactionListItem {
  return {
    id: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    optionId: '00000000-0000-4000-8000-000000000099',
    optionName: `opt-${suffix}`,
    type: 'RECEIVE',
    quantity: 1,
    stockDelta: 1,
    unitCost: 0,
    totalCost: 0,
    warehouseId: null,
    relatedId: null,
    relatedType: null,
    note: null,
    createdBy: null,
    createdAt: '2026-04-01T00:00:00.000Z',
  };
}

function makeResponse(items: TransactionListItem[], total: number, page: number): TransactionListResponse {
  return { items, total, page, limit: 200 };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAllTransactionsInWindow', () => {
  it('pages through total > 200 and preserves {from,to} on every call, concatenating in order', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makeTx(`p1-${i}`));
    const page2 = Array.from({ length: 200 }, (_, i) => makeTx(`p2-${i}`));
    const page3 = Array.from({ length: 1 }, (_, i) => makeTx(`p3-${i}`));

    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce(makeResponse(page1, 401, 1) as never)
      .mockResolvedValueOnce(makeResponse(page2, 401, 2) as never)
      .mockResolvedValueOnce(makeResponse(page3, 401, 3) as never);

    const window = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
    const result = await fetchAllTransactionsInWindow(window);

    expect(getParsed).toHaveBeenCalledTimes(3);
    const urls = getParsed.mock.calls.map((c) => c[0] as string);
    // {from, to} must survive on every page request, otherwise pages drift outside the window.
    for (const url of urls) {
      expect(url).toContain('from=2026-04-01T00%3A00%3A00.000Z');
      expect(url).toContain('to=2026-04-30T23%3A59%3A59.999Z');
      expect(url).toContain('limit=200');
    }
    expect(urls[0]).toContain('page=1');
    expect(urls[1]).toContain('page=2');
    expect(urls[2]).toContain('page=3');

    expect(result).toHaveLength(401);
    expect(result[0]).toEqual(page1[0]);
    expect(result[200]).toEqual(page2[0]);
    expect(result[400]).toEqual(page3[0]);
  });

  it('does NOT request page 2 when total <= 200', async () => {
    const items = Array.from({ length: 17 }, (_, i) => makeTx(`only-${i}`));
    const getParsed = vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce(makeResponse(items, 17, 1) as never);

    const result = await fetchAllTransactionsInWindow({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
    });

    expect(getParsed).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(17);
  });
});
