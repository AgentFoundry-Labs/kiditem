import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/boribori-orders.js?raw';

// 보리보리 주문 엑셀 페이지 스크립트(MAIN world 처리기, 옛 worker.js `scrapeBoriboriOrders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(location·fetch)뿐이다. 옛 order-collector-empty-vs-login 테스트의 보리보리 응답을 옮겼다.
type Handler = (args: unknown) => Promise<Record<string, unknown>>;

function load(fetch: (url: string, init: { body: string }) => Promise<Response>, pathname = '/order/orderDeliList') {
  const window: Record<string, unknown> = { __kiditemPageCalls: {} };
  const immediate = (callback: () => void) => callback();
  new Function('window', 'fetch', 'location', 'setTimeout', 'btoa', source)(window, fetch, { pathname }, immediate, btoa);
  return (window.__kiditemPageCalls as Record<string, Handler>)['boribori.orders']!;
}

describe('boribori orders page script', () => {
  it('다운로드 사유와 암호(있으면 type=password)로 언마스킹 엑셀을 요청해 xlsx를 base64로 돌려준다', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const handler = load(async (url, init) => {
      bodies.push({ url, ...JSON.parse(init.body) });
      return new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    });
    await expect(handler({ downloadReason: '배송확인합니다', downloadPassword: 'pw' })).resolves.toEqual({
      success: true,
      xlsxBase64: btoa('PK\u0003\u0004'),
      fileName: '보리보리.xlsx',
      size: 4,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      url: '/order/rest/deli/downloadPkgOrdDeliList/excel-xlsx',
      stateCd: 'c',
      rowCount: 1000,
      reason: '배송확인합니다',
      password: 'pw',
      type: 'password',
    });
  });

  it('주문 없음을 말하는 404만 빈 수집, 그 밖의 404는 provider_contract_changed(옛 테스트), 주문 경로가 아니면 로그인 필요', async () => {
    const respond = (status: number, body: string) => load(async () => new Response(body, { status }));
    await expect(respond(404, JSON.stringify({ message: '조회된 주문이 없습니다.' }))({ downloadReason: '배송확인합니다', downloadPassword: '' }))
      .resolves.toEqual({ success: true, empty: true, rowCount: 0 });
    const unknown404 = await respond(404, JSON.stringify({ message: 'Not Found' }))({ downloadReason: '배송확인합니다', downloadPassword: '' });
    expect(unknown404).toMatchObject({ success: false, errorCode: 'provider_contract_changed' });
    expect(unknown404.empty).toBeUndefined();

    await expect(load(async () => new Response(''), '/login')({ downloadReason: '배송확인합니다', downloadPassword: '' }))
      .resolves.toMatchObject({ success: false, pendingLogin: true, errorCode: 'login_required' });
  });
});
