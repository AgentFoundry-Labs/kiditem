(function initializeMallSessionProbe(root) {
  "use strict";

  // 몰 관리자 로그인 상태를 **조용히** 확인한다 — 로그인은 하지 않는다.
  //
  // 몰마다 정해진 읽기 전용 주소 하나를 사용자 쿠키로 한 번 읽고, 확실한 표시가 있을 때만
  // 판단한다. 로그인됨은 로그인해야만 보이는 표시(주문 목록 · 로그아웃 링크 · 관리자 JSON)가
  // 있을 때, 로그인 필요는 로그인 화면으로 넘어가거나(리다이렉트 · 401/403) 몰이 로그인하라고
  // 답할 때뿐이다. 나머지는 확인 불가다.
  //
  // 응답에는 상태와 이유 코드만 담는다 — 주소 · 본문 · 헤더 · 쿠키는 돌려주지 않는다. 웹은
  // 몰 키만 보낼 수 있고, 주소는 여기 고정 목록에서만 나온다. 데이터를 바꾸거나 감사 기록을
  // 남기는 주소(엑셀 생성 · 다운로드 사유 · 등록 화면)는 넣지 않는다.

  const LOGIN_PATH = /\/(?:login|signin)|loginform|partnerlogin|partner_login/i;
  const VERIFY_PATH = /\/security\/verify_user\.htm$/i;
  const PASSWORD_INPUT = /<input[^>]*type\s*=\s*["']?password/i;
  const LOGOUT_MARKER = /로그아웃|\/logout\b|logout\.(?:php|do|html?|asp)/i;
  const LOGIN_TEXT = /로그인|login/i;

  function verdict(state, reason) {
    return { state, reason };
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
  function htmlDetect(signedInMarker) {
    return (page) => {
      if (LOGIN_PATH.test(page.finalPath)) return verdict("signed_out", "login_page");
      if (anyText(page.texts, signedInMarker)) return verdict("signed_in", "admin_page");
      if (anyText(page.texts, PASSWORD_INPUT)) return verdict("signed_out", "login_page");
      return verdict("unknown", "unrecognized_page");
    };
  }

  // 관리자 JSON 주소: 기대한 모양이면 로그인됨, 몰이 로그인하라고 답하면 로그인 필요.
  // 모양이 다르기만 한 응답은 로그인 여부의 증거가 아니므로 확인 불가로 둔다.
  function jsonDetect(isSignedIn, isSignedOut) {
    return (page) => {
      const json = parseJson(page.texts[0]);
      if (json && isSignedIn(json)) return verdict("signed_in", "admin_api");
      if (json && isSignedOut && isSignedOut(json)) return verdict("signed_out", "login_required_response");
      if (LOGIN_PATH.test(page.finalPath) || anyText(page.texts, PASSWORD_INPUT)) {
        return verdict("signed_out", "login_page");
      }
      if (!json && anyText(page.texts, LOGIN_TEXT)) return verdict("signed_out", "login_page");
      return verdict("unknown", "unrecognized_page");
    };
  }

  // 몰 키는 서버(주문수집 계정 · 매니페스트)의 키다. 주소는 주문수집이 이미 쓰는 읽기 전용
  // 화면이고, 모두 manifest host_permissions 안에 있다.
  const SPECS = Object.freeze({
    domeggook: Object.freeze({
      url: "https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1",
      headers: Object.freeze({ "x-requested-with": "XMLHttpRequest" }),
      // 로그인돼 있으면 엑셀 생성 목록(dat 배열)이 온다. 로그아웃이면 200 에
      // {"res":false,"msg":"로그인이 필요합니다"} 를 준다(2026-09-12 실측).
      detect: jsonDetect(
        (json) => Array.isArray(json?.dat),
        (json) => json?.res === false,
      ),
    }),
    onch: Object.freeze({
      // 분류 AJAX 는 로그아웃일 때도 200 에 일반 실패 메시지만 줘서 로그인 여부를 가릴 수 없다.
      // 공급사 주문 목록 화면은 로그아웃이면 /login/login_web.php 로 넘어간다(2026-09-12 실측).
      url: "https://www.onch3.co.kr/supplier/orders.php?state=all",
      detect: htmlDetect(/로그아웃|order_detail_supplier/),
    }),
    kidsnote: Object.freeze({
      url: "https://shop.kidsnote.com/_manage/?body=3010",
      detect: htmlDetect(/주문번호|로그아웃/),
    }),
    kidkids: Object.freeze({
      url: "https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=1",
      detect: (page) => {
        // 로그인 뒤에 따로 오는 본인확인 화면. 주문 목록이 아니므로 로그인됨으로 치지 않는다.
        if (VERIFY_PATH.test(page.finalPath)) return verdict("signed_out", "verification_required");
        const found = htmlDetect(/name\s*=\s*["']?CheckBox2|로그아웃/)(page);
        if (found.state !== "unknown") return found;
        // 주문이 0건이면 CheckBox2 가 없다. 로그인 화면으로 넘어가지 않고 비밀번호 칸도 없이
        // 출고관리 목록에 머물렀으면 로그인된 빈 목록이다 — 주문수집기와 같은 판정이다.
        return /\/logis\/logis_index\.htm$/i.test(page.finalPath) ? verdict("signed_in", "admin_page") : found;
      },
    }),
    "icecream-mall": Object.freeze({
      url: "https://po.i-screammall.co.kr/main.do",
      detect: htmlDetect(LOGOUT_MARKER),
    }),
    art09: Object.freeze({
      url: "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1",
      // Cafe24 는 로그인된 화면에도 '로그인' 글자와 비밀번호 칸이 있다. 주문목록에 머물렀는지만 본다.
      detect: (page) =>
        /order_list\.php$/i.test(page.finalPath)
          ? verdict("signed_in", "admin_page")
          : verdict("signed_out", "redirected_away"),
    }),
    "haebub-mall": Object.freeze({
      url: "https://mallseller.genimarket.co.kr/mall/order/basket_list.php",
      detect: htmlDetect(LOGOUT_MARKER),
    }),
    "teacher-mall": Object.freeze({
      // 로그아웃이면 로그인 화면이 http:// 를 한 번 거친다. 그 주소는 권한 밖이라 따라가지
      // 못하고 fetch 가 실패한다 — 아래 '튕겨 나갔다' 확인이 그 경우를 로그인 필요로 읽는다.
      url: "https://shop.teacherville.co.kr/selleradmin/order/catalog",
      detect: htmlDetect(/excel_down_form|로그아웃/),
    }),
    kkomangse: Object.freeze({
      url: "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1",
      detect: htmlDetect(/form_list|로그아웃/),
    }),
  });

  const MALLS = Object.freeze(Object.keys(SPECS));

  function decodeAll(buffer) {
    const texts = [new TextDecoder("utf-8").decode(buffer)];
    // euc-kr 몰(키드키즈 등)은 utf-8 로 읽으면 한글이 깨진다. 깨졌으면 euc-kr 로도 읽어 둘 다 본다.
    if (texts[0].includes("�")) {
      try {
        texts.push(new TextDecoder("euc-kr").decode(buffer));
      } catch {
        // 이 런타임에 euc-kr 디코더가 없다 — utf-8 결과만으로 판단한다.
      }
    }
    return texts;
  }

  function pathOf(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  }

  function create({ fetch: fetchImpl, timeoutMs = 8000 } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("mall session probe needs fetch");

    async function request(spec, redirect, signal) {
      return fetchImpl(spec.url, {
        method: "GET",
        credentials: "include",
        redirect,
        cache: "no-store",
        headers: { ...(spec.headers || {}) },
        signal,
      });
    }

    async function probe(mallKey) {
      const key = typeof mallKey === "string" ? mallKey : "";
      const spec = Object.prototype.hasOwnProperty.call(SPECS, key) ? SPECS[key] : null;
      if (!spec) return { success: true, mallKey: key, state: "unknown", reason: "no_passive_check" };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const answer = (result) => ({ success: true, mallKey: key, state: result.state, reason: result.reason });
      try {
        let response;
        try {
          response = await request(spec, "follow", controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          // 로그인 화면이 권한 밖 주소(http · 통합 로그인)로 넘기면 따라가지 못해 fetch 가 실패한다.
          // 관리자 전용 주소에서 튕겨 나갔다는 사실만 다시 확인한다 — 어디로 갔는지는 보지도
          // 돌려주지도 않는다.
          const manual = await request(spec, "manual", controller.signal);
          const bounced = manual.type === "opaqueredirect" || (manual.status >= 300 && manual.status < 400);
          return answer(bounced ? verdict("signed_out", "redirected_away") : verdict("unknown", "network_error"));
        }
        if (response.status === 401 || response.status === 403) {
          return answer(verdict("signed_out", "http_unauthorized"));
        }
        const page = {
          finalPath: pathOf(String(response.url || spec.url)),
          texts: decodeAll(await response.arrayBuffer()),
        };
        return answer(spec.detect(page));
      } catch {
        return answer(verdict("unknown", controller.signal.aborted ? "timeout" : "network_error"));
      } finally {
        clearTimeout(timer);
      }
    }

    return Object.freeze({ probe, malls: MALLS });
  }

  root.KidItemMallSessionProbe = Object.freeze({ create, malls: MALLS });
})(globalThis);
