import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  collectRocketPoRowsFromExtension,
  collectRocketPoRowsForConfirmationFromExtension,
  detectRocketOrderExtensionId,
} from './rocket-sales-collection';

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('detectRocketOrderExtensionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a loaded extension that lacks the evidence response capability', async () => {
    vi.mocked(detectOrderCollectionExtensionId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('legacy-extension-id');

    await expect(
      detectRocketOrderExtensionId('collectRocketPoRowsEvidenceV1'),
    ).rejects.toThrow(/새로고침/);
    expect(detectOrderCollectionExtensionId).toHaveBeenNthCalledWith(
      1,
      1200,
      'collectRocketPoRowsEvidenceV1',
    );
  });
});

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

  it('requires the confirmation metadata capability for workbook collection', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: true,
      rows: [{
        poLineId: '1001:P-1:8800000000001:1',
        poNumber: '1001',
        vendorId: 'VENDOR-1',
        productNo: 'P-1',
        barcode: '8800000000001',
        productName: 'Rocket item',
        orderQty: 2,
        plannedDeliveryDate: '2026-07-20',
        confirmation: {
          center: '덕평1센터',
          inboundType: '택배',
          poStatus: '거래처확인요청',
          returnManager: '',
          returnContact: '',
          returnAddress: '',
          purchasePrice: 1000,
          supplyPrice: 900,
          vat: 90,
          totalPurchase: 1980,
          poRegisteredAt: '2026-07-17 09:00:00',
          xdock: 'N',
        },
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

    await collectRocketPoRowsForConfirmationFromExtension({
      from: '2026-07-01',
      to: '2026-07-07',
    });

    expect(detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'collectRocketPoRowsConfirmationV1',
    );
  });

  it('rejects confirmation collection rows without official workbook evidence', async () => {
    await expect(collectRocketPoRowsForConfirmationFromExtension({
      from: '2026-07-01',
      to: '2026-07-07',
    })).rejects.toThrow(/확정 자료/);
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
