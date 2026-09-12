/* global chrome */
(() => {
  "use strict";

  const SUPPLIER_TAB_MATCHES = ["https://supplier.coupang.com/*"];
  const PO_BOOTSTRAP_URL = "https://supplier.coupang.com/scm/purchase/order/list";
  const PO_READY_PATH_PREFIX = "/po-web/purchase/order";
  const SESSION_ERROR_CODE = "coupang_po_session_required";
  const COOKIE_BLOAT_ERROR_CODE = "coupang_cookie_bloat";

  function isReadyPoUrl(value) {
    try {
      const url = new URL(value || "");
      return url.origin === "https://supplier.coupang.com"
        && url.pathname.startsWith(PO_READY_PATH_PREFIX);
    } catch {
      return false;
    }
  }

  function sessionError() {
    return {
      success: false,
      pendingLogin: true,
      errorCode: SESSION_ERROR_CODE,
      error:
        "쿠팡 발주 세션을 준비하지 못했습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
    };
  }

  // supplier.coupang.com 은 쿠키가 누적되면 요청 헤더가 커져 HTTP 400 을 돌려준다.
  // 이때는 재시도해도 쿠키가 그대로라 안 풀리므로, 로그인 안내가 아니라 쿠키 정리를 안내해야 한다.
  function cookieBloatError() {
    return {
      success: false,
      errorCode: COOKIE_BLOAT_ERROR_CODE,
      error:
        "쿠팡 접속이 많아 supplier.coupang.com 쿠키가 커져(HTTP 400) 요청이 거부됐습니다. 쿠팡 쿠키를 정리하거나 다시 로그인한 뒤 조회하세요.",
    };
  }

  function preparationError(tab, created, result) {
    return { success: false, result: result ?? sessionError(), tab, created };
  }

  function cancellationResult() {
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Coupang PO collection was cancelled.",
    };
  }

  function create({ chrome: chromeApi, attachOrderCollectionTab, waitForTabReady }) {
    // 400 응답은 탭 URL 이 그대로라 본문으로만 구분된다("HTTP Status 400 – Bad Request").
    async function isCookieBloatTab(tabId) {
      if (!tabId || !chromeApi.scripting?.executeScript) return false;
      try {
        const injected = await chromeApi.scripting.executeScript({
          target: { tabId },
          func: () => String(document.body?.innerText || "").slice(0, 400),
        });
        const text = injected?.[0]?.result || "";
        return /HTTP Status 400|Bad Request/i.test(text);
      } catch {
        return false;
      }
    }

    async function prepare(collection, forceNew) {
      let tab;
      let created = false;

      if (!(await isCollectionActive(collection))) {
        return preparationError(null, false, cancellationResult());
      }

      // Rocket PO runs must never reuse an operator's visible Supplier tab.
      // They use a fresh inactive tab so the common cancellation fence can
      // close the exact in-page request loop even after app-close/restart.
      if (!forceNew && collection?.requireOwnedTab !== true) {
        const tabs = await chromeApi.tabs.query({ url: SUPPLIER_TAB_MATCHES });
        tab = tabs.find((candidate) => isReadyPoUrl(candidate.url));
      }

      if (!tab?.id) {
        tab = await chromeApi.tabs.create({ url: PO_BOOTSTRAP_URL, active: false });
        created = true;
      }
      if (!tab?.id) return preparationError(tab, created);

      const attached = await attachOrderCollectionTab(collection, tab, created);
      if (attached === null || attached === false) {
        return preparationError(tab, created, cancellationResult());
      }
      await waitForTabReady(tab.id);
      if (!(await isCollectionActive(collection))) {
        return preparationError(tab, created, cancellationResult());
      }

      let currentTab;
      try {
        currentTab = await chromeApi.tabs.get(tab.id);
      } catch {
        return preparationError(tab, created);
      }
      if (!isReadyPoUrl(currentTab?.url)) {
        // PO 화면으로 못 넘어간 이유가 쿠키 과다(HTTP 400)인지 확인한다. 로그인 문제로
        // 잘못 안내하면 운영자가 재로그인만 반복하게 되고 실제로는 풀리지 않는다.
        const bloated = await isCookieBloatTab(tab.id);
        return preparationError(
          currentTab || tab,
          created,
          bloated ? cookieBloatError() : undefined,
        );
      }

      return { success: true, tab: currentTab, created };
    }

    async function release(collection, prepared) {
      if (typeof collection?.detachTab !== "function") return;
      await collection.detachTab(prepared.tab, { owned: prepared.created });
    }

    async function executePrepared(collection, prepared, execute, retainSessionError) {
      if (!(await isCollectionActive(collection))) {
        await release(collection, prepared);
        return cancellationResult();
      }
      let result;
      try {
        result = await execute(prepared.tab);
      } catch (error) {
        await release(collection, prepared);
        throw error;
      }

      if (!(await isCollectionActive(collection))) {
        await release(collection, prepared);
        return cancellationResult();
      }

      if (!retainSessionError || result?.errorCode !== SESSION_ERROR_CODE) {
        await release(collection, prepared);
      }
      return result;
    }

    async function run(collection, execute) {
      let prepared = await prepare(collection, false);
      if (!prepared.success) {
        if (prepared.tab?.id) await release(collection, prepared);
        if (prepared.result?.errorCode === "COLLECTION_CANCELLED") {
          return prepared.result;
        }
        // 쿠키 과다는 새 탭을 열어도 같은 쿠키가 실려 그대로 400 이다. 한 번 더 기다리게 하지 않는다.
        if (prepared.result?.errorCode === COOKIE_BLOAT_ERROR_CODE) return prepared.result;
        if (!(await isCollectionActive(collection))) return cancellationResult();
        prepared = await prepare(collection, true);
        if (!prepared.success) return prepared.result;
        return executePrepared(collection, prepared, execute, true);
      }

      const firstResult = await executePrepared(
        collection,
        prepared,
        execute,
        false,
      );
      if (firstResult?.errorCode !== SESSION_ERROR_CODE) return firstResult;

      if (!(await isCollectionActive(collection))) return cancellationResult();

      const retryPrepared = await prepare(collection, true);
      if (!retryPrepared.success) return retryPrepared.result;
      return executePrepared(collection, retryPrepared, execute, true);
    }

    async function isCollectionActive(collection) {
      if (typeof collection?.isActive !== "function") return true;
      try {
        return (await collection.isActive()) !== false;
      } catch {
        return false;
      }
    }

    return Object.freeze({ run });
  }

  globalThis.KidItemCoupangPoSession = Object.freeze({
    create,
    bootstrapUrl: PO_BOOTSTRAP_URL,
    errorCode: SESSION_ERROR_CODE,
  });
})();
