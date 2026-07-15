import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { collectRocketPoRowsFromExtension } from './rocket-sales-collection';

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('collectRocketPoRowsFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => RUN_ID });
    vi.mocked(detectOrderCollectionExtensionId).mockResolvedValue('extension-id');
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      rows: [{
        poLineId: '1001:P-1::1',
        poNumber: '1001',
        vendorId: 'VENDOR-1',
        productNo: 'P-1',
        barcode: '',
        productName: 'Rocket item',
        orderQty: 2,
        plannedDeliveryDate: '2026-07-20',
      }],
      poCount: 1,
      evidence: {
        collectionRunId: RUN_ID,
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
    });
  });

  it('sends a browser UUID and returns the exact completeness evidence', async () => {
    const result = await collectRocketPoRowsFromExtension({
      from: '2026-07-01',
      to: '2026-07-07',
      status: 'RP',
    });

    expect(sendToExtension).toHaveBeenCalledWith(
      'extension-id',
      expect.objectContaining({
        action: 'collectRocketPoRows',
        runId: RUN_ID,
      }),
      190000,
    );
    expect(result.collection.collectionRunId).toBe(RUN_ID);
    expect(result.rows[0]?.poLineId).toBe('1001:P-1::1');
  });

  it('rejects an extension response attached to another run', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: true,
      rows: [],
      poCount: 0,
      evidence: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
    });

    await expect(collectRocketPoRowsFromExtension({
      from: '2026-07-01',
      to: '2026-07-07',
    })).rejects.toThrow(/run/i);
  });
});
