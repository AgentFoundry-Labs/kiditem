import { describe, expect, it } from 'vitest';
import { runAvailability } from '../mall-write/availability';
import { availabilityHarness } from '../mall-write/availability.fake';
import './availability';

/** 온채널 품절 = 관리자에게 가는 일시품절 요청(ajax 한 방, 상품코드를 `/`로 이어 한 번에). 200이 와도 승인 전까지 반영이 아니다. */
function onchMall({ landed = 'https://www.onch3.co.kr/access/product_access.php?ubr=option_state_modi', body = 'ok' } = {}) {
  const posts: Array<{ url: string; body: string; type: string }> = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    posts.push({ url, body: String(init.body), type: (init.headers as Record<string, string>)['Content-Type']! });
    return { ok: true, status: 200, url: landed, text: async () => body } as unknown as Response;
  };
  return { ...availabilityHarness({ mallKey: 'onch', fetch: fetch as never }), posts };
}

describe('온채널 품절·재개', () => {
  it('품절은 상품코드를 이어 일시품절(4) 요청 한 번 — 승인 요청이라 반영이 아니다', async () => {
    const { api, posts, log } = onchMall();
    const result = await api.send({ codes: ['A1', 'A2'] });
    expect(log).toEqual([]);
    expect(posts).toEqual([{
      url: 'https://www.onch3.co.kr/access/product_access.php?ubr=option_state_modi',
      body: new URLSearchParams({ prd_code_str: 'A1/A2', sec: '4', comment: '재고 소진' }).toString(),
      type: 'application/x-www-form-urlencoded',
    }]);
    expect(result).toEqual({ success: true, sent: 2, failed: 0, requestOnly: true, warnings: ['온채널은 관리자 승인을 거칩니다 — 보낸 것이 곧 반영은 아닙니다.'] });
  });

  it('재개는 재입고(1) 요청이다', async () => {
    const { api, posts } = onchMall();
    await api.send({ codes: ['A1'], resume: true });
    expect(new URLSearchParams(posts[0]!.body).get('sec')).toBe('1');
    expect(new URLSearchParams(posts[0]!.body).get('comment')).toBe('재입고');
  });

  it('로그인 화면으로 넘어갔으면 실행이 SITE_LOGIN_REQUIRED로 멈춘다 · 다시 읽기는 없다', async () => {
    const out = onchMall({ landed: 'https://www.onch3.co.kr/login/login_web.php' });
    await expect(runAvailability(out.module, out.context, { resume: false, byOption: false, listings: [{ externalListingId: 'A1', externalOptionIds: [] }], expectedProviderAccountId: null }))
      .rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    const ok = onchMall();
    const run = await runAvailability(ok.module, ok.context, { resume: false, byOption: false, listings: [{ externalListingId: 'A1', externalOptionIds: [] }], expectedProviderAccountId: null });
    expect(run.observed).toEqual([]);
    expect(run.answer.requestOnly).toBe(true);
  });
});
