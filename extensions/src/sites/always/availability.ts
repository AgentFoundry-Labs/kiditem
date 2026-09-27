import {
  flagOption,
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
import { availabilityGuard } from '../mall-write/guard';
import { ALWAYS_PAGE_GUARD } from './index';

/**
 * 올웨이즈 품절·재개·지금 상태(옛 `mall-availability-send.js` `always` · `itemApi`, KID-256). 판매자센터 상품 조회/수정의
 * [품절]·[판매재개] 버튼이 보내는 요청 그대로다(2026-09-19 실측): 품절 POST /items/sold-out-many {itemIdList}·재개
 * /items/resume-many {itemIdList}, 확인 POST /sellers/items/info-request {itemIds}의 soldOut. 인증 토큰은 판매자센터 화면의
 * localStorage에 있고 x-access-token으로 싣는다 — 화면 안에서만 읽고 쓴다(서비스워커는 열쇠 이름만 넘긴다). 로그인 입구
 * 명세가 없다(JWT) — 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 탭을 남긴다.
 */
const ORIGIN = 'https://alwayzseller.ilevit.com';
const PAGE_URL = 'https://alwayzseller.ilevit.com/items/management';
const BACKEND = 'https://alwayz-seller-back.ilevit.com';
const TOKEN_KEY = '@alwayz@seller@token@';
const PACE_MS = 700;
const LABEL = '올웨이즈';
const LOGGED_OUT = `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;

const isItemId = (code: string) => /^[0-9a-f]{24}$/i.test(code);

async function readItems(run: PageRun, itemIds: string[]): Promise<{ loggedOut?: true; items?: MallJson[]; error?: string }> {
  const answer = await run('alwayzRequestOnPage', [`${BACKEND}/sellers/items/info-request`, { itemIds }, TOKEN_KEY]);
  if (answer.loggedOut) return { loggedOut: true };
  const items = Array.isArray(answer.json?.data) ? answer.json.data : null;
  if (answer.status !== 200 || !items) return { error: `HTTP ${answer.status}` };
  return { items };
}

/** [품절]·[판매재개] 버튼이 보내는 요청을 여러 개 한 번에 보내고, 다시 읽어 확인한다. */
async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const { codes, resume } = input;
  const warnings: string[] = [];
  const ids = codes.filter(isItemId);
  let failed = codes.length - ids.length;
  if (failed > 0) warnings.push(`${failed}건은 ${LABEL} 상품 고유번호 모양이 아니라 보내지 않았습니다.`);
  let sent = 0;
  let confirmed = 0;
  let already = 0;
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilitySendAnswer | null> => {
    if (ids.length === 0) return null;
    const read = await readItems(run, ids);
    if (read.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!read.items) return { success: false, error: `${LABEL} 상품 상태를 읽지 못했습니다(${read.error}).` };
    const byId = new Map(read.items.map((item) => [String(item._id), item]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      failed += missing.length;
      warnings.push(`${missing.length}건은 ${LABEL}에서 찾지 못했습니다.`);
    }
    const targets = ids.filter((id) => byId.has(id) && Boolean(byId.get(id).soldOut) === resume);
    already += ids.filter((id) => byId.has(id)).length - targets.length;
    if (targets.length === 0) return null;
    const path = resume ? '/items/resume-many' : '/items/sold-out-many';
    const answer = await run('alwayzRequestOnPage', [`${BACKEND}${path}`, { itemIdList: targets }, TOKEN_KEY]);
    const ok = answer.status === 200 && (answer.json?.status === undefined || Number(answer.json.status) === 200);
    if (!ok) {
      failed += targets.length;
      warnings.push(`${LABEL}이 ${resume ? '판매재개' : '품절'}를 받지 않았습니다(HTTP ${answer.status}).`);
      return null;
    }
    sent += targets.length;
    await context.sleep(PACE_MS);
    const after = await readItems(run, targets);
    if (after.items) confirmed += after.items.filter((item) => Boolean(item.soldOut) === !resume).length;
    else warnings.push(`${LABEL}에서 바뀐 상태를 다시 읽지 못했습니다.`);
    return null;
  });
  if (halted) return halted;
  return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
}

/** 지금 상태. 재고 수는 주지 않고 품절 여부만 준다 — 품절이면 0, 아니면 모름(null). 읽기만 한다. */
async function read(context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  const ids = [...new Set(codes)].filter(isItemId).slice(0, READ_LIMIT);
  if (ids.length === 0) return { success: false, error: `읽을 ${LABEL} 상품 고유번호가 없습니다.` };
  let found: AvailabilityProduct[] = [];
  let missing: string[] = [];
  const halted = await withSellerPage(context, ORIGIN, PAGE_URL, async (run): Promise<AvailabilityReadAnswer | null> => {
    const result = await readItems(run, ids);
    if (result.loggedOut) return { success: false, error: LOGGED_OUT };
    if (!result.items) return { success: false, error: `${LABEL} 상품 상태를 읽지 못했습니다(${result.error}).` };
    const byId = new Map(result.items.map((item) => [String(item._id), item]));
    found = ids.filter((id) => byId.has(id)).map((id) => ({ code: id, options: [flagOption(id, !byId.get(id).soldOut, byId.get(id).soldOut ? '품절' : null)] }));
    missing = ids.filter((id) => !byId.has(id));
    return null;
  });
  if (halted) return halted;
  return { success: true, products: found, missing };
}

registerMallAvailability({
  mallKey: 'always',
  displayName: LABEL,
  guard: availabilityGuard(ALWAYS_PAGE_GUARD, LABEL),
  dialogHosts: ['alwayzseller.ilevit.com'],
  send,
  read,
});
