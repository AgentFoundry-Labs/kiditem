// 몰 폼 [등록] 관문(KID-322). 서비스워커가 `orders/mall-form-register.js` 보다 먼저 싣고, 등록 모듈은
// `self.KidItemMallFormSubmitGate` 로 읽는다.
//
// [등록]은 등록 대상 실행 안에서만 누른다 — 웹이 `submit: true` 를 보내고, 서버가 준 실행 컨텍스트
// (executionId · payloadHash · leaseToken)가 셋 다 비지 않은 문자열일 때뿐이다. 컨텍스트가 없는
// 빠른 등록은 폼만 채운다. 실행 fence 밖에서 몰에 상품이 올라가는 길을 막는 마지막 자리다(ADR-0014).
(function initializeMallFormSubmitGate(root) {
  "use strict";

  var EXECUTION_CONTEXT_FIELDS = ["executionId", "payloadHash", "leaseToken"];

  function completeExecutionContext(context) {
    if (!context || typeof context !== "object" || Array.isArray(context)) return false;
    return EXECUTION_CONTEXT_FIELDS.every(function (field) {
      return typeof context[field] === "string" && context[field].trim() !== "";
    });
  }

  /** 웹이 [등록]까지 부탁했고(`submit === true`) 살아 있는 실행 컨텍스트가 있을 때만 true. */
  function shouldPressRegister(input) {
    return Boolean(input) && input.submit === true && completeExecutionContext(input.executionContext);
  }

  root.KidItemMallFormSubmitGate = Object.freeze({
    EXECUTION_CONTEXT_FIELDS: Object.freeze(EXECUTION_CONTEXT_FIELDS.slice()),
    shouldPressRegister: shouldPressRegister,
  });
})(typeof self !== "undefined" ? self : globalThis);
