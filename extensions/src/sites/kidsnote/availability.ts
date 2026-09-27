import {
  flagOption,
  observedUrlOf,
  READ_LIMIT,
  registerMallAvailability,
  stoppedMidway,
  withSellerPage,
  type AvailabilityContext,
  type AvailabilityProduct,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
  type PageRun,
  type PriceSendAnswer,
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { KIDSNOTE_LOGIN, KIDSNOTE_PAGE_GUARD } from './index';

/**
 * 키즈노트(WISA 스마트윙 관리자) 품절·재개·가격·지금 상태(옛 `mall-availability-send.js` `kidsnote` · `stateBatch`, KID-256).
 * 품절 = 상태 품절(3), 판매 재개 = 정상(2) — 판매 상품 내역(body=2010)의 [상태/노출일괄수정] 폼(`edt_layer_4`)에서 "선택한 상품의"
 * 상태를 바꿔 [확인]을 누른 요청 그대로다(2026-09-19 실측).
 *
 *  - POST `/_manage/`에 그 폼 전체를 싣는다. `nums`는 고른 상품번호마다 "@"를 앞에 붙여 이은 것, `where=1`은 "선택한 상품의",
 *    노출 칸은 "변화없음" 그대로다.
 *  - 상품번호 검색이 없어 목록을 100개씩 넘기며 지금 상태(정상·품절·숨김)를 읽는다. 숨김 상품은 사장님이 숨긴 것이라 바꾸지 않는다.
 *  - 답은 숨은 창에 그리는 화면이라, 보낸 뒤 목록을 다시 읽어 상태가 바뀐 것을 센다.
 *  - 가격은 가격 일괄수정 폼(`edt_layer_2`)을 "균일가 적용·선택한 상품·판매가를 X원으로" 보낸 요청이다(exec=sell_prc). 같은
 *    가격끼리 묶어 보내고 목록을 다시 읽어 판매가를 확인한다. ⚠️ 가격을 바꾸면 본사 승인 전까지 그 상품 판매가 멈춘다.
 */
const ORIGIN = 'https://shop.kidsnote.com';
const PAGE_URL = 'https://shop.kidsnote.com/_manage/?body=2010';
const LIST_PATH = '/_manage/';
const SAVE_PATH = '/_manage/';
/** 목록 한 쪽 최대(화면의 '100개씩'). 보낼 때도 한 번에 이만큼. */
const PAGE_SIZE = 100;
const MAX_PAGES = 60;
const PAGE_PACE_MS = 200;
const PACE_MS = 700;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 2;
const LABEL = '키즈노트';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
/** 가격 일괄수정 화면 문구 그대로의 뜻 — 가격을 바꾸면 본사 승인 전까지 판매가 멈춘다. */
export const KIDSNOTE_PRICE_NOTE = '키즈노트는 가격을 바꾸면 본사 승인 전까지 그 상품 판매가 멈춥니다.';

type Pair = [string, string];

/** 목록을 100개씩 넘기며 찾는 상품의 상태를 모은다. `withForm`이면 첫 쪽에서 일괄수정 폼 값도 받아 온다. */
async function readRows(
  context: AvailabilityContext,
  run: PageRun,
  codes: string[],
  withForm: boolean,
  formId = 'edt_layer_4',
): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; form?: Pair[] | null; error?: string }> {
  const wanted = new Set(codes);
  const rows = new Map<string, MallJson>();
  let form: Pair[] | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (page > 1) await context.sleep(PAGE_PACE_MS);
    const answer = (await run('kidsnoteListOnPage', [LIST_PATH, page, PAGE_SIZE, Boolean(withForm && page === 1), formId])) as MallJson;
    if (answer?.loggedOut) return { loggedOut: true };
    if (!Array.isArray(answer?.rows)) return { error: answer?.error || '목록 조회 실패' };
    if (withForm && page === 1) form = answer.form;
    for (const row of answer.rows as MallJson[]) if (wanted.has(row.pno)) rows.set(row.pno, row);
    if (answer.rows.length < PAGE_SIZE || rows.size >= wanted.size) break;
  }
  return { rows, form };
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? '정상' : '품절';
  const from = resume ? '품절' : '정상';
  const value = resume ? '2' : '3';
  const warnings: string[] = [];
  const products = codes.filter((code) => /^\d{1,10}$/.test(code));
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    if (products.length === 0) return null;
    const before = await readRows(context, run, products, true);
    if (before.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!before.rows) return { success: false, error: `${LABEL} 상품목록을 읽지 못했습니다(${before.error}).` };
    const rows = before.rows;
    const form = before.form ?? [];
    const names = new Set(form.map(([name]) => name));
    if (!['body', 'nums', 'exec', 'where', 'change_stat'].every((name) => names.has(name))) {
      return { success: false, error: `${LABEL} 상태/노출일괄수정 화면이 바뀌어 보내지 않았습니다.` };
    }
    const found = products.filter((no) => rows.has(no));
    const missing = products.length - found.length;
    if (missing > 0) {
      failed += missing;
      warnings.push(`${missing}건은 ${LABEL} 상품목록에서 찾지 못했습니다.`);
    }
    // 숨김은 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 풀지 않는다(사장님이 숨긴 상품).
    const hidden = found.filter((no) => ![from, wanted].includes(rows.get(no).stat)).length;
    if (resume && hidden > 0) {
      failed += hidden;
      warnings.push(`${hidden}건은 ${LABEL}에서 숨김(또는 다른 상태)이라 풀지 않았습니다.`);
    }
    if (!resume) already += hidden;
    const targets = found.filter((no) => rows.get(no).stat === from);
    already += found.filter((no) => rows.get(no).stat === wanted).length;
    const accepted: string[] = [];
    let answered: string | null = null;
    for (let start = 0; start < targets.length; start += PAGE_SIZE) {
      const group = targets.slice(start, start + PAGE_SIZE);
      // 화면 폼 그대로 — 고른 상품(nums), "선택한 상품의"(where=1), 바꿀 상태(change_stat)만 채운다.
      const pairs: Pair[] = form.map(([name, current]): Pair => {
        if (name === 'nums') return [name, group.map((no) => `@${no}`).join('')];
        if (name === 'where') return [name, '1'];
        if (name === 'change_stat') return [name, value];
        return [name, current];
      });
      const answer = (await run('kidsnoteSaveOnPage', [SAVE_PATH, pairs])) as MallJson;
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = targets.length - start;
        return null;
      }
      if (answer?.alert) answered = answer.alert;
      if (answer?.status !== 200) {
        failed += group.length;
        warnings.push(`${LABEL}이 상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0}).`);
      } else {
        sent += group.length;
        accepted.push(...group);
      }
      await context.sleep(PACE_MS);
    }
    if (accepted.length === 0) return null;
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, accepted, false);
      if (!after.rows) continue;
      seen = accepted.filter((no) => after.rows!.get(no)?.stat === wanted).length;
      if (seen >= accepted.length) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 판매 상품 내역에서 확인하세요.`);
    } else {
      confirmed += seen;
      if (seen < accepted.length) {
        const said = answered ? ` 몰 답: "${answered}"` : '';
        warnings.push(`${LABEL} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다.${said}`);
      }
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 가격 일괄수정(균일가·선택한 상품·판매가)으로 같은 가격끼리 묶어 보내고, 목록을 다시 읽어 판매가를 확인한다. */
async function sendPrice(context: AvailabilityContext, items: Array<{ code: string; price: number; ifPrice: number | null }>): Promise<PriceSendAnswer> {
  const warnings: string[] = [KIDSNOTE_PRICE_NOTE];
  const valid = items.filter((item) => /^\d{1,10}$/.test(item.code));
  let failed = items.length - valid.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let submissionAttempted = false;
  const results: NonNullable<PriceSendAnswer['results']> = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run, page): Promise<PriceSendAnswer | null> => {
    if (valid.length === 0) return null;
    const before = await readRows(context, run, valid.map((item) => item.code), true, 'edt_layer_2');
    if (before.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!before.rows) return { success: false, error: `${LABEL} 상품목록을 읽지 못했습니다(${before.error}).` };
    const rows = before.rows;
    const form = before.form ?? [];
    const names = new Set(form.map(([name]) => name));
    const exec = form.find(([name]) => name === 'exec')?.[1];
    if (!['body', 'nums', 'exec', 'where', 'prc_chg_type', 'o3', 'replace_prc'].every((name) => names.has(name)) || exec !== 'sell_prc') {
      return { success: false, error: `${LABEL} 가격 일괄수정 화면이 바뀌어 보내지 않았습니다.` };
    }
    const byPrice = new Map<number, Array<{ code: string; before: number | null }>>();
    for (const item of valid) {
      const row = rows.get(item.code);
      if (!row) {
        failed += 1;
        warnings.push(`${item.code}: ${LABEL} 상품목록에서 찾지 못했습니다.`);
        continue;
      }
      if (item.ifPrice !== null && row.price !== item.ifPrice) {
        failed += 1;
        warnings.push(`${item.code}: ${LABEL} 가격이 그사이 ${row.price === null ? '모르는 값' : `${row.price.toLocaleString('ko-KR')}원`}으로 바뀌어 보내지 않았습니다. 몰 상품을 다시 가져온 뒤 보내세요.`);
        continue;
      }
      byPrice.set(item.price, [...(byPrice.get(item.price) || []), { code: item.code, before: row.price }]);
    }
    const accepted: Array<{ code: string; before: number | null; price: number }> = [];
    for (const [price, group] of byPrice) {
      for (let start = 0; start < group.length; start += PAGE_SIZE) {
        const chunk = group.slice(start, start + PAGE_SIZE);
        // 화면 폼 그대로 — 고른 상품(nums), "선택한 상품의"(where=1), 균일가(prc_chg_type=2)·판매가(o3)·새 가격만 채운다.
        const pairs: Pair[] = form.map(([name, current]): Pair => {
          if (name === 'nums') return [name, chunk.map((entry) => `@${entry.code}`).join('')];
          if (name === 'where') return [name, '1'];
          if (name === 'prc_chg_type') return [name, '2'];
          if (name === 'o3') return [name, 'sell_prc'];
          if (name === 'replace_prc') return [name, String(price)];
          return [name, current];
        });
        submissionAttempted = true;
        const answer = (await run('kidsnoteSaveOnPage', [SAVE_PATH, pairs])) as MallJson;
        if (answer?.loggedOut) return { success: false, error: LOGGED_OUT };
        if (answer?.status !== 200) {
          failed += chunk.length;
          warnings.push(`${LABEL}이 가격 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0}).`);
        } else {
          sent += chunk.length;
          accepted.push(...chunk.map((entry) => ({ ...entry, price })));
        }
        await context.sleep(PACE_MS);
      }
    }
    if (accepted.length === 0) return null;
    let after: Awaited<ReturnType<typeof readRows>> | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      after = await readRows(context, run, accepted.map((entry) => entry.code), false);
      if (after.rows && accepted.every((entry) => after!.rows!.get(entry.code)?.price === entry.price)) break;
    }
    for (const entry of accepted) {
      const now = after?.rows?.get(entry.code)?.price ?? null;
      const ok = now === entry.price;
      if (ok) confirmed += 1;
      const observedUrl = typeof now === 'number' && Number.isFinite(now) ? await observedUrlOf(page, ORIGIN) : null;
      results.push({ code: entry.code, before: entry.before, after: now, confirmed: ok, ...(observedUrl ? { observedUrl } : {}) });
    }
    return null;
  });
  if (halted) return { ...halted, submissionAttempted };
  return { success: true, sent, failed, confirmed, results, warnings, submissionAttempted };
}

/** 지금 상태. 목록을 넘기며 찾는다. 정상이 아니면(품절·숨김) 0과 그 글자, 정상이면 모름(null). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{1,10}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, products, false);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품목록을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = products.filter((no) => rows.has(no)).map((no) => ({ code: no, options: [flagOption(no, rows.get(no).stat === '정상', rows.get(no).stat)] }));
    missing = products.filter((no) => !rows.has(no));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'kidsnote',
  displayName: LABEL,
  guard: availabilityGuard(KIDSNOTE_PAGE_GUARD, LABEL),
  dialogHosts: ['shop.kidsnote.com'],
  login: KIDSNOTE_LOGIN,
  send,
  read,
  sendPrice,
});
