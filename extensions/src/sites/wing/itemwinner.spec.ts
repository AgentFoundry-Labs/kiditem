import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED, createSiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import { WING_ITEMWINNER_CALLER, WING_ITEMWINNER_URL, readWingItemwinnerList } from './itemwinner';

function wing(respond: () => Response | Promise<Response>, xsrf: string | null = 'token%3D') {
  const sent: Array<{ url: string; body: unknown; headers: Headers; redirect: RequestRedirect | undefined }> = [];
  const deps: SiteCallerDeps = {
    async fetch(url, init) {
      sent.push({ url, body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers), redirect: init?.redirect });
      return respond();
    },
    cookies: { get: async () => (xsrf ? { value: xsrf } : null) },
    now: () => 0,
    sleep: async () => undefined,
  };
  return { caller: createSiteCaller(WING_ITEMWINNER_CALLER, deps), sent };
}

const raw = (id: unknown, overrides: Record<string, unknown> = {}) => ({
  vendorItemId: id,
  productName: `상품 ${String(id)}`,
  winnerStatus: true,
  suppressed: false,
  currentPrice: '1000',
  winnerPrice: '900',
  myViSales: '2',
  ...overrides,
});
const page = (rows: unknown[], overrides: Record<string, unknown> = {}) => {
  const totalSize = rows.length;
  return Response.json({ totalSize, page: 0, pageSize: totalSize === 0 ? 10 : 1000, totalPages: totalSize === 0 ? 0 : 1, result: rows, ...overrides });
};

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/wing/itemwinner — Wing 아이템위너 목록(getProductList, 읽기 전용)', () => {
  it('옛 content script와 같은 고정 본문(판매중 전체·1,000개·0쪽)을 XSRF 헤더와 함께 서비스워커에서 POST하고, 리다이렉트를 따라가지 않는다', async () => {
    const site = wing(() => page([raw('101', { productName: '긴 이름 '.repeat(20), myViSales: '' }), raw(102, { suppressed: true, currentPrice: '0' }), raw('103', { winnerStatus: false })]));
    const list = await readWingItemwinnerList(site.caller);

    expect(site.sent).toHaveLength(1);
    expect(site.sent[0]!.url).toBe(WING_ITEMWINNER_URL);
    expect(site.sent[0]!.redirect).toBe('manual');
    expect(site.sent[0]!.headers.get('X-XSRF-TOKEN')).toBe('token=');
    expect(site.sent[0]!.body).toMatchObject({ vendorItemStatus: 'ON_SALE', itemWinnerStatus: 'ALL', pageSize: 1000, page: 0, sortType: 'MY_VI_SALES_DESC' });
    expect(list.totalSize).toBe(3);
    expect(list.rows[0]).toEqual({
      vendorItemId: '101',
      productName: '긴 이름 '.repeat(20).trim().slice(0, 80),
      isWinner: true,
      myPrice: 1000,
      winnerPrice: 900,
      salesQty: 0,
      suppressed: false,
      providerWinnerStatus: true,
    });
    expect(list.rows[1]).toMatchObject({ vendorItemId: '102', isWinner: false, providerWinnerStatus: true, suppressed: true, myPrice: 0 });
    expect(list.rows[2]).toMatchObject({ isWinner: false, providerWinnerStatus: false });
  });

  it('Wing이 0개라고 답하면(10개 쪽, 0쪽) 빈 목록을 완결로 돌려준다', async () => {
    const list = await readWingItemwinnerList(wing(() => page([])).caller);
    expect(list).toEqual({ rows: [], totalSize: 0 });
  });

  it('XSRF 쿠키가 없으면 보내지 않고 로그인 필요로 멈춘다, 401·리다이렉트도 로그인 필요다', async () => {
    const noCookie = wing(() => page([]), null);
    expect((await rejection(readWingItemwinnerList(noCookie.caller))).code).toBe(SITE_LOGIN_REQUIRED);
    expect(noCookie.sent).toHaveLength(0);
    expect((await rejection(readWingItemwinnerList(wing(() => new Response('', { status: 401 })).caller))).code).toBe(SITE_LOGIN_REQUIRED);
  });

  it('1,000개를 넘거나 한 쪽에 다 오지 않거나 행이 모자라거나 같은 상품이 겹치면 잘린 목록을 완결로 보지 않는다', async () => {
    const over = await rejection(readWingItemwinnerList(wing(() => page([raw('1')], { totalSize: 1001 })).caller));
    expect(over.code).toBe('RUNTIME_PAGE_LIMIT_REACHED');
    const partial = await rejection(readWingItemwinnerList(wing(() => page([raw('1')], { totalSize: 2 })).caller));
    expect(partial).toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'wing_itemwinner_partial' } });
    const twoPages = await rejection(readWingItemwinnerList(wing(() => page([raw('1')], { totalPages: 2 })).caller));
    expect(twoPages.details).toMatchObject({ reason: 'wing_itemwinner_partial' });
    const duplicate = await rejection(readWingItemwinnerList(wing(() => page([raw('1'), raw('1')])).caller));
    expect(duplicate.details).toMatchObject({ reason: 'wing_itemwinner_duplicate' });
  });

  it('필수 필드가 없는 행이나 모양이 다른 응답은 거절한다', async () => {
    const badRow = await rejection(readWingItemwinnerList(wing(() => page([raw('1', { winnerStatus: 'yes' })])).caller));
    expect(badRow.details).toMatchObject({ reason: 'wing_itemwinner_row_invalid' });
    const badPrice = await rejection(readWingItemwinnerList(wing(() => page([raw('1', { currentPrice: 'abc' })])).caller));
    expect(badPrice.details).toMatchObject({ reason: 'wing_itemwinner_row_invalid' });
    const badShape = await rejection(readWingItemwinnerList(wing(() => Response.json({ result: 'x' })).caller));
    expect(badShape.details).toMatchObject({ reason: 'wing_itemwinner_response_invalid' });
  });
});
