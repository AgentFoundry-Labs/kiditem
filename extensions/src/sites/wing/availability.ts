import {
  READ_LIMIT,
  registerMallAvailability,
  withSellerPage,
  type AvailabilityContext,
  type AvailabilityProduct,
  type AvailabilityReadAnswer,
  type AvailabilitySendAnswer,
  type MallJson,
  type PageRun,
} from '../mall-write/availability';
import { WING_LOGIN } from './login';
import { WING_IDENTITY_FILE, WING_WRITE_GUARD } from './registration';

/**
 * 쿠팡 윙 품절·재개·지금 재고(옛 `mall-availability-send.js` `coupang` · `sendByOptionStock` · `readByOptionStock`, KID-256).
 * 품절 = 옵션 재고수량 0 — 윙 상품목록의 재고수량 칸을 고치면 보내는 것과 같은 요청이다(실측 2026-09-18, 화면 코드
 * `app/listV3.js`). 윙에서 품절과 판매중지는 다르다: 품절은 판매중인 채로 '품절'로 보이고 재고를 넣으면 다시 팔린다.
 *
 *  - 옵션 단위다. 등록상품ID로 옵션 목록을 읽어 `vendorInventoryItemId`를 얻고, 짚은 옵션(옵션ID = vendorItemId)만
 *    `stock-manager/remain-change/request`에 `stockManageItems={"dtos":[…]}`로 보낸다. 해제는 재고 0인 옵션에만 999.
 *  - 로켓그로스(RFM) 옵션은 쿠팡 재고라 윙 화면도 못 고친다 — 건너뛴다.
 *  - 윙 화면(상품목록) 안에서 윙 화면의 로그인으로 부른다. 이미 열린 로그인된 윙 탭이 있으면 그 탭에서 부르고 건드리지 않는다.
 *    옛 "상품 하나를 누르면 상품목록을 앞에 띄운다"는 실행 계약에 없다 — 실행 탭은 뒤에 있다.
 *  - 윙이 429로 막으면 쉬었다 같은 요청을 다시 보낸다(재고를 정해진 값으로 두는 요청이라 다시 보내도 같다). 끝까지 막히면
 *    거기서 멈춰 남은 상품을 보내지 못한 것으로 센다.
 *  - 실행에 판매자 계정이 있으면 보내기 전에 화면의 업체코드를 대조하고(다르면 보내지 않는다), 다시 읽은 뒤에도 같은 계정일 때만
 *    다시 읽은 옵션 재고를 증거(`observed`)로 싣는다. 로켓그로스·분류를 모르는 옵션·재고를 모르는 옵션은 싣지 않는다.
 */
const ORIGIN = 'https://wing.coupang.com';
const LABEL = '쿠팡 윙';
const ITEMS_PATH = '/tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/';
const ITEMS_QUERY = 'hasProgressiveDiscountRule=true&queryNonVariationJustificationProof=true&queryMpnProof=true';
const CHANGE_PATH = '/tenants/seller-web/vendorinventory/stock-manager/remain-change/request';
/** 해제할 때 품절(재고 0) 옵션에 넣는 재고. 원래 값이 아니라 "다시 판다"는 기본값이다. */
const RESUME_QUANTITY = 999;
/** 윙은 몰아치면 429로 막는다(실측: 쉬지 않고 옵션 목록을 읽으면 170번쯤에서 막혔다) — 상품마다 쉰다. */
const PRODUCT_PACE_MS = 400;
const PACE_MS = 700;
const RATE_LIMIT_WAITS_MS = [5000, 15000, 30000];
/** 보낸 뒤 다시 읽어 아직 안 바뀌었으면 한 번 더 볼 때까지. */
const RECHECK_MS = 1500;

/** 윙 상품목록(사장님이 쓰는 주소 그대로, 검색어 칸 비움). */
export function wingListUrl(keyword = ''): string {
  return `${ORIGIN}/vendor-inventory/list?searchKeywordType=ALL`
    + `&searchKeywords=${encodeURIComponent(keyword)}`
    + '&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes='
    + '&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL'
    + '&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR'
    + '&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50&page=1';
}

type ItemsRead = { items: MallJson[] } | { items?: undefined; status: number; rateLimited: boolean; loggedOut: boolean };

