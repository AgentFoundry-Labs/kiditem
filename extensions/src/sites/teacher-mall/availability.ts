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
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { TEACHER_MALL_LOGIN, TEACHER_MALL_PAGE_GUARD } from './index';

/**
 * 티쳐몰(퍼스트몰 selleradmin) 품절·재개·지금 재고(옛 `mall-availability-send.js` `teacher-mall` · `batchStock`, KID-256). 품절 =
 * 재고 0, 판매 재개 = 재고 999 — 판매상품 > [실물] 일괄 업데이트의 "상품코드/무게/재고 직접 업데이트"(batch_modify?mode=goodsetc)
 * 에서 [업데이트하기]가 보내는 요청 그대로다(2026-09-19 실측, 화면 코드 `batch_goods_save_submit`).
 *
 *  - 상품번호로 검색한 일괄 업데이트 화면의 폼 `goodsBatchUpdateForm`을 그대로 모아 그 상품의 `stock[옵션번호]`만 바꾸고, 화면의
 *    검색 조건을 붙여 POST `/selleradmin/goods_process/batch_goods_modify`로 보낸다.
 *  - 퍼스트몰은 재고 0이면 저절로 품절이다. 정보수정(goods/regist)으로 바꾸면 승인이 풀려 그 길은 쓰지 않는다.
 *  - 보낸 뒤 재고를 다시 읽고 상품목록의 상태가 "승인 품절"(재개면 "승인 정상")인지 본다. "미승인"이면 확인하지 않고 알린다.
 *  - 옵션이 여럿인 상품은 옵션마다 재고라 보내지 않고 알린다.
 */
const ORIGIN = 'https://shop.teacherville.co.kr';
const PAGE_URL = 'https://shop.teacherville.co.kr/selleradmin/goods/catalog';
const BATCH_PATH = '/selleradmin/goods/batch_modify';
const SAVE_PATH = '/selleradmin/goods_process/batch_goods_modify';
const CATALOG_PATH = '/selleradmin/goods/catalog';
const RESUME_STOCK = 999;
const PACE_MS = 700;
const READ_PACE_MS = 400;
const LABEL = '티쳐몰';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

const isZero = (stock: unknown) => String(stock).trim() !== '' && Number(stock) === 0;

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const wanted = resume ? String(RESUME_STOCK) : '0';
  const expectedState = resume ? '정상' : '품절';
  const warnings: string[] = [];
  let sent = 0;
  let failed = 0;
  let confirmed = 0;
  let already = 0;
  let missing = 0;
  let withOptions = 0;
  let halt: string | null = null;
  let left = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    for (let index = 0; index < codes.length; index += 1) {
      const code = codes[index]!;
      if (index > 0) await context.sleep(PACE_MS);
      const form = (await run('teacherBatchFormOnPage', [BATCH_PATH, code])) as MallJson;
      if (form?.loggedOut) {
        halt = LOGGED_OUT;
        left = codes.length - index;
        return null;
      }
      if (!form?.found) {
        if (form?.error) {
          failed += 1;
          warnings.push(`${code}: ${LABEL} 일괄 업데이트 화면을 읽지 못했습니다(${form.error}).`);
        } else {
          missing += 1;
        }
        continue;
      }
      if (form.stocks.length !== 1) {
        withOptions += 1;
        failed += 1;
        continue;
      }
      const [[option, stock]] = form.stocks as Array<[string, string]>;
      const soldOut = isZero(stock);
      if (resume ? !soldOut : soldOut) {
        already += 1;
        continue;
      }
      // [업데이트하기]가 보내는 모양 그대로 — 폼 값에서 이 상품의 재고만 바꾸고 검색 조건을 덧붙인다.
      const pairs: Array<[string, string]> = (form.pairs as Array<[string, string]>).map(([name, value]) => [name, name === `stock[${option}]` ? wanted : value]);
      for (const pair of form.search as Array<[string, string]>) pairs.push(pair);
      const answer = await run('requestOnPage', [SAVE_PATH, 'POST', 'application/x-www-form-urlencoded; charset=UTF-8', new URLSearchParams(pairs).toString()]);
      if (answer.status < 200 || answer.status >= 400 || /login|로그인/i.test(`${answer.url || ''}`)) {
        failed += 1;
        warnings.push(`${code}: ${LABEL}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
        continue;
      }
      sent += 1;
      const after = (await run('teacherBatchFormOnPage', [BATCH_PATH, code])) as MallJson;
      const status = (await run('teacherCatalogStatusOnPage', [CATALOG_PATH, code])) as MallJson;
      const stockChanged = after?.found && after.stocks.length === 1 && String(Number(after.stocks[0][1])) === wanted;
      if (status?.approval === '미승인') {
        warnings.push(`${code}: ${LABEL} 승인이 풀렸습니다(미승인) — 티쳐몰에서 확인하세요.`);
      } else if (stockChanged) {
        confirmed += 1;
        if (status?.found && status.state && status.state !== expectedState) {
          warnings.push(`${code}: 재고는 바뀌었는데 ${LABEL} 상품목록 상태가 아직 '${status.approval || ''}${status.state}'입니다.`);
        }
      }
    }
    return null;
  });
  if (halted) return halted;
  if (missing > 0) {
    failed += missing;
    warnings.push(`${missing}건은 ${LABEL}에서 찾지 못했습니다.`);
  }
  if (withOptions > 0) warnings.push(`옵션이 여럿인 상품 ${withOptions}개는 옵션마다 재고라 보내지 않았습니다 — ${LABEL}에서 옵션 재고를 고쳐 주세요.`);
  if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 재고. 상품마다 일괄 업데이트 화면 검색 한 번. 재고 0이면 품절(0), 아니면 판매 가능(모름). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{1,12}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  const found: AvailabilityProduct[] = [];
  const missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(READ_PACE_MS);
      const form = (await run('teacherBatchFormOnPage', [BATCH_PATH, products[index]])) as MallJson;
      if (form?.loggedOut) return { success: false, error: LOGGED_OUT };
      // 화면을 못 읽은 것(HTTP 오류)은 "없음"이 아니다 — 칸이 "찾지 못했습니다"로 거짓말하지 않게 실패로 돌려준다.
      if (form?.error) return { success: false, error: `${LABEL} 화면을 읽지 못했습니다(${form.error}).` };
      if (!form?.found || form.stocks.length === 0) {
        missing.push(products[index]!);
        continue;
      }
      found.push({
        code: products[index]!,
        options: (form.stocks as Array<[string, string]>).map(([option, stock]) => ({ optionCode: option, stock: isZero(stock) ? 0 : null, rocket: false })),
      });
    }
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'teacher-mall',
  displayName: LABEL,
  guard: availabilityGuard(TEACHER_MALL_PAGE_GUARD, LABEL),
  dialogHosts: ['shop.teacherville.co.kr'],
  login: TEACHER_MALL_LOGIN,
  send,
  read,
});
