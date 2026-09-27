import {
  flagOption,
  READ_LIMIT,
  registerMallAvailability,
  stoppedMidway,
  withSellerPage,
  type AvailabilityContext,
  type AvailabilityOption,
  type AvailabilityProduct,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { KKOMANGSE_LOGIN, KKOMANGSE_PAGE_GUARD } from './index';

/**
 * 꼬망세(EduPre 입점관리자) 품절·재개·지금 재고(옛 `mall-availability-send.js` `kkomangse` · `directChange`, KID-256). 품절 =
 * 재고 0, 판매 재개 = 재고 999 — 노출/재고/KC 설정 화면(`_product_mass.view.php`)의 줄마다 있는 [개별수정]이 보내는 요청
 * 그대로다(2026-09-19 실측, 화면 코드 `$('.product_view_change')`).
 *
 *  - [개별수정]은 그 줄의 지금 값을 모아 POST `_product_mass.pro.php`에 `_mode=view_direct_change`·`pcode`·`_view`·`_stock`·
 *    `_stock_control`·`_kc_yn`·`_kc_num`·`_kc_date`를 싣고 JSON `{res:"success"}`로 답한다. 지금 값은 같은 화면을 상품코드로
 *    검색해 그 줄에서 읽고, 재고만 바꾼다(노출·재고관리는 그대로).
 *  - 보낸 뒤 같은 검색으로 다시 읽어 재고가 바뀐 것을 센다.
 */
const ORIGIN = 'https://nstore.edupre.co.kr';
const PAGE_URL = 'https://nstore.edupre.co.kr/subAdmin/_product_mass.view.php';
const VIEW_PATH = '/subAdmin/_product_mass.view.php';
const CHANGE_PATH = '/subAdmin/_product_mass.pro.php';
const RESUME_STOCK = 999;
const PACE_MS = 700;
const READ_PACE_MS = 400;
const LABEL = '꼬망세';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

/** 빈 칸은 0이 아니다 — 모르는 재고를 품절로 읽지 않는다. */
const isZero = (stock: unknown) => String(stock).trim() !== '' && Number(stock) === 0;
/** 재고 칸 한 줄의 지금 상태 — 0이면 품절, 숫자가 있으면 판매중(재고 수는 싣지 않는다), 비었으면 모름. */
const stockOption = (code: string, stock: unknown): AvailabilityOption =>
  (String(stock ?? '').trim() === '' ? { optionCode: code, stock: null, rocket: false } : flagOption(code, !isZero(stock), isZero(stock) ? '품절' : null));

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? String(RESUME_STOCK) : '0';
  const warnings: string[] = [];
  let sent = 0;
  let failed = 0;
  let confirmed = 0;
  let already = 0;
  let missing = 0;
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    for (let index = 0; index < codes.length; index += 1) {
      const code = codes[index]!;
      if (index > 0) await context.sleep(PACE_MS);
      const row = (await run('kkomangseRowOnPage', [VIEW_PATH, code])) as MallJson;
      if (row?.loggedOut) {
        halt = LOGGED_OUT;
        left = codes.length - index;
        return null;
      }
      if (!row?.found) {
        if (row?.error) {
          failed += 1;
          warnings.push(`${code}: ${LABEL} 설정 화면을 읽지 못했습니다(${row.error}).`);
        } else {
          missing += 1;
        }
        continue;
      }
      const soldOut = isZero(row.stock);
      if (resume ? !soldOut : soldOut) {
        already += 1;
        continue;
      }
      // 노출·재고관리 칸을 못 읽었으면 보내지 않는다 — 빈 값을 실으면 노출이 꺼지거나 KC 정보가 지워질 수 있다.
      if (!['Y', 'N'].includes(row.view) || !['Y', 'N'].includes(row.stockControl)) {
        failed += 1;
        warnings.push(`${code}: ${LABEL} 설정 화면에서 노출 · 재고관리 값을 읽지 못해 보내지 않았습니다.`);
        continue;
      }
      // [개별수정]이 모으는 모양 그대로 — 지금 값을 싣고 재고만 바꾼다.
      const body = new URLSearchParams([
        ['_mode', 'view_direct_change'], ['pcode', code], ['_view', row.view], ['_stock', wanted],
        ['_stock_control', row.stockControl], ['_kc_yn', row.kcYn], ['_kc_num', row.kcNum], ['_kc_date', row.kcDate],
      ]);
      const answer = await run('requestOnPage', [CHANGE_PATH, 'POST', 'application/x-www-form-urlencoded; charset=UTF-8', body.toString(), { 'X-Requested-With': 'XMLHttpRequest' }]);
      if (answer.status < 200 || answer.status >= 300 || answer.json?.res !== 'success') {
        failed += 1;
        warnings.push(`${code}: ${LABEL}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
        continue;
      }
      sent += 1;
      const after = (await run('kkomangseRowOnPage', [VIEW_PATH, code])) as MallJson;
      if (after?.found && String(Number(after.stock)) === wanted) confirmed += 1;
    }
    return null;
  });
  if (halted) return halted;
  if (missing > 0) {
    failed += missing;
    warnings.push(`${missing}건은 ${LABEL}에서 찾지 못했습니다.`);
  }
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 재고. 상품마다 설정 화면 검색 한 번. 재고 0이면 품절(0), 아니면 판매 가능(모름). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품코드가 없습니다.` };
  const found: AvailabilityProduct[] = [];
  const missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(READ_PACE_MS);
      const row = (await run('kkomangseRowOnPage', [VIEW_PATH, products[index]])) as MallJson;
      if (row?.loggedOut) return { success: false, error: LOGGED_OUT };
      if (row?.error) return { success: false, error: `${LABEL} 설정 화면을 읽지 못했습니다(${row.error}).` };
      if (!row?.found) {
        missing.push(products[index]!);
        continue;
      }
      found.push({ code: products[index]!, options: [stockOption(products[index]!, row.stock)] });
    }
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'kkomangse',
  displayName: LABEL,
  guard: availabilityGuard(KKOMANGSE_PAGE_GUARD, LABEL),
  dialogHosts: ['nstore.edupre.co.kr'],
  login: KKOMANGSE_LOGIN,
  send,
  read,
});
