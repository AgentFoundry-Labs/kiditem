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
import { LOTTE_ON_LOGIN, LOTTE_ON_PAGE_GUARD } from './index';

/**
 * 롯데ON 판매자센터 품절·재개·지금 상태(옛 `mall-availability-send.js` `lotte-on` · `saleStatus`, KID-256). 품절 = 상품
 * 판매상태 품절(SOUT), 판매 재개 = 판매중(SALE) — 상품 조회/수정의 [상품판매 변경]이 여는 상품정보일괄수정 → 일괄수정항목
 * 팝업의 [저장]이 보내는 요청 그대로다(2026-09-19 실측, 팝업 `productChangeInfo.xml`의 case '07').
 *
 *  - POST soapi `/soapi/v1/product/registration/updateProductBatch`에 상품마다 `{spdNo, trNo, lrtrNo, trGrpCd, dvPdTypCd,
 *    code:"07", ctrtTypCd/dvProcTypCd/dmstOvsDvDvsCd:"all", reqTxt:"spdSlStatCd", spdSlStatCd}` 배열. 거래처·배송상품유형은 상품
 *    조회가 준 값 그대로. 판매종료(END)는 보내지 않는다.
 *  - 요청 머리(토큰·시간대·기기)는 화면이 요청마다 쓰는 함수(`gcm._sbm_setRequestHeader`)로 붙인다 — 화면 안(MAIN)에서
 *    부르고 토큰은 밖으로 나가지 않는다. 세션이 탭에 묶여 있어 열린 판매자센터 탭을 먼저 빌린다.
 *  - 롯데ON이 판매중지(STP)했거나 판매종료(END)한 상품은 바꾸지 않는다. 상품 조회는 바꾼 판매상태를 늦게 보여 준다 —
 *    보낸 뒤 바뀐 상태가 보일 때까지 다시 읽는다.
 */
const ORIGIN = 'https://store.lotteon.com';
const PAGE_URL = 'https://store.lotteon.com/cm/main/index_SO.wsp';
const API = 'https://soapi.lotteon.com';
const LIST_PATH = '/soapi/v1/product/information/selectProductList';
const UPDATE_PATH = '/soapi/v1/product/registration/updateProductBatch';
/** 한 번에 조회·저장하는 상품 수. 판매자상품번호 칸은 줄바꿈으로 여러 개를 받는다. */
const BATCH_SIZE = 100;
const PACE_MS = 700;
/** 실측 2026-09-19: 보낸 직후와 몇 초 뒤엔 옛 값, 10여 초 뒤 새 값. */
const RECHECK_MS = 3000;
const RECHECK_TIMES = 8;
/** 보내기 전 "이미 원하는 상태"로 보인 상품을 다시 읽는 횟수 — 방금 바꾼 옛 값인지 가린다. */
const SETTLE_TIMES = 4;
const LABEL = '롯데ON';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
const STATUS_WORDS: Record<string, string> = { SOUT: '품절', STP: '판매중지', END: '판매종료' };

const isProductNo = (code: string) => /^LO\d{4,20}$/.test(code);

async function readRows(context: AvailabilityContext, run: PageRun, codes: string[]): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; error?: string }> {
  const rows = new Map<string, MallJson>();
  for (let start = 0; start < codes.length; start += BATCH_SIZE) {
    if (start > 0) await context.sleep(PACE_MS);
    const group = codes.slice(start, start + BATCH_SIZE);
    const answer = await run('lotteonPostOnPage', [`${API}${LIST_PATH}`, { spdNo: group.join('\n'), pageNo: 1, rowsPerPage: BATCH_SIZE }, true], 'main');
    if (answer?.loggedOut) return { loggedOut: true };
    if (answer?.status !== 200 || answer.returnCode !== 'SUCCESS' || !Array.isArray(answer.rows)) {
      return { error: `HTTP ${answer?.status ?? 0}${answer?.returnCode ? ` ${answer.returnCode}` : ''}` };
    }
    for (const row of answer.rows as MallJson[]) if (row?.spdNo) rows.set(String(row.spdNo), row);
  }
  return { rows };
}

