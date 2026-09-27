import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/lotte-on-orders.js?raw';

// 롯데ON 신규주문 엑셀 페이지 스크립트(ISOLATED 처리기, 옛 worker.js `scrapeLotteonOrders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(sessionStorage·location·fetch·시계)뿐이다.
type Handler = (args: unknown) => Promise<Record<string, unknown>>;
const ARGS = { downloadReason: '배송을 위한 주문정보 다운로드' };

function load(options: { token: string | null; href?: string; fetch?: (url: string, init: RequestInit) => Promise<Response> }) {
  const scope = { __kiditemIsolatedPageCalls: {} as Record<string, Handler> };
  const immediate = (callback: () => void) => callback();
  const sessionStorage = { getItem: () => options.token };
  const location = { href: options.href ?? 'https://store.lotteon.com/cm/main/index_SO.wsp' };
  let now = 0;
  const clock = class extends Date {
    static override now() {
      now += 1_000;
      return now;
    }
  };
  const fetch = options.fetch ?? (async () => { throw new Error('fetch should not run'); });
  new Function('globalThis', 'sessionStorage', 'location', 'fetch', 'setTimeout', 'Date', 'btoa', source)(scope, sessionStorage, location, fetch, immediate, clock, btoa);
  return scope.__kiditemIsolatedPageCalls['lotte-on.orders']!;
}

describe('lotte-on orders page script', () => {
  it('다운로드 사유 등록 → 엑셀 요청(_dnldKey) → fileManage 파일을 토큰 머리글로 받아 base64로 돌려준다', async () => {
    const requested: Array<[string, RequestInit]> = [];
    const handler = load({
      token: 'tok',
      fetch: async (url, init) => {
        requested.push([url, init]);
        if (url.includes('saveDownloadReason')) return Response.json({ returnCode: 'SUCCESS', data: 'enc-key' });
        if (url.includes('downloadDeliveryExcel')) return Response.json({ returnCode: 'SUCCESS', data: { fileId: 'F1', fileName: '신규주문.xlsx' } });
        return new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { status: 200 });
      },
    });
    await expect(handler(ARGS)).resolves.toEqual({ success: true, xlsxBase64: btoa('PK\u0003\u0004'), fileName: '신규주문.xlsx', size: 4 });
    expect(requested.map(([url]) => url.replace(/\?.*$/, ''))).toEqual([
      'https://soapi.lotteon.com/soapi/v1/bocommon/auth/saveDownloadReason',
      'https://soapi.lotteon.com/soapi/v2/delivery/sodeliverymanagement/sodeliverymanagement/downloadDeliveryExcel',
      'https://soapi.lotteon.com/soapi/v1/bocommon/o/fileManage/download/F1',
    ]);
    expect(JSON.parse(String(requested[0]![1].body))).toEqual({ dnldRsnCnts: '배송을 위한 주문정보 다운로드' });
    expect(requested[1]![0]).toContain('_dnldKey=enc-key');
    expect(requested[1]![0]).toContain('odPrgsStepCd=11');
    expect((requested[0]![1].headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('토큰이 끝내 없으면(로그인 화면 포함) 로그인 필요 문장, 사유 인증 실패는 옛 문장', async () => {
    await expect(load({ token: null, href: 'https://store.lotteon.com/cm/main/login_SO.wsp' })(ARGS)).resolves.toEqual({
      success: false,
      error: '롯데ON 판매자센터 로그인이 필요합니다. 로그인 후 다시 시도하세요.',
    });
    const refused = load({
      token: 'tok',
      fetch: async (url) => (url.includes('saveDownloadReason')
        ? Response.json({ returnCode: 'SUCCESS', data: 'enc-key' })
        : Response.json({ returnCode: 'REQUIRED_DOWN_LOAD_REASON' })),
    });
    await expect(refused(ARGS)).resolves.toEqual({ success: false, error: '롯데ON 다운로드 사유 인증에 실패했습니다. 다시 시도하세요.' });
  });
});
