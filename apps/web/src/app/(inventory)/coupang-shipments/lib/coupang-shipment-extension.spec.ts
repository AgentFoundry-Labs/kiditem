import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);
const api = vi.hoisted(() => ({ get: vi.fn() }));
const start = vi.hoisted(() => ({ requestOperationStart: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/operation-start', () => start);
vi.mock('@/lib/operation-login', () => ({
  operationLoginOptions: vi.fn(async () => ({})),
  noteOperationLoginFailureForMall: vi.fn(),
  ROCKET_LOGIN_MALL_KEY: 'coupang-direct',
}));

const LIST_ID = '11111111-1111-4111-8111-111111111111';

/** 배송 목록 실행(`orders.coupang_shipment_list`)이 끝난 모습. */
function shipmentList(status: 'succeeded' | 'failed', patch: Record<string, unknown> = {}) {
  return {
    operation: {
      id: LIST_ID,
      kind: 'orders.coupang_shipment_list',
      status,
      lockKeys: [],
      plan: null,
      progress: null,
      result: status === 'succeeded'
        ? {
          date: '2026-09-29',
          shipments: [{ seq: '101', center: '평택1', outbound: '2026-09-29', boxes: 2, status: null }],
          scannedPages: 1,
          stopReason: 'short_page',
        }
        : null,
      window: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-09-29T00:00:00.000Z',
      finishedAt: '2026-09-29T00:00:05.000Z',
      expiresAt: '2026-09-29T00:30:00.000Z',
      attempts: 1,
      maxAttempts: 1,
      scheduledFor: null,
      ...patch,
    },
  };
}

import {
  clearCoupangCookiesViaExtension,
  collectCoupangShipmentDraftsViaExtension,
  isCoupangCookieBloatError,
  openCoupangShipmentPageViaExtension,
} from './coupang-shipment-extension';
import { COUPANG_SHIPMENT_PAGE_URL } from './coupang-shipment-files';

it('has no button-click download path — nothing called it (KID-366)', async () => {
  const module = await import('./coupang-shipment-extension');
  expect(module).not.toHaveProperty('clickCoupangShipmentDownloadsViaExtension');
});

describe('Coupang shipment extension actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
    start.requestOperationStart.mockResolvedValue({ outcome: 'started', operationId: LIST_ID });
    api.get.mockResolvedValue(shipmentList('succeeded'));
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

  it('배송 목록은 실행 orders.coupang_shipment_list로 받고, 그 행의 seq·center로 PDF 묶음을 받아 발송일·센터로 이름 짓는다', async () => {
    bridge.sendToExtension.mockImplementation(async (_id: string, message: { action: string; items?: Array<{ seq: string; kind: string }> }) => ({
      success: true,
      files: (message.items ?? []).map((item) => ({ seq: item.seq, kind: item.kind, ok: true, b64: btoa('%PDF'), bytes: 4, error: null })),
    }));

    const result = await collectCoupangShipmentDraftsViaExtension('2026-09-29');

    expect(start.requestOperationStart).toHaveBeenCalledWith('orders.coupang_shipment_list', { date: '2026-09-29' }, { capability: 'orderActionOperationKindsV1' });
    expect(bridge.sendToExtension).toHaveBeenCalledOnce();
    expect(bridge.sendToExtension).toHaveBeenCalledWith('ext', {
      action: 'fetchCoupangShipmentPdfBatch',
      items: [{ seq: '101', kind: 'label' }, { seq: '101', kind: 'manifest' }],
    }, 120000);
    expect(result.drafts.map((draft) => draft.name)).toEqual([
      '쿠팡쉽먼트_2026-09-29_평택1_101_Label.pdf',
      '쿠팡쉽먼트_2026-09-29_평택1_101_내역서.pdf',
    ]);
    expect(result.failed).toEqual([]);
  });

  it('배송 목록 실행이 쿠키 과다로 끝나면 쿠키 정리 복구 오류로 알린다', async () => {
    api.get.mockResolvedValue(shipmentList('failed', { errorCode: 'SITE_COOKIE_BLOAT', errorMessage: '쿠팡 쿠키가 너무 많아 요청이 거절됐습니다.' }));
    const error = await collectCoupangShipmentDraftsViaExtension('2026-09-29').catch((caught: unknown) => caught);
    expect(isCoupangCookieBloatError(error)).toBe(true);
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('turns a PDF batch cookie bloat failure into the cookie recovery error', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: false, errorCode: 'coupang_cookie_bloat', error: '쿠키가 커져 요청이 거절됐습니다.' });
    const error = await collectCoupangShipmentDraftsViaExtension('2026-09-29').catch((caught: unknown) => caught);
    expect(isCoupangCookieBloatError(error)).toBe(true);
  });
});
