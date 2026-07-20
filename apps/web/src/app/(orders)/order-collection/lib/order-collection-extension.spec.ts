import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import {
  collectIcecreamMallRowsFromExtension,
  detectOrderCollectionSessionExtension,
  ensureMallLoggedInViaExtension,
  finalizeOrderCollectionSession,
  sendOrderFileToSellpiaViaExtension,
} from './order-collection-extension';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('order collection extension session bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('order-extension');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requires the browser collection session capability', async () => {
    await expect(detectOrderCollectionSessionExtension()).resolves.toBe(
      'order-extension',
    );
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'browserCollectionSessions',
    );
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
      { runId: RUN_ID, extensionId: 'order-extension' },
    );

    expect(result).toEqual({
      success: false,
      pendingLogin: true,
      error: '로그인이 필요합니다.',
    });
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({ action: 'ensureMallLoggedIn', runId: RUN_ID }),
      45000,
    );
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
    };

    await expect(sendOrderFileToSellpiaViaExtension(params)).resolves.toMatchObject({
      outcome: 'not_submitted',
    });
    await expect(sendOrderFileToSellpiaViaExtension(params)).resolves.toMatchObject({
      outcome: 'submitted',
    });
  });
});
