import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionController } from './order-collection.controller';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

describe('OrderCollectionController Coupang direct convert', () => {
  it('generates a Sellpia workbook from every collected line and reports linkage separately', async () => {
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 2,
      }),
    };
    const collection = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        exportId: '55555555-5555-4555-8555-555555555555',
        transmissionIntentKey: 'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
        matchedLineCount: 1,
        reconciledRows: 1,
        collectedLines: [
          { poNumber: 'PO-1', productNo: 'P-1' },
          { poNumber: 'PO-1', productNo: 'P-2' },
        ],
        matchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
        unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-2' }],
        duplicate: false,
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );
    const response = { setHeader: vi.fn(), status: vi.fn() };

    const file = await controller.convertCoupangDirectship(
      request() as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(collection.collect).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      request: request(),
    });
    expect(workbook.generate).toHaveBeenCalledOnce();
    expect(workbook.generate.mock.calls[0]?.[0]).toMatchObject({
      transport: 'SHIPMENT',
      pos: [{
        seq: 'PO-1',
        items: [
          expect.objectContaining({ skuId: 'P-1' }),
          expect.objectContaining({ skuId: 'P-2' }),
        ],
      }],
    });
    expect(file).toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Order-Collection-Import-Run-Id',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Rocket-Workbook-Export-Id',
      '55555555-5555-4555-8555-555555555555',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Sellpia-Transmission-Intent-Key',
      'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Source-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Product-Rows', '2');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Output-Rows', '2');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '0');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Matched-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Unmatched-Rows', '1');
  });

  it('generates a Sellpia workbook when every collected line is unmatched', async () => {
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 2,
      }),
    };
    const collection = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        exportId: null,
        transmissionIntentKey: 'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
        matchedLineCount: 0,
        reconciledRows: 0,
        collectedLines: [
          { poNumber: 'PO-1', productNo: 'P-1' },
          { poNumber: 'PO-1', productNo: 'P-2' },
        ],
        matchedLines: [],
        unmatchedLines: [
          { poNumber: 'PO-1', productNo: 'P-1' },
          { poNumber: 'PO-1', productNo: 'P-2' },
        ],
        duplicate: false,
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );
    const response = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    const result = await controller.convertCoupangDirectship(
      request() as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(result).toBeDefined();
    expect(response.status).not.toHaveBeenCalled();
    expect(workbook.generate).toHaveBeenCalledWith(
      request(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '0');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Unmatched-Rows', '2');
  });

  it('returns 204 only when the selected transport has no collected row', async () => {
    const workbook = { generate: vi.fn() };
    const collection = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        exportId: null,
        transmissionIntentKey: null,
        matchedLineCount: 0,
        reconciledRows: 0,
        collectedLines: [],
        matchedLines: [],
        unmatchedLines: [],
        duplicate: false,
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
    );
    const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis() };
    const emptyRequest = { ...request(), pos: [] };

    const result = await controller.convertCoupangDirectship(
      emptyRequest as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(result).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(204);
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
        name: 'Rocket item 1',
        qty: 2,
        amount: 2000,
      }, {
        skuId: 'P-2',
        barcode: '8801234567891',
        name: 'Rocket item 2',
        qty: 1,
        amount: 1000,
      }],
    }],
  };
}
