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
import { ST11_LISTINGS_GUARD } from './listings';

/**
 * 11번가 셀러오피스 품절·재개·지금 상태(옛 `mall-availability-send.js` `11st` · `st11SellStatus`, KID-256). 품절 = 판매중지(105),
 * 판매 재개 = 판매중지 해제 — 목록의 [판매중지]·[판매중지 해제]가 여는 확인 창(`getSelStatList`)의 [적용]이 보내는 요청
 * 그대로다(2026-09-19 실측, 창 코드 `applySelStat`).
 *
 *  - POST `/product/SellProductAction.tmall?method=updateProductSelStat&prdStatCd=SELL_STOP|SELL_RELEASE`에 `chkPrdNoCount`·
 *    `trgtPrdNos`(상품번호를 쉼표로)·`content`(사유, 비움). 답은 창 화면이고 `msg = "SAVE_OK"`와 "총 N건 중 M건"을 담는다.
 *  - 지금 상태는 목록 조회 `getSellProductListJSON`으로 읽는다. selStatCd 103 판매중·104 품절(재고 0)·105 판매중지·102 전시전.
 *  - 판매중인 상품만 멈추고, 해제는 판매중지이면서 재고가 있는 상품만 푼다(화면도 재고 0이면 막는다).
 *  - 로그인 입구 명세가 없다 — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://soffice.11st.co.kr';
const PAGE_URL = 'https://soffice.11st.co.kr/view/8006';
const LIST_PATH = '/product/SellProductAjaxAction.tmall';
const SAVE_PATH = '/product/SellProductAction.tmall';
const BATCH_SIZE = 100;
const PACE_MS = 700;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
const LABEL = '11번가';
const LOGGED_OUT = `${LABEL} 셀러오피스 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
const ST11_WORDS: Record<string, string> = { 101: '승인대기', 102: '전시전', 104: '품절', 105: '판매중지' };

const isProductNo = (code: string) => /^\d{6,12}$/.test(code);

async function readRows(context: AvailabilityContext, run: PageRun, prdNos: string[]): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; error?: string }> {
  const rows = new Map<string, MallJson>();
  for (let start = 0; start < prdNos.length; start += BATCH_SIZE) {
    if (start > 0) await context.sleep(PACE_MS);
    const answer = (await run('st11ListOnPage', [LIST_PATH, prdNos.slice(start, start + BATCH_SIZE)])) as MallJson;
    if (answer?.loggedOut) return { loggedOut: true };
    if (!Array.isArray(answer?.rows)) return { error: answer?.error || '목록 조회 실패' };
    for (const row of answer.rows as MallJson[]) if (row?.prdNo) rows.set(row.prdNo, row);
  }
  return { rows };
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const mode = resume ? 'SELL_RELEASE' : 'SELL_STOP';
  const wanted = resume ? '103' : '105';
  const warnings: string[] = [];
  const products = codes.filter(isProductNo);
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
      warnings.push(`${missing}건은 ${LABEL}에서 찾지 못했습니다(지운 상품일 수 있습니다).`);
    }
    const stat = (no: string) => rows.get(no).selStatCd;
    let targets: string[];
    if (resume) {
      // 해제는 판매중지이면서 재고가 있는 상품만 — 화면도 재고 0이면 "재고수량 등록 후"라며 막는다.
      const stopped = found.filter((no) => stat(no) === '105');
      const empty = stopped.filter((no) => !(rows.get(no).stckQty > 0) && rows.get(no).setTypCd !== '02');
      if (empty.length > 0) {
        failed += empty.length;
        warnings.push(`${empty.length}건은 ${LABEL} 재고가 0 이라 판매중지를 풀지 못합니다 — 재고를 넣은 뒤 다시 보내세요.`);
      }
      targets = stopped.filter((no) => !empty.includes(no));
      already += found.filter((no) => stat(no) === '103').length;
      const other = found.filter((no) => !['103', '105'].includes(stat(no))).length;
      if (other > 0) {
        failed += other;
        warnings.push(`${other}건은 ${LABEL}에서 판매중지가 아니라(품절 · 전시전 등) 풀 것이 없습니다.`);
      }
    } else {
      // 판매중(103)만 멈춘다. 품절(104)·판매중지(105)·전시전(102)·승인대기(101)는 이미 못 산다.
      targets = found.filter((no) => stat(no) === '103');
      already += found.length - targets.length;
    }
    const accepted: string[] = [];
    for (let start = 0; start < targets.length; start += BATCH_SIZE) {
      const group = targets.slice(start, start + BATCH_SIZE);
      const answer = (await run('st11SaveOnPage', [SAVE_PATH, mode, group])) as MallJson;
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = targets.length - start;
        return null;
      }
      if (answer?.status !== 200 || answer.msg !== 'SAVE_OK') {
        failed += group.length;
        const said = answer?.alert || answer?.msg || answer?.error || `HTTP ${answer?.status ?? 0}`;
        warnings.push(`${LABEL}이 ${resume ? '판매중지 해제' : '판매중지'}를 받지 않았습니다: ${said}`);
      } else {
        sent += group.length;
        accepted.push(...group);
        if (answer.total !== null && answer.done !== null && answer.done < answer.total) {
          warnings.push(`${LABEL}이 ${answer.total}건 중 ${answer.done}건만 처리했다고 답했습니다.`);
        }
      }
      await context.sleep(PACE_MS);
    }
    if (accepted.length === 0) return null;
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, accepted);
      if (!after.rows) continue;
      seen = accepted.filter((no) => after.rows!.get(no)?.selStatCd === wanted).length;
      if (seen >= accepted.length) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품조회/수정에서 확인하세요.`);
    } else {
      confirmed += seen;
      if (seen < accepted.length) warnings.push(`${LABEL} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품조회/수정에서 확인하세요.`);
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 판매상태. 판매중이면 모름(null), 아니면 0과 11번가의 말. 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const valid = [...new Set(codes)].filter(isProductNo).slice(0, READ_LIMIT);
  if (valid.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, valid);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = valid.filter((code) => rows.has(code)).map((code) => {
      const stat = String(rows.get(code).selStatCd);
      return { code, options: [flagOption(code, stat === '103', stat === '103' ? null : ST11_WORDS[stat] || '판매중지')] };
    });
    missing = valid.filter((code) => !rows.has(code));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: '11st',
  displayName: LABEL,
  guard: availabilityGuard(ST11_LISTINGS_GUARD, LABEL),
  dialogHosts: ['soffice.11st.co.kr'],
  send,
  read,
});
