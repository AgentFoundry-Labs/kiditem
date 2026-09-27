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
import { THIRTYMALL_LISTINGS_GUARD } from './listings';

/**
 * 떠리몰(샵바이 파트너 어드민) 품절·재개·지금 상태(옛 `mall-availability-send.js` `thirtymall` · `shopbySaleSetting`, KID-256).
 * 품절 = 판매중지(STOP_SELLING), 판매 재개 = 판매가능(AVAILABLE_FOR_SALE) — 상품정보 조회/수정 목록의 판매설정 칸을 바꾼 것과 같은
 * 요청이다(2026-09-19, 화면 번들 putProductsSaleStatus로 확인).
 *
 *  - PUT admin-api.e-ncp.com `/products/sale-status`에 `{productNos, saleSettingStatusType}` → `{failures}`. 머리는 화면처럼
 *    accessToken(파트너 로그인 쿠키)·Version 1.0·ClientLocation(목록 화면 주소 — 없으면 403). 토큰은 화면 안에서만 쓴다.
 *  - 지금 상태는 `POST /products/search-by-key {mallNos, mallProductNos}`로 읽는다(판매설정·판매상태·품절 여부).
 *  - ⚠️ 판매금지(PROHIBITION_SALE)는 되돌릴 수 없다 — 보내지도 풀지도 않는다. 재개는 판매중지인 상품만 푼다.
 *  - 로그인 입구 명세가 없다 — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://partner.shopby.co.kr';
const API = {
  pageUrl: 'https://partner.shopby.co.kr/product/list',
  apiOrigin: 'https://admin-api.e-ncp.com',
  searchPath: '/products/search-by-key',
  updatePath: '/products/sale-status',
  clientLocation: 'https://partner-remote.shopby.co.kr/product/management/list',
  tokenCookie: 'SHOPBY_PARTNER_SESSAT',
  mallNo: 78859,
  batchSize: 50,
};
const ESM_PACE_MS = 300;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
const LABEL = '떠리몰';
const LOGGED_OUT = `${LABEL} 파트너 어드민 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

const isProductNo = (code: string) => /^\d{6,12}$/.test(code);

async function readRows(context: AvailabilityContext, run: PageRun, codes: string[]): Promise<{ loggedOut?: true; rows?: Map<string, MallJson>; error?: string }> {
  const rows = new Map<string, MallJson>();
  for (let start = 0; start < codes.length; start += API.batchSize) {
    const group = codes.slice(start, start + API.batchSize);
    const answer = (await run('shopbyApiOnPage', [API, 'search', { mallNos: [API.mallNo], mallProductNos: group }])) as MallJson;
    if (answer?.loggedOut) return { loggedOut: true };
    if (!Array.isArray(answer?.rows)) return { error: answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}` };
    for (const row of answer.rows as MallJson[]) if (row.mallNo === API.mallNo && group.includes(row.no)) rows.set(row.no, row);
    if (start + API.batchSize < codes.length) await context.sleep(ESM_PACE_MS);
  }
  return { rows };
}

/** 상품 한 줄의 지금 모습 — 살 수 있으면 true, 아니면 몰의 말(판매중지·판매금지·품절 …). */
export function shopbyWord(row: MallJson): true | string {
  const apply = String(row.applyStatusType ?? '');
  if (/REJECTION$/.test(apply)) return '승인거부';
  if (/READY$/.test(apply)) return '승인대기';
  if (row.saleSettingStatusType === 'PROHIBITION_SALE') return '판매금지';
  if (row.saleSettingStatusType === 'STOP_SELLING') return '판매중지';
  if (row.saleStatusType === 'END_SALE') return '판매종료';
  if (row.saleStatusType === 'WAITING_SALE') return '판매대기';
  if (row.isSoldOut) return '품절';
  if (row.saleSettingStatusType === 'AVAILABLE_FOR_SALE' && ['ON_SALE', 'ON_PRE_SALE'].includes(row.saleStatusType)) return true;
  return '확인필요';
}

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? 'AVAILABLE_FOR_SALE' : 'STOP_SELLING';
  const warnings: string[] = [];
  const products = [...new Set(codes)].filter(isProductNo);
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, API.pageUrl, async (run): Promise<AvailabilitySendAnswer | null> => {
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
    const row = (code: string) => rows.get(code);
    let targets: string[];
    if (resume) {
      // 판매중지만 푼다. 판매금지는 몰이 막은 것이라(되돌릴 수 없는 상태) 풀지 않는다.
      targets = found.filter((code) => row(code).saleSettingStatusType === 'STOP_SELLING');
      const selling = found.filter((code) => shopbyWord(row(code)) === true);
      already += selling.length;
      const prohibited = found.filter((code) => row(code).saleSettingStatusType === 'PROHIBITION_SALE').length;
      const stockOut = found.filter((code) => row(code).saleSettingStatusType === 'AVAILABLE_FOR_SALE' && shopbyWord(row(code)) === '품절').length;
      const other = found.length - targets.length - selling.length - prohibited - stockOut;
      if (prohibited > 0) {
        failed += prohibited;
        warnings.push(`${prohibited}건은 ${LABEL}이 판매금지한 상품이라 풀지 않았습니다 — 파트너 어드민에서 까닭을 확인하세요.`);
      }
      if (stockOut > 0) {
        failed += stockOut;
        warnings.push(`${stockOut}건은 재고가 없어 품절입니다 — 판매 재개로 풀리지 않습니다.`);
      }
      if (other > 0) {
        failed += other;
        warnings.push(`${other}건은 ${LABEL}에서 판매중지가 아니라(판매종료 · 승인 전 등) 풀 것이 없습니다.`);
      }
    } else {
      // 살 수 있는 상품만 멈춘다. 판매중지·판매금지·품절·판매종료·승인 전은 이미 못 산다.
      targets = found.filter((code) => shopbyWord(row(code)) === true);
      already += found.length - targets.length;
    }
    const accepted: string[] = [];
    for (let start = 0; start < targets.length; start += API.batchSize) {
      const group = targets.slice(start, start + API.batchSize);
      // 화면 목록처럼 상품번호를 숫자로 싣는다(샵바이 상품번호는 안전한 정수 범위다).
      const answer = (await run('shopbyApiOnPage', [API, 'status', { productNos: group.map((code) => Number(code)), saleSettingStatusType: wanted }])) as MallJson;
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = targets.length - start;
        return null;
      }
      if (!Array.isArray(answer?.failures)) {
        failed += group.length;
        warnings.push(`${LABEL}이 판매설정 변경을 받지 않았습니다: ${answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}`}`);
        continue;
      }
      const failures = answer.failures as Array<{ no?: string; message?: string }>;
      const refused = new Set(failures.map((entry) => entry.no).filter(Boolean));
      const ok = group.filter((code) => !refused.has(code));
      sent += ok.length;
      accepted.push(...ok);
      const said = failures.map((entry) => entry.message).filter(Boolean).slice(0, 2).join(' / ');
      if (ok.length < group.length) {
        failed += group.length - ok.length;
        warnings.push(`${LABEL}이 ${group.length}건 중 ${group.length - ok.length}건을 바꾸지 않았습니다${said ? ` — ${said}` : ''}.`);
      }
      // 실패 줄에 상품번호가 없으면 어느 상품인지 모른다 — 보낸 것으로 두고 다시 읽어 확인한다.
      const unnamed = failures.filter((entry) => !entry.no).length;
      if (unnamed > 0) warnings.push(`${LABEL}이 ${unnamed}건 실패를 알렸습니다${said ? ` — ${said}` : ''}. 다시 읽어 확인합니다.`);
      if (start + API.batchSize < targets.length) await context.sleep(ESM_PACE_MS);
    }
    if (accepted.length === 0) return null;
    let seen: number | null = null;
    for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const after = await readRows(context, run, accepted);
      if (!after.rows) continue;
      seen = accepted.filter((code) => after.rows!.get(code)?.saleSettingStatusType === wanted).length;
      // 재개했는데 재고가 없으면 판매가능이어도 품절로 보인다 — 마지막으로 읽은 한 번만 말한다.
      if (resume && (seen >= accepted.length || attempt === RECHECK_TIMES)) {
        const stockOut = accepted.filter((code) => after.rows!.get(code)?.isSoldOut === true).length;
        if (stockOut > 0) warnings.push(`${stockOut}건은 재고가 없어 판매 재개 뒤에도 ${LABEL}에 품절로 보입니다.`);
      }
      if (seen >= accepted.length) break;
    }
    if (seen === null) {
      warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다. 상품정보 조회/수정에서 확인하세요.`);
    } else {
      confirmed += seen;
      if (seen < accepted.length) warnings.push(`${LABEL} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품정보 조회/수정에서 확인하세요.`);
    }
    return null;
  });
  if (halted) return halted;
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 상태. 판매가능·판매중이고 재고가 있으면 살 수 있고(모름), 아니면 0과 몰의 말이다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const valid = [...new Set(codes)].filter(isProductNo).slice(0, READ_LIMIT);
  if (valid.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, API.pageUrl, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readRows(context, run, valid);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.rows) return { success: false, error: `${LABEL} 상품을 읽지 못했습니다(${result.error}).` };
    const rows = result.rows;
    found = valid.filter((code) => rows.has(code)).map((code) => {
      const word = shopbyWord(rows.get(code));
      return { code, options: [flagOption(code, word === true, word === true ? null : word)] };
    });
    missing = valid.filter((code) => !rows.has(code));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'thirtymall',
  displayName: LABEL,
  guard: availabilityGuard(THIRTYMALL_LISTINGS_GUARD, LABEL),
  dialogHosts: ['partner.shopby.co.kr'],
  send,
  read,
});
