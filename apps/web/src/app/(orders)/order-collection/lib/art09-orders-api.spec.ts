import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import {
  collectArt09CsvFromExtension,
  collectArt09OrdersFromExtension,
} from './art09-orders-api';

describe('collectArt09OrdersFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // run 없이 호출하는 경로는 확장 ID 를 직접 탐지한다. 탐지 결과가 없으면 수집 이전에 던지므로
    // CSV 변환을 검증하는 테스트가 확장 탐지에서 막힌다.
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('order-extension');
    bridge.sendToExtension.mockResolvedValue({ success: true, rows: [] });
  });

  it('keeps the extension lifecycle open until web file generation finalizes it', async () => {
    await collectArt09OrdersFromExtension({
      extensionId: 'order-extension',
      runId: '00000000-0000-4000-8000-000000000009',
      date: '2026-07-27',
    });

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectArt09Orders',
        date: '2026-07-27',
        deferTerminal: true,
      }),
      190000,
    );
  });

  it('writes only real Cafe24 order identifiers and never synthesizes an item number', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      rows: [{
        orderId: '20260727-1234567',
        orderItemId: '',
        productNo: 'P-1',
        productName: '상품',
        qty: 1,
      }],
    });

    const result = await collectArt09CsvFromExtension({ download: false });
    const csv = await result.blob.text();

    expect(csv).toContain('한국어 쇼핑몰,1,20260727-1234567,,');
    expect(csv).not.toContain('20260727-1234567-01');
    expect(csv).not.toContain('판매처 주문번호 or 상품주문번호');
    expect(result.orderNumbers).toEqual(['20260727-1234567']);
  });
});