/** 저장 답 — `data`는 JSON 글자들의 배열이고 마지막 것이 {successCnt, failCnt}다(팝업이 그렇게 읽는다). 못 읽으면 null. */
function batchCounts(json: MallJson): { successCnt: number | null; failCnt: number } | null {
  const data = Array.isArray(json?.data) ? json.data : null;
  if (!data || data.length === 0) return null;
  try {
    const last = typeof data[data.length - 1] === 'string' ? JSON.parse(data[data.length - 1]) : data[data.length - 1];
    const successCnt = Number(last?.successCnt);
    const failCnt = Number(last?.failCnt);
    return Number.isFinite(successCnt) || Number.isFinite(failCnt)
      ? { successCnt: Number.isFinite(successCnt) ? successCnt : null, failCnt: Number.isFinite(failCnt) ? failCnt : 0 }
      : null;
  } catch {
    return null;
  }
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? 'SALE' : 'SOUT';
  const from = resume ? 'SOUT' : 'SALE';
  const warnings: string[] = [];
  const products = codes.filter(isProductNo);
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 판매자상품번호 모양이 아니라 보내지 않았습니다.`);
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
    // 판매중지(STP)·판매종료(END)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 풀지 않는다.
    const locked = found.filter((no) => !['SALE', 'SOUT'].includes(rows.get(no).slStatCd));
    if (resume && locked.length > 0) {
      failed += locked.length;
      warnings.push(`${locked.length}건은 ${LABEL}이 판매중지 · 판매종료한 상품이라 풀지 않았습니다.`);
    }
    if (!resume) already += locked.length;
    let targets = found.filter((no) => rows.get(no).slStatCd === from);
    // 상품 조회는 바꾼 직후 옛 판매상태를 섞어 준다 — "이미 원하는 상태"로 보인 것은 잠시 뒤 다시 읽어, 사실은 아직 옛
    // 상태면 보낼 대상에 넣는다(방금 품절한 상품을 바로 재개할 때 옛 SALE을 보고 건너뛰지 않게).
    let settled = found.filter((no) => rows.get(no).slStatCd === wanted);
    for (let attempt = 0; attempt < SETTLE_TIMES && settled.length > 0; attempt += 1) {
      await context.sleep(RECHECK_MS);
      const again = await readRows(context, run, settled);
      if (!again.rows) break;
      const flipped = settled.filter((no) => again.rows!.get(no)?.slStatCd === from);
      targets = [...targets, ...flipped];
      settled = settled.filter((no) => !flipped.includes(no));
    }
    already += settled.length;
    for (let start = 0; start < targets.length; start += BATCH_SIZE) {
      const group = targets.slice(start, start + BATCH_SIZE);
      // 팝업이 만드는 모양 그대로 — 상품정보일괄수정이 넘긴 줄 값에 팝업이 고른 판매상태를 얹는다.
      const params = group.map((no) => {
        const row = rows.get(no);
        return {
          spdNo: no, trNo: row.trNo, lrtrNo: row.lrtrNo, trGrpCd: row.trGrpCd, dvPdTypCd: row.dvPdTypCd,
          code: '07', ctrtTypCd: 'all', dvProcTypCd: 'all', dmstOvsDvDvsCd: 'all', reqTxt: 'spdSlStatCd', spdSlStatCd: wanted,
        };
      });
      const answer = await run('lotteonPostOnPage', [`${API}${UPDATE_PATH}`, params, false], 'main');
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = targets.length - start;
        return null;
      }
      if (answer?.status !== 200 || (answer.json?.returnCode && answer.json.returnCode !== 'SUCCESS')) {
        failed += group.length;
        const reason = answer?.json?.message ? `: ${String(answer.json.message).slice(0, 120)}` : '';
        warnings.push(`${LABEL}이 판매상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0})${reason}.`);
        continue;
      }
      // 받은 수는 몰이 말한 성공 수, 나머지는 전부 실패다.
      const counts = batchCounts(answer.json);
      const ok = Math.max(0, Math.min(counts?.successCnt ?? group.length - (counts?.failCnt ?? 0), group.length));
      sent += ok;
      if (ok < group.length) {
        failed += group.length - ok;
        warnings.push(`${LABEL}이 ${group.length}건 중 ${group.length - ok}건을 바꾸지 않았다고 답했습니다.`);
      }
      await context.sleep(PACE_MS);
    }
    if (sent === 0) return null;
    // 상품 조회가 늦게 따라온다 — 바뀐 상태가 보일 때까지 몇 번 더 읽는다.
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, targets);
      if (!after.rows) continue;
      seen = targets.filter((no) => after.rows!.get(no)?.slStatCd === wanted).length;
      if (seen >= sent) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 조회/수정에서 확인하세요.`);
    } else {
      // 몰이 받았다고 한 수를 넘겨 확인으로 세지 않는다.
      confirmed += Math.min(seen, sent);
      if (seen < sent) warnings.push(`${LABEL} 상품 조회가 아직 옛 상태를 보여 줍니다 — 잠시 뒤 다시 확인하세요.`);
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 판매상태. 상품 조회 한 번. 판매중이 아니면(품절·판매중지·판매종료) 0과 그 글자, 판매중이면 모름(null). */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter(isProductNo).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 판매자상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, products);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = products.filter((no) => rows.has(no)).map((no) => {
      const status = String(rows.get(no).slStatCd);
      return { code: no, options: [flagOption(no, status === 'SALE', STATUS_WORDS[status])] };
    });
    missing = products.filter((no) => !rows.has(no));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'lotte-on',
  displayName: LABEL,
  guard: availabilityGuard(LOTTE_ON_PAGE_GUARD, LABEL),
  dialogHosts: ['store.lotteon.com'],
  login: LOTTE_ON_LOGIN,
  send,
  read,
});
