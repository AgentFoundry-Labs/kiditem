import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/always-orders.js?raw';

// 올웨이즈 주문 엑셀 페이지 스크립트(MAIN world 처리기, 옛 worker.js `scrapeAlwayzOrders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(배송관리 DOM·localStorage·fetch·createObjectURL)뿐이다. 옛 order-collector-empty-vs-login 테스트를 옮겼다.
type Handler = () => Promise<Record<string, unknown>>;

function load(options: { fetch: (url: string, init: RequestInit) => Promise<unknown>; token?: string; onExtract?: () => void }) {
  const window: Record<string, unknown> = { __kiditemPageCalls: {} };
  const immediate = (callback: () => void) => callback();
  const created: unknown[] = [];
  const url = { createObjectURL: (value: unknown) => { created.push(value); return 'blob:x'; } };
  const extractButton = { textContent: '엑셀추출하기', offsetParent: {}, click: () => options.onExtract?.call(null) };
  const document = { querySelectorAll: () => [extractButton], querySelector: () => null, body: { innerText: '' } };
  const localStorage = { getItem: () => options.token ?? '' };
  new Function('window', 'document', 'URL', 'Blob', 'localStorage', 'fetch', 'setTimeout', 'btoa', source)(
    window, document, url, Blob, localStorage, options.fetch, immediate, btoa,
  );
  return { handler: (window.__kiditemPageCalls as Record<string, Handler>)['always.orders']!, url };
}

describe('always orders page script', () => {
  it('인증되지 않은 pre-excel은 0건이 아니라 로그인 필요(옛 테스트)', async () => {
    const { handler } = load({ token: 'expired-token', fetch: async () => ({ ok: false, status: 401 }) });
    const result = await handler();
    expect(result).toMatchObject({ success: false, pendingLogin: true, errorCode: 'login_required' });
    expect(result.empty).toBeUndefined();
  });

  it('인증된 빈 pre-excel은 0건(옛 테스트), 토큰은 판매자 백엔드 요청 머리글에만 싣는다', async () => {
    const requested: Array<[string, RequestInit]> = [];
    const { handler } = load({
      token: 'active-token',
      fetch: async (url, init) => {
        requested.push([url, init]);
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      },
    });
    await expect(handler()).resolves.toEqual({ success: true, empty: true, rowCount: 0 });
    expect(requested).toEqual([['https://alwayz-seller-back.ilevit.com/sellers/items/pre-shipping/pre-excel', { headers: { 'x-access-token': 'active-token' } }]]);
  });

  it('신규 주문이 있으면 엑셀추출하기로 조립된 blob을 잡아 base64로 돌려준다', async () => {
    let loaded: ReturnType<typeof load>;
    const blob = new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]);
    loaded = load({
      token: 'active-token',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 1 }] }) }),
      onExtract: () => { (loaded.url as { createObjectURL(value: unknown): string }).createObjectURL(blob); },
    });
    await expect(loaded.handler()).resolves.toEqual({ success: true, xlsxBase64: btoa('PK\u0003\u0004'), fileName: '올웨이즈.xlsx', size: 4 });
  });
});
