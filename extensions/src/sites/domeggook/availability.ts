import {
  flagOption,
  readJson,
  READ_LIMIT,
  registerMallAvailability,
  type AvailabilityContext,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { DOMEGGOOK_LOGIN, DOMEGGOOK_PAGE_GUARD } from './index';

/**
 * 도매꾹 상품공급사센터 품절·재개(옛 `mall-availability-send.js` `domeggook` · `sendByListEdit`, KID-256). 상품조회/수정
 * 목록(`/sc/item/lstAll`)의 [수정저장]이 보내는 것과 같은 요청이다(실측 2026-09-18).
 *
 *  - 품절 = 진열안함, 해제 = 진열함. 도매꾹 목록에서는 재고를 못 고친다(재고 칸 편집이 막혀 있다). 사방넷도 도매꾹은
 *    일시중지 · 완전품절 둘 다 `숨김중`으로 보낸다(쇼핑몰특이사항).
 *  - [수정저장]은 고친 줄마다 `{no, disp, title, loq, useOpt}`를 모아 `dat=` 한 번으로 보낸다. 상품명 · 최대판매수량 · 옵션
 *    사용도 같이 가므로 지금 값을 그대로 실어야 한다 — 먼저 목록 조회(`/sc/item/lst`, 상품번호 500개까지)로 그 줄을 읽는다.
 *  - 화면을 열지 않는다 — 서비스워커가 판매자센터 쿠키로 부른다. 보낸 뒤 같은 조회로 진열여부를 다시 읽어 확인한다.
 */
const ORIGIN = 'https://www.domeggook.com';
const LOOKUP_PATH = '/sc/item/lst';
const EDIT_PATH = '/sc/item/editOnList';
/** 상품번호 검색 칸이 받는 최대 개수. */
const MAX_CODES = 500;
const SHOWN = { hide: '진열안함', show: '진열함' } as const;
const PACE_MS = 700;
const LABEL = '도매꾹';

/** 목록 조회 — 상품번호로. 목록 검색 폼이 보내는 기본값에 번호만 넣는다. 읽기만 한다. */
async function lookupListRows(context: AvailabilityContext, codes: readonly string[]): Promise<MallJson[]> {
  const params = new URLSearchParams();
  for (const [key, value] of [
    ['ktype', 'no'], ['nos', codes.join(',')], ['ttl', ''], ['st', ''],
    ['chn[]', 'dome'], ['chn[]', 'supply'], ['sec[]', 'sell'], ['sec[]', 'shop'],
    ['ca1', '00'], ['ca2', '00'], ['ca3', '00'], ['ca4', '00'],
    ['idx', ''], ['qty', ''], ['disp', ''], ['rmp', ''], ['format', 'grid'],
    ['pg', '1'], ['sz', String(MAX_CODES)], ['so', 'rd'],
  ] as const) params.append(key, value);
  const response = await context.fetch(`${ORIGIN}${LOOKUP_PATH}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
  });
  const { json, text } = await readJson(response);
  if (!response.ok || !json || json.res !== true || !Array.isArray(json.dat)) {
    const loggedOut = /로그인|login/i.test(`${json?.msg || ''} ${text.slice(0, 300)}`);
    throw new Error(loggedOut ? `${LABEL}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 보내세요.` : `${LABEL} 상품 목록을 읽지 못했습니다.`);
  }
  return json.dat;
}

/**
 * 목록 수정 한 방으로 진열여부를 바꾼다. 줄을 먼저 읽어 지금 값을 그대로 싣고 진열여부만 바꾼다. 이미 원하는 상태인 줄은
 * 보내지 않는다. 보낸 뒤 다시 읽어 바뀐 줄을 센다.
 */
async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? SHOWN.show : SHOWN.hide;
  const warnings: string[] = [];
  let sent = 0;
  let failed = 0;
  let confirmed = 0;
  let already = 0;
  const missing: string[] = [];
  for (let start = 0; start < codes.length; start += MAX_CODES) {
    const group = codes.slice(start, start + MAX_CODES);
    const rows = new Map((await lookupListRows(context, group)).map((row) => [String(row.no), row]));
    const found = group.filter((code) => rows.has(code));
    missing.push(...group.filter((code) => !rows.has(code)));
    const targets = found.filter((code) => rows.get(code).disp !== wanted);
    already += found.length - targets.length;
    if (targets.length > 0) {
      // [수정저장]이 만드는 모양 그대로다(`loq`는 첫 쉼표만 뗀다 — 화면 코드가 그렇게 한다).
      const dat = targets.map((code) => {
        const row = rows.get(code);
        return { no: row.no, disp: resume, title: row.title, loq: String(row.loq ?? '').replace(',', ''), useOpt: row.useOpt !== 'N' };
      });
      const response = await context.fetch(`${ORIGIN}${EDIT_PATH}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: `dat=${encodeURIComponent(JSON.stringify(dat))}`,
      });
      const { json } = await readJson(response);
      if (!response.ok || !json || json.res !== true) {
        failed += targets.length;
        warnings.push(`${LABEL}이 수정을 받지 않았습니다${json?.msg ? `: ${String(json.msg).slice(0, 120)}` : ''}.`);
      } else {
        // 건수가 숫자로 왔을 때만 믿는다(null · "" · true를 0 · 1로 읽지 않는다). 없으면 묶음 전체로 본다.
        const counted = typeof json.success === 'number' || (typeof json.success === 'string' && /^\d+$/.test(json.success)) ? Number(json.success) : null;
        const ok = counted === null ? targets.length : Math.min(counted, targets.length);
        sent += ok;
        failed += targets.length - ok;
        if (ok < targets.length) warnings.push(`${LABEL}이 ${targets.length}건 중 ${ok}건만 바꿨다고 답했습니다.`);
      }
      await context.sleep(PACE_MS);
    }
    // 반영 확인 — 같은 조회로 진열여부를 다시 읽는다. 못 읽으면 확인하지 못한 것으로 둔다.
    const after = found.length > 0 ? await lookupListRows(context, found).catch(() => null) : [];
    if (after) confirmed += after.filter((row) => row.disp === wanted).length;
    else warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 목록에서 확인하세요.`);
  }
  if (already > 0) warnings.push(`${already}건은 이미 ${wanted}이었습니다.`);
  if (missing.length > 0) warnings.push(`${missing.length}건은 ${LABEL} 상품번호로 찾지 못했습니다.`);
  // 이미 원하는 상태인 줄은 보낼 것이 없었을 뿐 끝난 일이다.
  return { success: true, sent: sent + already, failed: failed + missing.length, confirmed, requestOnly: false, warnings };
}

/** 지금 진열여부(KID-256 — 보낸 뒤 증거를 싣는 다시 읽기). 진열함이면 재고 모름, 진열안함이면 0과 그 글자. 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{1,12}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  const rows = new Map((await lookupListRows(context, products)).map((row) => [String(row.no), row]));
  return {
    success: true,
    products: products.filter((no) => rows.has(no)).map((no) => ({ code: no, options: [flagOption(no, rows.get(no).disp === SHOWN.show, rows.get(no).disp)] })),
    missing: products.filter((no) => !rows.has(no)),
  };
}

registerMallAvailability({
  mallKey: 'domeggook',
  displayName: LABEL,
  guard: availabilityGuard(DOMEGGOOK_PAGE_GUARD, LABEL),
  dialogHosts: ['domeggook.com'],
  login: DOMEGGOOK_LOGIN,
  send,
  read,
});
