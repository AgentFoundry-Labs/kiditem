/* global document, getComputedStyle */
// 몰 로그인 확인(KID-366 `checkMallLogin`, 확장 `sites/mall-session/check`)이 확인용 탭의 모든 프레임에 넣는 읽기 파일.
// 옛 `orders/worker.js` `inspectMallLoginScreen`을 옮겼다. 보이는 입력칸만 보고 로그인 폼·인증번호 화면인지 답한다 —
// 아무것도 채우거나 누르지 않고, 주소·본문을 돌려주지 않는다. 마지막 식의 값이 `executeScript` 결과다.
(function inspectKidItemLoginScreen() {
  "use strict";
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const typeOf = (input) => String(input.type || "text").toLowerCase();
  const inputs = Array.from(document.querySelectorAll("input")).filter((input) => visible(input) && !input.disabled);
  const password = inputs.some((input) => typeOf(input) === "password");
  const idField = inputs.some((input) => ["", "text", "email", "tel"].includes(typeOf(input)));
  const describe = (input) => [input.name, input.id, input.placeholder, input.getAttribute("aria-label")].filter(Boolean).join(" ");
  const codeField = inputs.some((input) =>
    ["", "text", "tel", "number"].includes(typeOf(input)) && /인증|otp|code|auth|번호/i.test(describe(input)));
  const text = String((document.body && document.body.innerText) || "").slice(0, 8000);
  const verificationText = /본인\s*인증|본인\s*확인|인증\s*번호|OTP|SMS\s*인증|2단계\s*인증|추가\s*인증|휴대폰\s*인증/i.test(text);
  return { loginForm: password && idField, verification: !password && codeField && verificationText };
})();
