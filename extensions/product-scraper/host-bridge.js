// KidItem web app bridge for product-scraper extension discovery only.
// Auth tokens travel through chrome.runtime.sendMessage to the service worker,
// never through page-world postMessage.
(() => {
  try {
    const extId = chrome.runtime.id;
    if (!extId) return;

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

    try {
      localStorage.setItem("kiditem-sourcing-ext-id", extId);
    } catch {
      /* noop */
    }

    try {
      window.postMessage(
        { type: "kiditem:sourcing-ext-id", extensionId: extId },
        window.location.origin,
      );
    } catch {
      /* noop */
    }

    window.addEventListener("message", (ev) => {
      if (!ev.data || ev.data.type !== "kiditem:request-sourcing-ext-id") return;
      try {
        ev.source?.postMessage(
          { type: "kiditem:sourcing-ext-id", extensionId: extId },
          ev.origin,
        );
      } catch {
        /* noop */
      }
      try {
        localStorage.setItem("kiditem-sourcing-ext-id", extId);
      } catch {
        /* noop */
      }
    });
  } catch (e) {
    console.warn("[product-scraper host-bridge] init failed", e);
  }
})();
