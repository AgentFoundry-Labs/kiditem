import { describe, expect, it } from 'vitest';
import { runAvailability } from '../mall-write/availability';
import { availabilityHarness } from '../mall-write/availability.fake';
import './availability';

/**
 * 도매꾹 품절 = 진열안함(실측 2026-09-18, 옛 `mall-availability-send.test.mjs` 이식). 상품조회/수정 목록의 [수정저장]은 고친
 * 줄마다 `{no, disp, title, loq, useOpt}`를 모아 `/sc/item/editOnList`에 `dat=` 한 번으로 보낸다. 줄은 목록 조회
 * (`/sc/item/lst`, 상품번호 검색)가 준다.
 */
type Row = { no: number; disp: string; title: string; loq: string; useOpt: string; status: string; inventory: string };

function domeggookMall({ rows, editAnswer = { res: true, success: null as number | null, msg: undefined as string | undefined }, lookupAnswer = null as unknown }: {
  rows: Row[];
  editAnswer?: { res: boolean; success?: number | null; msg?: string };
  lookupAnswer?: unknown;
}) {
  const state = new Map(rows.map((row) => [String(row.no), { ...row }]));
  const log = { lookups: [] as Array<{ nos: string[]; params: string[] }>, edits: [] as Array<Array<Record<string, unknown>>> };
  const fetch = async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/sc/item/lst') {
      const nos = parsed.searchParams.get('nos')!.split(',');
      log.lookups.push({ nos, params: [...(parsed.searchParams as unknown as { keys(): Iterable<string> }).keys()] });
      const body = lookupAnswer ?? { res: true, cnt: nos.length, dat: nos.filter((no) => state.has(no)).map((no) => ({ ...state.get(no) })) };
      return { ok: true, status: 200, url, text: async () => JSON.stringify(body) } as unknown as Response;
    }
    if (parsed.pathname === '/sc/item/editOnList' && init.method === 'POST') {
      expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^application\/x-www-form-urlencoded/);
      const body = String(init.body);
      expect(body.startsWith('dat=')).toBe(true);
      const dat = JSON.parse(decodeURIComponent(body.slice(4)));
      log.edits.push(dat);
      if (editAnswer.res) for (const item of dat) state.get(String(item.no))!.disp = item.disp ? '진열함' : '진열안함';
      const success = editAnswer.success ?? (editAnswer.res ? dat.length : 0);
      return { ok: true, status: 200, url, text: async () => JSON.stringify({ res: editAnswer.res, success, msg: editAnswer.msg }) } as unknown as Response;
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'domeggook', fetch: fetch as never });
  return { ...harness, log, state, tabLog: harness.log };
}

const row = (no: number, disp: string, extra: Partial<Row> = {}): Row => ({
  no, disp, title: `말랑이 ${no} & <특가>`, loq: '1,000', useOpt: 'N', status: '진행중', inventory: '999', ...extra,
});

