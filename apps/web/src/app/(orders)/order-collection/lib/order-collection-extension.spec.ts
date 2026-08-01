import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import {
  collectIcecreamMallRowsFromExtension,
  createOrderCollectionExtensionError,
  detectOrderCollectionSessionExtension,
  detectOrderCollectionSessionExtensionStatus,
  ensureMallLoggedInViaExtension,
  finalizeOrderCollectionSession,
  sendOrderFileToSellpiaViaExtension,
} from './order-collection-extension';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('order collection extension session bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('order-extension');
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'ready',
      extensionId: 'order-extension',
      version: '0.1.86',
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requires the browser collection session capability', async () => {
    await expect(detectOrderCollectionSessionExtension()).resolves.toBe(
      'order-extension',
    );
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(
      1200,
      ['browserCollectionSessions', 'orderCollectionFailureEvidenceV1'],
    );
  });

  it('preserves the loaded extension version and missing capability diagnosis', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'incompatible',
      extensionId: 'order-extension',
      version: '0.1.85',
      missingCapabilities: ['orderCollectionFailureEvidenceV1'],
    });

    await expect(detectOrderCollectionSessionExtensionStatus()).resolves.toEqual({
      status: 'incompatible',
      extensionId: 'order-extension',
      version: '0.1.85',
      missingCapabilities: ['orderCollectionFailureEvidenceV1'],
    });
    await expect(
      collectIcecreamMallRowsFromExtension('2026-07-15'),
    ).rejects.toThrow('0.1.85');
    await expect(
      collectIcecreamMallRowsFromExtension('2026-07-15'),
    ).rejects.toThrow('orderCollectionFailureEvidenceV1');
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('passes the page-owned runId into the automatic collection message', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      mall: '아이스크림몰',
      date: '2026-07-15',
      headers: ['주문번호'],
      rows: [['A-1']],
      rowCount: 1,
      masked: false,
      source: 'test',
      runId: RUN_ID,
    });

    await collectIcecreamMallRowsFromExtension(
      '2026-07-15',
      { loginId: 'operator', password: 'secret' },
      { runId: RUN_ID, extensionId: 'order-extension' },
    );

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectIcecreamMallOrders',
        runId: RUN_ID,
      }),
      90000,
    );
  });

  it('returns a structured login attention result instead of swallowing it', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '로그인이 필요합니다.',
    });

    const result = await ensureMallLoggedInViaExtension(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      { runId: RUN_ID, extensionId: 'order-extension', date: '2026-07-28' },
    );

    expect(result).toEqual({
      success: false,
      pendingLogin: true,
      error: '로그인이 필요합니다.',
    });
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'ensureMallLoggedIn',
        runId: RUN_ID,
        date: '2026-07-28',
      }),
      45000,
    );
  });

  it('does not classify a missing extension as a marketplace login failure', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'not_found' });

    await expect(ensureMallLoggedInViaExtension(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      { runId: RUN_ID, date: '2026-07-28' },
    )).resolves.toMatchObject({
      success: false,
      pendingLogin: false,
      errorCode: 'unknown_failure',
      error: expect.stringContaining('확장프로그램'),
    });
  });

  it('preserves structured collection failure evidence on thrown errors', () => {
    const error = createOrderCollectionExtensionError({
      success: false,
      pendingLogin: true,
      errorCode: 'login_required',
      error: '로그인이 필요합니다.',
      failure: {
        version: 1,
        provider: 'always',
        action: ['collect', 'orders'].join('_') as 'collect_orders',
        code: 'login_required',
        retryable: true,
        operatorAction: 'complete_login',
      },
    }, '올웨이즈 주문 수집 실패');

    expect(error).toMatchObject({
      message: '로그인이 필요합니다.',
      pendingLogin: true,
      errorCode: 'login_required',
      failure: expect.objectContaining({ code: 'login_required' }),
    });
  });

  it('finalizes the page-owned session after backend conversion', async () => {
    bridge.sendToExtension.mockResolvedValue({
      runId: RUN_ID,
      producer: 'orders.mall',
      status: 'failed',
    });

    await finalizeOrderCollectionSession(
      { runId: RUN_ID, extensionId: 'order-extension' },
      'failed',
      '쿠팡직배송 엑셀 생성 실패',
    );

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      {
        action: 'finalizeCollectionSession',
        runId: RUN_ID,
        status: 'failed',
        message: '쿠팡직배송 엑셀 생성 실패',
      },
    );
  });

  it('classifies a missing extension as definitely not submitted', async () => {
    bridge.detectOrderCollectionExtensionId.mockResolvedValue(null);

    await expect(sendOrderFileToSellpiaViaExtension({
      shopName: '키드키즈',
      fileName: 'orders.xlsx',
      blob: new Blob(['orders']),
    })).resolves.toMatchObject({
      success: false,
      outcome: 'not_submitted',
      error: expect.stringContaining('확장프로그램'),
    });
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('requires the Sellpia upload-evidence capability before sending a file', async () => {
    bridge.detectOrderCollectionExtensionId.mockResolvedValue(null);

    await sendOrderFileToSellpiaViaExtension({
      shopName: '키드키즈',
      fileName: 'orders.xlsx',
      blob: new Blob(['orders']),
    });

    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'sellpiaScopedAutoInvoiceV1',
    );
  });

  it('classifies a local file encoding failure as definitely not submitted', async () => {
    class FailingFileReader {
      result: string | ArrayBuffer | null = null;
      error = new Error('encoding failed');
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        this.onerror?.();
      }
    }
    vi.stubGlobal('FileReader', FailingFileReader);

    await expect(sendOrderFileToSellpiaViaExtension({
      shopName: '키드키즈',
      fileName: 'orders.xlsx',
      blob: new Blob(['orders']),
      orderNumbers: ['ORDER-1'],
    })).resolves.toMatchObject({
      success: false,
      outcome: 'not_submitted',
      error: expect.stringContaining('encoding failed'),
    });
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('classifies a lost extension response as unknown', async () => {
    bridge.sendToExtension.mockRejectedValue(new Error('응답 시간이 초과되었습니다.'));

    await expect(sendOrderFileToSellpiaViaExtension({
      shopName: '키드키즈',
      fileName: 'orders.xlsx',
      blob: new Blob(['orders']),
      orderNumbers: ['ORDER-1'],
    })).resolves.toMatchObject({
      success: false,
      outcome: 'unknown',
      error: expect.stringContaining('초과'),
    });
  });

  it('preserves explicit worker outcomes without inferring from success', async () => {
    bridge.sendToExtension
      .mockResolvedValueOnce({
        success: false,
        outcome: 'not_submitted',
        error: '판매처를 찾지 못했습니다.',
      })
      .mockResolvedValueOnce({
        success: true,
        outcome: 'submitted',
        shop: '키드키즈',
      });
    const params = {
      shopName: '키드키즈',
      fileName: 'orders.xlsx',
      blob: new Blob(['orders']),
      orderNumbers: ['ORDER-1'],
    };

    await expect(sendOrderFileToSellpiaViaExtension(params)).resolves.toMatchObject({
      outcome: 'not_submitted',
    });
    await expect(sendOrderFileToSellpiaViaExtension(params)).resolves.toMatchObject({
      outcome: 'submitted',
    });
  });
});
