/**
 * 몰 로그인 확인 표(KID-366, 옛 `orders/mall-session.js` SPECS의 확인 칸 — `entryUrl`·`headers`·`loggedInSignal` — 을 옮겼다).
 * 몰 한 줄이 "확인하러 여는 관리자 화면"과 "조용히 한 번 읽어 로그인 여부를 가리는 표시"를 함께 적는다. 데이터를 바꾸거나
 * 감사 기록을 남기는 주소(엑셀 생성·다운로드 사유·등록 화면)는 넣지 않는다. 몰 키는 채널 레지스트리 철자다.
 *
 * 판정은 셋이다: `in`(로그인된 근거) · `out`(로그인이 필요한 근거) · `unknown`(가리지 못했다). 이유 코드는 서버 관찰 기록이 받는
 * `^[a-z][a-z0-9_]{0,63}$` 모양이고 웹 툴팁이 문장으로 바꾼다.
 */
export const MALL_LOGIN_REASONS = {
  ADMIN_PAGE: 'admin_page',
  ADMIN_API: 'admin_api',
  LOGIN_PAGE: 'login_page',
  LOGIN_REQUIRED_RESPONSE: 'login_required_response',
  REDIRECTED_AWAY: 'redirected_away',
  HTTP_UNAUTHORIZED: 'http_unauthorized',
  VERIFICATION_REQUIRED: 'verification_required',
  UNRECOGNIZED_PAGE: 'unrecognized_page',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  NO_PASSIVE_CHECK: 'no_passive_check',
  NO_LOGIN_ADDRESS: 'no_login_address',
  LOGIN_PAGE_NOT_REACHABLE: 'login_page_not_reachable',
} as const;
export type MallLoginReason = (typeof MALL_LOGIN_REASONS)[keyof typeof MALL_LOGIN_REASONS];
export type Verdict = 'in' | 'out' | 'unknown';
export interface Seen {
  verdict: Verdict;
  reason: MallLoginReason;
}

/** 조용히 읽은 화면: 리다이렉트까지 따라간 최종 pathname과 본문(utf-8, 깨졌으면 euc-kr도). */
export interface ProbedPage {
  finalPath: string;
  texts: string[];
}

export interface MallCheckSpec {
  /** 확인하러 여는 관리자 화면. 조용한 확인도 같은 주소를 읽는다. 로그인 화면 주소는 쓰지 않는다. */
  entryUrl: string;
  /** 조용한 읽기에만 붙이는 요청 머리(도매꾹은 `x-requested-with`가 없으면 관리자 JSON 대신 화면을 준다). */
  headers?: Readonly<Record<string, string>>;
  /** 조용히 한 번 읽어 가리는 표시. 없으면 화면을 연다. */
  loggedInSignal?: (page: ProbedPage) => Seen;
}

