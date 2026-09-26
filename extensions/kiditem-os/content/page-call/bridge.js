// 페이지 호출 브리지(ISOLATED world, KID-359 H3). 확장 런타임 사이트(`extensions/src/sites/page-call.ts`)가
// `chrome.tabs.sendMessage`로 `{type: "KIDITEM_PAGE_CALL", call, args}`를 보내면, 같은 world에 등록된 처리기
// (`__kiditemIsolatedPageCalls[call]`)를 부르거나 MAIN world 러너(`runner.js`)에 `postMessage`로 넘기고 답을 돌려준다.
// 처리기가 어디에도 없으면 `content_script_missing`으로 답해 호출하는 쪽이 파일을 주입하고 다시 묻게 한다.
// 인자는 파일 주입으로는 넘길 수 없어서(`func.toString()` 금지 — src/README.md) 이 메시지 길을 쓴다.
(function installKidItemPageBridge() {
  "use strict";
  if (globalThis.__kiditemPageBridgeLoaded) return;
  globalThis.__kiditemPageBridgeLoaded = true;

  const CALL = "__kiditem_page_call";
  const ACK = "__kiditem_page_ack";
  const RESULT = "__kiditem_page_result";
  /** MAIN 러너가 받았다고 알리기까지 기다리는 시간. 넘으면 러너가 없는 것이다. */
  const ACK_WAIT_MS = 1000;
  const isolatedCalls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const pending = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data.id !== "string") return;
    const entry = pending.get(data.id);
    if (!entry) return;
    if (data.type === ACK) {
      entry.acked = true;
      return;
    }
    if (data.type === RESULT) {
      pending.delete(data.id);
      entry.resolve(data.answer);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "KIDITEM_PAGE_CALL" || typeof message.call !== "string") return undefined;
    run(message.call, message.args).then(sendResponse);
    return true;
  });

  async function run(call, args) {
    const local = isolatedCalls[call];
    if (typeof local === "function") {
      try {
        return { ok: true, value: await local(args) };
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
      }
    }
    return viaMain(call, args);
  }

  function viaMain(call, args) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const entry = { acked: false, resolve };
      pending.set(id, entry);
      window.postMessage({ type: CALL, id, call, args }, window.location.origin);
      setTimeout(() => {
        if (entry.acked || pending.get(id) !== entry) return;
        pending.delete(id);
        resolve({ ok: false, error: "content_script_missing" });
      }, ACK_WAIT_MS);
    });
  }
})();
