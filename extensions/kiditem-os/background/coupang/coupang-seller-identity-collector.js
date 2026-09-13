(function installKidItemCoupangSellerIdentityCollector(root) {
  "use strict";

  // Product-detail traversal is a bounded enrichment source, distinct from
  // public SERP and seller-shop catalog capture.  The source owner remains
  // responsible for the attempt and terminal result.
  const PRODUCT_DETAIL_RENDER_DELAY_MS = 1200;
  const BETWEEN_PRODUCT_DELAY_MIN_MS = 900;
  const BETWEEN_PRODUCT_DELAY_MAX_MS = 1500;
  const PAGE_TIMEOUT_MS = 60000;
  const MAX_TARGETS = 200;

  function requiredDependencies(options) {
    if (
      !options?.chrome?.tabs?.create ||
      !options.chrome.tabs.get ||
      !options.chrome.tabs.update ||
      !options.chrome.scripting?.executeScript ||
      typeof options.sessions?.getOwned !== "function" ||
      typeof options.sessions?.attachTab !== "function" ||
      typeof options.waitForTabComplete !== "function" ||
      typeof options.environment?.bindTab !== "function"
    ) {
      throw new Error("Coupang seller identity collector dependencies are required.");
    }
    return options;
  }

  function callbackOrPromise(chromeApi, invoke) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const callback = (value) => {
        if (settled) return;
        settled = true;
        const error = chromeApi.runtime?.lastError;
        if (error) {
          reject(new Error(error.message || "Chrome API request failed"));
          return;
        }
        resolve(value);
      };
      try {
        const result = invoke(callback);
        if (result && typeof result.then === "function") {
          result.then((value) => {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          }, (error) => {
            if (!settled) {
              settled = true;
              reject(error);
            }
          });
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  }

  function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
  }

  function isProductDetailUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.username === "" &&
        parsed.password === "" && parsed.port === "" &&
        parsed.hostname.toLowerCase() === "www.coupang.com" &&
        /^\/vp\/products\/\d+$/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function matchesProductDetailUrl(actualValue, expectedValue) {
    if (!isProductDetailUrl(actualValue) || !isProductDetailUrl(expectedValue)) return false;
    try {
      const actual = new URL(actualValue);
      const expected = new URL(expectedValue);
      if (actual.pathname !== expected.pathname) return false;
      for (const name of ["itemId", "vendorItemId"]) {
        const required = expected.searchParams.get(name);
        if (required !== null && actual.searchParams.get(name) !== required) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function productKey(target) {
    const vendorItemId = String(target?.vendorItemId || "").trim();
    if (vendorItemId) return `vendor-item:${vendorItemId}`;
    const productId = String(target?.productId || "").trim();
    if (productId) return `product:${productId}`;
    return `link:${String(target?.link || "")}`;
  }

  function extractSellerLinkInPage() {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const sellerAnchor = anchors.find((anchor) => {
      try {
        const parsed = new URL(anchor.href);
        return parsed.protocol === "https:" && parsed.username === "" &&
          parsed.password === "" && parsed.port === "" &&
          parsed.hostname === "shop.coupang.com" &&
          /^\/(?:vid\/)?[A-Za-z0-9_-]+\/?$/.test(parsed.pathname);
      } catch {
        return false;
      }
    });
    if (!sellerAnchor) return null;
    return { href: sellerAnchor.href, text: sellerAnchor.textContent || "" };
  }

  function create(options) {
    const {
      chrome: chromeApi,
      sessions,
      environment,
      waitForTabComplete,
      delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    } = requiredDependencies(options);

    function getTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.get(tabId, callback))
        .then((tab) => {
          if (!tab?.id) throw new Error("상품 상세 탭을 조회할 수 없습니다");
          return tab;
        });
    }

    function createTab() {
      return callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.create({ url: "about:blank", active: false }, callback),
      ).then((tab) => {
        if (!tab?.id) throw new Error("상품 상세 탭을 열 수 없습니다");
        return tab;
      });
    }

    function removeTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.remove(tabId, callback))
        .catch(() => undefined);
    }

    async function ownerSession(attemptId, environmentId) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session && session.producer !== "advertising.competitor_seller_identity") {
        throw new Error("coupang_seller_identity_source_owner_session_invalid");
      }
      return session;
    }

    async function assertActive(attemptId, environmentId, expiresAt) {
      const session = await ownerSession(attemptId, environmentId);
      if (!session) throw Object.assign(new Error("판매자 확인이 취소되었습니다"), { cancelled: true });
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(attemptId, environmentId, "advertising.competitor_seller_identity"))) {
        throw Object.assign(new Error("판매자 확인이 취소되었습니다"), { cancelled: true });
      }
      if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.now() >= Date.parse(expiresAt)) {
        throw new Error("판매자 확인 수집 기한이 만료되었습니다");
      }
    }

    async function updateTabAndWait(tabId, url) {
      const before = await getTab(tabId).catch(() => null);
      if (before?.active) throw new Error("active user tab is collection-protected");
      await callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.update(tabId, { url, active: false }, callback),
      );
      return waitForTabComplete(tabId, { expectedUrl: url, timeoutMs: PAGE_TIMEOUT_MS });
    }

    async function execute(tabId) {
      const [result] = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: extractSellerLinkInPage,
      });
      return root.KidItemCoupangSellerDetail?.extractCoupangSellerShopLink(
        result?.result,
      ) || null;
    }

    async function collect(targets, context = {}) {
      const { environmentId, attemptId, expiresAt, onProgress } = context;
      if (typeof attemptId !== "string" || !attemptId) throw new Error("seller_identity_attempt_required");
      if (typeof environmentId !== "string" || !environmentId) throw new Error("seller_identity_environment_required");
      const sourceTargets = Array.isArray(targets) ? targets.slice(0, MAX_TARGETS) : [];
      try {
        await assertActive(attemptId, environmentId, expiresAt);
        if (sourceTargets.length === 0) return { success: true, identities: [] };
        let tab;
        try {
          tab = await createTab();
          await assertActive(attemptId, environmentId, expiresAt);
          // Attach and bind before the first navigation/readiness wait so a
          // service-worker suspension cannot leave an unowned tab in flight.
          const attached = await sessions.attachTab(attemptId, {
            tabId: tab.id,
            windowId: tab.windowId,
            closeOnCancel: true,
          });
          if (!attached) throw new Error("coupang_seller_identity_source_owner_tab_attach_refused");
          await environment.bindTab(tab.id, environmentId);
        } catch (error) {
          if (tab?.id) await removeTab(tab.id);
          throw error;
        }

        const validTargets = sourceTargets.filter((target) => isProductDetailUrl(target?.link));
        const targetKeys = new Set(validTargets.map(productKey));
        const detailsByProduct = new Map();
        const identities = [];
        let processed = 0;
        for (const target of sourceTargets) {
          await assertActive(attemptId, environmentId, expiresAt);
          if (!isProductDetailUrl(target?.link)) continue;
          const detailKey = productKey(target);
          let detail = detailsByProduct.get(detailKey);
          if (detail === undefined) {
            try {
              const loaded = await updateTabAndWait(tab.id, target.link);
              await assertActive(attemptId, environmentId, expiresAt);
              const current = await getTab(tab.id).catch(() => null);
              if (!loaded || !matchesProductDetailUrl(current?.url || loaded?.url || "", target.link)) {
                throw new Error("상품 상세가 아닌 페이지로 이동했습니다");
              }
              await delay(PRODUCT_DETAIL_RENDER_DELAY_MS);
              await assertActive(attemptId, environmentId, expiresAt);
              detail = await execute(tab.id);
              await assertActive(attemptId, environmentId, expiresAt);
              if (!detail) {
                await delay(PRODUCT_DETAIL_RENDER_DELAY_MS);
                await assertActive(attemptId, environmentId, expiresAt);
                detail = await execute(tab.id);
                await assertActive(attemptId, environmentId, expiresAt);
              }
            } catch (error) {
              await assertActive(attemptId, environmentId, expiresAt);
              console.warn("[KIDITEM] 겹치는 상품 판매자 확인 실패:", error?.message || error);
              detail = null;
            }
            await assertActive(attemptId, environmentId, expiresAt);
            detailsByProduct.set(detailKey, detail);
            processed += 1;
            if (typeof onProgress === "function") {
              await onProgress({ processed, targetCount: targetKeys.size });
            }
            if (processed < targetKeys.size) {
              await delay(randomDelayMs(BETWEEN_PRODUCT_DELAY_MIN_MS, BETWEEN_PRODUCT_DELAY_MAX_MS));
            }
          }
          if (!detail?.sellerName || !detail?.sellerId || !detail?.sellerStoreUrl) continue;
          identities.push({
            keyword: target.keyword,
            productKey: target.productKey,
            productId: target.productId || null,
            vendorItemId: target.vendorItemId || null,
            link: target.link,
            sellerName: detail.sellerName,
            sellerId: detail.sellerId,
            sellerStoreUrl: detail.sellerStoreUrl,
            capturedAt: new Date().toISOString(),
          });
        }
        await assertActive(attemptId, environmentId, expiresAt);
        return { success: true, identities };
      } catch (error) {
        if (error?.cancelled) return { success: false, cancelled: true };
        throw error;
      }
    }

    return Object.freeze({ collect });
  }

  root.KidItemCoupangSellerIdentityCollector = Object.freeze({ create });
})(globalThis);
