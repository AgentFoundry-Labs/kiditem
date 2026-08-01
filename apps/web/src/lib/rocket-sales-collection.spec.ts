import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOrderCollectionExtensionRuntime, sendToExtension } from '@/lib/extension-bridge';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  collectRocketPoRowsFromExtension,
  collectRocketPoRowsForConfirmationFromExtension,
  detectRocketOrderExtensionId,
  finalizeRocketPoCollectionSession,
} from './rocket-sales-collection';

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/browser-collection-session', () => ({
  issueBrowserCollectionRunId: vi.fn(),
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('detectRocketOrderExtensionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a loaded extension that lacks the evidence response capability', async () => {
    vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
      status: 'incompatible',
      extensionId: 'legacy-extension-id',
      version: '0.1.86',
      missingCapabilities: ['coupangRocketPoCollectionSessionV1'],
    });

    await expect(
      detectRocketOrderExtensionId('collectRocketPoRowsEvidenceV1'),
    ).rejects.toThrow(/새로고침/);
    expect(detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1200, [
      'collectRocketPoRowsEvidenceV1',
      'coupangRocketPoCollectionSessionV1',
    ]);
  });
});

describe('collectRocketPoRowsFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(issueBrowserCollectionRunId).mockResolvedValue(RUN_ID);
    vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
      status: 'ready',
      extensionId: 'extension-id',
      version: '0.1.87',
    });
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

  it('sends the server-issued run ID and returns the exact completeness evidence', async () => {
    const result = await collectRocketPoRowsFromExtension({
      from: '2026-07-01',
      to: '2026-07-07',
      status: 'RP',
    });

    expect(sendToExtension).toHaveBeenCalledWith(
      'extension-id',
      expect.objectContaining({
        action: 'collectRocketPoRows',
        deferTerminal: true,
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

    expect(detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1200, [
      'collectRocketPoRowsConfirmationV1',
      'coupangRocketPoCollectionSessionV1',
    ]);
    expect(sendToExtension).toHaveBeenCalledWith(
      'extension-id',
      expect.objectContaining({
        action: 'collectRocketPoRows',
        status: '',
        dateType: 'WAREHOUSING_PLAN_DATE',
      }),
      190000,
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

  it('finalizes the deferred extension session after the server save', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: true,
      status: 'succeeded',
    });

    await finalizeRocketPoCollectionSession({
      extensionId: 'extension-id',
      runId: RUN_ID,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    });

    expect(sendToExtension).toHaveBeenCalledWith('extension-id', {
      action: 'finalizeCollectionSession',
      runId: RUN_ID,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    });
  });
});
