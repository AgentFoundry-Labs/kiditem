// 페이지 호출 러너(MAIN world, KID-359 H3). 브리지(`bridge.js`)가 넘긴 호출을 MAIN world 처리기
// (`window.__kiditemPageCalls[call]`)로 부른다 — 페이지와 같은 출처·쿠키·페이지 변수로 몰 화면을 읽어야 하는 사이트.
// 처리기가 없으면 곧바로 `content_script_missing`으로 답해 호출하는 쪽이 처리기 파일을 주입하고 다시 묻게 한다.
// 답은 처리기가 돌려준 값만 싣는다(원본 응답·헤더·쿠키는 싣지 않는다).
(function installKidItemPageRunner() {
  "use strict";
  if (window.__kiditemPageRunnerLoaded) return;
  window.__kiditemPageRunnerLoaded = true;

  const CALL = "__kiditem_page_call";
  const ACK = "__kiditem_page_ack";
  const RESULT = "__kiditem_page_result";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  function post(message) {
    window.postMessage(message, window.location.origin);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== CALL || typeof data.id !== "string" || typeof data.call !== "string") return;
    const handler = calls[data.call];
    if (typeof handler !== "function") {
      post({ type: RESULT, id: data.id, answer: { ok: false, error: "content_script_missing" } });
      return;
    }
    post({ type: ACK, id: data.id });
    let answer;
    try {
      answer = { ok: true, value: await handler(data.args) };
    } catch (error) {
      answer = { ok: false, error: String((error && error.message) || error) };
    }
    post({ type: RESULT, id: data.id, answer });
  });
})();
