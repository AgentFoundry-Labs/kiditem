(function initializeOrderCollectionFailure(root) {
  "use strict";

  // KID-379: 옛 몰 소유자 경로(카카오)의 실패 증거. 몰마다의 화면 구조 문구(도매꾹·아이스크림몰·아트공구)와 GS샵 SMS
  // 인증 분기는 그 몰들이 실행 kind로 옮겨 지웠다(KID-380) — 실행 kind 사이트는 `extensions/src`에서 제 코드를 낸다.
  // 추가 인증 화면을 로그인 화면과 구분하는 패턴. 웹의 `isAuthRequiredMessage` 와
  // 같은 뜻이어야 하므로 한쪽만 고치지 말 것. 맨 "인증" 한 단어는 로그인 안내문에도
  // 흔히 섞여 오므로 넣지 않는다.
  const AUTH_PATTERNS =
    /인증번호|인증이?\s*필요|SMS\s*인증|인증\s*방식|2단계\s*인증|추가\s*인증|OTP/i;
  const STABLE_CODES = new Set([
    "login_required",
    "operator_action_required",
    "provider_contract_changed",
    "network_failed",
    "unknown_failure",
  ]);

  function messageOf(value) {
    if (typeof value?.error === "string") return value.error;
    if (typeof value?.message === "string") return value.message;
    return typeof value === "string" ? value : String(value || "");
  }

  function createEvidence(provider, value) {
    const message = messageOf(value);
    let code = "unknown_failure";
    let retryable = false;
    let operatorAction = null;

    // 인증(SMS/2단계/OTP)은 로그인과 조치가 다르므로 화면에도 "인증"으로 떠야 한다.
    // 인증 안내문에는 "로그인"이 섞여 오는 경우가 많아, 반드시 로그인 판별보다 먼저 본다.
    if (value?.pendingAuth === true || AUTH_PATTERNS.test(message)) {
      code = "operator_action_required";
      retryable = true;
      operatorAction = "complete_auth";
    } else if (STABLE_CODES.has(value?.errorCode)) {
      code = value.errorCode;
      retryable = code === "login_required" || code === "operator_action_required" || code === "network_failed";
      operatorAction = code === "login_required" ? "complete_login" : null;
    } else if (
      /failed to fetch|networkerror|network request failed|net::err_/i.test(message)
    ) {
      code = "network_failed";
      retryable = true;
    } else if (
      value?.pendingLogin === true
      || /로그인(?:이|을)?\s*(?:필요|만료|확인|완료|\/)|로그인 후 다시|세션이? (?:없|만료)|cannot access contents|frame with id|no frame with id|frame was removed|cannot be scripted|must request permission|receiving end does not exist|no tab with id/i.test(message)
    ) {
      code = "login_required";
      retryable = true;
      operatorAction = "complete_login";
    }

    return {
      version: 1,
      provider,
      action: "collect_orders",
      code,
      retryable,
      operatorAction,
    };
  }

  root.KidItemOrderCollectionFailure = Object.freeze({ createEvidence });
})(globalThis);
