import { describe, expect, it } from 'vitest';
import { availabilityHarness } from '../mall-write/availability.fake';
import './availability';

/**
 * 올웨이즈 품절·판매재개 = 판매자센터의 [품절]·[판매재개] 버튼(2026-09-19 실측, 옛 스펙 이식). POST /items/sold-out-many ·
 * /items/resume-many {itemIdList}, 확인 POST /sellers/items/info-request {itemIds}. 토큰은 화면 안에서만 읽는다.
 */
function alwayzMall({ items = {} as Record<string, { soldOut?: boolean }>, loggedOut = false } = {}) {
  const state = new Map(Object.entries(items).map(([id, item]) => [id, { _id: id, itemTitle: `상품 ${id}`, soldOut: false, ...item }]));
  const log = { posts: [] as Array<[string, string[]]>, args: [] as unknown[][] };
  const harness = availabilityHarness({
    mallKey: 'always',
    handlers: {
      alwayzRequestOnPage: (url: string, body: { itemIds?: string[]; itemIdList?: string[] }, tokenKey: string) => {
        log.args.push([url, body, tokenKey]);
        expect(tokenKey).toBe('@alwayz@seller@token@');
        if (loggedOut) return { status: 401, json: null, loggedOut: true };
        const path = new URL(url).pathname;
        if (path === '/sellers/items/info-request') {
          return { status: 200, json: { status: 200, data: body.itemIds!.filter((id) => state.has(id)).map((id) => ({ ...state.get(id) })) }, loggedOut: false };
        }
        if (path === '/items/sold-out-many' || path === '/items/resume-many') {
          log.posts.push([path, body.itemIdList!]);
          for (const id of body.itemIdList!) state.get(id)!.soldOut = path === '/items/sold-out-many';
          return { status: 200, json: { status: 200 }, loggedOut: false };
        }
        throw new Error(`unexpected ${url}`);
      },
    },
  });
  return { ...harness, state, alwayz: log };
}

const A = '6743cacb46ae748ace9f239c';
const B = '675b86c999d04ee13d45b6c0';
const C = '668b81adc75f21b22efa0fda';

describe('올웨이즈 품절·재개', () => {
  it('⭐ 품절은 [품절] 버튼과 같은 요청으로 — 이미 품절인 상품은 보내지 않고, 다시 읽어 확인한다 · 토큰은 워커에 오지 않는다', async () => {
    const { api, alwayz, state, log } = alwayzMall({ items: { [A]: { soldOut: false }, [B]: { soldOut: true } } });
    const result = await api.send({ codes: [A, B, C, 'not-an-id'] });
    expect(alwayz.posts).toEqual([['/items/sold-out-many', [A]]]);
    expect(state.get(A)!.soldOut).toBe(true);
    expect(result).toMatchObject({ success: true, sent: 2, confirmed: 2, already: 1, failed: 2 });
    expect(log.filter((line) => line.startsWith('navigate '))).toEqual(['navigate https://alwayzseller.ilevit.com/items/management']);
    expect(log).toContain('close 7');
    expect(alwayz.args.every((args) => args.length === 3 && typeof args[2] === 'string' && !/eyJ/.test(JSON.stringify(args)))).toBe(true);
  });

  it('판매재개는 품절인 상품만 [판매재개]로 되돌린다', async () => {
    const { api, alwayz } = alwayzMall({ items: { [A]: { soldOut: true }, [B]: { soldOut: false } } });
    const result = await api.send({ codes: [A, B], resume: true });
    expect(alwayz.posts).toEqual([['/items/resume-many', [A]]]);
    expect(result.confirmed).toBe(2);
  });

  it('로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
    const { api, alwayz } = alwayzMall({ items: { [A]: {} }, loggedOut: true });
    const result = await api.send({ codes: [A] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/올웨이즈 로그인이 풀렸습니다/);
    expect(alwayz.posts).toHaveLength(0);
  });

  it('지금 상태 읽기 — 품절이면 0, 아니면 모름', async () => {
    const { api } = alwayzMall({ items: { [A]: { soldOut: true }, [B]: { soldOut: false } } });
    expect(await api.read({ codes: [A, B] })).toEqual({
      success: true,
      products: [
        { code: A, options: [{ optionCode: A, stock: 0, rocket: false, state: '품절' }] },
        { code: B, options: [{ optionCode: B, stock: null, rocket: false, state: '판매중' }] },
      ],
      missing: [],
    });
  });
});
