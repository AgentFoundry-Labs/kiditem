import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildIcecreamDeliveryRows,
  saveIcecreamDeliveryIndex,
} from './icecream-delivery-index';

describe('icecream delivery index', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps exact delivery sequences and deduplicates product rows per delivery', async () => {
    saveIcecreamDeliveryIndex(
      ['주문번호', '배송번호', '배송순번', '상품번호'],
      [
        ['20260729M037101', '116569790', '1', '11287755'],
        ['20260729M037101', '116569790', '1', 'DELIVERY-FEE'],
        ['20260729M037101', '116569791', '2', '11287756'],
      ],
    );

    const result = await buildIcecreamDeliveryRows(
      new Set(['20260729M037101', 'MISSING']),
      [],
    );

    expect(result.headers).toEqual(['주문번호', '배송번호', '배송순번']);
    expect(result.rows).toEqual([
      ['20260729M037101', '116569790', '1'],
      ['20260729M037101', '116569791', '2'],
    ]);
    expect(result.matchedOrders).toBe(1);
    expect(result.missingOrderNumbers).toEqual(['MISSING']);
  });

  it('migrates legacy delivery entries as sequence one without duplicating item rows', async () => {
    window.localStorage.setItem(
      'kiditem-icecream-deli-index',
      JSON.stringify({
        '20260728M034091': {
          deliNo: '116565901',
          items: ['11258337', 'DELIVERY-FEE'],
          at: Date.now(),
        },
      }),
    );

    const result = await buildIcecreamDeliveryRows(
      new Set(['20260728M034091']),
      [],
    );

    expect(result.rows).toEqual([
      ['20260728M034091', '116565901', '1'],
    ]);
  });
});
