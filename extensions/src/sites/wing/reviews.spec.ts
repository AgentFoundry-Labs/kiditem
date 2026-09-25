import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED, createSiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import { WING_REVIEW_CALLER, WING_REVIEW_SEARCH_URL, searchWingReviews } from './reviews';

const WINDOW = { start: '2026-08-01T00:00:00+09:00', end: '2026-08-31T23:59:59+09:00' };

function wing(respond: (init: RequestInit | undefined) => Response | Promise<Response>) {
  let clock = 1_000;
  const sent: Array<{ url: string; body: unknown; method: string | undefined }> = [];
  const sleeps: number[] = [];
  const deps: SiteCallerDeps = {
    async fetch(url, init) {
      sent.push({ url, body: JSON.parse(String(init?.body)), method: init?.method });
      return respond(init);
    },
    cookies: { get: async () => null },
    now: () => clock,
    async sleep(ms) {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return { caller: createSiteCaller(WING_REVIEW_CALLER, deps), sent, sleeps };
}

const raw = (reviewId: unknown, overrides: Record<string, unknown> = {}) => ({
  reviewId,
  vendorItemId: 9001,
  productId: 77,
  itemName: ' Red ',
  rating: 4,
  reviewTitle: '',
  reviewContent: ' 좋아요 ',
  memberName: 'buyer',
  reviewAt: 1_756_700_000_000,
  attachment: JSON.stringify({ imageAttachments: [{}, {}], videoAttachments: [{}] }),
  deleted: false,
  blinded: true,
  ...overrides,
});

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/wing/reviews — Wing 상품평 검색 한 쪽', () => {
  it('옛 수집기와 같은 본문(월 창 날짜·50건·판매중지 포함)으로 POST하고 행을 정규화한다, 쓸 수 없는 행은 버린다', async () => {
    const site = wing(() => Response.json({
      code: 'OK',
      data: {
        content: [raw(123), raw(null), raw(124, { rating: 0 }), raw(125, { reviewAt: 0, createdAt: 1_756_700_000_001, attachment: 'not json', vendorItemId: null })],
        pagination: { totalPages: 3 },
      },
    }));

    const page = await searchWingReviews(site.caller, { ...WINDOW, pageIndex: 2 });

    expect(site.sent).toEqual([{
      url: WING_REVIEW_SEARCH_URL,
      method: 'POST',
      body: {
        startTime: '2026-08-01', endTime: '2026-08-31', rating: '', salesStatus: '', advancedType: 'productName',
        advancedInput: '', pageIndex: 2, pageSize: 50, productName: '',
      },
    }]);
    expect(page.totalPages).toBe(3);
    expect(page.items).toEqual([
      {
        externalReviewId: '123', externalOptionId: '9001', externalProductId: '77', itemName: 'Red', rating: 4,
        title: null, content: '좋아요', reviewerName: 'buyer', reviewedAt: 1_756_700_000_000,
        imageCount: 2, videoCount: 1, isDeleted: false, isBlinded: true,
      },
      expect.objectContaining({ externalReviewId: '125', externalOptionId: null, reviewedAt: 1_756_700_000_001, imageCount: 0, videoCount: 0 }),
    ]);
  });

  it('요청 사이 350ms 간격을 지킨다', async () => {
    const site = wing(() => Response.json({ code: 'OK', data: { content: [], pagination: { totalPages: 0 } } }));
    await searchWingReviews(site.caller, { ...WINDOW, pageIndex: 0 });
    await searchWingReviews(site.caller, { ...WINDOW, pageIndex: 1 });
    expect(site.sleeps).toEqual([350]);
  });

  it('로그인이 풀렸으면(401·로그인 리다이렉트) SITE_LOGIN_REQUIRED', async () => {
    const unauthorized = wing(() => new Response('', { status: 401 }));
    expect((await rejection(searchWingReviews(unauthorized.caller, { ...WINDOW, pageIndex: 0 }))).code).toBe(SITE_LOGIN_REQUIRED);
    const redirected = wing(() => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response);
    expect((await rejection(searchWingReviews(redirected.caller, { ...WINDOW, pageIndex: 0 }))).code).toBe(SITE_LOGIN_REQUIRED);
  });

  it('응답이 멈추면 시간 상한에서 끊고 SITE_REQUEST_FAILED — heartbeat가 잠금을 끝없이 연장하지 않게', async () => {
    const stalled = wing((init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const error = await rejection(searchWingReviews(stalled.caller, { ...WINDOW, pageIndex: 0 }, { timeoutMs: 20 }));
    expect(error.code).toBe(SITE_REQUEST_FAILED);
  });

  it('Wing이 거절하면(code가 OK가 아님) 그 문장을 담아 SITE_REQUEST_FAILED', async () => {
    const site = wing(() => Response.json({ code: 'ERROR', message: '검색 기간은 1개월 이내로 지정해주세요.' }));
    const error = await rejection(searchWingReviews(site.caller, { ...WINDOW, pageIndex: 0 }));
    expect(error.code).toBe(SITE_REQUEST_FAILED);
    expect(error.message).toContain('검색 기간은 1개월 이내로 지정해주세요.');
  });
});
