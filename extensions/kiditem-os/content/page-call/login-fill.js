// 사이트 로그인 폼 채우기(ISOLATED world, KID-377 — 옛 worker.js `autoSubmitIcecreamMallLogin` 이식). 두 길로 쓴다.
// - `TabPage.frames`로 모든 프레임에 넣으면 파일의 마지막 값 `{ loginForm }`이 프레임마다 돌아온다: 보이는 비밀번호
//   칸 곁에 아이디 칸이 있는가(값을 넣거나 누르지 않는다). 사이트 로그인 단계가 어느 프레임에 폼이 있는지 고른다.
// - 페이지 호출(`bridge.js`)의 처리기 `login.fill`: `{ values: { loginId, password, supplierLoginId? } }`를 받아
//   칸을 채우고 로그인 버튼을 누른 뒤 `{ state, method?, reason? }`만 돌려준다(값은 돌려주지 않는다).
// 저장 자격은 런타임 메시지(`chrome.tabs.sendMessage`)로 이 탭의 이 파일에만 온다 — 옛 `executeScript` 인자와 같은
// 노출이다(src/README.md). 저장하지도, 페이지(MAIN world)에 넘기지도 않는다 — 호출은 `world: "isolated"`라 이 처리기가
// 없는 문서(프레임이 옮겨 감)에서는 브리지가 MAIN으로 넘기지 않고 이 파일을 다시 넣게 한다.
(function installKidItemLoginFill() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  calls["login.fill"] = (args) => fillLogin(args && typeof args === "object" ? args.values : null);
  // 보내기가 실제로 나갔는지(재QA 3 D1): 누를 때 이 문서에 표시를 남기고, 막히지 않은 submit 이벤트를 보면 나간 것으로 적는다.
  // 몰의 폼 검사(form_check·캡차)가 막으면 같은 문서에 "채웠지만 보내지 않음"이 남는다 — 사이트 로그인 단계가 거절로 단정하지 않는다.
  // 보내기로 문서가 바뀌면 표시가 없다(새 문서).
  if (!globalThis.__kiditemLoginSubmitWatch && typeof window.addEventListener === "function") {
    globalThis.__kiditemLoginSubmitWatch = true;
    window.addEventListener("submit", (event) => {
      const mark = globalThis.__kiditemLoginSubmit;
      if (mark && !event.defaultPrevented) mark.observed = true;
    });
  }
  const password = pickPasswordInput();
  const mark = globalThis.__kiditemLoginSubmit;
  const loginForm = Boolean(password && pickLoginIdInput(password));
  return mark ? { loginForm, filledHere: true, submitObserved: mark.observed === true } : { loginForm };

  function fillLogin(values) {
    const passwordInput = pickPasswordInput();
    // 비밀번호 칸이 아직 없음 → 로그인 폼 미표시(이미 로그인했거나 렌더 전). 부른 쪽이 다시 본다.
    if (!passwordInput) return { state: "no-login-form" };
    if (!values || !values.loginId || !values.password) return { state: "credentials-missing" };

    const supplierLoginInput = values.supplierLoginId ? pickSupplierLoginIdInput(passwordInput) : null;
    const loginInput = values.supplierLoginId
      ? pickCafe24ShopIdInput(passwordInput, supplierLoginInput)
      : pickLoginIdInput(passwordInput);
    // Cafe24(아트공구) 로그인은 대표운영자 탭이 열린 채로 뜬다 — 공급사 아이디가 있는데 칸이 모자라면 공급사 탭을 눌러
    // 세 칸 폼을 열고 다음 바퀴에 채운다(실기기 R3).
    if (values.supplierLoginId && (!loginInput || !supplierLoginInput)) {
      const supplierTab = findSupplierTab();
      if (supplierTab) {
        activate(supplierTab, "supplier-tab");
        return { state: "incomplete", reason: "supplier-tab-opened" };
      }
    }
    // 비번칸은 떴는데 ID칸이 아직 안 보임 → 다음 스캔에서 재시도.
    if (!loginInput) return { state: "incomplete", reason: "id-input-not-found" };
    if (values.supplierLoginId && !supplierLoginInput) return { state: "incomplete", reason: "supplier-id-input-not-found" };

    setInputValue(loginInput, values.loginId);
    if (supplierLoginInput) setInputValue(supplierLoginInput, values.supplierLoginId);
    setInputValue(passwordInput, values.password);

    // 캡차가 붙은 폼(Cafe24 reCAPTCHA 등)은 사람이 풀어야 보내진다 — 칸만 채우고 누르지 않는다(재QA 3 D1).
    if (captchaShown(passwordInput)) return { state: "verification_required", reason: "captcha" };

    globalThis.__kiditemLoginSubmit = { observed: false };
    const method = triggerLogin(passwordInput);
    return method ? { state: "submitted", method } : { state: "incomplete", reason: "submit-not-found" };
  }

  // 정확 셀렉터(#password) 우선, 못 찾으면 일반 휴리스틱.
  function pickPasswordInput() {
    const exact = document.querySelector("input#password, input[name='password']");
    if (exact && isVisibleInput(exact)) return exact;
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        const type = String(input.type || "").toLowerCase();
        const descriptor = inputDescriptor(input);
        return (
          isVisibleInput(input) &&
          (type === "password" ||
            descriptor.includes("비밀번호") ||
            descriptor.includes("password") ||
            descriptor.includes("passwd") ||
            descriptor.includes("pwd"))
        );
      }) || null
    );
  }

  // 정확 셀렉터(#loginId) 우선, 못 찾으면 폼/문서에서 랭킹.
  function pickLoginIdInput(anchor) {
    const exact = document.querySelector("input#loginId, input[name='loginId']");
    if (exact && isVisibleInput(exact)) return exact;
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return rankLoginInputs(inputs, anchor)[0] || null;
  }

  function pickSupplierLoginIdInput(anchor) {
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return inputs.find((input) => /공급사|supplier|vendor/.test(inputDescriptor(input))) || rankLoginInputs(inputs, anchor)[0] || null;
  }

  function pickCafe24ShopIdInput(anchor, supplierInput) {
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length < 2 && form !== document) inputs = textInputs(document);
    const candidates = inputs.filter((input) => input !== supplierInput);
    return candidates.find((input) => /쇼핑몰|mall.?id|shop.?id|cafe24/.test(inputDescriptor(input))) || candidates[0] || null;
  }

  /** 그 로그인 폼(없으면 문서)에 보이는 캡차 위젯이 있는가 — reCAPTCHA·hCaptcha. 숨은 탭의 위젯은 보지 않는다. */
  function captchaShown(anchor) {
    const root = anchor.closest("form") || document;
    return Array.from(
      root.querySelectorAll(".g-recaptcha, .gRecaptcha, iframe[src*='recaptcha'], .h-captcha, iframe[src*='hcaptcha']"),
    ).some(isVisibleControl);
  }

  /** 로그인 화면의 "공급사" 탭(Cafe24 eclogin). 폼 안의 버튼·안내 링크가 아닌, 글자가 딱 "공급사"(로그인)인 보이는 컨트롤. */
  function findSupplierTab() {
    const matches = Array.from(document.querySelectorAll("a,button,li,label,[role='tab'],[role='button']"))
      .filter(isVisibleControl)
      .filter((element) => /^공급사(?:\s*(?:로그인|관리자))?$/.test(String(element.textContent || "").replace(/\s+/g, " ").trim()));
    // 가장 안쪽(클릭 처리기가 붙는 a·button)을 누른다 — <li><a>공급사</a></li>에서 li를 누르면 a의 처리기가 돌지 않는다.
    return matches.find((element) => !matches.some((other) => other !== element && element.contains(other))) || null;
  }

  function textInputs(root) {
    return Array.from(root.querySelectorAll("input")).filter((input) => {
      const type = String(input.type || "text").toLowerCase();
      return ["", "text", "email", "tel", "search", "number"].includes(type) && isVisibleInput(input);
    });
  }

  // 로그인 실행. 앞쪽일수록 확실한 신호라 순서를 지킨다(옛 규칙 그대로). 어떤 경로로 눌렀는지 돌려준다.
  function triggerLogin(anchor) {
    // 1) onclick 에 로그인 핸들러가 든 컨트롤
    const byHandler = Array.from(document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"))
      .filter(isVisibleControl)
      .find((el) => /do_?login|fn_?login|go_?login|login_?proc|loginsubmit/i.test(el.getAttribute("onclick") || ""));
    if (byHandler) return activate(byHandler, "onclick-handler");

    const form = anchor.closest("form");

    // 2) 텍스트가 정확히 "로그인"/"login"
    const byText = findLoginControl(form || document) || (form ? findLoginControl(document) : null);
    if (byText) return activate(byText, "exact-text");

    // 3) form 안의 submit 컨트롤 / form submit
    if (form) {
      const submitControl = Array.from(form.querySelectorAll("input[type='submit'],button[type='submit']")).filter(isVisibleControl)[0];
      if (submitControl) {
        submitControl.click();
        return "form-submit-control";
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return "form-request-submit";
      }
      if (form.submit) {
        form.submit();
        return "form-submit";
      }
    }

    // 4) 텍스트 느슨한 일치 — "로그인하기", "Sign in" 등. 링크·안내문은 부정 목록으로 거른다.
    const byLooseText = findLoginControlLoose(form || document);
    if (byLooseText) return activate(byLooseText, "loose-text");

    // 5) id/class/name 에 login 이 든 버튼 (아이콘만 있는 버튼 대응)
    const byAttribute = Array.from(
      document.querySelectorAll(
        "button[id*='login' i],button[class*='login' i],a[id*='login' i],a[class*='login' i]," +
          "input[type='image'][id*='login' i],input[type='button'][id*='login' i]",
      ),
    ).filter(isVisibleControl).filter((el) => !isLoginDecoy(el))[0];
    if (byAttribute) return activate(byAttribute, "attribute-match");

    // 6) 마지막 수단 — 비밀번호 칸에서 Enter(폼이 없는 SPA 로그인 화면).
    for (const type of ["keydown", "keypress", "keyup"]) {
      anchor.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
    return "password-enter";
  }

  // `<a href="javascript:…">`(롯데ON `mf_btn_login`)를 그냥 누르면 이 world에서 `javascript:` 주소로 가려다 CSP 오류가 난다
  // (KID-380 D9). 폼 안이든 밖이든 화면의 클릭 처리기(onclick·jQuery 로그인)는 돌게 두고 주소 이동만 막는다 — 폼을 대신
  // 제출하면 그 처리기가 건너뛰어져 폼이 남고, 거절된 자격으로 오판해 몰이 막힌다(리뷰 MUST 1).
  function activate(control, method) {
    const href = control.tagName === "A" ? String(control.getAttribute("href") || "") : "";
    if (!/^\s*javascript:/i.test(href)) {
      control.click();
      return method;
    }
    const stopNavigation = (event) => {
      if (event.target === control || control.contains(event.target)) event.preventDefault();
    };
    window.addEventListener("click", stopNavigation, true);
    try {
      control.click();
    } finally {
      window.removeEventListener("click", stopNavigation, true);
    }
    return method;
  }

  /** 로그인 버튼이 아닌데 "로그인" 글자가 든 것들. 누르면 엉뚱한 데로 간다. */
  function isLoginDecoy(el) {
    const text = String(el.textContent || el.value || "").replace(/\s+/g, " ").trim();
    return /faq|찾기|재설정|회원가입|가입|안내|문의|고객센터|간편|sns|카카오톡|네이버로|자동\s*로그인/i.test(text);
  }

  function controlText(control, withAlt) {
    return String(
      control.textContent ||
        control.value ||
        control.getAttribute("title") ||
        (withAlt ? control.getAttribute("alt") : "") ||
        control.getAttribute("aria-label") ||
        "",
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function findLoginControlLoose(root) {
    return (
      Array.from(root.querySelectorAll("a,button,input[type='button'],input[type='submit'],input[type='image'],[role='button'],[onclick]"))
        .filter(isVisibleControl)
        .filter((el) => !isLoginDecoy(el))
        .find((control) => {
          const text = controlText(control, true);
          if (!text || text.length > 12) return false; // 긴 문장은 버튼이 아니다
          return /로그인|login|sign\s?in|접속하기/i.test(text);
        }) || null
    );
  }

  function findLoginControl(root) {
    const controls = Array.from(root.querySelectorAll("a,button,input[type='button'],input[type='submit'],[role='button'],[onclick]")).filter(isVisibleControl);
    return controls.find((control) => {
      const text = controlText(control, false);
      return text === "로그인" || text.toLowerCase() === "login";
    }) || null;
  }

  function rankLoginInputs(inputs, anchor) {
    return inputs
      .map((input) => ({ input, score: loginInputScore(input, anchor) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.input);
  }

  function loginInputScore(input, anchor) {
    const descriptor = inputDescriptor(input);
    let score = 1;
    if (descriptor.includes("아이디")) score += 6;
    if (descriptor.includes("loginid")) score += 6;
    if (descriptor.includes("id")) score += 4;
    if (descriptor.includes("login")) score += 4;
    if (descriptor.includes("user")) score += 3;
    if (descriptor.includes("email")) score += 2;
    if (anchor && input.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) score += 3;
    return score;
  }

  function associatedLabelText(input) {
    const labels = [];
    if (input.labels) labels.push(...Array.from(input.labels).map((label) => label.textContent || ""));
    const parentLabel = input.closest("label");
    if (parentLabel) labels.push(parentLabel.textContent || "");
    return labels.join(" ");
  }

  function setInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisibleInput(input) {
    return isVisibleControl(input) && !input.readOnly;
  }

  function inputDescriptor(input) {
    return [input.name, input.id, input.placeholder, input.title, input.getAttribute("aria-label"), associatedLabelText(input)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleControl(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !element.disabled;
  }
})();
