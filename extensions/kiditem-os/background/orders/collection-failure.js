(function initializeOrderCollectionFailure(root) {
  "use strict";

  const CONTRACT_PATTERNS = Object.freeze({
    domeggook: [/생성 요청 모달을? (?:열지|찾지) 못했습니다/],
    "icecream-mall": [/로그인 후 화면으로 넘어가지 않았습니다/],
    art09: [/주문목록에서 주문번호를 찾지 못했습니다/],
  });
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
    const providerPatterns = CONTRACT_PATTERNS[provider] || [];
    let code = "unknown_failure";
    let retryable = false;
    let operatorAction = null;

    if (
      provider === "gs-shop"
      && /인증번호\s*받기|SMS\s*인증|인증방식/i.test(message)
    ) {
      code = "operator_action_required";
      retryable = true;
      operatorAction = "complete_sms_auth";
    } else if (STABLE_CODES.has(value?.errorCode)) {
      code = value.errorCode;
      retryable = code === "login_required" || code === "operator_action_required" || code === "network_failed";
      operatorAction = code === "login_required"
        ? "complete_login"
        : code === "operator_action_required" && provider === "gs-shop"
          ? "complete_sms_auth"
          : null;
    } else if (providerPatterns.some((pattern) => pattern.test(message))) {
      code = "provider_contract_changed";
    } else if (
      /failed to fetch|networkerror|network request failed|net::err_/i.test(message)
    ) {
      code = "network_failed";
      retryable = true;
    } else if (
      value?.pendingLogin === true
      || /로그인이? (?:필요|만료)|로그인을? (?:확인|완료)|로그인 후 다시|세션이? (?:없|만료)|cannot access contents|frame with id|no frame with id|frame was removed|cannot be scripted|must request permission|receiving end does not exist|no tab with id/i.test(message)
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
