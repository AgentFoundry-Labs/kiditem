(function initializeMallSession(root) {
  "use strict";

  // 몰 세션 — 옛 수집 경로(카카오 attempt KID-379, 셀피아·송장 업로드 wave8b)의 저장 자격 로그인(KID-254).
  //
  //   ensureLoggedIn(mallKey, credentials, { collection, tab }) → ok · rejected · unknown
  //
  // 몰 한 줄(`loginUrl · fields`)이 로그인 입구를 적는다. 로그인 상태 확인(`checkMallLogin`)과 계정 화면의 로그인
  // 테스트(`testMallLogin`)는 새 런타임(`extensions/src/sites/mall-session`, KID-366)이 갖는다 — 이 모듈은 옛 경로와 함께
  // 사라진다. 탭을 열고 · 프레임에 스크립트를 넣고 · 알림 창을 삼키는 일은 드라이버 자리다(worker.js가 끼운다).
  //
  // 재시도 간격 · 실패한 몰 차단은 여기 없다. 그건 웹의 정책이고 웹에 남아 있다.

  /**
   * 저장 자격 로그인의 이유 코드. 기계가 읽는 snake_case(`^[a-z][a-z0-9_]{0,63}$`) 모양을 지킨다. 로그인 확인의 이유 코드는 새 런타임(`sites/mall-session/check-specs.ts`)에 있다.
   */
  const REASONS = Object.freeze({
    ALREADY_SIGNED_IN: "already_signed_in",
    FORM_SUBMITTED: "form_submitted",
    LOGIN_FORM_REMAINS: "login_form_remains",
    VERIFICATION_REQUIRED: "verification_required",
    LOGIN_PAGE_NOT_REACHABLE: "login_page_not_reachable",
    UNSUPPORTED_MALL: "unsupported_mall",
    NO_LOGIN_FORM: "no_login_form",
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

  // 키드키즈는 management.htm 을 띄운 뒤 로그인 화면으로 넘기거나 본인확인 화면을 연다.
  const KIDKIDS_VERIFY_URL = /\/security\/verify_user\.htm(?:[?#]|$)/;
  const KIDKIDS_LOGIN_URL = /\/partnerlogin\.htm(?:[?#]|$)|\/join\/partner_login\.htm(?:[?#]|$)/;
  const KIDKIDS_MANAGEMENT_URL = /^https:\/\/partner\.kidkids\.net\/new\/pages\/logis\/management\.htm(?:[?#]|$)/;

  /** 아이디 · 비밀번호만 있는 보통 로그인 폼. */
  const ID_PASSWORD = Object.freeze(["loginId", "password"]);

  function spec({ loginUrl = null, fields = ID_PASSWORD } = {}) {
    return Object.freeze({ loginUrl, fields });
  }

  /**
   * 몰 한 줄 — 옛 수집 경로(카카오 attempt, 셀피아·송장 업로드)가 쓰는 로그인 입구만 남았다. 로그인 상태 확인(주소·로그인
   * 표시)과 계정 화면의 로그인 테스트는 새 런타임(`extensions/src/sites/mall-session`, KID-366)이 갖는다.
   *
   * - `loginUrl`  저장된 계정으로 로그인하러 들어가는 주소. `null` 이면 사장님이 쇼핑몰
   *               계정에 적어 둔 사이트 주소로 들어간다.
   * - `fields`    그 몰 로그인 폼이 받는 입력칸. `null` 은 채울 폼이 없다는 뜻이다.
   *
   * 몰 키는 채널 레지스트리의 철자다(KID-250).
   */
  const SPECS = Object.freeze({
    domeggook: spec({ loginUrl: "https://domeggook.com/sc/order/lstAll" }),
    onch: spec({ loginUrl: "https://www.onch3.co.kr/supplier/orders.php?state=all" }),
    kidsnote: spec({ loginUrl: "https://shop.kidsnote.com/_manage/?body=3010" }),
    // 미로그인 시 management.htm → partner.kidkids.net/partnerLogin.htm → www.kidkids.net/join/partner_login.htm.
    kidkids: spec({ loginUrl: "https://partner.kidkids.net/new/pages/logis/management.htm" }),
    "icecream-mall": spec({ loginUrl: "https://po.i-screammall.co.kr/main.do" }),
    // Cafe24 는 쇼핑몰 아이디와 운영자 아이디를 따로 받는다.
    art09: spec({
      loginUrl: "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1",
      fields: Object.freeze(["supplierLoginId", "loginId", "password"]),
    }),
    "haebub-mall": spec({ loginUrl: "https://mallseller.genimarket.co.kr/mall/order/basket_list.php" }),
    "teacher-mall": spec({ loginUrl: "https://shop.teacherville.co.kr/selleradmin/order/catalog" }),
    boribori: spec({ loginUrl: "https://seller-club.co.kr/order/orderDeliList" }),
    "lotte-on": spec({ loginUrl: "https://store.lotteon.com/cm/main/login_SO.wsp" }),
    "gs-shop": spec({ loginUrl: "https://partners.gsshop.com/logistics/partner-logistics-mng" }),
    ssg: spec(),
    thirtymall: spec(),
    kkomangse: spec({
      loginUrl: "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000",
    }),
    // 쿠팡 직배송은 로켓 계정 행에 저장된 아이디·비밀번호를 쓴다(ADR-0012).
    "coupang-direct": spec({ loginUrl: "https://supplier.coupang.com/po-web/app/purchase-order/list" }),
    rocket: spec(),
    coupang: spec({ loginUrl: "https://wing.coupang.com/" }),
    "benepia-mul": spec(),
    // 카카오(토큰) · 올웨이즈(브라우저 저장소 JWT)는 채울 로그인 폼이 없다.
    kakao: spec({ fields: null }),
    always: spec({ fields: null }),
  });

  const MALLS = Object.freeze(Object.keys(SPECS));

  function specOf(mallKey) {
    const key = typeof mallKey === "string" ? mallKey : "";
    return Object.prototype.hasOwnProperty.call(SPECS, key) ? SPECS[key] : null;
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
     *
     * `collection` 은 수집 시도다(있으면 탭 소유권을 그 시도에 맡긴다). `tab` 은 부른 쪽이
     * 이미 열어 둔 탭이다 — 상품등록 폼이 로그인 풀린 화면을 만났을 때 그 탭 위에서 바로
     * 로그인한다. 그 탭은 부른 쪽 것이라 열지도 닫지도 않는다.
     */
    async function ensureLoggedIn(mallKey, credentials, { collection = null, tab = null } = {}) {
      if (!credentials || !credentials.loginId || !credentials.password) {
        return answer("unknown", REASONS.NO_CREDENTIALS, { success: true, submitted: false });
      }
      const found = specOf(mallKey);
      // 채울 로그인 폼이 없는 몰(카카오 토큰 · 올웨이즈 브라우저 저장소 JWT). 탭을 열어도 넣을 칸이
      // 없어 "폼을 못 봤다 = 이미 로그인됨" 으로 새기만 한다 — 아무도 로그인하지 않은 채
      // 수집이 굴러가 "로그인 필요" 로 끝난다. 스펙의 `fields: null` 을 그대로 말한다.
      if (found && found.fields === null) {
        return answer("unknown", REASONS.NO_LOGIN_FORM, { success: true, submitted: false });
      }
      if (tab) return fillLoginForm(tab.id, credentials, mallKey);
      // 고정 주소가 있는 몰은 그 주소로, 없는 몰은 사장님이 적어 둔 사이트 주소로 들어간다.
      // 둘 다 없으면 어디로 갈지 모르므로 시도하지 않는다 — 시도하지 않았다는 사실을
      // 호출부가 알아야 "확인됨" 으로 잘못 표시하지 않는다.
      const url = (found && found.loginUrl) || savedSiteUrl(credentials);
      if (!url) return answer("unknown", REASONS.UNSUPPORTED_MALL, { success: true, submitted: false });

      // 취소된 수집이 로그인 탭을 만들지 못하도록, 탭을 열기 전에 소유권을 확인한다.
      // 이미 취소됐으면 드라이버가 그대로 던져 수집 lifecycle 이 받는다.
      const opened = await driver.openTab(url, collection);
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
        await driver.ensureActive(collection);
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
        await driver.closeTab(opened.tab, { collection, keepOpen: !settled });
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

    return Object.freeze({ ensureLoggedIn });
  }

  root.KidItemMallSession = Object.freeze({
    create,
    SPECS,
    REASONS,
    malls: MALLS,
    savedSiteUrl,
  });
})(globalThis);
