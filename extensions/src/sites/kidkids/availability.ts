import {
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
import { KIDKIDS_LOGIN, KIDKIDS_PAGE_GUARD } from './index';

/**
 * 키드키즈 파트너센터(EUC-KR PHP) 품절·재개·지금 상태(옛 `mall-availability-send.js` `kidkids` · `useFlag`, KID-256). 품절 =
 * 일시품절(use_flag N), 판매 재개 = 품절해제(Y) — 상품관리 목록에서 상품코드로 검색해 그 줄을 고르고 [일시품절]·[품절해제]를
 * 누른 것과 같다(2026-09-19 실측, 화면 코드 `changeUseFlag`: `commitType=change_use_flag`·`use_flag`를 채워 목록 폼 전체를 숨은
 * 창으로 `./proc_logis.htm`에 보낸다).
 *
 *  - 목록은 수정일 순 동률이라 쪽을 넘겨선 못 찾는다 — 상품코드 검색으로 그 줄만 띄운다.
 *  - 폼에 한글이 같이 실리므로 화면처럼 EUC-KR로 폼을 제출한다(숨은 창, 스크립트는 막은 채).
 *  - "품절상품" 칸이 판매(정상)·품절(일시품절)이다. 세금 구분이 비어 있는 상품은 화면도 막는다.
 *  - 보낸 뒤 같은 검색으로 다시 읽어 확인한다.
 */
const ORIGIN = 'https://partner.kidkids.net';
const PAGE_URL = 'https://partner.kidkids.net/sales/goods_list_renewal.htm?pNum=1';
const LIST_PATH = '/sales/goods_list_renewal.htm';
const SAVE_PATH = '/sales/proc_logis.htm';
const PACE_MS = 700;
const READ_PACE_MS = 200;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
const LABEL = '키드키즈';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

const isGoodsCode = (code: string) => /^\d{3,10}$/.test(code);
const readRow = async (run: PageRun, code: string) => (await run('kidkidsRowOnPage', [LIST_PATH, code])) as MallJson;

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? '판매' : '품절';
  const from = resume ? '품절' : '판매';
  const warnings: string[] = [];
  const products = [...new Set(codes)].filter(isGoodsCode);
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품코드 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  const notFound: string[] = [];
  const other: string[] = [];
  const noTax: string[] = [];
  const accepted: string[] = [];
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    for (let index = 0; index < products.length; index += 1) {
      const code = products[index]!;
      if (index > 0) await context.sleep(PACE_MS);
      const row = await readRow(run, code);
      if (row?.loggedOut) {
        halt = LOGGED_OUT;
        left = products.length - index;
        return null;
      }
      if (row?.error) {
        failed += 1;
        warnings.push(`${code}: ${LABEL} 목록을 읽지 못했습니다(${row.error}).`);
        continue;
      }
      if (!row?.found) {
        failed += 1;
        notFound.push(code);
        continue;
      }
      // 판매 재개는 품절 → 판매, 품절은 판매 → 품절. 품절이면 이미 못 사고, 그 밖의 글자는 건드리지 않는다.
      if (row.word === wanted) {
        already += 1;
        continue;
      }
      if (row.word !== from) {
        failed += 1;
        other.push(`${code}(${row.word || '?'})`);
        continue;
      }
      if (!row.taxType) {
        // 화면도 막는다(chkTaxFlag: "세금 구분이 미 등록된 상품이 있습니다").
        failed += 1;
        noTax.push(code);
        continue;
      }
      const pairs = (row.pairs as Array<[string, string]>).map(([name, value]): [string, string] => {
        if (name === 'commitType') return [name, 'change_use_flag'];
        if (name === 'use_flag') return [name, resume ? 'Y' : 'N'];
        return [name, value];
      });
      const answer = (await run('kidkidsSaveOnPage', [SAVE_PATH, pairs])) as MallJson;
      if (answer?.loggedOut) {
        halt = LOGGED_OUT;
        left = products.length - index;
        return null;
      }
      if (answer?.status !== 200) {
        failed += 1;
        warnings.push(`${code}: ${LABEL}이 받지 않았습니다(${answer?.error || `HTTP ${answer?.status ?? 0}`}).`);
        continue;
      }
      sent += 1;
      accepted.push(code);
      if (answer.alert && /실패|오류|권한|불가|없습니다/.test(answer.alert)) warnings.push(`${code}: ${LABEL} 답 "${answer.alert}"`);
    }
    // 다시 검색해 확인한다(같은 탭에서).
    let pending = [...accepted];
    for (let attempt = 0; attempt <= RECHECK_TIMES && pending.length > 0; attempt += 1) {
      if (attempt > 0) await context.sleep(RECHECK_MS);
      const still: string[] = [];
      for (const code of pending) {
        const row = await readRow(run, code);
        if (row?.found && row.word === wanted) confirmed += 1;
        else still.push(code);
      }
      pending = still;
    }
    if (pending.length > 0) warnings.push(`${LABEL} 목록이 ${pending.length}건을 아직 옛 상태로 보여 줍니다 — 상품관리에서 확인하세요.`);
    return null;
  });
  if (halted) return halted;
  if (notFound.length > 0) warnings.push(`${notFound.length}건은 ${LABEL}에서 찾지 못했습니다.`);
  if (other.length > 0) warnings.push(`${other.length}건은 ${LABEL}에서 ${from}이 아니라 바꾸지 않았습니다: ${other.slice(0, 5).join(', ')}`);
  if (noTax.length > 0) warnings.push(`${noTax.length}건은 ${LABEL} 세금 구분이 미등록이라 화면도 바꾸지 못합니다: ${noTax.slice(0, 5).join(', ')}`);
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 상태 — 상품마다 코드 검색. 품절이면 0과 그 글자, 판매면 모름(null). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter(isGoodsCode).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품코드가 없습니다.` };
  const found: AvailabilityProduct[] = [];
  const missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(READ_PACE_MS);
      const code = products[index]!;
      const row = await readRow(run, code);
      if (row?.loggedOut) return { success: false, error: LOGGED_OUT };
      if (row?.error) return { success: false, error: `${LABEL} 목록을 읽지 못했습니다(${row.error}).` };
      if (!row?.found) {
        missing.push(code);
        continue;
      }
      const selling = row.word === '판매';
      found.push({ code, options: [{ optionCode: code, stock: selling ? null : 0, rocket: false, ...(selling ? {} : { state: row.word || '품절' }) }] });
    }
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'kidkids',
  displayName: LABEL,
  guard: availabilityGuard(KIDKIDS_PAGE_GUARD, LABEL),
  dialogHosts: ['partner.kidkids.net'],
  login: KIDKIDS_LOGIN,
  send,
  read,
});
