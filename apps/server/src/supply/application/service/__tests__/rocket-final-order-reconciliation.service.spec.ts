import { describe, expect, it, vi } from 'vitest';
import { RocketFinalOrderReconciliationService } from '../rocket-final-order-reconciliation.service';

describe('RocketFinalOrderReconciliationService', () => {
  it('delegates the caller-owned transaction and authenticated scope unchanged', async () => {
    const transactions = {
      reconcile: vi.fn().mockResolvedValue({
        exportId: '55555555-5555-4555-8555-555555555555',
        transmissionIntentKey: 'rocket-workbook:55555555-5555-4555-8555-555555555555:shipment',
        matchedLineCount: 1,
        reconciledRows: 1,
        skippedLines: [],
      }),
    };
    const service = new RocketFinalOrderReconciliationService(transactions);
    const input = {
      transaction: {},
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      channelAccountId: '33333333-3333-4333-8333-333333333333',
      sourceImportRunId: '66666666-6666-4666-8666-666666666666',
      transport: 'SHIPMENT' as const,
      lines: [{
        finalOrderLineId: '44444444-4444-4444-8444-444444444444',
        poNumber: 'PO-1',
        productNo: 'P-1',
        barcode: '8801234567890',
        unitQuantity: 2,
      }],
    };

    await expect(service.reconcile(input)).resolves.toEqual({
      exportId: '55555555-5555-4555-8555-555555555555',
      transmissionIntentKey: 'rocket-workbook:55555555-5555-4555-8555-555555555555:shipment',
      matchedLineCount: 1,
      reconciledRows: 1,
      skippedLines: [],
    });
    expect(transactions.reconcile).toHaveBeenCalledWith(input);
  });
});
