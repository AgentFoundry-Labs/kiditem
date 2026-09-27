import {
  observedUrlOf,
  priceNumber,
  READ_LIMIT,
  registerMallAvailability,
  withSellerPage,
  type AvailabilityContext,
  type AvailabilityProduct,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
  type PageRun,
  type PriceSendAnswer,
} from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { KAKAO_LISTINGS_GUARD } from './listings';

/**
 * 카카오 톡스토어 품절·재개·가격·지금 재고(옛 `mall-availability-send.js` `kakao` · `gridStock`, KID-256). 품절 = 재고 0 —
 * 판매자센터 상품조회의 [선택 수정]이 보내는 요청 그대로다(PUT /api/tstore/products/grid/columns, 2026-09-19 실측). 판매상태
 * 품절(OUT_OF_STOCK)은 재고 0이면 저절로 된다.
 *
 *  - [선택 수정]은 상품마다 {productId, name, salePrice, storeManagementCode, stockQuantity, displayStatus}를 한 배열로 보낸다.
 *    지금 값을 목록 API(GET /api/tstore/products?productIds=)로 읽어 그대로 싣고 재고(가격이면 판매가)만 바꾼다.
 *  - 옵션이 있는 상품(optionSetting 설정)은 이 칸으로 재고·가격을 못 고친다 — 보내지 않고 알린다.
 *  - 해제는 재고 0인 상품에만 999. 보낸 뒤 목록 API로 다시 읽어 확인한다.
 *  - 로그인 입구 명세가 없다 — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://shopping-seller.kakao.com';
const PAGE_URL = 'https://shopping-seller.kakao.com/product/store-seller/list';
const LIST_PATH = '/api/tstore/products';
const GRID_PATH = '/api/tstore/products/grid/columns';
const RESUME_QUANTITY = 999;
const PACE_MS = 400;
const LABEL = '카카오 톡스토어';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

/** 상품 하나를 목록 API로 읽는다. 없으면 null, 로그인이 풀렸으면 `loggedOut`. */
async function readProduct(run: PageRun, productId: string): Promise<{ loggedOut?: true; product?: MallJson | null; error?: string }> {
  const answer = await run('requestOnPage', [`${LIST_PATH}?productIds=${encodeURIComponent(productId)}&size=1&page=0`, 'GET', null, null]);
  if (answer.status === 401 || answer.status === 403 || /login|xauth|accounts\.kakao/i.test(`${answer.url ?? ''} ${answer.preview ?? ''}`)) return { loggedOut: true };
  if (answer.status !== 200 || !Array.isArray(answer.json?.contents)) return { error: `HTTP ${answer.status}` };
  return { product: answer.json.contents.find((row: MallJson) => String(row.id) === String(productId)) || null };
}

const hasOptions = (product: MallJson) => Boolean(product.optionSetting && product.optionSetting !== '미설정');

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const quantity = resume ? RESUME_QUANTITY : 0;
  const warnings: string[] = [];
  const products = codes.filter((code) => /^\d{1,15}$/.test(code));
  let failed = codes.length - products.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  let withOptions = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    const targets: MallJson[] = [];
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(PACE_MS);
      const read = await readProduct(run, products[index]!);
      if (read.loggedOut) return { success: false, error: LOGGED_OUT };
      if (!read.product) {
        failed += 1;
        warnings.push(`${products[index]}: ${LABEL}에서 찾지 못했습니다${read.error ? `(${read.error})` : ''}.`);
        continue;
      }
      if (hasOptions(read.product)) {
        withOptions += 1;
        failed += 1;
        continue;
      }
      const stock = Number(read.product.stockQuantity);
      if (!(resume ? stock === 0 : stock !== 0)) {
        already += 1;
        continue;
      }
      targets.push(read.product);
    }
    if (targets.length === 0) return null;
    // [선택 수정]이 만드는 모양 그대로 — 지금 값을 그대로 싣고 재고만 바꾼다.
    const edits = targets.map((product) => ({
      name: product.name,
      salePrice: product.salePrice,
      storeManagementCode: product.storeManagementCode ?? '',
      stockQuantity: quantity,
      productId: product.id,
      displayStatus: product.displayStatusType,
    }));
    const answer = await run('requestOnPage', [GRID_PATH, 'PUT', 'application/json', JSON.stringify(edits)]);
    if (answer.status < 200 || answer.status >= 300) {
      failed += targets.length;
      const reason = answer.json?.message || answer.json?.errorMessage || '';
      warnings.push(`${LABEL}이 재고 변경을 받지 않았습니다(HTTP ${answer.status})${reason ? `: ${String(reason).slice(0, 120)}` : ''}.`);
      return null;
    }
    // 몰이 받은 건수를 주면 그만큼만 보낸 것으로 센다(없으면 묶음 전체).
    const counted = Number.isSafeInteger(answer.json?.successCount) ? Math.max(0, Math.min(answer.json.successCount, targets.length)) : null;
    sent += counted ?? targets.length;
    if (counted !== null && counted < targets.length) {
      failed += targets.length - counted;
      warnings.push(`${LABEL}이 ${targets.length}건 중 ${counted}건만 바꿨다고 답했습니다.`);
    }
    for (const product of targets) {
      await context.sleep(PACE_MS);
      const after = await readProduct(run, String(product.id));
      if (after.product && Number(after.product.stockQuantity) === quantity) confirmed += 1;
    }
    return null;
  });
  if (halted) return halted;
  if (withOptions > 0) warnings.push(`옵션이 있는 상품 ${withOptions}개는 옵션마다 재고라 보내지 않았습니다 — ${LABEL}에서 옵션 재고를 고쳐 주세요.`);
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/**
 * 가격: [선택 수정]과 같은 모양으로 지금 값(상품명·관리코드·재고·전시상태)을 그대로 싣고 판매가만 바꿔 보낸 뒤, 다시 읽어
 * 판매가가 바뀐 것을 센다. 같은 가격도 보낸다 — 가격 경로를 몰에서 확인하는 시험이 같은 가격 다시 보내기다(사장님 2026-09-19).
 * 화면이 본 몰 가격(ifPrice)과 지금 몰 가격이 다르면 덮어쓰지 않는다.
 */