const R = MALL_LOGIN_REASONS;
const LOGIN_PATH = /\/(?:login|signin|sign-in|signIn)|loginform|partnerlogin|partner_login|login_so|authentication\/login/i;
const VERIFY_PATH = /\/security\/verify_user\.htm$/i;
const PASSWORD_INPUT = /<input[^>]*type\s*=\s*["']?password/i;
const LOGOUT_MARKER = /로그아웃|\/logout\b|logout\.(?:php|do|html?|asp)/i;
const LOGIN_TEXT = /로그인|login/i;

const seen = (verdict: Verdict, reason: MallLoginReason): Seen => ({ verdict, reason });
const anyText = (texts: readonly string[], pattern: RegExp) => texts.some((text) => pattern.test(text));

function parseJson(text: string | undefined): unknown {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** 관리자 HTML 화면: 로그인 주소로 넘어갔으면 out, 로그인해야 보이는 표시가 있으면 in, 비밀번호 칸만 있으면 out. */
function htmlSignal(signedInMarker: RegExp) {
  return (page: ProbedPage): Seen => {
    if (LOGIN_PATH.test(page.finalPath)) return seen('out', R.LOGIN_PAGE);
    if (anyText(page.texts, signedInMarker)) return seen('in', R.ADMIN_PAGE);
    if (anyText(page.texts, PASSWORD_INPUT)) return seen('out', R.LOGIN_PAGE);
    return seen('unknown', R.UNRECOGNIZED_PAGE);
  };
}

/** 관리자 JSON 주소: 기대한 모양이면 in, 몰이 로그인하라고 답하면 out. 모양만 다른 응답은 모른다. */
function jsonSignal(isSignedIn: (json: Record<string, unknown>) => boolean, isSignedOut?: (json: Record<string, unknown>) => boolean) {
  return (page: ProbedPage): Seen => {
    const json = parseJson(page.texts[0]) as Record<string, unknown> | null;
    if (json && isSignedIn(json)) return seen('in', R.ADMIN_API);
    if (json && isSignedOut?.(json)) return seen('out', R.LOGIN_REQUIRED_RESPONSE);
    if (LOGIN_PATH.test(page.finalPath) || anyText(page.texts, PASSWORD_INPUT)) return seen('out', R.LOGIN_PAGE);
    if (!json && anyText(page.texts, LOGIN_TEXT)) return seen('out', R.LOGIN_PAGE);
    return seen('unknown', R.UNRECOGNIZED_PAGE);
  };
}

export const MALL_CHECK_SPECS: Readonly<Record<string, MallCheckSpec>> = {
  domeggook: {
    // 로그인돼 있으면 엑셀 생성 목록(dat 배열), 로그아웃이면 200에 {"res":false,"msg":"로그인이 필요합니다"}(2026-09-12 실측).
    entryUrl: 'https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1',
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    loggedInSignal: jsonSignal((json) => Array.isArray(json.dat), (json) => json.res === false),
  },
  onch: {
    // 공급사 주문 목록 화면은 로그아웃이면 /login/login_web.php로 넘어간다(2026-09-12 실측).
    entryUrl: 'https://www.onch3.co.kr/supplier/orders.php?state=all',
    loggedInSignal: htmlSignal(/로그아웃|order_detail_supplier/),
  },
  kidsnote: {
    entryUrl: 'https://shop.kidsnote.com/_manage/?body=3010',
    loggedInSignal: htmlSignal(/주문번호|로그아웃/),
  },
  kidkids: {
    entryUrl: 'https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=1',
    loggedInSignal: (page) => {
      // 로그인 뒤에 따로 오는 본인확인 화면. 주문 목록이 아니므로 로그인됨으로 치지 않는다.
      if (VERIFY_PATH.test(page.finalPath)) return seen('out', R.VERIFICATION_REQUIRED);
      const found = htmlSignal(/name\s*=\s*["']?CheckBox2|로그아웃/)(page);
      if (found.verdict !== 'unknown') return found;
      // 주문이 0건이면 CheckBox2가 없다 — 출고관리 목록에 머물렀으면 로그인된 빈 목록이다.
      return /\/logis\/logis_index\.htm$/i.test(page.finalPath) ? seen('in', R.ADMIN_PAGE) : found;
    },
  },
  'icecream-mall': { entryUrl: 'https://po.i-screammall.co.kr/main.do', loggedInSignal: htmlSignal(LOGOUT_MARKER) },
  art09: {
    entryUrl: 'https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1',
    // Cafe24는 로그인된 화면에도 '로그인' 글자와 비밀번호 칸이 있다. 주문목록에 머물렀는지만 본다.
    loggedInSignal: (page) => (/order_list\.php$/i.test(page.finalPath) ? seen('in', R.ADMIN_PAGE) : seen('out', R.REDIRECTED_AWAY)),
  },
  'haebub-mall': { entryUrl: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php', loggedInSignal: htmlSignal(LOGOUT_MARKER) },
  'teacher-mall': {
    // 로그아웃이면 로그인 화면이 http://를 한 번 거쳐 권한 밖이라 조용한 읽기가 실패한다 — '튕겨 나갔다' 확인이 로그인 필요로 읽는다.
    entryUrl: 'https://shop.teacherville.co.kr/selleradmin/order/catalog',
    loggedInSignal: htmlSignal(/excel_down_form|로그아웃/),
  },
  boribori: { entryUrl: 'https://seller-club.co.kr/order/orderDeliList', loggedInSignal: htmlSignal(/orderDeliList|jqGrid|로그아웃/) },
  'lotte-on': { entryUrl: 'https://store.lotteon.com/cm/main/index_SO.wsp', loggedInSignal: htmlSignal(/로그아웃|logout|productInsert|index_SO\.wsp/) },
  'gs-shop': { entryUrl: 'https://partners.gsshop.com/logistics/partner-logistics-mng', loggedInSignal: htmlSignal(/로그아웃|logout|partner-logistics-mng/) },
  ssg: { entryUrl: 'https://po.ssgadm.com/', loggedInSignal: htmlSignal(/로그아웃|logout|파트너 오피스 홈/) },
  thirtymall: { entryUrl: 'https://partner.shopby.co.kr/', loggedInSignal: htmlSignal(/로그아웃|logout|partner-remote/) },
  kkomangse: {
    entryUrl: 'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1',
    loggedInSignal: htmlSignal(/form_list|로그아웃/),
  },
  'coupang-direct': { entryUrl: 'https://supplier.coupang.com/po-web/app/purchase-order/list' },
  rocket: { entryUrl: 'https://supplier.coupang.com/po-web/app/purchase-order/list' },
  coupang: { entryUrl: 'https://wing.coupang.com/' },
  'benepia-mul': { entryUrl: 'https://newmallvenadm.benepia.co.kr/' },
  kakao: { entryUrl: 'https://shopping-seller.kakao.com/' },
  always: { entryUrl: 'https://alwayzseller.ilevit.com/' },
};

export function checkSpecOf(mallKey: string): MallCheckSpec | null {
  return Object.prototype.hasOwnProperty.call(MALL_CHECK_SPECS, mallKey) ? MALL_CHECK_SPECS[mallKey]! : null;
}