function wingTools(context: AvailabilityContext, run: PageRun) {
  const inPage = async (path: string, method: string, contentType: string | null, body: string | null) => {
    for (let attempt = 0; ; attempt += 1) {
      const answer = await run('requestOnPage', [path, method, contentType, body]);
      if (answer.status !== 429 || attempt >= RATE_LIMIT_WAITS_MS.length) return answer;
      await context.sleep(RATE_LIMIT_WAITS_MS[attempt]!);
    }
  };
  const readItems = async (product: string): Promise<ItemsRead> => {
    const answer = await inPage(`${ITEMS_PATH}${product}?${ITEMS_QUERY}`, 'GET', null, null);
    if (answer.status === 200 && answer.json?.success === true && Array.isArray(answer.json.data)) return { items: answer.json.data };
    return {
      status: answer.status,
      rateLimited: answer.status === 429,
      loggedOut: answer.status !== 429 && /login|로그인|xauth/i.test(`${answer.url ?? ''} ${answer.preview ?? ''}`),
    };
  };
  const readIdentity = async (expected: string): Promise<{ ok: boolean; vendorId?: string }> =>
    ((await run('wingIdentityOnPage', [expected])) as unknown as { ok: boolean; vendorId?: string }) ?? { ok: false };
  return { inPage, readItems, readIdentity };
}

function withWingPage<T>(context: AvailabilityContext, work: (run: PageRun) => Promise<T>): Promise<T> {
  return withSellerPage(context, ORIGIN, wingListUrl(), (run) => work(run), { isolated: [WING_IDENTITY_FILE] });
}

const isOptionId = (code: string) => /^\d{1,15}$/.test(code);
/** 윙 재고 칸 — 음이 아닌 정수만 재고다. 비었거나 숫자가 아니면 모름(null)이지 NaN이 아니다. */
const stockOf = (value: unknown): number | null => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const stock = Number(value);
  return Number.isSafeInteger(stock) && stock >= 0 ? stock : null;
};

/** 보낸 뒤 다시 읽은 옵션 중 증거로 싣는 것: 짚은 옵션이면서 일반(NORMAL) 등록이고 재고가 음이 아닌 정수인 것. */
function observedNormalOptions(items: MallJson[], selected: Set<string>) {
  return items
    .filter((item) => selected.has(String(item.vendorItemId)) && item.registrationType === 'NORMAL'
      && (typeof item.stockQuantity === 'number' || (typeof item.stockQuantity === 'string' && /^\d+$/.test(item.stockQuantity)))
      && Number.isSafeInteger(Number(item.stockQuantity)) && Number(item.stockQuantity) >= 0)
    .map((item) => ({ optionCode: String(item.vendorItemId), stock: Number(item.stockQuantity), rocket: false }));
}

