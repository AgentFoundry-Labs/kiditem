(function installKidItemCoupangSellerCatalogCollector(root) {
  "use strict";

  // Seller-shop capture is server-targeted and bounded.  Only frozen
  // shop.coupang.com URLs are admitted; this module never becomes an
  // arbitrary navigation executor.
  const MAX_ITEMS = 500;
  const TRACKED_MAX_ITEMS = 100;
  const RENDER_DELAY_MS = 1200;
  const PAGE_TIMEOUT_MS = 60000;

  function requiredDependencies(options) {
    if (
      !options?.chrome?.tabs?.create ||
      !options.chrome.tabs.get ||
      !options.chrome.tabs.update ||
      !options.chrome.scripting?.executeScript ||
      typeof options.sessions?.getOwned !== "function" ||
      typeof options.sessions?.ownsTab !== "function" ||
      typeof options.sessions?.attachTab !== "function" ||
      typeof options.waitForTabComplete !== "function" ||
      typeof options.environment?.bindTab !== "function"
    ) {
      throw new Error("Coupang seller catalog collector dependencies are required.");
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

  function boundedText(value, maximum) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, maximum) : null;
  }

  function boundedInteger(value) {
    if (
      value == null ||
      typeof value === "boolean" ||
      Array.isArray(value) ||
      (typeof value === "string" && value.trim() === "") ||
      (typeof value !== "number" && typeof value !== "string")
    ) return null;
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
  }

  function isSellerStoreUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.username === "" &&
        parsed.password === "" && parsed.port === "" &&
        parsed.hostname.toLowerCase() === "shop.coupang.com" &&
        /^\/(?:vid\/)?[A-Za-z0-9_-]+\/?$/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function matchesSellerStoreUrl(actualValue, expectedValue) {
    if (!isSellerStoreUrl(actualValue) || !isSellerStoreUrl(expectedValue)) return false;
    try {
      const actual = new URL(actualValue);
      const expected = new URL(expectedValue);
      return actual.pathname === expected.pathname && actual.search === expected.search;
    } catch {
      return false;
    }
  }

  function sanitizeTrackedCatalog(catalog, target) {
    if (!catalog || typeof catalog !== "object") return null;
    const products = [];
    for (const candidate of Array.isArray(catalog.products) ? catalog.products : []) {
      if (!candidate || typeof candidate !== "object") continue;
      const productId = boundedText(candidate.productId, 200);
      const itemId = boundedText(candidate.itemId, 200);
      const vendorItemId = boundedText(candidate.vendorItemId, 200);
      const name = boundedText(candidate.name, 500);
      if (!name || (!productId && !itemId && !vendorItemId)) continue;
      products.push({
        sourceRank: boundedInteger(candidate.sourceRank) || products.length + 1,
        productId,
        itemId,
        vendorItemId,
        name,
        priceKrw: boundedInteger(candidate.priceKrw),
        reviewCount: boundedInteger(candidate.reviewCount),
        imageUrl: boundedText(candidate.imageUrl, 2000),
        link: boundedText(candidate.link, 2000),
      });
      if (products.length >= TRACKED_MAX_ITEMS) break;
    }
    if (products.length === 0) return null;
    const capturedAt = Number.isFinite(Date.parse(String(catalog.capturedAt || "")))
      ? new Date(catalog.capturedAt).toISOString()
      : new Date().toISOString();
    const totalProductCount = boundedInteger(catalog.totalProductCount);
    return {
      keyword: target.keyword,
      sellerId: target.sellerId,
      sellerName: boundedText(catalog.sellerName, 300) ||
        boundedText(target.sellerName, 300) || target.sellerId,
      sellerStoreUrl: target.sellerStoreUrl,
      totalProductCount,
      collectedProductCount: products.length,
      isTruncated: catalog.isTruncated === true ||
        (totalProductCount !== null && totalProductCount > products.length),
      sort: "newest",
      capturedAt,
      products,
    };
  }

  function preserveRankEnrichmentCatalog(catalog, target) {
    if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.products) || catalog.products.length === 0) return null;
    const capturedAt = Number.isFinite(Date.parse(String(catalog.capturedAt || "")))
      ? new Date(catalog.capturedAt).toISOString()
      : new Date().toISOString();
    return {
      keyword: target.keyword,
      sellerId: target.sellerId,
      sellerName: catalog.sellerName || target.sellerName || target.sellerId,
      sellerStoreUrl: target.sellerStoreUrl,
      totalProductCount: Number.isFinite(catalog.totalProductCount) ? catalog.totalProductCount : null,
      collectedProductCount: catalog.products.length,
      isTruncated: catalog.isTruncated === true ||
        (Number.isFinite(catalog.totalProductCount) && catalog.totalProductCount > catalog.products.length),
      sort: "newest",
      capturedAt,
      // Rank enrichment intentionally retains the full 500-row extractor
      // output and nullable evidence fields.
      products: catalog.products.slice(0, MAX_ITEMS),
    };
  }

  function extractSellerCatalogInPage(maxItems) {
    const productLinkPattern = /^\/vp\/products\/\d+$/;
    const sleepInPage = (milliseconds) =>
      new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
    const productAnchors = () => Array.from(document.querySelectorAll('a[href*="/vp/products/"]'));
    return (async () => {
      let stableRounds = 0;
      let previousCount = -1;
      for (let round = 0; round < 45; round += 1) {
        const count = productAnchors().length;
        if (count >= maxItems) break;
        stableRounds = count === previousCount ? stableRounds + 1 : 0;
        if (stableRounds >= 3) break;
        previousCount = count;
        globalThis.scrollTo(0, document.documentElement.scrollHeight);
        await sleepInPage(650);
      }

      const digits = (value) => {
        const normalized = String(value || "").replace(/[^\d]/g, "");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const totalMatch = (document.body?.innerText || "").match(/전체\s*\(([\d,]+)\)/);
      const totalProductCount = totalMatch ? digits(totalMatch[1]) : null;
      const seen = new Set();
      const products = [];
      for (const anchor of productAnchors()) {
        if (products.length >= maxItems) break;
        let parsed;
        try {
          parsed = new URL(anchor.getAttribute("href") || "", location.origin);
        } catch {
          continue;
        }
        if (
          parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
          parsed.hostname !== "www.coupang.com" || !productLinkPattern.test(parsed.pathname)
        ) continue;
        const productId = (parsed.pathname.match(/^\/vp\/products\/(\d+)$/) || [])[1] || null;
        const itemId = parsed.searchParams.get("itemId") || null;
        const vendorItemId = parsed.searchParams.get("vendorItemId") || null;
        const key = vendorItemId || itemId || productId;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const name = (anchor.querySelector(".name")?.textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 300);
        if (!name) continue;
        const priceKrw = digits(anchor.querySelector(".price-value")?.textContent || "");
        const reviewCount = digits(anchor.querySelector(".rating-total-count")?.textContent || "");
        const image = anchor.querySelector("img");
        const rawImageUrl = [
          image?.getAttribute("data-img-src"), image?.getAttribute("data-src"),
          image?.currentSrc, image?.getAttribute("src"),
        ].find((value) => typeof value === "string" && value.trim() && !value.trim().startsWith("data:"));
        let imageUrl = null;
        if (rawImageUrl) {
          try {
            const imageParsed = new URL(rawImageUrl, location.href);
            if (imageParsed.protocol === "https:" && !imageParsed.username && !imageParsed.password && !imageParsed.port) imageUrl = imageParsed.href;
          } catch {
            imageUrl = null;
          }
        }
        products.push({
          sourceRank: products.length + 1,
          productId,
          itemId,
          vendorItemId,
          name,
          priceKrw,
          reviewCount,
          imageUrl,
          link: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        });
      }
      const sellerName = Array.from(document.querySelectorAll("h1,h2,h3,strong,span,div"))
        .map((element) => (element.textContent || "").trim())
        .find((text) => text && text.length <= 120 &&
          (document.body?.innerText || "").includes(`${text}의 판매자샵입니다.`)) || null;
      return { sellerName, totalProductCount, products };
    })();
  }

  function selectNewestInPage() {
    const target = Array.from(document.querySelectorAll("li.sortkey, [role=button], button"))
      .find((element) => (element.textContent || "").trim() === "최신순");
    if (!target) return false;
    target.click();
    return true;
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
          if (!tab?.id) throw new Error("판매자샵 탭을 조회할 수 없습니다");
          return tab;
        });
    }

    function createTab() {
      return callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.create({ url: "about:blank", active: false }, callback),
      ).then((tab) => {
        if (!tab?.id) throw new Error("판매자샵 탭을 열 수 없습니다");
        return tab;
      });
    }

    function removeTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.remove(tabId, callback))
        .catch(() => undefined);
    }

    async function ownerSession(attemptId, environmentId) {
      if (typeof attemptId !== "string" || !attemptId || typeof environmentId !== "string" || !environmentId) {
        throw new Error("coupang_seller_catalog_source_owner_attempt_required");
      }
      const session = await sessions.getOwned(attemptId, environmentId);
      if (!session || session.producer !== "advertising.competitor_catalog") {
        throw new Error("coupang_seller_catalog_source_owner_session_invalid");
      }
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(attemptId, environmentId, "advertising.competitor_catalog"))) {
        throw new Error("coupang_seller_catalog_source_owner_cancelled");
      }
      return session;
    }

    async function ownerIsActive(attemptId, environmentId) {
      try {
        await ownerSession(attemptId, environmentId);
        return true;
      } catch {
        return false;
      }
    }

    async function updateTabAndWait(tabId, url) {
      const before = await getTab(tabId).catch(() => null);
      if (before?.active) throw new Error("active user tab is collection-protected");
      await callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.update(tabId, { url, active: false }, callback));
      return waitForTabComplete(tabId, { expectedUrl: url, timeoutMs: PAGE_TIMEOUT_MS });
    }

    async function collectTarget(input = {}) {
      const {
        environmentId,
        attemptId,
        target,
        targetMode,
        collectionTabId,
      } = input;
      await ownerSession(attemptId, environmentId);
      if (!target || !isSellerStoreUrl(target.sellerStoreUrl)) {
        return { success: false, error: "판매자샵 URL이 허용된 Coupang 주소가 아닙니다" };
      }
      if (!(await ownerIsActive(attemptId, environmentId))) {
        return { success: false, cancelled: true, tabId: Number.isInteger(collectionTabId) ? collectionTabId : null };
      }

      let tab = null;
      if (Number.isInteger(collectionTabId)) {
        if (!(await sessions.ownsTab(
          attemptId,
          environmentId,
          "advertising.competitor_catalog",
          collectionTabId,
        ))) {
          throw new Error("coupang_seller_catalog_source_owner_tab_invalid");
        }
        tab = await getTab(collectionTabId).catch(() => null);
        if (!tab) throw new Error("coupang_seller_catalog_source_owner_tab_unavailable");
        await environment.bindTab(tab.id, environmentId);
      } else {
        tab = await createTab();
        try {
          await ownerSession(attemptId, environmentId);
          const attached = await sessions.attachTab(attemptId, { tabId: tab.id, windowId: tab.windowId, closeOnCancel: true });
          if (!attached) throw new Error("coupang_seller_catalog_source_owner_tab_attach_refused");
          await environment.bindTab(tab.id, environmentId);
        } catch (error) {
          await removeTab(tab.id);
          throw error;
        }
      }

      try {
        const loaded = await updateTabAndWait(tab.id, target.sellerStoreUrl);
        if (!(await ownerIsActive(attemptId, environmentId))) return { success: false, cancelled: true, tabId: tab.id };
        const current = await getTab(tab.id).catch(() => null);
        if (!loaded || !matchesSellerStoreUrl(current?.url || loaded?.url || "", target.sellerStoreUrl)) {
          throw new Error("판매자샵이 아닌 페이지로 이동했습니다");
        }
        await delay(RENDER_DELAY_MS);
        if (!(await ownerIsActive(attemptId, environmentId))) return { success: false, cancelled: true, tabId: tab.id };
        const [sortResult] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, func: selectNewestInPage });
        if (sortResult?.result !== true) {
          throw new Error("판매자샵 최신순 정렬을 확인하지 못했습니다");
        }
        await delay(RENDER_DELAY_MS);
        if (!(await ownerIsActive(attemptId, environmentId))) return { success: false, cancelled: true, tabId: tab.id };
        const [extraction] = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractSellerCatalogInPage,
          args: [MAX_ITEMS],
        });
        if (!(await ownerIsActive(attemptId, environmentId))) return { success: false, cancelled: true, tabId: tab.id };
        const rawCatalog = extraction?.result || null;
        if (!rawCatalog?.products?.length) {
          return { success: false, error: "쿠팡 판매자샵 상품 목록을 확인하지 못했습니다", tabId: tab.id };
        }
        const captured = {
          sellerId: target.sellerId,
          sellerName: rawCatalog.sellerName || target.sellerName || null,
          sellerStoreUrl: target.sellerStoreUrl,
          keyword: String(target.keyword || "").trim(),
          priorityScore: Number(target.priorityScore) || 0,
          overlapProductCount: Number(target.overlapProductCount) || 0,
          totalProductCount: rawCatalog.totalProductCount,
          collectedProductCount: rawCatalog.products.length,
          isTruncated: Number.isFinite(rawCatalog.totalProductCount) && rawCatalog.totalProductCount > rawCatalog.products.length,
          sort: "newest",
          capturedAt: new Date().toISOString(),
          products: rawCatalog.products.slice(0, MAX_ITEMS),
        };
        const catalog = targetMode === "rank_enrichment"
          ? preserveRankEnrichmentCatalog(captured, target)
          : sanitizeTrackedCatalog(captured, target);
        if (!catalog) return { success: false, error: "쿠팡 판매자샵 결과가 완전하지 않습니다", tabId: tab.id };
        return { success: true, catalog, tabId: tab.id };
      } catch (error) {
        return { success: false, error: error?.message || "쿠팡 판매자샵 수집 실패", tabId: tab.id };
      }
    }

    return Object.freeze({ collectTarget });
  }

  root.KidItemCoupangSellerCatalogCollector = Object.freeze({ create });
})(globalThis);
