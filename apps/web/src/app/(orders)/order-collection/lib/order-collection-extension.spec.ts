import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import {
  createOrderCollectionExtensionError,
  detectOrderCollectionSessionExtension,
  detectOrderCollectionSessionExtensionStatus,
  ensureMallLoggedInViaExtension,
  sendOrderFileToSellpiaViaExtension,
} from './order-collection-extension';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';

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
    // The known extension gets 8 s: during collect-all a busy worker answers a
    // ping late, and late is not missing (2026-09-18 GS샵 · 쿠팡직배송).
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(
      1200,
      [
        'browserCollectionSessions',
        'orderCollectionFailureEvidenceV1',
        'orderCollectionConfirmedCoverageV1',
      ],
      8_000,
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
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('실행 kind로 옮긴 몰(KID-359 H3)의 로그인은 옛 몰 시도 없이 보낸다 — 확장이 로그인만 한다', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, submitted: false });

    await ensureMallLoggedInViaExtension(
      'kidkids',
      { loginId: 'operator', password: 'secret' },
      { attemptId: '', attemptToken: '', extensionId: 'order-extension', date: null, sourceOwner: 'mall_orders_operation' },
    );

    const message = bridge.sendToExtension.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(message).toMatchObject({ action: 'ensureMallLoggedIn', mallKey: 'kidkids' });
    expect(message).not.toHaveProperty('attemptId');
    expect(message).not.toHaveProperty('deferTerminal');
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
      {
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        extensionId: 'order-extension',
        date: '2026-07-28',
      },
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
        attemptId: ATTEMPT_ID,
        deferTerminal: true,
        date: '2026-07-28',
      }),
      75_000,
    );
  });

  it('does not classify a missing extension as a marketplace login failure', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'not_found' });

    await expect(ensureMallLoggedInViaExtension(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      { attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, date: '2026-07-28' },
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