async function send(
  context: AvailabilityContext,
  input: { codes: string[]; options: Record<string, string[]> | null; resume: boolean; expectedProviderAccountId: string | null },
): Promise<AvailabilitySendAnswer> {
  const { codes, options, resume, expectedProviderAccountId } = input;
  if (expectedProviderAccountId !== null && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(expectedProviderAccountId)) {
    return { success: false, error: 'Wing 실행의 계정 식별값이 올바르지 않습니다.' };
  }
  const quantity = resume ? RESUME_QUANTITY : 0;
  const warnings: string[] = [];
  const observed: AvailabilityProduct[] = [];
  let providerAccountId: string | null = null;
  const products = codes.filter(isOptionId);
  const invalid = codes.length - products.length;
  if (invalid > 0) warnings.push(`${invalid}건은 ${LABEL} 등록상품ID 모양이 아니라 보내지 않았습니다.`);

  let sent = 0;
  let failed = invalid;
  let confirmed = 0;
  let already = 0;
  let rocket = 0;
  // 윙이 끝까지 막아 멈춘 자리(products의 index). 여기부터는 보내지 않았다.
  let stoppedAt: number | null = null;
  // 보내기에서 막힌 상품(읽기는 됐다). 멈춘 자리 앞이지만 역시 보내지 못했다.
  let blockedOnSend = 0;
  let loggedOutAt: number | null = null;
  // 짚은 옵션코드. 비었거나 없으면 모든 옵션이다. 모양이 틀린 코드는 버리지 않고 실패로 센다.
  const wantedOf = (product: string): Set<string> | null => {
    const list = options?.[product];
    if (!Array.isArray(list) || list.length === 0) return null;
    return new Set(list.map(String).filter(isOptionId));
  };
  const badOptionsOf = (product: string) => (Array.isArray(options?.[product]) ? options![product]!.map(String).filter((code) => !isOptionId(code)).length : 0);
  const isTarget = (item: MallJson) => (resume ? Number(item.stockQuantity) === 0 : Number(item.stockQuantity) !== 0);

  const halted = await withWingPage(context, async (run): Promise<AvailabilitySendAnswer | null> => {
    const { inPage, readItems, readIdentity } = wingTools(context, run);
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]!;
      if (index > 0) await context.sleep(PRODUCT_PACE_MS);
      const wanted = wantedOf(product);
      const badOptions = badOptionsOf(product);
      if (badOptions > 0) {
        failed += badOptions;
        warnings.push(`${product}: 옵션코드 ${badOptions}개가 ${LABEL} 옵션ID 모양이 아니라 보내지 않았습니다.`);
      }
      if (wanted && wanted.size === 0) continue;
      const identity = expectedProviderAccountId ? await readIdentity(expectedProviderAccountId) : null;
      if (expectedProviderAccountId && (!identity?.ok || identity.vendorId !== expectedProviderAccountId)) {
        if (sent === 0) return { success: false, error: 'Wing 계정이 실행에 지정된 계정과 다르거나 확인되지 않았습니다.' };
        failed += products.length - index;
        warnings.push('Wing 계정이 바뀌어 남은 전송을 중단했습니다.');
        break;
      }
      const read = await readItems(product);
      if (!read.items) {
        if (read.loggedOut) {
          if (sent === 0) return { success: false, error: `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.` };
          loggedOutAt = index;
          break;
        }
        if (read.rateLimited) {
          stoppedAt = index;
          break;
        }
        failed += wanted ? wanted.size : 1;
        warnings.push(`${product}: ${LABEL} 옵션 목록을 읽지 못했습니다(HTTP ${read.status}).`);
        continue;
      }
      const items = read.items.filter((item) => !wanted || wanted.has(String(item.vendorItemId)));
      if (!wanted && read.items.length === 0) {
        // 옵션 목록이 비어 오면 보낼 것도 확인할 것도 없다 — 조용히 넘기지 않고 실패로 센다.
        failed += 1;
        warnings.push(`${product}: ${LABEL} 옵션 목록이 비어 있습니다.`);
        continue;
      }
      if (wanted) {
        const missing = [...wanted].filter((code) => !read.items!.some((item) => String(item.vendorItemId) === code));
        if (missing.length > 0) {
          failed += missing.length;
          warnings.push(`${product}: 옵션 ${missing.length}개가 ${LABEL}에 없습니다.`);
        }
      }
      const editable = items.filter((item) => item.registrationType !== 'RFM');
      rocket += items.length - editable.length;
      const targets = editable.filter(isTarget);
      already += editable.length - targets.length;
      const selected = new Set(items.map((item) => String(item.vendorItemId)));
      // 다시 읽은 것을 증거로 싣는다 — 보내기 전과 같은 계정일 때만.
      const recordEvidence = async (reread: MallJson[] | undefined) => {
        if (!identity?.ok || !reread) return;
        const after = await readIdentity(expectedProviderAccountId!);
        if (!after?.ok || after.vendorId !== identity.vendorId) return;
        providerAccountId = after.vendorId ?? null;
        observed.push({ code: product, options: observedNormalOptions(reread, selected) });
      };
      if (targets.length === 0) {
        await recordEvidence(read.items);
        continue;
      }
      const dtos = targets.map((item) => ({ vendorInventoryItemId: item.vendorInventoryItemId, vendorItemId: item.vendorItemId, inventoryQuantity: quantity }));
      const answer = await inPage(CHANGE_PATH, 'POST', 'application/x-www-form-urlencoded; charset=UTF-8', `stockManageItems=${encodeURIComponent(JSON.stringify({ dtos }))}`);
      if (answer.status === 429) {
        failed += targets.length;
        blockedOnSend = 1;
        stoppedAt = index + 1;
        break;
      }
      const results = Array.isArray(answer.json) ? (answer.json as MallJson[]) : null;
      if (answer.status < 200 || answer.status >= 300 || !results) {
        failed += targets.length;
        warnings.push(`${product}: ${LABEL}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
        continue;
      }
      const ok = new Set(results.filter((entry) => entry && entry.success === true).map((entry) => String(entry.vendorItemId)));
      const okCount = targets.filter((item) => ok.has(String(item.vendorItemId))).length;
      sent += okCount;
      failed += targets.length - okCount;
      if (okCount < targets.length) {
        const reasons = [...new Set(results.filter((entry) => entry && entry.success !== true).map((entry) => String(entry.message || '').trim()).filter(Boolean))].slice(0, 2);
        warnings.push(`${product}: ${targets.length - okCount}개 옵션을 바꾸지 않았습니다${reasons.length ? ` — ${reasons.join(' / ').slice(0, 160)}` : ''}.`);
      }
      // 다시 읽어 재고가 바뀐 옵션을 센다. 윙이 받은 뒤 조금 늦게 반영하면 한 번 더 본다. 못 읽으면 확인하지 못한 것이다.
      const countChanged = (list: MallJson[]) => {
        const changed = new Set(list.filter((item) => Number(item.stockQuantity) === quantity).map((item) => String(item.vendorItemId)));
        return targets.filter((item) => changed.has(String(item.vendorItemId))).length;
      };
      let after = await readItems(product);
      let seen = after.items ? countChanged(after.items) : 0;
      if (after.items && seen < okCount) {
        await context.sleep(RECHECK_MS);
        after = await readItems(product);
        if (after.items) seen = Math.max(seen, countChanged(after.items));
      }
      confirmed += seen;
      await recordEvidence(after.items);
      await context.sleep(PACE_MS);
    }
    return null;
  });
  if (halted) return halted;
  if (stoppedAt !== null) {
    const rest = products.slice(stoppedAt);
    failed += rest.reduce((sum, product) => sum + (wantedOf(product)?.size || 1), 0);
    warnings.push(`${LABEL}이 요청을 잠시 막았습니다(HTTP 429). 상품 ${rest.length + blockedOnSend}개는 보내지 못했습니다 — 몇 분 뒤 다시 보내세요.`);
  }
  if (loggedOutAt !== null) {
    const rest = products.slice(loggedOutAt);
    failed += rest.reduce((sum, product) => sum + (wantedOf(product)?.size || 1), 0);
    warnings.push(`${LABEL} 로그인이 풀려 멈췄습니다 — 상품 ${rest.length}개는 보내지 못했습니다. 로그인한 뒤 다시 보내세요.`);
  }
  return {
    success: true,
    // 이미 원하는 재고인 옵션은 보낼 것이 없었을 뿐 끝난 일이다.
    sent: sent + already,
    failed,
    confirmed: confirmed + already,
    already,
    rocket,
    requestOnly: false,
    warnings,
    observed,
    providerAccountId,
    observedUrl: null,
    ...(stoppedAt !== null ? { stopped: 'rate_limited' } : loggedOutAt !== null ? { stopped: 'logged_out' } : {}),
  };
}

/** 지금 옵션 재고를 읽기만 한다(등록현황 칸의 "지금 품절인가" — 매트릭스의 판매상태는 품절을 모른다). */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const products = [...new Set(codes)].filter(isOptionId).slice(0, READ_LIMIT);
  if (products.length === 0) return { success: false, error: `읽을 ${LABEL} 등록상품ID가 없습니다.` };
  const found: AvailabilityProduct[] = [];
  const missing: string[] = [];
  const halted = await withWingPage(context, async (run): Promise<AvailabilityReadAnswer | null> => {
    const { readItems } = wingTools(context, run);
    for (let index = 0; index < products.length; index += 1) {
      if (index > 0) await context.sleep(PRODUCT_PACE_MS);
      const product = products[index]!;
      const result = await readItems(product);
      if (!result.items) {
        if (result.loggedOut) return { success: false, error: `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (result.rateLimited) return { success: false, error: `${LABEL}이 요청을 잠시 막았습니다(HTTP 429). 몇 분 뒤 다시 확인하세요.` };
        missing.push(product);
        continue;
      }
      // 옵션 목록이 비어 오면 모른다 — 빈 목록을 돌려주면 칸이 로켓그로스로 읽는다.
      if (result.items.length === 0) {
        missing.push(product);
        continue;
      }
      found.push({
        code: product,
        options: result.items.map((item) => ({ optionCode: String(item.vendorItemId), stock: stockOf(item.stockQuantity), rocket: item.registrationType === 'RFM' })),
      });
    }
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'coupang',
  displayName: LABEL,
  guard: { ...WING_WRITE_GUARD, loginMessage: '쿠팡 윙 로그인이 필요합니다. 열린 쿠팡 윙 화면에서 로그인한 뒤 다시 시도해 주세요.' },
  dialogHosts: ['wing.coupang.com'],
  login: WING_LOGIN,
  send,
  read,
});
