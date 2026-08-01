import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  collectCoupangShipmentDateSummaryViaExtension,
  COUPANG_SHIPMENT_RESPONSE_INVALID_CODE,
  COUPANG_SHIPMENT_SESSION_REQUIRED_CODE,
  CoupangShipmentExtensionError,
} from './coupang-shipment-extension';

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));

const mockedDetectExtension = vi.mocked(detectOrderCollectionExtensionRuntime);
const mockedSendToExtension = vi.mocked(sendToExtension);

describe('collectCoupangShipmentDateSummaryViaExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDetectExtension.mockResolvedValue({
      status: 'ready',
      extensionId: 'order-collector',
      version: '0.1.95',
    });
  });

  it('accepts only the validated date-summary capability and complete evidence', async () => {
    mockedSendToExtension.mockResolvedValueOnce({
      success: true,
      scannedPages: 2,
      totalRows: 3,
      dates: [
        { date: '2026-07-27', count: 2, boxes: 4 },
        { date: '2026-07-24', count: 1, boxes: 1 },
      ],
    });

    await expect(collectCoupangShipmentDateSummaryViaExtension()).resolves.toEqual([
      { date: '2026-07-27', count: 2, boxes: 4 },
      { date: '2026-07-24', count: 1, boxes: 1 },
    ]);
    expect(mockedDetectExtension).toHaveBeenCalledWith(
      1200,
      [
        'collectCoupangShipmentDateSummaryValidatedV1',
        'coupangShipmentSummaryCollectionSessionV1',
      ],
    );
  });

  it('rejects a stale extension with explicit reload guidance', async () => {
    mockedDetectExtension.mockResolvedValueOnce({
      status: 'incompatible',
      extensionId: 'legacy-order-collector',
      version: '0.1.94',
      missingCapabilities: ['coupangShipmentSummaryCollectionSessionV1'],
    });

    await expect(collectCoupangShipmentDateSummaryViaExtension())
      .rejects.toThrow('이전 버전');
    expect(mockedSendToExtension).not.toHaveBeenCalled();
  });

  it('preserves the structured Supplier Hub session error', async () => {
    mockedSendToExtension.mockResolvedValueOnce({
      success: false,
      errorCode: COUPANG_SHIPMENT_SESSION_REQUIRED_CODE,
      error: 'Supplier Hub 로그인이 필요합니다.',
    });

    const error = await collectCoupangShipmentDateSummaryViaExtension()
      .then(() => null, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(CoupangShipmentExtensionError);
    expect(error).toMatchObject({
      code: COUPANG_SHIPMENT_SESSION_REQUIRED_CODE,
      message: 'Supplier Hub 로그인이 필요합니다.',
    });
  });

  it('rejects rows that disappear during extension response parsing', async () => {
    mockedSendToExtension.mockResolvedValueOnce({
      success: true,
      scannedPages: 1,
      totalRows: 2,
      dates: [{ date: '2026-07-27', count: 1, boxes: 1 }],
    });

    const error = await collectCoupangShipmentDateSummaryViaExtension()
      .then(() => null, (reason: unknown) => reason);

    expect(error).toMatchObject({
      code: COUPANG_SHIPMENT_RESPONSE_INVALID_CODE,
    });
  });

  it('keeps a validated empty parcel table distinct from an auth failure', async () => {
    mockedSendToExtension.mockResolvedValueOnce({
      success: true,
      scannedPages: 1,
      totalRows: 0,
      dates: [],
    });

    await expect(collectCoupangShipmentDateSummaryViaExtension()).resolves.toEqual([]);
  });
});
