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
import { SMARTSTORE_LISTINGS_GUARD } from './listings';

/**
 * 네이버 스마트스토어센터 품절·재개·지금 상태(옛 `mall-availability-send.js` `smartstore` · `naverStatus`, KID-256). 품절 =
 * 판매중지(SUSPENSION), 판매 재개 = 판매중(SALE) — 목록의 판매상태 변경이 보내는 요청 그대로다(2026-09-19, 공개 번들 app.js로
 * 확인).
 *
 *  - PATCH `/api/products/bulk-update?_action=updateProductStatusType`에 `{productNos:[원상품번호], productStatusType,
 *    productBulkUpdateType}`. 답이 `STARTED`면 비동기라 결과(`getBulkUpdateProgressResult`)를 끝날 때까지 묻는다.
 *    `ALREADY_PROGRESS`·`BUSY`는 받지 않은 것이다.
 *  - 요청은 화면 자신의 Angular `$http`로 보낸다 — 화면 인터셉터가 붙이는 머리가 그대로 실린다. 그래서 화면 안(MAIN)에서 부른다.
 *  - 지금 상태는 목록 검색(상품번호 여럿을 쉼표로)으로 읽는다. 우리 상품코드가 채널상품번호인지 원상품번호인지 몰라 채널상품번호로
 *    먼저 찾고, 못 찾은 것은 원상품번호로 찾는다.
 *  - 판매중인 상품만 멈추고, 해제는 판매중지인 상품만 푼다 — 재고가 없으면 네이버가 품절로 둔다.
 *  - 로그인 입구 명세가 없다 — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://sell.smartstore.naver.com';
const PAGE_URL = 'https://sell.smartstore.naver.com/#/products/origin-list';
const SEARCH_PATH = '/api/products/list/search';
const UPDATE_PATH = '/api/products/bulk-update?_action=updateProductStatusType';
const PROGRESS_PATH = '/api/products/bulk-update?_action=getBulkUpdateProgressResult';
const BATCH_SIZE = 50;
const PACE_MS = 700;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
/** 일괄변경은 비동기다 — 결과가 나올 때까지 화면처럼 1초·3초·5초 간격으로 묻는다(최대 이만큼). */
const PROGRESS_WAITS_MS = [1000, 1000, 1000, 3000, 3000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
const LABEL = '스마트스토어';
const LOGGED_OUT = `${LABEL}센터 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
const NAVER_WORDS: Record<string, string> = { OUTOFSTOCK: '품절', SUSPENSION: '판매중지', WAIT: '판매대기', CLOSE: '판매종료', PROHIBITION: '판매금지' };

/** 목록을 상품번호로 찾는다 — 채널상품번호로 먼저, 못 찾은 것은 원상품번호로. 우리 코드마다 그 원상품 줄을 모은다. */
async function readRows(context: AvailabilityContext, run: PageRun, codes: string[]): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; error?: string }> {
  const rows = new Map<string, MallJson>();
  for (const keywordType of ['CHANNEL_PRODUCT_NO', 'PRODUCT_NO']) {
    const left = codes.filter((code) => !rows.has(code));
    for (let start = 0; start < left.length; start += BATCH_SIZE) {
      const group = left.slice(start, start + BATCH_SIZE);
      const answer = (await run('smartstoreApiOnPage', ['search', SEARCH_PATH, {
        searchKeywordType: keywordType,
        searchKeyword: group.join(','),
        searchOrderType: 'REG_DATE',
        page: 0,
        size: Math.max(20, group.length),
      }], 'main')) as MallJson;
      if (answer?.loggedOut) return { loggedOut: true };
      if (!Array.isArray(answer?.rows)) return { error: answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}` };
      for (const row of answer.rows as MallJson[]) {
        for (const code of group) if (row.id === code || row.channelProductNos.includes(code)) rows.set(code, row);
      }
      await context.sleep(PACE_MS);
    }
  }
  return { rows };
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? 'SALE' : 'SUSPENSION';
  const warnings: string[] = [];
  const products = [...new Set(codes)].filter((code) => /^\d{6,15}$/.test(code));
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
    const found = products.filter((code) => rows.has(code));
    const missing = products.length - found.length;
    if (missing > 0) {
      failed += missing;
      warnings.push(`${missing}건은 ${LABEL}에서 찾지 못했습니다.`);
    }
    const stat = (code: string) => rows.get(code).productStatusType;
    let targets: string[];
    if (resume) {
      targets = found.filter((code) => stat(code) === 'SUSPENSION');
      already += found.filter((code) => stat(code) === 'SALE').length;
      const other = found.filter((code) => !['SALE', 'SUSPENSION'].includes(stat(code))).length;
      if (other > 0) {
        failed += other;
        warnings.push(`${other}건은 ${LABEL}에서 판매중지가 아니라(품절 · 판매대기 · 판매종료 등) 풀 것이 없습니다.`);
      }
    } else {
      // 판매중(SALE)만 멈춘다. 품절(재고 0)·판매중지·판매대기·판매종료·판매금지는 이미 못 산다.
      targets = found.filter((code) => stat(code) === 'SALE');
      already += found.length - targets.length;
    }
    // 원상품번호로 보낸다. 같은 원상품을 가리키는 코드가 여럿이면 한 번만.
    const origin = new Map<string, string>();
    for (const code of targets) origin.set(rows.get(code).id, code);
    const originNos = [...origin.keys()];
    const accepted: string[] = [];
    for (let start = 0; start < originNos.length; start += BATCH_SIZE) {
      const group = originNos.slice(start, start + BATCH_SIZE);
      // 화면 목록의 번호처럼 숫자로 싣는다(원상품번호는 안전한 정수 범위다).
      const answer = (await run('smartstoreApiOnPage', ['status', UPDATE_PATH, {
        productNos: group.map((no) => (/^\d{1,15}$/.test(no) ? Number(no) : no)),
        productStatusType: wanted,
        productBulkUpdateType: wanted,
      }], 'main')) as MallJson;
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = originNos.length - start;
        return null;
      }
      if (answer?.state !== 'STARTED') {
        failed += group.length;
        const said = answer?.state === 'ALREADY_PROGRESS'
          ? '이미 수정중인 상품이 있습니다. 잠시 후 다시 보내세요.'
          : answer?.state === 'BUSY'
            ? '스마트스토어에 진행중 작업이 많습니다. 잠시 후 다시 보내세요.'
            : answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}`;
        warnings.push(`${LABEL}이 판매상태 변경을 받지 않았습니다: ${said}`);
        continue;
      }
      // 비동기 결과 — 화면처럼 끝날 때까지 묻는다.
      let result: MallJson = null;
      for (const waitMs of PROGRESS_WAITS_MS) {
        await context.sleep(waitMs);
        const progress = (await run('smartstoreApiOnPage', ['progress', PROGRESS_PATH, null], 'main')) as MallJson;
        if (progress?.loggedOut) {
          // 일괄변경은 이미 시작됐다 — 이 묶음은 보낸 것으로 두고(확인은 못 함) 멈춘다.
          sent += group.length;
          accepted.push(...group.map((no) => origin.get(no)!));
          halt = LOGGED_OUT;
          left = originNos.length - start - group.length;
          return null;
        }
        if (progress?.completed === true) {
          result = progress;
          break;
        }
        if (progress?.completed === null || progress?.state === 'ALREADY_PROGRESS') break;
      }
      if (!result) {
        warnings.push(`${LABEL} 일괄변경 결과를 끝까지 받지 못했습니다 — 목록을 다시 읽어 확인합니다.`);
        accepted.push(...group.map((no) => origin.get(no)!));
        sent += group.length;
        continue;
      }
      if (result.errorMessage) {
        failed += group.length;
        warnings.push(`${LABEL}: ${result.errorMessage}`);
        continue;
      }
      // 결과에는 작업 번호가 없다 — 우리 묶음 번호가 하나도 없으면 다른 작업의 결과로 보고 목록으로 확인한다.
      const successIds: string[] | null = Array.isArray(result.successIds) ? result.successIds.map(String) : null;
      if (successIds && !group.some((no) => successIds.includes(String(no)))) {
        warnings.push(`${LABEL} 일괄변경 결과가 이 묶음과 맞지 않아 목록을 다시 읽어 확인합니다.`);
        accepted.push(...group.map((no) => origin.get(no)!));
        sent += group.length;
        continue;
      }
      const ok = successIds ? group.filter((no) => successIds.includes(String(no))) : group;
      sent += ok.length;
      accepted.push(...ok.map((no) => origin.get(no)!));
      if (ok.length < group.length) {
        failed += group.length - ok.length;
        const said = result.failures?.length ? ` — ${result.failures.join(' / ')}` : '';
        warnings.push(`${LABEL}이 ${group.length}건 중 ${group.length - ok.length}건을 바꾸지 않았습니다${said}.`);
      }
    }
    if (accepted.length === 0) return null;
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, accepted);
      if (!after.rows) continue;
      seen = accepted.filter((code) => after.rows!.get(code)?.productStatusType === wanted).length;
      if (resume) {
        const outOfStock = accepted.filter((code) => after.rows!.get(code)?.productStatusType === 'OUTOFSTOCK').length;
        if (outOfStock > 0 && attempt === RECHECK_TIMES) warnings.push(`${outOfStock}건은 재고가 없어 ${LABEL}이 판매중 대신 품절로 두었습니다.`);
      }
      if (seen >= accepted.length) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 조회/수정에서 확인하세요.`);
    } else {
      confirmed += seen;
      if (seen < accepted.length) warnings.push(`${LABEL} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품 조회/수정에서 확인하세요.`);
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 판매상태. 판매중이면 모름(null), 아니면 0과 네이버의 말. 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const valid = [...new Set(codes)].filter((code) => /^\d{6,15}$/.test(code)).slice(0, READ_LIMIT);
  if (valid.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, valid);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = valid.filter((code) => rows.has(code)).map((code) => {
      const stat = String(rows.get(code).productStatusType);
      return { code, options: [flagOption(code, stat === 'SALE', stat === 'SALE' ? null : NAVER_WORDS[stat] || '판매중지')] };
    });
    missing = valid.filter((code) => !rows.has(code));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'smartstore',
  displayName: LABEL,
  guard: availabilityGuard(SMARTSTORE_LISTINGS_GUARD, LABEL),
  dialogHosts: ['sell.smartstore.naver.com'],
  send,
  read,
});
