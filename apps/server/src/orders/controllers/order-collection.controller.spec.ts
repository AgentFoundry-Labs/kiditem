import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionController } from './order-collection.controller';

describe('OrderCollectionController Coupang direct boundary', () => {
  it('persists and reconciles PA orders before generating the Sellpia workbook', async () => {
    const collection = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        reconciledRows: 1,
        confirmedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
        skippedLines: [],
        duplicate: false,
      }),
    };
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 1,
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );
    const response = { setHeader: vi.fn() };

    await controller.convertCoupangDirectship(
      request() as never,
      '22222222-2222-4222-8222-222222222222',
      { id: '33333333-3333-4333-8333-333333333333' } as never,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(collection.collect).toHaveBeenCalledOnce();
    expect(workbook.generate).toHaveBeenCalledOnce();
    expect(collection.collect.mock.invocationCallOrder[0])
      .toBeLessThan(workbook.generate.mock.invocationCallOrder[0]!);
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Order-Collection-Import-Run-Id',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Order-Collection-Reconciled-Rows',
      '1',
    );
  });

  it('returns a "no confirmed orders" success without a workbook when nothing is confirmed', async () => {
    const collection = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        reconciledRows: 0,
        confirmedLines: [],
        skippedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
        duplicate: false,
      }),
    };
    const workbook = { generate: vi.fn() };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );
    const response = { setHeader: vi.fn() };

    const result = await controller.convertCoupangDirectship(
      request() as never,
      '22222222-2222-4222-8222-222222222222',
      { id: '33333333-3333-4333-8333-333333333333' } as never,
      { once: vi.fn() } as never,
      response as never,
    );

    // 확정 주문이 없으면 파일을 만들지 않고 2xx 로 사실대로 알린다.
    expect(workbook.generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      collected: 0,
      skipped: 1,
      message: '수집할 확정 주문이 없습니다.',
    });
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Confirmed-Empty', '1');
  });

  it('does not generate a workbook when persistence or reconciliation fails', async () => {
    const collection = { collect: vi.fn().mockRejectedValue(new Error('reconcile failed')) };
    const workbook = { generate: vi.fn() };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );

    await expect(controller.convertCoupangDirectship(
      request() as never,
      '22222222-2222-4222-8222-222222222222',
      { id: '33333333-3333-4333-8333-333333333333' } as never,
      { once: vi.fn() } as never,
      { setHeader: vi.fn() } as never,
    )).rejects.toThrow('reconcile failed');
    expect(workbook.generate).not.toHaveBeenCalled();
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
