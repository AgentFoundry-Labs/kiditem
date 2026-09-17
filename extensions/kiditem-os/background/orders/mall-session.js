(function initializeMallSession(root) {
  "use strict";

  // 몰 세션 — "어디로 들어가나 · 로그인된 걸 어떻게 아나" 를 한 곳에서 답한다(KID-254).
  //
  // 예전에는 같은 사실이 표 셋에 흩어져 있었다. 자동 로그인 주소 · 로그인 확인 주소 ·
  // 조용한 확인 스펙. 몰을 한 표에만 적으면 자동 로그인은 되는데 상태는 "확인 불가" 로
  // 남았다 — 실패도 성공도 아니라 아무도 고장이라고 부르지 않는 고장이다.
  //
  // 이제 몰 한 줄(`entryUrl · loginUrl · loggedInSignal · fields`)이 그 셋을 함께 적고,
  // 밖으로 나가는 문은 둘뿐이다.
  //
  //   ensureLoggedIn(mallKey, credentials, context) → ok · rejected · unknown
  //   checkLogin(mallKey, siteUrl)                  → in · out · unknown
  //
  // 탭을 열고 · 프레임에 스크립트를 넣고 · 알림 창을 삼키고 · 조용히 한 번 읽는 일은 모듈
  // 안쪽의 드라이버 자리다. 크롬 드라이버는 worker.js 가 끼우고, 테스트는 가짜를 끼워
  // 스펙에 적힌 몰 전부를 돌린다.
  //
  // 재시도 간격 · 실패한 몰 차단은 여기 없다. 그건 웹의 정책이고 웹에 남아 있다.

  /**
   * 두 문이 함께 쓰는 이유 코드 한 벌. 서버의 관찰 기록(`mall-operation-outcomes.ts`)이
   * `^[a-z][a-z0-9_]{0,63}$` 만 받으므로 그 모양을 지킨다 — 어긋나면 기록이 통째로 거절된다.
   * `login_check` 와 `login_test` 가 같은 벌에서 답해야 두 줄을 나란히 읽을 수 있다.
   */
  const REASONS = Object.freeze({
    // 로그인돼 있다는 근거
    ADMIN_PAGE: "admin_page",
    ADMIN_API: "admin_api",
    ALREADY_SIGNED_IN: "already_signed_in",
    FORM_SUBMITTED: "form_submitted",
    // 로그인이 필요하다는 근거
    LOGIN_PAGE: "login_page",
    LOGIN_REQUIRED_RESPONSE: "login_required_response",
    REDIRECTED_AWAY: "redirected_away",
    HTTP_UNAUTHORIZED: "http_unauthorized",
    LOGIN_FORM_REMAINS: "login_form_remains",
    VERIFICATION_REQUIRED: "verification_required",
    // 가리지 못했다는 근거 — 몰에 대한 관찰이 아니라 우리 쪽 사정인 것도 있다
    UNRECOGNIZED_PAGE: "unrecognized_page",
    NETWORK_ERROR: "network_error",
    TIMEOUT: "timeout",
    NO_PASSIVE_CHECK: "no_passive_check",
    NO_LOGIN_ADDRESS: "no_login_address",
    LOGIN_PAGE_NOT_REACHABLE: "login_page_not_reachable",
    UNSUPPORTED_MALL: "unsupported_mall",
    NO_CREDENTIALS: "no_credentials",
    LOGIN_FORM_INCOMPLETE: "login_form_incomplete",
    LOGIN_STATE_UNCONFIRMED: "login_state_unconfirmed",
    LOGIN_TAB_UNAVAILABLE: "login_tab_unavailable",
    LOGIN_TIMEOUT: "login_timeout",
    COLLECTION_CANCELLED: "collection_cancelled",
  });

  // 폼 자동 입력은 이 시간 안에서만 돈다. 화면이 넘어가는 중이면 다시 본다.
  const FILL_WINDOW_MS = 15000;
  const FILL_RETRY_MS = 500;
  const AFTER_SUBMIT_MS = 1500;
  const AFTER_REDIRECT_MS = 1200;
  const AFTER_TAB_OPEN_MS = 1000;
  const LOGIN_TIMEOUT_MS = 35000;
  // 키드키즈는 management.htm 을 띄운 뒤 클라이언트 리다이렉트로 로그인 화면을 연다.
  const KIDKIDS_SETTLE_MS = 5000;
  // 확인용으로 연 화면: 로드 제한시간과, SPA 가 로그인 화면으로 넘기는 시간.
  const SCREEN_LOAD_TIMEOUT_MS = 20000;
  const SCREEN_SETTLE_MS = 2500;
  const SCREEN_SECOND_LOOK_MS = 2000;

  // ── 로그인 화면인가(탭 주소로) ───────────────────────────────────────────────
  //
  // 권한 밖 도메인(통합 로그인)으로 넘어가 들여다보지 못해도 탭 주소는 읽힌다.
  const LOGIN_SCREEN_URL = /\/(?:login|signin|sign-in|signIn)(?:[/?#.]|$)|loginform|partnerlogin|partner_login|login_so|authentication\/login|xauth\.coupang\.com|nid\.naver\.com|accounts\.kakao\.com|accounts\.commerce\.naver\.com/i;
  const VERIFY_SCREEN_URL = /verify_user|\/otp(?:[/?#.]|$)|two-?factor|\/mfa(?:[/?#.]|$)/i;
  const KIDKIDS_VERIFY_URL = /\/security\/verify_user\.htm(?:[?#]|$)/;
  const KIDKIDS_LOGIN_URL = /\/partnerlogin\.htm(?:[?#]|$)|\/join\/partner_login\.htm(?:[?#]|$)/;
  const KIDKIDS_MANAGEMENT_URL = /^https:\/\/partner\.kidkids\.net\/new\/pages\/logis\/management\.htm(?:[?#]|$)/;

  // ── 로그인 표시(조용히 읽은 화면에서) ───────────────────────────────────────
  //
  // 몰마다 글자가 조금씩 다르다 — `sign-in`(GS샵) · `login_SO.wsp`(롯데ON) ·
  // `authentication/login.ssg`(신세계)도 같은 로그인 화면이다.
  const LOGIN_PATH = /\/(?:login|signin|sign-in|signIn)|loginform|partnerlogin|partner_login|login_so|authentication\/login/i;
  const VERIFY_PATH = /\/security\/verify_user\.htm$/i;
  const PASSWORD_INPUT = /<input[^>]*type\s*=\s*["']?password/i;
  const LOGOUT_MARKER = /로그아웃|\/logout\b|logout\.(?:php|do|html?|asp)/i;
  const LOGIN_TEXT = /로그인|login/i;

  /** 확인의 답 — 로그인됨 · 로그인 필요 · 모름. 이유 코드를 함께 싣는다. */
  function seen(value, reason) {
    return { verdict: value, reason };
  }

  function anyText(texts, pattern) {
    return texts.some((text) => pattern.test(text));
  }

  function parseJson(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  // 관리자 HTML 화면: 로그인 주소로 넘어갔으면 로그인 필요, 로그인해야만 보이는 표시가 있으면
  // 로그인됨, 비밀번호 칸만 있으면 로그인 필요. 셋 다 아니면 모른다.
  function htmlSignal(signedInMarker) {
    return (page) => {
      if (LOGIN_PATH.test(page.finalPath)) return seen("out", REASONS.LOGIN_PAGE);
      if (anyText(page.texts, signedInMarker)) return seen("in", REASONS.ADMIN_PAGE);
      if (anyText(page.texts, PASSWORD_INPUT)) return seen("out", REASONS.LOGIN_PAGE);
      return seen("unknown", REASONS.UNRECOGNIZED_PAGE);
    };
  }

  // 관리자 JSON 주소: 기대한 모양이면 로그인됨, 몰이 로그인하라고 답하면 로그인 필요.
  // 모양이 다르기만 한 응답은 로그인 여부의 증거가 아니므로 모른다로 둔다.
  function jsonSignal(isSignedIn, isSignedOut) {
    return (page) => {
      const json = parseJson(page.texts[0]);
      if (json && isSignedIn(json)) return seen("in", REASONS.ADMIN_API);
      if (json && isSignedOut && isSignedOut(json)) return seen("out", REASONS.LOGIN_REQUIRED_RESPONSE);
      if (LOGIN_PATH.test(page.finalPath) || anyText(page.texts, PASSWORD_INPUT)) {
        return seen("out", REASONS.LOGIN_PAGE);
      }
      if (!json && anyText(page.texts, LOGIN_TEXT)) return seen("out", REASONS.LOGIN_PAGE);
      return seen("unknown", REASONS.UNRECOGNIZED_PAGE);
    };
  }

  /** 아이디 · 비밀번호만 있는 보통 로그인 폼. */
  const ID_PASSWORD = Object.freeze(["loginId", "password"]);

  function spec({ entryUrl, loginUrl = null, loggedInSignal = null, fields = ID_PASSWORD, headers = null }) {
    return Object.freeze({ entryUrl, loginUrl, loggedInSignal, fields, headers });
  }

  /**
   * 몰 한 줄.
   *
   * - `entryUrl`  확인하러 여는 관리자 화면. 조용한 확인도 같은 주소를 읽는다. 로그인 화면
   *               주소는 쓰지 않는다 — 로그인돼 있어도 로그인 폼을 보여 줄 수 있다.
   * - `loginUrl`  저장된 계정으로 로그인하러 들어가는 주소. `null` 이면 사장님이 쇼핑몰
   *               계정에 적어 둔 사이트 주소로 들어간다.
   * - `loggedInSignal` 조용히 한 번 읽어 로그인 여부를 가리는 표시. `null` 이면 화면을 연다.
   * - `fields`    그 몰 로그인 폼이 받는 입력칸. `null` 은 채울 폼이 없다는 뜻이다.
   *
   * 몰 키는 채널 레지스트리의 철자다(KID-250). 데이터를 바꾸거나 감사 기록을 남기는
   * 주소(엑셀 생성 · 다운로드 사유 · 등록 화면)는 넣지 않는다.
   */
  const SPECS = Object.freeze({
    domeggook: spec({
      // 로그인돼 있으면 엑셀 생성 목록(dat 배열)이 온다. 로그아웃이면 200 에
      // {"res":false,"msg":"로그인이 필요합니다"} 를 준다(2026-09-12 실측).
      entryUrl: "https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1",
      headers: Object.freeze({ "x-requested-with": "XMLHttpRequest" }),
      loginUrl: "https://domeggook.com/sc/order/lstAll",
      loggedInSignal: jsonSignal(
        (json) => Array.isArray(json?.dat),
        (json) => json?.res === false,
      ),
    }),
    onch: spec({
      // 분류 AJAX 는 로그아웃일 때도 200 에 일반 실패 메시지만 줘서 로그인 여부를 가릴 수 없다.
      // 공급사 주문 목록 화면은 로그아웃이면 /login/login_web.php 로 넘어간다(2026-09-12 실측).
      entryUrl: "https://www.onch3.co.kr/supplier/orders.php?state=all",
      loginUrl: "https://www.onch3.co.kr/supplier/orders.php?state=all",
      loggedInSignal: htmlSignal(/로그아웃|order_detail_supplier/),
    }),
    kidsnote: spec({
      entryUrl: "https://shop.kidsnote.com/_manage/?body=3010",
      loginUrl: "https://shop.kidsnote.com/_manage/?body=3010",
      loggedInSignal: htmlSignal(/주문번호|로그아웃/),
    }),
    kidkids: spec({
      entryUrl: "https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=1",
      // ⚠️미로그인 시 management.htm → partner.kidkids.net/partnerLogin.htm →
      // www.kidkids.net/join/partner_login.htm 으로 넘어간다. 로그인 폼은 www.kidkids.net 에
      // 있으므로 manifest host_permissions 에 그 주소가 반드시 있어야 한다.
      loginUrl: "https://partner.kidkids.net/new/pages/logis/management.htm",
      loggedInSignal: (page) => {
        // 로그인 뒤에 따로 오는 본인확인 화면. 주문 목록이 아니므로 로그인됨으로 치지 않는다.
        if (VERIFY_PATH.test(page.finalPath)) return seen("out", REASONS.VERIFICATION_REQUIRED);
        const found = htmlSignal(/name\s*=\s*["']?CheckBox2|로그아웃/)(page);
        if (found.verdict !== "unknown") return found;
        // 주문이 0건이면 CheckBox2 가 없다. 로그인 화면으로 넘어가지 않고 비밀번호 칸도 없이
        // 출고관리 목록에 머물렀으면 로그인된 빈 목록이다 — 주문수집기와 같은 판정이다.
        return /\/logis\/logis_index\.htm$/i.test(page.finalPath) ? seen("in", REASONS.ADMIN_PAGE) : found;
      },
    }),
    "icecream-mall": spec({
      entryUrl: "https://po.i-screammall.co.kr/main.do",
      loginUrl: "https://po.i-screammall.co.kr/main.do",
      loggedInSignal: htmlSignal(LOGOUT_MARKER),
    }),
    art09: spec({
      entryUrl: "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1",
      loginUrl: "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1",
      // Cafe24 는 쇼핑몰 아이디와 운영자 아이디를 따로 받는다.
      fields: Object.freeze(["supplierLoginId", "loginId", "password"]),
      // Cafe24 는 로그인된 화면에도 '로그인' 글자와 비밀번호 칸이 있다. 주문목록에 머물렀는지만 본다.
      loggedInSignal: (page) =>
        /order_list\.php$/i.test(page.finalPath)
          ? seen("in", REASONS.ADMIN_PAGE)
          : seen("out", REASONS.REDIRECTED_AWAY),
    }),
    "haebub-mall": spec({
      entryUrl: "https://mallseller.genimarket.co.kr/mall/order/basket_list.php",
      loginUrl: "https://mallseller.genimarket.co.kr/mall/order/basket_list.php",
      loggedInSignal: htmlSignal(LOGOUT_MARKER),
    }),
    "teacher-mall": spec({
      // 로그아웃이면 로그인 화면이 http:// 를 한 번 거친다. 그 주소는 권한 밖이라 따라가지
      // 못하고 조용한 읽기가 실패한다 — '튕겨 나갔다' 확인이 그 경우를 로그인 필요로 읽는다.
      entryUrl: "https://shop.teacherville.co.kr/selleradmin/order/catalog",
      loginUrl: "https://shop.teacherville.co.kr/selleradmin/order/catalog",
      loggedInSignal: htmlSignal(/excel_down_form|로그아웃/),
    }),
    boribori: spec({
      // 주문/배송관리(B201). 로그아웃이면 `/login` 으로 넘어간다(2026-09-16 실측).
      entryUrl: "https://seller-club.co.kr/order/orderDeliList",
      loginUrl: "https://seller-club.co.kr/order/orderDeliList",
      loggedInSignal: htmlSignal(/orderDeliList|jqGrid|로그아웃/),
    }),
    "lotte-on": spec({
      // 판매자센터 첫 화면. 로그아웃이면 `login_SO.wsp` 로 넘어간다(2026-09-16 실측).
      entryUrl: "https://store.lotteon.com/cm/main/index_SO.wsp",
      // 롯데ON 은 <form> 없는 WebSquare 화면이지만 사용자ID/비밀번호 input 과
      // <a id="mf_btn_login">로그인</a> 이 실재해 form-fill 이 가능하다(2026-09-01 DOM 확인).
      loginUrl: "https://store.lotteon.com/cm/main/login_SO.wsp",
      loggedInSignal: htmlSignal(/로그아웃|logout|productInsert|index_SO\.wsp/),
    }),
    "gs-shop": spec({
      // 파트너스 물류 관리 화면. 로그아웃이면 `/sign-in` 으로 넘어간다(2026-09-16 실측).
      entryUrl: "https://partners.gsshop.com/logistics/partner-logistics-mng",
      loginUrl: "https://partners.gsshop.com/logistics/partner-logistics-mng",
      loggedInSignal: htmlSignal(/로그아웃|logout|partner-logistics-mng/),
    }),
    ssg: spec({
      // 파트너 오피스 첫 화면. 로그아웃이면 `authentication/login.ssg` 로 넘어간다(2026-09-16 실측).
      entryUrl: "https://po.ssgadm.com/",
      loggedInSignal: htmlSignal(/로그아웃|logout|파트너 오피스 홈/),
    }),
    thirtymall: spec({
      // 샵바이 파트너 어드민. 로그아웃이면 `/login` 으로 넘어간다(2026-09-16 실측).
      entryUrl: "https://partner.shopby.co.kr/",
      loggedInSignal: htmlSignal(/로그아웃|logout|partner-remote/),
    }),
    kkomangse: spec({
      entryUrl: "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1",
      loginUrl: "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000",
      loggedInSignal: htmlSignal(/form_list|로그아웃/),
    }),
    // 쿠팡 직배송은 로켓 계정 행에 저장된 아이디·비밀번호를 쓴다(ADR-0012).
    "coupang-direct": spec({
      entryUrl: "https://supplier.coupang.com/po-web/app/purchase-order/list",
      loginUrl: "https://supplier.coupang.com/po-web/app/purchase-order/list",
    }),
    rocket: spec({ entryUrl: "https://supplier.coupang.com/po-web/app/purchase-order/list" }),
    coupang: spec({ entryUrl: "https://wing.coupang.com/" }),
    "benepia-mul": spec({ entryUrl: "https://newmallvenadm.benepia.co.kr/" }),
    // 카카오(토큰) · 올웨이즈(브라우저 저장소 JWT)는 채울 로그인 폼이 없다. 그래서 고정
    // 로그인 주소도 두지 않는다 — 수집기가 미로그인을 감지해 "로그인 필요" 로 안내한다.
    kakao: spec({ entryUrl: "https://shopping-seller.kakao.com/", fields: null }),
    always: spec({ entryUrl: "https://alwayzseller.ilevit.com/", fields: null }),
  });

  const MALLS = Object.freeze(Object.keys(SPECS));
  const PASSIVE_MALLS = Object.freeze(MALLS.filter((key) => typeof SPECS[key].loggedInSignal === "function"));

  function specOf(mallKey) {
    const key = typeof mallKey === "string" ? mallKey : "";
    return Object.prototype.hasOwnProperty.call(SPECS, key) ? SPECS[key] : null;
  }

  /** 이 몰을 확인하러 여는 주소. 조용한 읽기도 같은 주소를 쓴다. */
  function entryUrlOf(mallKey) {
    const found = specOf(mallKey);
    return found ? found.entryUrl : null;
  }

  /**
   * 쇼핑몰 계정에 저장된 사이트 주소. 고정 주소가 없는 몰은 여기로 들어간다. 사장님이 적은
   * 것만 쓰고(http · https 만) 그 밖의 값은 없는 것으로 본다 — 확장이 임의의 주소를 열지 않는다.
   */
  function savedSiteUrl(credentials) {
    const raw = typeof credentials?.siteUrl === "string" ? credentials.siteUrl.trim() : "";
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  function answer(verdict, reason, payload) {
    return { verdict, reason, ...payload };
  }

  function create({ driver }) {
    if (!driver) throw new Error("mall session needs a driver");

    /**
     * 저장된 계정으로 로그인한다 — 됐다(`ok`) · 몰이 거절했다(`rejected`) ·
     * 가리지 못했다(`unknown`). 판정은 여기까지고, 언제 다시 넣을지는 웹이 정한다.
     */
    async function ensureLoggedIn(mallKey, credentials, context = null) {
      if (!credentials || !credentials.loginId || !credentials.password) {
        return answer("unknown", REASONS.NO_CREDENTIALS, { success: true, submitted: false });
      }
      const found = specOf(mallKey);
      // 고정 주소가 있는 몰은 그 주소로, 없는 몰은 사장님이 적어 둔 사이트 주소로 들어간다.
      // 둘 다 없으면 어디로 갈지 모르므로 시도하지 않는다 — 시도하지 않았다는 사실을
      // 호출부가 알아야 "확인됨" 으로 잘못 표시하지 않는다.
      const url = (found && found.loginUrl) || savedSiteUrl(credentials);
      if (!url) return answer("unknown", REASONS.UNSUPPORTED_MALL, { success: true, submitted: false });

      // 취소된 수집이 로그인 탭을 만들지 못하도록, 탭을 열기 전에 소유권을 확인한다.
      // 이미 취소됐으면 드라이버가 그대로 던져 수집 lifecycle 이 받는다.
      const opened = await driver.openTab(url, context);
      if (opened.cancelled) {
        return answer("unknown", REASONS.COLLECTION_CANCELLED, await driver.cancelledResult());
      }
      if (!opened.tab) {
        return answer("unknown", REASONS.LOGIN_TAB_UNAVAILABLE, {
          success: false,
          error: "자동 로그인 탭을 열 수 없습니다.",
        });
      }

      let result = null;
      try {
        await driver.waitReady(opened.tab.id);
        await driver.delay(AFTER_TAB_OPEN_MS);
        // 로그인 화면이 뜨는 동안 수집이 취소됐을 수 있다. 스크립트를 넣기 직전에 다시 본다.
        await driver.ensureActive(context);
        result = await driver.withTimeout(
          fillLoginForm(opened.tab.id, credentials, mallKey),
          LOGIN_TIMEOUT_MS,
          "자동 로그인 시간이 초과되었습니다.",
        );
        return result;
      } catch (error) {
        result = error?.code === "COLLECTION_CANCELLED"
          ? answer("unknown", REASONS.COLLECTION_CANCELLED, await driver.cancelledResult(error))
          : answer("unknown", REASONS.LOGIN_TIMEOUT, {
            success: false,
            submitted: false,
            pendingLogin: true,
            error: error instanceof Error ? error.message : "자동 로그인을 완료하지 못했습니다.",
          });
        return result;
      } finally {
        // 로그인됐다고 확인한 탭만 닫는다 — 나머지는 사람이 그 화면을 봐야 안다. 취소된
        // 수집은 남길 화면이 없으므로 닫는다.
        const settled = result?.verdict === "ok" || result?.reason === REASONS.COLLECTION_CANCELLED;
        await driver.closeTab(opened.tab, { context, keepOpen: !settled });
      }
    }

    /**
     * 로그인 폼이 보이면 저장된 계정으로 채워 제출한다. 눌렀다고 로그인된 것은 아니라서
     * 로그인 화면이 사라졌는지까지 보고 답한다. 몰마다 로그인 뒤 화면이 달라(알림 창이 뜨거나
     * 관리자 화면에 비밀번호 칸이 남는다) 폼이 남은 것만으로 비밀번호가 틀렸다고 단정하지 않는다.
     */
    async function fillLoginForm(tabId, credentials, mallKey) {
      const expiresAt = driver.now() + FILL_WINDOW_MS;
      let sawIncompleteLoginForm = false;
      let lastIncompleteReason = null;
      let kidkidsManagementStableSince = null;
      // 한 번이라도 화면을 들여다봤는가. 한 번도 못 봤다면 '이미 로그인됨' 이라고 말할 근거가 없다.
      let sawAnyFrame = false;
      let blindSpot = false;
      // 몰이 알림 창으로 말하는 답("아이디 또는 비밀번호가 일치하지 않습니다")을 받아 둔다.
      // 백그라운드 탭의 알림 창은 그 탭의 스크립트를 멈춰 확인조차 막는다 — 미리 삼켜 둔다.
      await driver.watchDialogs(tabId);
      while (driver.now() < expiresAt) {
        const filled = await driver.fillLoginForm(tabId, credentials);
        // 권한이 없는 주소(로그인 화면이 다른 도메인으로 넘어가는 몰)면 계속 이 길로 떨어진다.
        if (filled.unreachable) blindSpot = true;
        const results = (filled.frames || []).filter(Boolean);
        if (results.length > 0) sawAnyFrame = true;

        const submitted = results.find((result) => result.state === "submitted");
        if (submitted) {
          await driver.delay(AFTER_SUBMIT_MS);
          await driver.waitReady(tabId); // 로그인 후 리다이렉트 정착
          await driver.delay(AFTER_REDIRECT_MS);
          // 몰이 알림 창으로 남긴 답. 왜 안 됐는지는 몰이 가장 잘 안다.
          const mallMessage = await driver.takeDialog(tabId);
          const formRemains = await driver.loginFormRemains(tabId);
          const common = {
            success: true,
            submitted: true,
            ...(mallMessage ? { mallMessage } : {}),
            method: submitted.method || null,
          };
          return formRemains
            ? answer("rejected", REASONS.LOGIN_FORM_REMAINS, {
              ...common,
              verified: false,
              verifyReason: "login_form_remains",
            })
            : answer("ok", REASONS.FORM_SUBMITTED, { ...common, verified: true });
        }

        // 어느 프레임에서도 로그인 폼이 없으면 이미 로그인된 상태로 간주.
        if (results.length && results.every((result) => result.state === "no-login-form")) {
          if (mallKey !== "kidkids") {
            // 이미 로그인된 세션이라 폼이 없다. 저장된 비밀번호를 검증한 것이 아니다.
            return answer("ok", REASONS.ALREADY_SIGNED_IN, { success: true, submitted: false });
          }
          // 키드키즈는 management.htm 로드가 끝난 뒤 클라이언트 리다이렉트로 로그인 페이지를
          // 여는 구간이 있어, 첫 no-login-form 을 성공으로 처리하면 자동 로그인을 건너뛴다.
          const currentUrl = String(await driver.tabUrl(tabId) || "").toLowerCase();
          if (KIDKIDS_VERIFY_URL.test(currentUrl)) {
            return answer("rejected", REASONS.VERIFICATION_REQUIRED, {
              success: false,
              submitted: false,
              pendingLogin: true,
              error: "키드키즈 본인 인증이 필요합니다. 열린 탭에서 인증 후 다시 수집해 주세요.",
            });
          }
          if (KIDKIDS_LOGIN_URL.test(currentUrl)) {
            kidkidsManagementStableSince = null;
          } else if (KIDKIDS_MANAGEMENT_URL.test(currentUrl)) {
            kidkidsManagementStableSince ??= driver.now();
            if (driver.now() - kidkidsManagementStableSince >= KIDKIDS_SETTLE_MS) {
              return answer("ok", REASONS.ALREADY_SIGNED_IN, { success: true, submitted: false });
            }
          } else {
            kidkidsManagementStableSince = null;
          }
          await driver.delay(FILL_RETRY_MS);
          continue;
        }

        const incomplete = results.find((result) =>
          ["incomplete", "credentials-missing"].includes(result.state));
        if (incomplete) {
          sawIncompleteLoginForm = true;
          lastIncompleteReason = incomplete.reason || incomplete.state;
        }
        await driver.delay(FILL_RETRY_MS);
      }

      if (sawIncompleteLoginForm) {
        return answer("unknown", REASONS.LOGIN_FORM_INCOMPLETE, {
          success: false,
          submitted: false,
          pendingLogin: true,
          error: `로그인 폼 자동 입력을 완료하지 못했습니다 (${lastIncompleteReason || "unknown"}). 열린 탭에서 로그인 후 다시 수집해 주세요.`,
        });
      }
      if (mallKey === "kidkids") {
        return answer("unknown", REASONS.LOGIN_STATE_UNCONFIRMED, {
          success: false,
          submitted: false,
          pendingLogin: true,
          error: "키드키즈 로그인 상태를 제한시간 안에 확인하지 못했습니다. 열린 탭에서 로그인 후 다시 수집해 주세요.",
        });
      }
      // 화면을 한 번도 들여다보지 못했다. 확장이 그 주소에 접근할 권한이 없을 때가 대부분이다
      // (쿠팡처럼 로그인 화면이 다른 도메인으로 넘어가는 몰). 이것을 '이미 로그인됨' 으로 답하면
      // 아무도 로그인하지 않은 채 수집이 굴러가 "로그인 필요" 로 끝난다 — 이유를 그대로 말한다.
      if (!sawAnyFrame && blindSpot) {
        let host = "";
        try {
          host = new URL(String(await driver.tabUrl(tabId) || "")).host;
        } catch {
          /* 탭 주소를 못 읽으면 호스트 없이 안내한다. */
        }
        return answer("unknown", REASONS.LOGIN_PAGE_NOT_REACHABLE, {
          success: false,
          submitted: false,
          pendingLogin: true,
          errorCode: REASONS.LOGIN_PAGE_NOT_REACHABLE,
          loginPageUnreachable: true,
          error: `${host || "로그인"} 화면에 확장이 접근할 수 없어 자동 로그인을 하지 못했습니다. 확장을 최신 버전으로 다시 불러온 뒤 다시 시도해 주세요.`,
        });
      }
      return answer("ok", REASONS.ALREADY_SIGNED_IN, { success: true, submitted: false }); // 폼 못 봄
    }

    /**
     * 로그인 상태만 본다 — 로그인됨(`in`) · 로그인 필요(`out`) · 모름(`unknown`).
     * 조용히 읽어 확실하면 그 답을 쓰고, 아니면 관리자 화면을 열어 본다. 로그인은 하지 않고,
     * 아이디 · 비밀번호를 넣지도 누르지도 않는다.
     */
    async function checkLogin(mallKey, siteUrl = "") {
      const passive = await driver.probe(mallKey);
      if (passive.verdict === "in" || passive.verdict === "out") {
        return seen(passive.verdict, passive.reason);
      }
      return lookAtScreen(mallKey, siteUrl);
    }

    /** 관리자 화면을 백그라운드 탭에 열어 로그인 폼 · 인증 화면이 뜨는지 보고 바로 닫는다. */
    async function lookAtScreen(mallKey, siteUrl) {
      const url = entryUrlOf(mallKey) || savedSiteUrl({ siteUrl });
      if (!url) return seen("unknown", REASONS.NO_LOGIN_ADDRESS);
      let origin;
      try {
        origin = new URL(url).origin;
      } catch {
        return seen("unknown", REASONS.NO_LOGIN_ADDRESS);
      }
      if (!(await driver.hasPermission(origin))) {
        return seen("unknown", REASONS.LOGIN_PAGE_NOT_REACHABLE);
      }
      const opened = await driver.openTab(url, null);
      if (!opened.tab) return seen("unknown", REASONS.LOGIN_PAGE_NOT_REACHABLE);
      try {
        await driver
          .withTimeout(driver.waitReady(opened.tab.id), SCREEN_LOAD_TIMEOUT_MS, "login-screen-load")
          .catch(() => undefined);
        // SPA 는 화면을 띄운 뒤 로그인 여부를 확인하고 로그인 화면으로 넘긴다 — 그 시간을 준다.
        await driver.delay(SCREEN_SETTLE_MS);
        let found = null;
        for (let look = 0; look < 2; look += 1) {
          if (look > 0) await driver.delay(SCREEN_SECOND_LOOK_MS);
          found = await lookOnce(opened.tab.id);
          if (found.definite) break;
        }
        return seen(found.verdict, found.reason);
      } finally {
        await driver.closeTab(opened.tab, { context: null, keepOpen: false });
      }
    }

    async function lookOnce(tabId) {
      const { href, frames } = await driver.inspectScreen(tabId);
      const address = String(href || "");
      if (frames?.some((frame) => frame.loginForm) || LOGIN_SCREEN_URL.test(address)) {
        return { verdict: "out", reason: REASONS.LOGIN_PAGE, definite: true };
      }
      if (frames?.some((frame) => frame.verification) || VERIFY_SCREEN_URL.test(address)) {
        return { verdict: "out", reason: REASONS.VERIFICATION_REQUIRED, definite: true };
      }
      // 알림 창이 떠 페이지가 멈췄거나 권한 밖 주소로 넘어갔다. 로그인 필요라고 단정하지 않는다.
      if (!frames || frames.length === 0) {
        return { verdict: "unknown", reason: REASONS.LOGIN_PAGE_NOT_REACHABLE, definite: false };
      }
      return { verdict: "in", reason: REASONS.ADMIN_PAGE, definite: false };
    }

    return Object.freeze({ ensureLoggedIn, checkLogin });
  }

  root.KidItemMallSession = Object.freeze({
    create,
    SPECS,
    REASONS,
    malls: MALLS,
    passiveMalls: PASSIVE_MALLS,
    entryUrlOf,
    savedSiteUrl,
  });
})(globalThis);