async function sendPrice(context: AvailabilityContext, items: Array<{ code: string; price: number; ifPrice: number | null }>): Promise<PriceSendAnswer> {
  const warnings: string[] = [];
  const valid = items.filter((item) => /^\d{1,15}$/.test(item.code));
  let failed = items.length - valid.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let withOptions = 0;
  let submissionAttempted = false;
  const results: NonNullable<PriceSendAnswer['results']> = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run, page): Promise<PriceSendAnswer | null> => {
    const targets: Array<{ product: MallJson; price: number }> = [];
    for (let index = 0; index < valid.length; index += 1) {
      if (index > 0) await context.sleep(PACE_MS);
      const item = valid[index]!;
      const read = await readProduct(run, item.code);
      if (read.loggedOut) return { success: false, error: LOGGED_OUT };
      if (!read.product) {
        failed += 1;
        warnings.push(`${item.code}: ${LABEL}에서 찾지 못했습니다${read.error ? `(${read.error})` : ''}.`);
        continue;
      }
      if (hasOptions(read.product)) {
        withOptions += 1;
        failed += 1;
        continue;
      }
      const current = priceNumber(read.product.salePrice);
      if (item.ifPrice !== null && current !== item.ifPrice) {
        failed += 1;
        warnings.push(`${item.code}: ${LABEL} 가격이 그사이 ${Number.isFinite(current) ? `${current.toLocaleString('ko-KR')}원` : '모르는 값'}으로 바뀌어 보내지 않았습니다. 몰 상품을 다시 가져온 뒤 보내세요.`);
        continue;
      }
      targets.push({ product: read.product, price: item.price });
    }
    if (targets.length === 0) return null;
    // 판매가는 읽은 값과 같은 형(숫자·글자)으로.
    const edits = targets.map(({ product, price }) => ({
      name: product.name,
      salePrice: typeof product.salePrice === 'number' ? price : String(price),
      storeManagementCode: product.storeManagementCode ?? '',
      stockQuantity: product.stockQuantity,
      productId: product.id,
      displayStatus: product.displayStatusType,
    }));
    submissionAttempted = true;
    const answer = await run('requestOnPage', [GRID_PATH, 'PUT', 'application/json', JSON.stringify(edits)]);
    if (answer.status < 200 || answer.status >= 300) {
      failed += targets.length;
      const reason = answer.json?.message || answer.json?.errorMessage || '';
      warnings.push(`${LABEL}이 가격 변경을 받지 않았습니다(HTTP ${answer.status})${reason ? `: ${String(reason).slice(0, 120)}` : ''}.`);
      return null;
    }
    const counted = Number.isSafeInteger(answer.json?.successCount) ? Math.max(0, Math.min(answer.json.successCount, targets.length)) : null;
    sent += counted ?? targets.length;
    if (counted !== null && counted < targets.length) {
      failed += targets.length - counted;
      warnings.push(`${LABEL}이 ${targets.length}건 중 ${counted}건만 바꿨다고 답했습니다.`);
    }
    for (const { product, price } of targets) {
      await context.sleep(PACE_MS);
      const after = await readProduct(run, String(product.id));
      const now = after.product ? priceNumber(after.product.salePrice) : null;
      const before = priceNumber(product.salePrice);
      const ok = now === price;
      if (ok) confirmed += 1;
      const observedUrl = after.product && String(after.product.salePrice ?? '').trim() !== '' && Number.isFinite(now) ? await observedUrlOf(page, ORIGIN) : null;
      results.push({
        code: String(product.id),
        before: Number.isFinite(before) ? before : null,
        after: now !== null && Number.isFinite(now) ? now : null,
        confirmed: ok,
        ...(observedUrl ? { observedUrl } : {}),
      });
    }
    return null;
  });
  if (halted) return { ...halted, submissionAttempted };
  if (withOptions > 0) warnings.push(`옵션이 있는 상품 ${withOptions}개는 옵션마다 가격이라 보내지 않았습니다 — ${LABEL}에서 옵션 가격을 고쳐 주세요.`);
  return { success: true, sent, failed, confirmed, results, warnings, submissionAttempted };
}

/** 지금 재고. 상품마다 목록 API 한 번. 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter((code) => /^\d{1,15}$/.test(code)).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 상품번호가 없습니다.` };
  const found: AvailabilityProduct[] = [];
  const missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(PACE_MS);
      const result = await readProduct(run, products[index]!);
      if (result.loggedOut) return { success: false, error: LOGGED_OUT };
      if (!result.product) {
        missing.push(products[index]!);
        continue;
      }
      found.push({ code: products[index]!, options: [{ optionCode: String(result.product.id), stock: Number(result.product.stockQuantity), rocket: false }] });
    }
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'kakao',
  displayName: LABEL,
  guard: availabilityGuard(KAKAO_LISTINGS_GUARD, LABEL),
  dialogHosts: ['shopping-seller.kakao.com'],
  send,
  read,
  sendPrice,
});
