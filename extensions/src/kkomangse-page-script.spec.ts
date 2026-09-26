import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/kkomangse-orders.js?raw';

// 꼬망세 주문 엑셀 페이지 스크립트(ISOLATED 처리기, 옛 worker.js `scrapeKkomangseExport` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(목록 폼 DOM·fetch)뿐이다.
type Handler = () => Promise<Record<string, unknown>>;

function field(name: string, value: string, extra: Record<string, unknown> = {}) {
  return { name, value, type: 'text', checked: false, ...extra };
}

function load(document: unknown, fetch: (url: string, init: RequestInit) => Promise<Response>) {
  const scope = { __kiditemIsolatedPageCalls: {} as Record<string, Handler> };
  const location = { pathname: '/subAdmin/_order_product.list.php' };
  new Function('globalThis', 'document', 'fetch', 'location', 'btoa', source)(scope, document, fetch, location, btoa);
  return scope.__kiditemIsolatedPageCalls['kkomangse.orders']!;
}

function listPage(fields: unknown[]) {
  const form = { getAttribute: () => '/subAdmin/_order_product.list.php', querySelectorAll: () => fields };
  return { querySelector: (selector: string) => (selector === '.form_list' ? form : null), forms: [form] };
}

describe('kkomangse orders page script', () => {
  it('목록 폼(체크 안 된 칸 제외)을 _mode=get_search_excel로 다시 보내 받은 xlsx를 base64로 돌려준다', async () => {
    const requested: Array<[string, RequestInit]> = [];
    const handler = load(
      listPage([field('mode', 'search'), field('pass_input_type', 'all'), field('chk', 'Y', { type: 'checkbox', checked: false }), field('_mode', 'list')]),
      async (url, init) => {
        requested.push([url, init]);
        return new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { status: 200 });
      },
    );
    await expect(handler()).resolves.toEqual({ success: true, xlsxBase64: btoa('PK\u0003\u0004'), size: 4 });
    expect(requested).toEqual([['/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&_mode=get_search_excel', { credentials: 'include' }]]);
  });

  it('엑셀이 아닌 응답·HTTP 실패는 옛 문장, 폼이 없고 비밀번호 칸이 보이면 로그인 필요', async () => {
    const html = load(listPage([]), async () => new Response('<html>로그인</html>', { status: 200 }));
    await expect(html()).resolves.toEqual({ success: false, error: '엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다.' });
    const failed = load(listPage([]), async () => new Response('', { status: 500 }));
    await expect(failed()).resolves.toEqual({ success: false, error: '꼬망세 엑셀 다운로드 실패 (HTTP 500)' });

    const loginPage = { querySelector: (selector: string) => (selector === 'input[type="password"]' ? {} : null), forms: [] };
    await expect(load(loginPage, async () => new Response(''))()).resolves.toMatchObject({ success: false, pendingLogin: true, errorCode: 'login_required' });
    const empty = { querySelector: () => null, forms: [] };
    await expect(load(empty, async () => new Response(''))()).resolves.toEqual({
      success: false,
      error: '꼬망세 주문 폼을 찾지 못했습니다. nstore.edupre.co.kr 로그인을 확인하세요.',
    });
  });
});
