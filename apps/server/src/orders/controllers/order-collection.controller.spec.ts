import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionController } from './order-collection.controller';

describe('OrderCollectionController Coupang direct convert', () => {
  it('generates the Sellpia workbook straight from the collected orders (no reconciliation gate)', async () => {
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 3,
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
    );
    const response = { setHeader: vi.fn() };

    const file = await controller.convertCoupangDirectship(
      request() as never,
      { once: vi.fn() } as never,
      response as never,
    );

    // 수집한 발주는 발주확정 여부와 무관하게 항상 파일로 나간다.
    expect(workbook.generate).toHaveBeenCalledOnce();
    expect(workbook.generate.mock.calls[0]?.[0]).toMatchObject({ transport: 'SHIPMENT' });
    expect(file).toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Source-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Product-Rows', '3');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Output-Rows', '3');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '0');
  });
});

function request() {
  return {
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    transport: 'SHIPMENT',
    centers: { Center: { addr: 'Seoul' } },
    pos: [{
      seq: 'PO-1',
      status: 'PA',
      center: 'Center',
      transport: 'SHIPMENT',
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [{
        skuId: 'P-1',
        barcode: '8801234567890',
        name: 'Rocket item',
        qty: 2,
        amount: 2000,
      }],
    }],
  };
}
