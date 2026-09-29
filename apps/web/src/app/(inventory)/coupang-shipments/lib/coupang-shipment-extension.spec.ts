import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import {
  clearCoupangCookiesViaExtension,
  collectCoupangShipmentDraftsViaExtension,
  isCoupangCookieBloatError,
  openCoupangShipmentPageViaExtension,
} from './coupang-shipment-extension';
import { COUPANG_SHIPMENT_PAGE_URL } from './coupang-shipment-files';

describe('Coupang shipment extension actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
  });

  it('opens the shipment page through the new runtime shipment capability', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, tabId: 7, url: COUPANG_SHIPMENT_PAGE_URL });
    await expect(openCoupangShipmentPageViaExtension()).resolves.toBe(COUPANG_SHIPMENT_PAGE_URL);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'coupangShipmentActionsV1');
  });

  it('clears cookies through the new runtime shipment capability', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, cleared: 3, total: 5 });
    await expect(clearCoupangCookiesViaExtension()).resolves.toBe(3);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'coupangShipmentActionsV1');
  });

  it('sends the shipment page message in the shared shape', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, tabId: 7, url: COUPANG_SHIPMENT_PAGE_URL });
    await openCoupangShipmentPageViaExtension();
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'openCoupangShipmentPage', url: COUPANG_SHIPMENT_PAGE_URL },
      20000,
    );
  });

  it('rejects a shipment page answer outside the shared contract', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true });
    await expect(openCoupangShipmentPageViaExtension()).rejects.toThrow('확장 답이 약속한 모양과 다릅니다');
  });

  it('keeps the cookie bloat code from the shared failure envelope', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: false, errorCode: 'coupang_cookie_bloat', error: '쿠키가 커져 요청이 거절됐습니다.' });
    const error = await clearCoupangCookiesViaExtension().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('쿠키가 커져 요청이 거절됐습니다.');
  });

  it('fetches label and manifest PDFs in shared-shape batches and names drafts by date and center', async () => {
    bridge.sendToExtension.mockImplementation(async (_id: string, message: { action: string; items?: Array<{ seq: string; kind: string }> }) => {
      if (message.action === 'collectCoupangShipmentList') {
        return { success: true, shipments: [{ seq: '101', center: '평택1', status: '', outbound: '', inbound: '', boxes: '', qty: '', po: '', invoice: '' }] };
      }
      return {
        success: true,
        files: (message.items ?? []).map((item) => ({ seq: item.seq, kind: item.kind, ok: true, b64: btoa('%PDF'), bytes: 4, error: null })),
      };
    });

    const result = await collectCoupangShipmentDraftsViaExtension('2026-09-29');

    expect(bridge.sendToExtension).toHaveBeenNthCalledWith(2, 'ext', {
      action: 'fetchCoupangShipmentPdfBatch',
      items: [{ seq: '101', kind: 'label' }, { seq: '101', kind: 'manifest' }],
    }, 120000);
    expect(result.drafts.map((draft) => draft.name)).toEqual([
      '쿠팡쉽먼트_2026-09-29_평택1_101_Label.pdf',
      '쿠팡쉽먼트_2026-09-29_평택1_101_내역서.pdf',
    ]);
    expect(result.failed).toEqual([]);
  });

  it('turns a PDF batch cookie bloat failure into the cookie recovery error', async () => {
    bridge.sendToExtension.mockImplementation(async (_id: string, message: { action: string }) => (
      message.action === 'collectCoupangShipmentList'
        ? { success: true, shipments: [{ seq: '101', center: '평택1' }] }
        : { success: false, errorCode: 'coupang_cookie_bloat', error: '쿠키가 커져 요청이 거절됐습니다.' }
    ));
    const error = await collectCoupangShipmentDraftsViaExtension('2026-09-29').catch((caught: unknown) => caught);
    expect(isCoupangCookieBloatError(error)).toBe(true);
  });
});
