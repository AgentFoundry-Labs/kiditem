// Kiditem 대시보드(localhost/staging) 에 익스텐션 ID 를 자동 등록.
// - manifest.externally_connectable 이 허용한 KidItem origin 에서만,
//   페이지가 chrome.runtime.sendMessage(extId, ...) 로 직접 호출하려면
//   페이지가 익스텐션 ID 를 먼저 알아야 한다.
// - 기존 popup btnRegister 는 수동 클릭. 본 스크립트는 페이지 진입마다 자동으로
//   localStorage["kiditem-ext-id"] 를 최신 chrome.runtime.id 로 갱신.
// - postMessage 도 함께 보내 페이지 측 즉시 감지(폴링 없이도 detect) 가능하게 함.

(() => {
  try {
    const extId = chrome.runtime.id;
    if (!extId) return;

    // 1) localStorage 즉시 갱신 (기존 detectExtensionId 동작과 호환)
    try {
      const cur = localStorage.getItem("kiditem-ext-id");
      if (cur !== extId) {
        localStorage.setItem("kiditem-ext-id", extId);
      }
    } catch {
      /* SecurityError on file:// or sandboxed iframe — ignore */
    }

    // 2) 페이지 측에서 들을 수 있도록 postMessage 도 발사
    try {
      window.postMessage(
        { type: "kiditem:ext-id", extensionId: extId },
        window.location.origin,
      );
    } catch {
      /* noop */
    }

    // 3) 페이지가 추후 요청하면 응답 (handshake 보강)
    window.addEventListener("message", (ev) => {
      if (!ev.data || ev.data.type !== "kiditem:request-ext-id") return;
      try {
        ev.source?.postMessage(
          { type: "kiditem:ext-id", extensionId: extId },
          ev.origin,
        );
      } catch {
        /* noop */
      }
      try {
        localStorage.setItem("kiditem-ext-id", extId);
      } catch {
        /* noop */
      }
    });
  } catch (e) {
    console.warn("[KIDITEM host-bridge] init failed", e);
  }
})();
