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
import { esmListingsGuard } from './listings';

/**
 * 지마켓·옥션(ESM Plus 상품 조회/수정, item.esmplus.com) 품절·재개·지금 상태(옛 `mall-availability-send.js` `gmarket`·`auction`
 * · `esmSellStatus`, KID-256). 품절 = 판매중지(21), 판매 재개 = 판매가능(11) — 목록의 [판매 상태 변경] → 판매중지·판매가능 창의
 * [변경]이 보내는 요청 그대로다(2026-09-19 실측, 화면 코드 `sellStatusChangeModal`). ESM은 재고를 1~99,999로만 받아 재고 0으로는
 * 품절을 못 만든다.
 *
 *  - 상품마다 PUT `/api/ea/goods/{마스터상품번호}/sellStatus`에 `{isSell:{gmkt|iac: false|true}}`, 머리 `X-G-SELLER-ID`·
 *    `X-A-SELLER-ID`(그 상품의 사이트별 판매자 아이디)를 싣는다. 사이트 결과가 0(또는 5300)이면 받은 것이다.
 *  - 지금 상태는 목록 검색 POST `/api/ea/goods/search`로 읽는다. 우리 상품코드는 사방넷이 준 `{사이트상품번호}_{마스터상품번호}`
 *    — 앞쪽 사이트상품번호로 찾는다.
 *  - 판매가능·판매중지 상품만 바꾼다. 지마켓·옥션을 한 상품으로 묶은 통합상품은 한쪽만 바꾸는 요청을 확인하지 못해 보내지 않는다.
 *  - ⚠️ 판매중지를 오래 두면 몰이 상품을 지운다(지마켓 13개월·옥션 90일 동안 상품정보를 안 고치면).
 *  - 로그인 입구 명세가 없다 — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://item.esmplus.com';
const PAGE_URL = 'https://item.esmplus.com/goods/list';
const SEARCH_PATH = '/api/ea/goods/search';
const GOODS_PATH = '/api/ea/goods/';
const BATCH_SIZE = 100;
const PACE_MS = 700;
const ESM_PACE_MS = 300;
const RECHECK_MS = 2000;
const RECHECK_TIMES = 3;
const ESM_WORDS: Record<string, string> = { 21: '판매중지', 22: '판매불가', 31: 'SKU품절', '01': '등록대기' };

export function registerEsmAvailability(mallKey: 'gmarket' | 'auction', label: string, site: 'gmkt' | 'iac'): void {
  const loggedOut = `${label}(ESM) 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

  /** ESM 상품코드(사방넷: `{사이트상품번호}_{마스터상품번호}`)에서 사이트상품번호. 모양이 틀리면 null. */
  const siteNoOf = (code: string): string | null => {
    const siteNo = String(code || '').split('_')[0]!;
    const pattern = site === 'gmkt' ? /^\d{6,12}$/ : /^[A-Z]\d{6,12}$/;
    return pattern.test(siteNo) ? siteNo : null;
  };

  /** 목록을 사이트상품번호로 찾는다(묶음마다 한 번). 이 사이트 번호로 모은다. */
  async function readItems(context: AvailabilityContext, run: PageRun, siteNos: string[]): Promise<{ loggedOut?: true; items?: Map<string, MallJson>; error?: string }> {
    const items = new Map<string, MallJson>();
    for (let start = 0; start < siteNos.length; start += BATCH_SIZE) {
      if (start > 0) await context.sleep(PACE_MS);
      const answer = (await run('esmSearchOnPage', [SEARCH_PATH, siteNos.slice(start, start + BATCH_SIZE)])) as MallJson;
      if (answer?.loggedOut) return { loggedOut: true };
      if (!Array.isArray(answer?.items)) return { error: answer?.error || '목록 검색 실패' };
      for (const item of answer.items as MallJson[]) {
        const siteNo = item?.siteGoodsNo?.[site];
        if (siteNo) items.set(String(siteNo), item);
      }
    }
    return { items };
  }

  async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
    const { codes, resume } = input;
    const wanted = resume ? '11' : '21';
    const from = resume ? '21' : '11';
    const warnings: string[] = [];
    const bySite = new Map<string, string>();
    for (const code of codes) {
      const siteNo = siteNoOf(code);
      if (siteNo) bySite.set(siteNo, code);
    }
    let failed = codes.length - bySite.size;
    if (failed > 0) warnings.push(`${failed}건은 ${label} 상품번호 모양이 아니라 보내지 않았습니다.`);
    let sent = 0;
    let confirmed = 0;
    let already = 0;
    let halt: string | null = null;
    let left = 0;
    const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
      const siteNos = [...bySite.keys()];
      if (siteNos.length === 0) return null;
      const before = await readItems(context, run, siteNos);
      if (before.loggedOut) return { success: false, error: loggedOut };
      if (!before.items) return { success: false, error: `${label} 상품을 읽지 못했습니다(${before.error}).` };
      const items = before.items;
      const found = siteNos.filter((no) => items.has(no));
      const missing = siteNos.length - found.length;
      if (missing > 0) {
        failed += missing;
        warnings.push(`${missing}건은 ${label}(ESM)에서 찾지 못했습니다.`);
      }
      const combined = found.filter((no) => items.get(no).siteGoodsNo.gmkt && items.get(no).siteGoodsNo.iac);
      if (combined.length > 0) {
        failed += combined.length;
        warnings.push(`${combined.length}건은 지마켓 · 옥션 통합상품이라 보내지 않았습니다 — ESM 에서 사이트를 골라 바꾸세요.`);
      }
      const single = found.filter((no) => !combined.includes(no));
      // 판매불가(22)·SKU품절(31)·등록대기(01)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 화면도 못 바꾼다.
      const locked = single.filter((no) => ![from, wanted].includes(items.get(no).sellStatus[site])).length;
      if (resume && locked > 0) {
        failed += locked;
        warnings.push(`${locked}건은 판매불가 · SKU품절 · 등록대기라 ${label} 화면도 판매가능으로 못 바꿉니다.`);
      }
      if (!resume) already += locked;
      const targets = single.filter((no) => items.get(no).sellStatus[site] === from);
      already += single.filter((no) => items.get(no).sellStatus[site] === wanted).length;
      const accepted: string[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const no = targets[index]!;
        const item = items.get(no);
        // 창이 만드는 모양 그대로 — 그 사이트 판매 여부 하나, 머리에는 사이트별 판매자 아이디(없으면 빈 값).
        const answer = (await run('esmSellStatusOnPage', [
          GOODS_PATH,
          item.goodsNo,
          { isSell: { [site]: resume } },
          { gmkt: encodeURIComponent(item.siteSellerId.gmkt ?? ''), iac: encodeURIComponent(item.siteSellerId.iac ?? '') },
        ])) as MallJson;
        if (answer?.loggedOut) {
          halt = loggedOut;
          left = targets.length - index;
          return null;
        }
        // 화면(createResultModel)처럼 사이트 결과 0·5300이 성공이고, 최상위 5300(노출 제한 안내)도 성공이다.
        const siteResult = answer?.[site];
        const ok = answer?.status === 200 && (answer.resultCode === 5300 || siteResult?.resultCode === 0 || siteResult?.resultCode === 5300);
        if (ok) {
          sent += 1;
          accepted.push(no);
        } else {
          failed += 1;
          const said = siteResult?.message || answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}`;
          warnings.push(`${label}이 ${no} 판매상태 변경을 받지 않았습니다: ${said}`);
        }
        await context.sleep(ESM_PACE_MS);
      }
      if (accepted.length === 0) return null;
      let seen: number | null = null;
      for (let attempt = 0; attempt <= RECHECK_TIMES; attempt += 1) {
        if (attempt > 0) await context.sleep(RECHECK_MS);
        const after = await readItems(context, run, accepted);
        if (!after.items) continue;
        seen = accepted.filter((no) => after.items!.get(no)?.sellStatus?.[site] === wanted).length;
        if (seen >= accepted.length) break;
      }
      if (seen === null) {
        warnings.push(`${label}에서 바뀐 상태를 다시 읽지 못했습니다. ESM 상품 조회/수정에서 확인하세요.`);
      } else {
        confirmed += seen;
        if (seen < accepted.length) warnings.push(`${label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — ESM 에서 확인하세요.`);
      }
      return null;
    });
    if (halted) return halted;
    if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
    return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
  }

  /** 지금 판매상태. 판매가능이면 모름(null), 아니면 0과 ESM의 말. 읽기만 한다. */
  async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
    const valid = [...new Set(codes)].filter((code) => Boolean(siteNoOf(code))).slice(0, READ_LIMIT);
    if (valid.length === 0) return { success: false, error: `읽을 ${label} 상품번호가 없습니다.` };
    let found: AvailabilityProduct[] = [];
    let missing: string[] = [];
    const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
      const bySite = new Map(valid.map((code) => [siteNoOf(code)!, code]));
      const result = await readItems(context, run, [...bySite.keys()]);
      if (result.loggedOut) return { success: false, error: loggedOut };
      if (!result.items) return { success: false, error: `${label} 상품을 읽지 못했습니다(${result.error}).` };
      const items = result.items;
      const selling = new Map([...bySite].filter(([siteNo]) => items.has(siteNo)).map(([siteNo, code]) => {
        const stat = String(items.get(siteNo).sellStatus[site]);
        return [code, stat === '11' ? true : ESM_WORDS[stat] || '판매중지'] as const;
      }));
      found = valid.filter((code) => selling.has(code)).map((code) => {
        const state = selling.get(code)!;
        return { code, options: [flagOption(code, state === true, state === true ? null : state)] };
      });
      missing = valid.filter((code) => !selling.has(code));
      return null;
    });
    if (halted) return halted;
    return { success: true, products: found, missing };
  }

  registerMallAvailability({
    mallKey,
    displayName: label,
    guard: availabilityGuard(esmListingsGuard(label), label),
    dialogHosts: ['item.esmplus.com'],
    send,
    read,
  });
}
