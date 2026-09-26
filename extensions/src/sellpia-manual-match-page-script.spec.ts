import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-manual-match.js?raw';

// 셀피아 수동상품매칭 페이지 스크립트(ISOLATED world 파일, 옛 `requestSellpiaManualMatchSnapshot` 이식)를 실제 파일 그대로
// 돌린다. 가짜는 페이지 경계(fetch·location·document)뿐이다.
const PAGE = 'https://kiditem.sellpia.com/product_manual_match.html';
const MD5 = 'a'.repeat(32);

type Answer = { status: string; candidates?: unknown[]; types?: Record<string, string>; stage?: string };

function jsonResponse(value: unknown) {
  const text = JSON.stringify(value);
  return { ok: true, status: 200, redirected: false, url: PAGE, text: async () => text };
}

function load(options: { page?: string; shopUid?: string | null; respond?: (body: URLSearchParams) => unknown } = {}) {
  const requests: Array<Record<string, string | string[]>> = [];
  const isolated: Record<string, unknown> = {};
  const fetch = async (_path: string, init: { body: URLSearchParams }) => {
    const body = new URLSearchParams(init.body);
    const fields: Record<string, string> = {};
    body.forEach((value, key) => {
      if (key !== 'data[]') fields[key] = value;
    });
    requests.push({ ...fields, data: body.getAll('data[]') });
    return options.respond ? options.respond(body) : jsonResponse(null);
  };
  const document = {
    querySelector: (selector: string) => (selector === '#makeshop_uid' && options.shopUid !== null ? { value: options.shopUid ?? 'shop-1' } : null),
  };
  new Function('globalThis', 'location', 'document', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'URL', 'URLSearchParams', source)(
    isolated,
    new URL(options.page ?? PAGE),
    document,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
  );
  const calls = isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>;
  return { calls, requests };
}

describe('sellpia manual match page script', () => {
  it('대상 코드마다 매칭 검색을 POST하고, 제목이 빈 줄은 빼고 허용한 칸만 돌려준다(읽기만)', async () => {
    const { calls, requests } = load({
      respond: () => jsonResponse([
        { product_code: '634', option_code: '1', match_title: '', match_md5: 'b'.repeat(32) },
        { product_code: '634', option_code: '1', match_title: '샤이니<b>무지개</b>  링', match_md5: MD5, item_count: '12', secret: 'x' },
      ]),
    });
    await expect(calls['sellpia.manualMatchSearch']!({ codes: ['634-1'] })).resolves.toEqual({
      status: 'ok',
      candidates: [{ productCode: '634-1', aliasTitle: '샤이니 무지개 링', matchMd5: MD5, itemCount: 12 }],
    });
    expect(requests).toEqual([{ modekey: 'get_product_search_matched', search_value: '634-1', search_type: 'product_code', data: [] }]);
  });

  it('상태 조회는 화면의 shop uid와 md5 목록으로 매칭 종류를 읽는다', async () => {
    const { calls, requests } = load({ respond: () => jsonResponse({ [MD5]: { matched_type: 'M' } }) });
    await expect(calls['sellpia.manualMatchStatus']!({ matchMd5s: [MD5] })).resolves.toEqual({ status: 'ok', types: { [MD5]: 'M' } });
    expect(requests[0]).toMatchObject({ modekey: 'get_match_data', shop_uid: 'shop-1', data: [MD5] });
    expect(await load({ shopUid: null }).calls['sellpia.manualMatchStatus']!({ matchMd5s: [MD5] })).toEqual({ status: 'contract_drift', stage: 'shop-uid' });
  });

  it('로그인 화면·HTML 응답이면 login_required, 다른 코드가 오면 contract_drift', async () => {
    expect(await load({ page: 'https://kiditem.sellpia.com/login.html' }).calls['sellpia.manualMatchSearch']!({ codes: ['634-1'] }))
      .toEqual({ status: 'login_required' });
    const html = load({ respond: () => ({ ok: true, status: 200, redirected: false, url: PAGE, text: async () => '<html><form>' }) });
    expect(await html.calls['sellpia.manualMatchSearch']!({ codes: ['634-1'] })).toEqual({ status: 'login_required' });
    const foreign = load({ respond: () => jsonResponse([{ product_code: '999', option_code: '', match_title: 'x', match_md5: MD5, item_count: 1 }]) });
    expect(await foreign.calls['sellpia.manualMatchSearch']!({ codes: ['634-1'] })).toEqual({ status: 'contract_drift', stage: 'search-row:634-1' });
  });
});
