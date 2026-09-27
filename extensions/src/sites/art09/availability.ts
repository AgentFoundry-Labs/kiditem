import {
  READ_LIMIT,
  registerMallAvailability,
  withSellerPage,
  type AvailabilityContext,
  type AvailabilityProduct,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
  type PageRun,
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { ART09_LOGIN, ART09_PAGE_GUARD } from './index';
import { isArt09LoginPage } from './registration';

/**
 * 아트공구(카페24 공급사 관리자) 품절·재개·지금 상태(옛 `mall-availability-send.js` `art09` · `sellingState`, KID-256). 품절 =
 * 판매안함, 판매 재개 = 판매함 — 상품목록(ProductManage)의 [판매안함]·[판매함] 버튼이 보내는 요청 그대로다(2026-09-19 실측,
 * 화면 코드 `PRODUCT_MANAGE._manageState`).
 *
 *  - POST /exec/admin/product/ProductManageState에 `product_no[]`·`change=is_selling`·`state=F|T`와 고른 상품마다 지금 값
 *    `market[번호][is_display|is_selling]`을 싣는다. 답은 JSON `{passed, msg}`.
 *  - 카페24 판매안함은 진열된 채 품절로 보이고 주문을 받지 않는다. 재고 칸은 건드리지 않는다. 세트상품은 화면도 막는다.
 *  - 상품번호로 짚는다. 목록 검색으로는 상품번호를 못 찾아서, 상품목록을 100개씩 끝까지 읽어 지금 값을 얻고, 보낸 뒤 다시
 *    읽어 확인한다.
 */
const ORIGIN = 'https://zzogzzog1.cafe24.com';
const PAGE_URL = 'https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductManage';
const LIST_PATH = '/disp/admin/shop1/product/ProductManage';
const STATE_PATH = '/exec/admin/product/ProductManageState';
/** 상품목록 한 쪽 최대(화면의 '100개씩보기'). 보낼 때도 한 번에 이만큼. */
const PAGE_SIZE = 100;
const MAX_PAGES = 60;
const PACE_MS = 700;
const LABEL = '아트공구';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

type Cafe24Row = { no: string; display: boolean | null; selling: boolean | null; set: boolean };

async function readRows(run: PageRun): Promise<{ loggedOut?: true; rows?: Map<string, Cafe24Row>; error?: string }> {
  const answer = (await run('cafe24ListOnPage', [LIST_PATH, PAGE_SIZE, MAX_PAGES])) as MallJson;
  if (answer?.loggedOut) return { loggedOut: true };
  if (!Array.isArray(answer?.rows)) return { error: answer?.error || '형식을 모릅니다' };
  return { rows: new Map((answer.rows as Cafe24Row[]).map((row) => [row.no, row])) };
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const warnings: string[] = [];
  const products = codes.filter((code) => /^\d{1,12}$/.test(code));
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    if (products.length === 0) return null;
    const before = await readRows(run);
    if (before.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!before.rows) return { success: false, error: `${LABEL} 상품목록을 읽지 못했습니다(${before.error}).` };
    const rows = before.rows;
    const found = products.filter((no) => rows.has(no));
    const missing = products.length - found.length;
    if (missing > 0) {
      failed += missing;
      warnings.push(`${missing}건은 ${LABEL} 상품목록에 없습니다.`);
    }
    const sets = found.filter((no) => rows.get(no)!.set).length;
    if (sets > 0) {
      failed += sets;
      warnings.push(`세트상품 ${sets}개는 ${LABEL} 화면도 판매상태를 바꾸지 못하게 막아 보내지 않았습니다.`);
    }
    const readable = (no: string) => rows.get(no)!.selling !== null && rows.get(no)!.display !== null;
    const unknown = found.filter((no) => !rows.get(no)!.set && !readable(no)).length;
    if (unknown > 0) {
      failed += unknown;
      warnings.push(`${unknown}건은 ${LABEL} 상품목록에서 판매 · 진열 상태를 읽지 못해 보내지 않았습니다.`);
    }
    const known = found.filter((no) => !rows.get(no)!.set && readable(no));
    const targets = known.filter((no) => rows.get(no)!.selling !== resume);
    already += known.length - targets.length;
    const accepted: string[] = [];
    for (let start = 0; start < targets.length; start += PAGE_SIZE) {
      const group = targets.slice(start, start + PAGE_SIZE);
      // 버튼이 만드는 모양 그대로(jQuery가 {product_no, change, state, market}을 펼친 순서).
      const body = new URLSearchParams();
      for (const no of group) body.append('product_no[]', no);
      body.append('change', 'is_selling');
      body.append('state', resume ? 'T' : 'F');
      for (const no of group) {
        const row = rows.get(no)!;
        body.append(`market[${no}][is_display]`, row.display ? 'T' : 'F');
        body.append(`market[${no}][is_selling]`, row.selling ? 'T' : 'F');
      }
      const answer = await run('requestOnPage', [STATE_PATH, 'POST', 'application/x-www-form-urlencoded; charset=UTF-8', body.toString(), { 'X-Requested-With': 'XMLHttpRequest' }]);
      if (answer.status < 200 || answer.status >= 300 || !answer.json || answer.json.passed === false) {
        failed += group.length;
        const reason = answer.json?.msg ? `: ${String(answer.json.msg).slice(0, 120)}` : '';
        warnings.push(`${LABEL}이 판매상태 변경을 받지 않았습니다(HTTP ${answer.status})${reason}.`);
        continue;
      }
      sent += group.length;
      accepted.push(...group);
      await context.sleep(PACE_MS);
    }
    if (sent === 0) return null;
    const after = await readRows(run);
    // 받아들여진 것만 확인으로 센다 — 거절된 묶음이 다른 까닭으로 원하는 상태여도 보낸 수를 넘기지 않는다.
    if (after.rows) confirmed += accepted.filter((no) => after.rows!.get(no)?.selling === resume).length;
    else warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품목록에서 확인하세요.`);
    return null;
  });
  if (halted) return halted;
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 판매상태. 상품목록을 한 번 끝까지 읽는다. 판매안함이면 0, 판매함이면 모름(null). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{1,12}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(run);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품목록을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    // 판매안함만 품절(0)이다. 판매 상태를 못 읽었으면(null) 모른다 — 품절로 단정하지 않는다.
    found = products.filter((no) => rows.has(no)).map((no) => ({ code: no, options: [{ optionCode: no, stock: rows.get(no)!.selling === false ? 0 : null, rocket: false }] }));
    missing = products.filter((no) => !rows.has(no));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'art09',
  displayName: LABEL,
  guard: availabilityGuard(ART09_PAGE_GUARD, LABEL, isArt09LoginPage),
  dialogHosts: ['zzogzzog1.cafe24.com', 'eclogin.cafe24.com'],
  login: { ...ART09_LOGIN, isLoginUrl: isArt09LoginPage },
  send,
  read,
});