describe('도매꾹 품절·재개', () => {
  it('⭐ 품절은 [수정저장]과 같은 모양으로 진열안함을 보내고, 지금 값(상품명 · 최대판매수량 · 옵션)을 그대로 싣는다', async () => {
    const { api, log, tabLog } = domeggookMall({
      rows: [row(68010748, '진열함'), row(68010749, '진열함', { loq: '9,999', useOpt: '<table>옵션</table>' }), row(68010750, '진열안함')],
    });
    const result = await api.send({ codes: ['68010748', '68010749', '68010750', '11111111'] });

    expect(tabLog).toEqual([]);
    expect(log.lookups[0]!.nos).toEqual(['68010748', '68010749', '68010750', '11111111']);
    expect(log.lookups[0]!.params).toEqual([
      'ktype', 'nos', 'ttl', 'st', 'chn[]', 'chn[]', 'sec[]', 'sec[]', 'ca1', 'ca2', 'ca3', 'ca4', 'idx', 'qty', 'disp', 'rmp', 'format', 'pg', 'sz', 'so',
    ]);
    expect(log.edits).toEqual([[
      { no: 68010748, disp: false, title: '말랑이 68010748 & <특가>', loq: '1000', useOpt: false },
      { no: 68010749, disp: false, title: '말랑이 68010749 & <특가>', loq: '9999', useOpt: true },
    ]]);
    expect(result).toEqual({
      success: true, sent: 3, failed: 1, confirmed: 3, requestOnly: false,
      warnings: ['1건은 이미 진열안함이었습니다.', '1건은 도매꾹 상품번호로 찾지 못했습니다.'],
    });
  });

  it('해제는 같은 길로 진열함을 보낸다', async () => {
    const { api, log } = domeggookMall({ rows: [row(68010750, '진열안함')] });
    const result = await api.send({ codes: ['68010750'], resume: true });
    expect(log.edits[0]![0]!.disp).toBe(true);
    expect(result).toMatchObject({ sent: 1, confirmed: 1 });
  });

  it('몰이 수정을 거절하면 실패로 세고 몰이 한 말을 싣는다 — 다시 읽어 바뀌지 않은 줄은 확인으로 세지 않는다', async () => {
    const { api } = domeggookMall({ rows: [row(68010748, '진열함')], editAnswer: { res: false, msg: '수정할 수 없는 상품입니다' } });
    const result = await api.send({ codes: ['68010748'] });
    expect(result).toMatchObject({ success: true, sent: 0, failed: 1, confirmed: 0 });
    expect(result.warnings).toContain('도매꾹이 수정을 받지 않았습니다: 수정할 수 없는 상품입니다.');
  });

  it('로그아웃이면 아무것도 보내지 않고 로그인하라고 답한다', async () => {
    const { api, log } = domeggookMall({ rows: [row(68010748, '진열함')], lookupAnswer: { res: false, msg: '로그인이 필요합니다' } });
    const result = await api.send({ codes: ['68010748'] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/도매꾹에 로그인되어 있지 않습니다/);
    expect(log.edits).toHaveLength(0);
  });

  it('상품번호 검색은 500개까지라 나눠서 읽고 보낸다', async () => {
    const codes = Array.from({ length: 501 }, (_, i) => String(68000000 + i));
    const { api, log } = domeggookMall({ rows: codes.map((code) => row(Number(code), '진열함')) });
    const result = await api.send({ codes });
    expect(log.edits.map((dat) => dat.length)).toEqual([500, 1]);
    expect(log.lookups.every((lookup) => lookup.nos.length <= 500)).toBe(true);
    expect(result).toMatchObject({ sent: 501, confirmed: 501 });
  });

  it('지금 진열여부 읽기 — 진열함이면 모름, 진열안함이면 0과 그 글자(보낸 뒤 증거)', async () => {
    const { api } = domeggookMall({ rows: [row(1, '진열함'), row(2, '진열안함')] });
    expect(await api.read({ codes: ['1', '2', '3'] })).toEqual({
      success: true,
      products: [
        { code: '1', options: [{ optionCode: '1', stock: null, rocket: false }] },
        { code: '2', options: [{ optionCode: '2', stock: 0, rocket: false, state: '진열안함' }] },
      ],
      missing: ['3'],
    });
  });
});

describe('도매꾹 — 몰 쓰기 실행(보낸 뒤 다시 읽기)', () => {
  it('보내고 같은 조회로 다시 읽어 리스팅마다 진열 상태를 돌려준다', async () => {
    const { module, context } = domeggookMall({ rows: [row(1, '진열함'), row(2, '진열함')] });
    const run = await runAvailability(module, context, {
      resume: false,
      byOption: false,
      listings: [{ externalListingId: '1', externalOptionIds: ['1'] }, { externalListingId: '2', externalOptionIds: ['2'] }],
      expectedProviderAccountId: null,
    });
    expect(run).toEqual({
      answer: expect.objectContaining({ success: true, sent: 2, confirmed: 2 }),
      observed: [
        { externalListingId: '1', status: '진열안함', options: [{ externalOptionId: '1', stock: 0, status: '진열안함' }] },
        { externalListingId: '2', status: '진열안함', options: [{ externalOptionId: '2', stock: 0, status: '진열안함' }] },
      ],
      providerAccountId: null,
      observedUrl: null,
    });
  });

  it('로그인이 풀렸으면 SITE_LOGIN_REQUIRED로, 몰 오류는 MALL_WRITE_FAILED로 멈춘다', async () => {
    const loggedOut = domeggookMall({ rows: [row(1, '진열함')], lookupAnswer: { res: false, msg: '로그인이 필요합니다' } });
    await expect(runAvailability(loggedOut.module, loggedOut.context, { resume: false, byOption: false, listings: [{ externalListingId: '1', externalOptionIds: [] }], expectedProviderAccountId: null }))
      .rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    const broken = domeggookMall({ rows: [row(1, '진열함')], lookupAnswer: { res: false, msg: '잠시 뒤' } });
    await expect(runAvailability(broken.module, broken.context, { resume: false, byOption: false, listings: [{ externalListingId: '1', externalOptionIds: [] }], expectedProviderAccountId: null }))
      .rejects.toMatchObject({ code: 'MALL_WRITE_FAILED', message: '도매꾹 상품 목록을 읽지 못했습니다.' });
  });
});
