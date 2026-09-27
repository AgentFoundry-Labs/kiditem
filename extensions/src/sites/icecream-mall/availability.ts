import {
  flagOption,
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
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { ICECREAM_LOGIN, ICECREAM_PAGE_GUARD } from './index';

/**
 * 아이스크림몰(아이스크림 PO) 품절·재개·지금 상태(옛 `mall-availability-send.js` `icecream-mall` · `goodsSaleState`, KID-256).
 * 품절 = 판매상태 품절(20), 판매 재개 = 판매중(10) — 상품 정보 관리 목록의 [판매상태 일괄변경]이 여는 "단품 판매상태 일괄
 * 변경" 창의 [적용]이 보내는 요청 그대로다(2026-09-19 실측, 창 코드 `goodsSaleStateModify.eventhandler`의 `#btn_apply`).
 *
 *  - POST `/goods/goodsMgmtPopup.modifyGoodsSaleState.do`에 JSON `{goodsSaleStateList: [{goodsNo, saleStatCd, itmSaleStatCd,
 *    soutCausCd:"12", saleStatChgCausCd:null}]}`. `saleStatCd`는 목록이 준 지금 상태, `itmSaleStatCd`가 고른 상태다.
 *  - 목록은 판매방식(saleMethCd)이 다른 상품을 한 번에 넘기지 못한다 — 판매방식마다 나눠 보낸다. 예약상품(20)이 품절이면
 *    창이 판매중을 고르지 못하게 숨긴다 — 재개하지 않고 알린다. 판매종료(40)는 건드리지 않는다.
 *  - 보낸 뒤 같은 조회로 판매상태를 다시 읽어 확인한다.
 */
const ORIGIN = 'https://po.i-screammall.co.kr';
const PAGE_URL = 'https://po.i-screammall.co.kr/goods/goodsMgmt.goodsMgmtView.do';
const VIEW_PATH = '/goods/goodsMgmt.goodsMgmtView.do';
const LIST_PATH = '/goods/goodsMgmt.getGoodsList.do';
const SAVE_PATH = '/goods/goodsMgmtPopup.modifyGoodsSaleState.do';
const BATCH_SIZE = 100;
const PACE_MS = 700;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
const LABEL = '아이스크림몰';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
const STATUS_WORDS: Record<string, string> = { 20: '품절', 40: '판매종료' };

async function readRows(context: AvailabilityContext, run: PageRun, codes: string[]): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; error?: string }> {
  const rows = new Map<string, MallJson>();
  for (let start = 0; start < codes.length; start += BATCH_SIZE) {
    if (start > 0) await context.sleep(PACE_MS);
    const answer = (await run('icecreamRowsOnPage', [VIEW_PATH, LIST_PATH, codes.slice(start, start + BATCH_SIZE)])) as MallJson;
    if (answer?.loggedOut) return { loggedOut: true };
    if (!Array.isArray(answer?.rows)) return { error: answer?.error || '목록 조회 실패' };
    for (const row of answer.rows as MallJson[]) if (row?.goodsNo) rows.set(row.goodsNo, row);
  }
  return { rows };
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? '10' : '20';
  const from = resume ? '20' : '10';
  const warnings: string[] = [];
  const products = codes.filter((code) => /^\d{5,15}$/.test(code));
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    if (products.length === 0) return null;
    const before = await readRows(context, run, products);
    if (before.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!before.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${before.error}).` };
    const rows = before.rows;
    const found = products.filter((no) => rows.has(no));
    const missing = products.length - found.length;
    if (missing > 0) {
      failed += missing;
      warnings.push(`${missing}건은 ${LABEL}에서 찾지 못했습니다.`);
    }
    // 판매종료(40)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 되살리지 않는다.
    const ended = found.filter((no) => !['10', '20'].includes(rows.get(no).saleStatCd)).length;
    if (resume && ended > 0) {
      failed += ended;
      warnings.push(`${ended}건은 ${LABEL}에서 판매종료된 상품이라 되살리지 않았습니다.`);
    }
    if (!resume) already += ended;
    const movable = found.filter((no) => rows.get(no).saleStatCd === from);
    already += found.filter((no) => rows.get(no).saleStatCd === wanted).length;
    // 예약상품이 품절이면 창이 판매중을 고르지 못하게 숨긴다 — 화면이 못 하는 것은 하지 않는다.
    const reserved = resume ? movable.filter((no) => rows.get(no).saleMethCd === '20') : [];
    if (reserved.length > 0) {
      failed += reserved.length;
      warnings.push(`${reserved.length}건은 예약상품이라 ${LABEL} 화면도 판매중으로 되돌리지 못합니다.`);
    }
    const targets = movable.filter((no) => !reserved.includes(no));
    // 목록은 판매방식이 다른 상품을 한 번에 넘기지 못한다 — 판매방식마다 나눠 보낸다.
    const groups = new Map<string, string[]>();
    for (const no of targets) {
      const method = String(rows.get(no).saleMethCd ?? '');
      if (!groups.has(method)) groups.set(method, []);
      groups.get(method)!.push(no);
    }
    const accepted: string[] = [];
    let processed = 0;
    for (const group of groups.values()) {
      for (let start = 0; start < group.length; start += BATCH_SIZE) {
        const slice = group.slice(start, start + BATCH_SIZE);
        // 창이 만드는 모양 그대로 — 목록 줄의 상품번호·지금 상태에 창이 고른 상태와 사유 칸을 얹는다.
        const list = slice.map((no) => ({ goodsNo: no, saleStatCd: rows.get(no).saleStatCd, itmSaleStatCd: wanted, soutCausCd: '12', saleStatChgCausCd: null }));
        const answer = (await run('icecreamSaveOnPage', [SAVE_PATH, list])) as MallJson;
        if (answer?.loggedOut) {
          halt = LOGGED_OUT;
          left = targets.length - processed;
          return null;
        }
        processed += slice.length;
        if (answer?.status !== 200 || answer.succeeded !== true) {
          failed += slice.length;
          const reason = answer?.message ? `: ${answer.message}` : '';
          warnings.push(`${LABEL}이 판매상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0})${reason}.`);
        } else {
          sent += slice.length;
          accepted.push(...slice);
        }
        await context.sleep(PACE_MS);
      }
    }
    if (accepted.length === 0) return null;
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, accepted);
      if (!after.rows) continue;
      seen = accepted.filter((no) => after.rows!.get(no)?.saleStatCd === wanted).length;
      if (seen >= accepted.length) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 정보 관리에서 확인하세요.`);
    } else {
      confirmed += seen;
      if (seen < accepted.length) warnings.push(`${LABEL} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품 정보 관리에서 확인하세요.`);
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 판매상태. 목록 조회 한 번. 판매중(10)이 아니면(품절·판매종료) 0과 그 글자, 판매중이면 모름(null). */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{5,15}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, products);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = products.filter((no) => rows.has(no)).map((no) => ({
      code: no,
      options: [flagOption(no, rows.get(no).saleStatCd === '10', STATUS_WORDS[String(rows.get(no).saleStatCd)])],
    }));
    missing = products.filter((no) => !rows.has(no));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'icecream-mall',
  displayName: LABEL,
  guard: availabilityGuard(ICECREAM_PAGE_GUARD, LABEL),
  dialogHosts: ['po.i-screammall.co.kr'],
  login: ICECREAM_LOGIN,
  send,
  read,
});
