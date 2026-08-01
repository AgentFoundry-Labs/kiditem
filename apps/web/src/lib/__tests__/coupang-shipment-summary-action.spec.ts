import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  collectAndPersistCoupangShipmentSummary,
} from '@/lib/coupang-shipment-summary-action';
import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe('collectAndPersistCoupangShipmentSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectOrderCollectionExtensionId).mockResolvedValue('extension-id');
  });

  it('uses the validated extension result and verifies the persisted summary', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      scannedPages: 2,
      totalRows: 3,
      dates: [
        { date: '2026-08-01', count: 2, boxes: 4 },
        { date: '2026-07-31', count: 1, boxes: 1 },
      ],
    });
    vi.mocked(apiClient.put).mockResolvedValue({ items: [] });
    vi.mocked(apiClient.get).mockResolvedValue({
      items: [
        { date: '2026-08-01', count: 2, boxes: 4, capturedAt: '2026-08-01T00:00:00Z' },
        { date: '2026-07-31', count: 1, boxes: 1, capturedAt: '2026-08-01T00:00:00Z' },
      ],
    });

    await expect(collectAndPersistCoupangShipmentSummary()).resolves.toEqual({
      status: 'collected',
      latest: { date: '2026-08-01', count: 2, boxes: 4 },
      items: [
        { date: '2026-08-01', count: 2, boxes: 4 },
        { date: '2026-07-31', count: 1, boxes: 1 },
      ],
    });
    expect(apiClient.put).toHaveBeenCalledWith('/api/coupang-shipments/date-summary', {
      items: [
        { date: '2026-08-01', count: 2, boxes: 4 },
        { date: '2026-07-31', count: 1, boxes: 1 },
      ],
    });
  });

  it('keeps an explicit empty result distinct and does not persist it', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      scannedPages: 1,
      totalRows: 0,
      dates: [],
    });

    await expect(collectAndPersistCoupangShipmentSummary()).resolves.toEqual({
      status: 'empty',
      items: [],
    });
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('rejects a save that cannot be read back exactly', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      scannedPages: 1,
      totalRows: 1,
      dates: [{ date: '2026-08-01', count: 1, boxes: 2 }],
    });
    vi.mocked(apiClient.put).mockResolvedValue({ items: [] });
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });

    await expect(collectAndPersistCoupangShipmentSummary())
      .rejects.toThrow('발송일 요약 저장을 서버에서 확인하지 못했습니다.');
  });
});
