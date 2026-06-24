(() => {
  try {
    const extId = chrome.runtime.id;
    if (!extId) return;

    try {
      localStorage.setItem("kiditem-order-ext-id", extId);
    } catch {
      /* noop */
    }

    try {
      window.postMessage(
        { type: "kiditem:order-ext-id", extensionId: extId },
        window.location.origin,
      );
    } catch {
      /* noop */
    }

    window.addEventListener("message", (event) => {
      if (!event.data || event.data.type !== "kiditem:request-order-ext-id") return;
      try {
        event.source?.postMessage(
          { type: "kiditem:order-ext-id", extensionId: extId },
          event.origin,
        );
      } catch {
        /* noop */
      }
      try {
        localStorage.setItem("kiditem-order-ext-id", extId);
      } catch {
        /* noop */
      }
    });
  } catch (error) {
    console.warn("[KIDITEM order collector] host bridge failed", error);
  }
})();
