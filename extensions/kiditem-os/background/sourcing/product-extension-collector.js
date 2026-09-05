(function (global) {
  "use strict";

  function create({ chrome, backendRequestConfig, injectContentScripts, enrichProductData }) {
    const sourcePath = "/sourcing/extension/product-data/attempts";
    const wire = global.KidItemSourcingAttemptWire.create({ chrome, sourcePath, requestFailureMessage: "상품 수집 요청 실패" });
    const pending = new Map();

    function finish(run, result) {
      clearTimeout(run.timer);
      run.closed = true;
      if (pending.get(run.tabId) === run) pending.delete(run.tabId);
      run.resolve(result);
    }

    function fail(run, code, message) {
      if (run.failure) return run.failure;
      if (run.closed) return;
      run.closed = true;
      clearTimeout(run.timer);
      run.failure = (async () => {
        if (run.attempt) {
          try {
            await wire.terminal(run.config, run.attempt, { method: "POST", suffix: "/fail", body: { code, message } });
            await wire.clearCorrelation(run.key);
          } catch (error) { console.warn("[bg] product failure report pending:", error.message); }
        }
        finish(run, { ok: false, error: message });
      })();
      return run.failure;
    }

    function begin(config, correlation) {
      return wire.requestJsonWithRetry(config, sourcePath, { method: "POST",
        headers: { ...config.headers, "idempotency-key": correlation.idempotencyKey },
        body: JSON.stringify({ sourceUrl: correlation.sourceUrl }) });
    }

    async function start(run) {
      try {
        run.config = await backendRequestConfig(run.environmentId);
        if (!run.config.ok) throw new Error(run.config.error);
        const tab = await chrome.tabs.get(run.tabId);
        global.KiditemSourcingUrlPolicy.parseAllowedSupplierUrl(tab.url);
        const sourceUrl = tab.url;
        const previous = await wire.getCorrelation(run.key);
        if (previous) {
          const recovered = await begin(run.config, previous);
          if (recovered.state === "RUNNING") {
            await wire.terminal(run.config, recovered, { method: "POST", suffix: "/fail",
              body: { code: "EXTRACTION_INTERRUPTED", message: "이전 상품 추출이 중단되었습니다." } });
          }
          await wire.clearCorrelation(run.key);
        }
        if (run.closed) return;
        const correlation = { sourceUrl, idempotencyKey: global.crypto.randomUUID() };
        await wire.setCorrelation(run.key, correlation);
        run.attempt = await begin(run.config, correlation);
        if (run.closed) {
          await wire.terminal(run.config, run.attempt, { method: "POST", suffix: "/fail",
            body: { code: "EXTRACTION_CANCELLED", message: "상품 추출이 취소되었습니다." } });
          return;
        }
        if (run.attempt.state !== "RUNNING") throw new Error("상품 추출 시도가 종료되었습니다.");
        run.timer = setTimeout(() => fail(run, "EXTRACTION_TIMEOUT", "추출 시간 초과 (20초)"), 20000);
        const trigger = { type: "TRIGGER_EXTRACT", attemptId: run.attempt.attemptId };
        chrome.tabs.sendMessage(run.tabId, trigger, () => {
          if (!chrome.runtime.lastError || run.closed) return;
          injectContentScripts(run.tabId).then((ok) => {
            if (run.closed) return;
            if (!ok) return fail(run, "EXTRACTION_INJECTION_FAILED", "콘텐츠 스크립트 주입 실패. 페이지를 새로고침 해주세요.");
            chrome.tabs.sendMessage(run.tabId, trigger, () => {
              if (chrome.runtime.lastError) fail(run, "EXTRACTION_UNAVAILABLE", "페이지를 새로고침 후 다시 시도해주세요.");
            });
          });
        });
      } catch (error) { await fail(run, "EXTRACTION_START_FAILED", error.message); }
    }

    function collect(tabId, environmentId) {
      const previous = pending.get(tabId);
      return new Promise((resolve) => {
        const run = { tabId, environmentId, resolve, key: `sourcing_product_attempt:${environmentId}:${tabId}` };
        pending.set(tabId, run);
        run.startTask = Promise.resolve(previous ? fail(previous, "EXTRACTION_CANCELLED", "cancelled") : undefined)
          .then(() => previous?.startTask).then(() => start(run));
      });
    }

    async function complete(run, hadDescription) {
      if (run.completing || run.closed) return;
      run.completing = true;
      try {
        const product = await run.product;
        if (run.closed) return;
        if (!product || Boolean(run.description) !== hadDescription) throw new Error("상품 설명 추출 완료를 확인할 수 없습니다.");
        clearTimeout(run.timer);
        const body = { product, ...(run.description ? { description: run.description } : {}), hadDescription };
        const result = await wire.terminal(run.config, run.attempt, { method: "PUT", suffix: "/complete", body });
        if (run.closed) return;
        if (result.state !== "COMPLETE") throw new Error(result.errorMessage || "상품 수집 실패");
        const lastExtraction = { ...product, ...(run.description ? {
          description_images: run.description.description_images, description_text: run.description.description_text,
          description_image_count: run.description.description_image_count,
        } : {}) };
        await chrome.storage.local.set({ lastExtraction, lastExtractionEnvironmentId: run.environmentId });
        await wire.clearCorrelation(run.key);
        finish(run, { ok: true });
      } catch (error) { await fail(run, "EXTRACTION_FAILED", error.message); }
    }

    function onEvent(message, sender) {
      const run = pending.get(sender.tab?.id);
      if (!run || run.closed || !run.attempt || message.attemptId !== run.attempt.attemptId) {
        return { ok: false, error: "수집 환경 또는 시도를 확인할 수 없습니다." };
      }
      if (message.type === "PRODUCT_DATA") {
        if (!run.product) {
          run.product = enrichProductData(message.data);
          if (message.data?.page_type === "search") complete(run, false);
        }
      } else if (message.type === "DESCRIPTION_DATA") {
        if (!run.completing) run.description = message.data;
      } else if (message.type === "EXTRACTION_COMPLETE") complete(run, message.hadDescription);
      return { ok: true };
    }

    chrome.tabs.onRemoved?.addListener((tabId) => {
      const run = pending.get(tabId);
      if (run) fail(run, "EXTRACTION_TAB_CLOSED", "상품 수집 탭이 닫혔습니다.");
    });
    return Object.freeze({ collect, onEvent });
  }

  global.KidItemProductExtensionCollector = Object.freeze({ create });
})(globalThis);
