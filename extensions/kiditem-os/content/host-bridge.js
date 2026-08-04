// KidItem 대시보드(local/office)에 익스텐션 ID를 자동 등록.
//
// - manifest.externally_connectable 이 허용한 KidItem origin 에서만, 페이지가
//   chrome.runtime.sendMessage(extId, ...) 로 직접 호출하려면 페이지가 익스텐션
//   ID 를 먼저 알아야 한다.
// - 페이지 진입마다 localStorage 를 최신 chrome.runtime.id 로 갱신하고,
//   postMessage 도 함께 발사해 폴링 없이 즉시 감지되게 한다.
// - 주문수집 / 쿠팡 / 소싱 확장을 하나로 합치기 전에는 확장마다 자기 채널로만
//   답했다. 이제 확장이 하나이므로 세 채널 모두에 같은 ID 로 답한다. 웹앱의
//   detectExtensionId / detectSourcingExtensionId / detectOrderCollectionExtensionId
//   는 그대로 두고도 동일한 확장을 가리키게 된다.
// - 인증 토큰은 서비스워커로 가는 chrome.runtime.sendMessage 로만 오간다.
//   페이지 월드 postMessage 로는 절대 내보내지 않는다.

(() => {
  const CHANNELS = [
    {
      storageKey: "kiditem-ext-id",
      requestType: "kiditem:request-ext-id",
      responseType: "kiditem:ext-id",
    },
    {
      storageKey: "kiditem-order-ext-id",
      requestType: "kiditem:request-order-ext-id",
      responseType: "kiditem:order-ext-id",
    },
    {
      storageKey: "kiditem-sourcing-ext-id",
      requestType: "kiditem:request-sourcing-ext-id",
      responseType: "kiditem:sourcing-ext-id",
    },
  ];

  try {
    const extId = chrome.runtime.id;
    if (!extId) return;

    const remember = (storageKey) => {
      try {
        if (localStorage.getItem(storageKey) !== extId) {
          localStorage.setItem(storageKey, extId);
        }
      } catch {
        /* SecurityError on file:// or sandboxed iframe — ignore */
      }
    };

    // MV3 서비스워커는 여러 키워드를 도는 1688 수집 도중 유휴 종료될 수 있다.
    // KidItem 페이지가 열려 있는 동안 하트비트를 보내 진행 중인 추출 프로미스와
    // 외부 응답 채널이 배치가 끝날 때까지 살아 있게 한다.
    const keepalivePortName = "kiditem-1688-trend-keepalive";
    const keepaliveIntervalMs = 20_000;
    let keepaliveTimer = null;

    const connectKeepalive = () => {
      try {
        const port = chrome.runtime.connect({ name: keepalivePortName });
        const ping = () => {
          try {
            port.postMessage({ type: "keepalive", at: Date.now() });
          } catch {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
          }
        };

        ping();
        keepaliveTimer = setInterval(ping, keepaliveIntervalMs);
        port.onDisconnect.addListener(() => {
          if (keepaliveTimer) clearInterval(keepaliveTimer);
          keepaliveTimer = null;
          window.setTimeout(connectKeepalive, 1_000);
        });
      } catch {
        window.setTimeout(connectKeepalive, 1_000);
      }
    };

    connectKeepalive();

    for (const channel of CHANNELS) {
      remember(channel.storageKey);
      try {
        window.postMessage(
          { type: channel.responseType, extensionId: extId },
          window.location.origin,
        );
      } catch {
        /* noop */
      }
    }

    window.addEventListener("message", (event) => {
      const requested = event.data?.type;
      if (!requested) return;
      const channel = CHANNELS.find((entry) => entry.requestType === requested);
      if (!channel) return;
      try {
        event.source?.postMessage(
          { type: channel.responseType, extensionId: extId },
          event.origin,
        );
      } catch {
        /* noop */
      }
      remember(channel.storageKey);
    });
  } catch (error) {
    console.warn("[KIDITEM host-bridge] init failed", error);
  }
})();
