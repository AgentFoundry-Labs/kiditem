/* global chrome */
(() => {
  "use strict";

  const SUPPLIER_TAB_MATCHES = ["https://supplier.coupang.com/*"];
  const PO_BOOTSTRAP_URL = "https://supplier.coupang.com/scm/purchase/order/list";
  const PO_READY_PATH_PREFIX = "/po-web/purchase/order";
  const SESSION_ERROR_CODE = "coupang_po_session_required";

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

  function preparationError(tab, created) {
    return { success: false, result: sessionError(), tab, created };
  }

  function create({ chrome: chromeApi, attachOrderCollectionTab, waitForTabReady }) {
    async function prepare(collection, forceNew) {
      let tab;
      let created = false;

      if (!forceNew) {
        const tabs = await chromeApi.tabs.query({ url: SUPPLIER_TAB_MATCHES });
        tab = tabs.find((candidate) => isReadyPoUrl(candidate.url));
      }

      if (!tab?.id) {
        tab = await chromeApi.tabs.create({ url: PO_BOOTSTRAP_URL, active: false });
        created = true;
      }
      if (!tab?.id) return preparationError(tab, created);

      await attachOrderCollectionTab(collection, tab, created);
      await waitForTabReady(tab.id);

      let currentTab;
      try {
        currentTab = await chromeApi.tabs.get(tab.id);
      } catch {
        return preparationError(tab, created);
      }
      if (!isReadyPoUrl(currentTab?.url)) {
        return preparationError(currentTab || tab, created);
      }

      return { success: true, tab: currentTab, created };
    }

    async function release(collection, prepared) {
      if (typeof collection?.detachTab !== "function") return;
      await collection.detachTab(prepared.tab, { owned: prepared.created });
    }

    async function executePrepared(collection, prepared, execute, retainSessionError) {
      let result;
      try {
        result = await execute(prepared.tab);
      } catch (error) {
        await release(collection, prepared);
        throw error;
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

      const retryPrepared = await prepare(collection, true);
      if (!retryPrepared.success) return retryPrepared.result;
      return executePrepared(collection, retryPrepared, execute, true);
    }

    return Object.freeze({ run });
  }

  globalThis.KidItemCoupangPoSession = Object.freeze({
    create,
    bootstrapUrl: PO_BOOTSTRAP_URL,
    errorCode: SESSION_ERROR_CODE,
  });
})();
