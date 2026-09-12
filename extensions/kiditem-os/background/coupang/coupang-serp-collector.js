(function installKidItemCoupangSerpCollector(root) {
  "use strict";

  // Public Coupang search is deliberately isolated from product-detail and
  // seller-shop traversal.  The source owner still owns attempt terminality;
  // this module owns only navigation, DOM evidence, pagination and bounds.
  const SEARCH_URL = "https://www.coupang.com/np/search";
  const MAX_PAGES = 3;
  const PAGE_RENDER_DELAY_MS = 1200;
  const PAGE_DELAY_MIN_MS = 1500;
  const PAGE_DELAY_MAX_MS = 3000;
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
      throw new Error("Coupang SERP collector dependencies are required.");
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

  function pageUrl(keyword, page) {
    return `${SEARCH_URL}?q=${encodeURIComponent(keyword)}&channel=user&page=${page}&listSize=36`;
  }

  function isSearchUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" &&
        parsed.username === "" && parsed.password === "" && parsed.port === "" &&
        parsed.hostname.toLowerCase() === "www.coupang.com" &&
        parsed.pathname === "/np/search";
    } catch {
      return false;
    }
  }

  function matchesSearchPage(actualValue, expectedValue) {
    if (!isSearchUrl(actualValue) || !isSearchUrl(expectedValue)) return false;
    try {
      const actual = new URL(actualValue);
      const expected = new URL(expectedValue);
      for (const name of ["q", "channel", "page", "listSize"]) {
        if (actual.searchParams.get(name) !== expected.searchParams.get(name)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
  }

  function normalizePageItem(raw, rank, page, positionInPage) {
    return {
      rank,
      page,
      positionInPage,
      isAd: !!raw?.isAd,
      productId: raw?.productId || null,
      itemId: raw?.itemId || null,
      vendorItemId: raw?.vendorItemId || null,
      name: raw?.name || null,
      priceKrw: raw?.priceKrw ?? null,
      reviewCount: raw?.reviewCount ?? null,
      ratingScore: raw?.ratingScore ?? null,
      link: raw?.link || null,
    };
  }

  function extractCoupangSerpInPage() {
    function digitsToNumber(text) {
      const digits = String(text || "").replace(/[^\d]/g, "");
      if (!digits) return null;
      const numeric = Number(digits);
      return Number.isFinite(numeric) ? numeric : null;
    }

    function detectAccessWall() {
      if (/login\.coupang\.com/i.test(location.hostname)) return "login";
      if (/captcha|securityCheck|verification/i.test(location.href)) return "captcha";
      if (document.querySelector(
        'form[action*="captcha" i], #captcha, [class*="captcha" i], input[name*="captcha" i]',
      )) return "captcha";
      const bodyText = (document.body?.innerText || "").slice(0, 4000);
      if (/보안\s*문자|자동\s*입력\s*방지/.test(bodyText)) return "captcha";
      if (/로그인이\s*필요/.test(bodyText)) return "login";
      return null;
    }

    function findProductElements() {
      const knownSelectors = [
        "ul#productList > li.search-product",
        "ul.search-product-list > li.search-product",
        "li.search-product",
        '#product-list > li[class*="ProductUnit" i]',
        'ul[class*="ProductList" i] > li',
        'li[class*="ProductUnit" i]',
      ];
      for (const selector of knownSelectors) {
        const found = Array.prototype.slice.call(document.querySelectorAll(selector))
          .filter((el) => el.querySelector('a[href*="/vp/products/"]'));
        if (found.length > 0) {
          return { elements: found, usedFallback: false, resultListObserved: true };
        }
      }
      const resultList = document.querySelector("#productList") ||
        document.querySelector("#product-list") ||
        document.querySelector('[class*="product-list" i]');
      const container = resultList || document.querySelector("main") || document.body;
      const seen = new Set();
      const elements = [];
      for (const anchor of container.querySelectorAll('a[href*="/vp/products/"]')) {
        const item = anchor.closest("li") || anchor;
        if (seen.has(item)) continue;
        seen.add(item);
        elements.push(item);
      }
      return { elements, usedFallback: true, resultListObserved: Boolean(resultList) };
    }

    function parseProductLink(anchor) {
      if (!anchor) return { link: null, productId: null, itemId: null, vendorItemId: null };
      const rawHref = anchor.getAttribute("href") || "";
      try {
        const parsed = new URL(rawHref, location.origin);
        const productId = (parsed.pathname.match(/^\/vp\/products\/(\d+)$/) || [])[1] || null;
        if (
          parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
          parsed.hostname !== "www.coupang.com" || !productId
        ) return { link: null, productId: null, itemId: null, vendorItemId: null };
        return {
          link: parsed.origin + parsed.pathname + parsed.search,
          productId,
          itemId: parsed.searchParams.get("itemId") || null,
          vendorItemId: parsed.searchParams.get("vendorItemId") || null,
        };
      } catch {
        return { link: null, productId: null, itemId: null, vendorItemId: null };
      }
    }

    function detectIsAd(element, anchor) {
      if (element.querySelector(
        '[class*="ad-badge" i], [class*="adBadge" i], [class*="AdMark" i], [class*="sponsored" i], .search-product__ad-badge',
      )) return true;
      if (/search-product__ad|AdMark/i.test(element.className || "")) return true;
      if (element.querySelector("[data-adsplatform], [data-ads-platform], [data-ad-marker]")) return true;
      const href = anchor ? anchor.getAttribute("href") || "" : "";
      if (/sourceType=srp_product_ads|adsPlatform/i.test(href)) return true;
      for (const badge of element.querySelectorAll("span, em, div")) {
        const text = (badge.textContent || "").trim();
        if (text.length <= 4 && (text === "광고" || text === "AD")) return true;
      }
      return false;
    }

    function extractName(element, anchor) {
      const nameEl = element.querySelector(".name") ||
        element.querySelector('[class*="productName" i]') ||
        element.querySelector('[class*="product-name" i]');
      let name = nameEl ? nameEl.textContent : "";
      if (!name) {
        const img = element.querySelector("img[alt]");
        if (img?.getAttribute("alt")) name = img.getAttribute("alt");
      }
      if (!name && anchor) name = anchor.textContent;
      name = String(name || "").replace(/\s+/g, " ").trim();
      return name ? name.slice(0, 300) : null;
    }

    function extractPrice(element) {
      const priceEl = element.querySelector(".price-value") ||
        element.querySelector('[class*="priceValue" i]') ||
        element.querySelector('[class*="sale-price" i]') ||
        element.querySelector('strong[class*="price" i]') ||
        element.querySelector('[class*="price" i] strong');
      return priceEl ? digitsToNumber(priceEl.textContent) : null;
    }

    function extractReviewCount(element) {
      const countEl = element.querySelector(".rating-total-count") ||
        element.querySelector('[class*="ratingCount" i]') ||
        element.querySelector('[class*="rating-total" i]');
      return countEl ? digitsToNumber(countEl.textContent) : null;
    }

    function extractRatingScore(element) {
      const ratingEl = element.querySelector("em.rating") ||
        element.querySelector('[class*="ratingValue" i]') ||
        element.querySelector(".rating");
      if (!ratingEl) return null;
      const direct = Number.parseFloat((ratingEl.textContent || "").trim());
      if (Number.isFinite(direct) && direct > 0 && direct <= 5) return direct;
      const width = Number.parseFloat(ratingEl.style?.width || "");
      if (Number.isFinite(width) && width > 0 && width <= 100) {
        return Math.round((width / 20) * 10) / 10;
      }
      return null;
    }

    function extractImageUrl(element) {
      const image = element.querySelector("img");
      const rawImageUrl = image?.currentSrc || image?.getAttribute("src") ||
        image?.getAttribute("data-img-src") || image?.getAttribute("data-src") || "";
      if (!rawImageUrl || rawImageUrl.startsWith("data:")) return null;
      try {
        const parsed = new URL(rawImageUrl, location.href);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
        return parsed.href;
      } catch {
        return null;
      }
    }

    const wall = detectAccessWall();
    const { elements, usedFallback, resultListObserved } = findProductElements();
    const items = [];
    for (const element of elements) {
      const anchor = element.matches?.('a[href*="/vp/products/"]')
        ? element
        : element.querySelector('a[href*="/vp/products/"]');
      if (!anchor) continue;
      const linkInfo = parseProductLink(anchor);
      if (!linkInfo.productId) continue;
      items.push({
        isAd: detectIsAd(element, anchor),
        productId: linkInfo.productId,
        itemId: linkInfo.itemId,
        vendorItemId: linkInfo.vendorItemId,
        name: extractName(element, anchor),
        priceKrw: extractPrice(element),
        reviewCount: extractReviewCount(element),
        ratingScore: extractRatingScore(element),
        imageUrl: extractImageUrl(element),
        link: linkInfo.link,
      });
    }
    return { items, usedFallback, wall, resultListObserved };
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
          if (!tab?.id) throw new Error("쿠팡 검색 탭을 조회할 수 없습니다");
          return tab;
        });
    }

    function createTab() {
      return callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.create({ url: "about:blank", active: false }, callback),
      ).then((tab) => {
        if (!tab?.id) throw new Error("쿠팡 검색 탭을 열 수 없습니다");
        return tab;
      });
    }

    function removeTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.remove(tabId, callback))
        .catch(() => undefined);
    }

    async function updateTabAndWait(tabId, url) {
      const before = await getTab(tabId).catch(() => null);
      if (before?.active) throw new Error("active user tab is collection-protected");
      await callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.update(tabId, { url, active: false }, callback),
      );
      return waitForTabComplete(tabId, { expectedUrl: url, timeoutMs: PAGE_TIMEOUT_MS });
    }

    async function ownerSession(attemptId, environmentId) {
      if (!attemptId || !environmentId) throw new Error("coupang_serp_source_owner_attempt_required");
      const session = await sessions.getOwned(attemptId, environmentId);
      if (!session || session.producer !== "advertising.keyword_rank") {
        throw new Error("coupang_serp_source_owner_session_invalid");
      }
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(attemptId, environmentId, "advertising.keyword_rank"))) {
        throw new Error("coupang_serp_source_owner_cancelled");
      }
      return session;
    }

    async function sessionIsActive(attemptId, environmentId) {
      try {
        await ownerSession(attemptId, environmentId);
        return true;
      } catch {
        return false;
      }
    }

    async function acquireTab(optionsForRun, firstUrl) {
      const attemptId = optionsForRun.attemptId;
      const environmentId = optionsForRun.environmentId;
      await ownerSession(attemptId, environmentId);
      let tab = null;
      const suppliedTabId = Number.isInteger(optionsForRun.tabId)
        ? optionsForRun.tabId
        : Number.isInteger(optionsForRun.collectionTabId)
          ? optionsForRun.collectionTabId
          : null;
      if (suppliedTabId !== null) {
        if (!(await sessions.ownsTab(
          attemptId,
          environmentId,
          "advertising.keyword_rank",
          suppliedTabId,
        ))) {
          throw new Error("coupang_serp_source_owner_tab_invalid");
        }
        tab = await getTab(suppliedTabId).catch(() => null);
        if (!tab) throw new Error("coupang_serp_source_owner_tab_unavailable");
        await environment.bindTab(tab.id, environmentId);
        return tab;
      }
      tab = await createTab();
      try {
        await ownerSession(attemptId, environmentId);
        const attached = await sessions.attachTab(attemptId, {
          tabId: tab.id,
          windowId: tab.windowId,
          closeOnCancel: true,
        });
        if (!attached) throw new Error("coupang_serp_source_owner_tab_attach_refused");
        await environment.bindTab(tab.id, environmentId);
      } catch (error) {
        await removeTab(tab.id);
        throw error;
      }
      return tab;
    }

    async function execute(tabId) {
      const [result] = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: extractCoupangSerpInPage,
      });
      return result?.result || null;
    }

    async function collect(keywordValue, maxPagesValue, optionsForRun = {}) {
      const keyword = typeof keywordValue === "string" ? keywordValue.trim() : "";
      if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };
      const numericPages = Number(maxPagesValue);
      const maxPages = Number.isFinite(numericPages)
        ? Math.max(1, Math.min(MAX_PAGES, Math.floor(numericPages)))
        : MAX_PAGES;
      const items = [];
      let tab = null;
      let pagesScanned = 0;
      let stoppedAtPage = 0;
      let stopReason = "invalid_result";
      let usedFallback = false;
      let wall = null;

      await ownerSession(optionsForRun.attemptId, optionsForRun.environmentId);

      for (let page = 1; page <= maxPages; page += 1) {
        stoppedAtPage = page;
        if (!(await sessionIsActive(optionsForRun.attemptId, optionsForRun.environmentId))) {
          return { success: false, cancelled: true, tabId: tab?.id || null };
        }
        const url = pageUrl(keyword, page);
        if (!tab) tab = await acquireTab(optionsForRun, url);
        const loaded = page === 1 && tab.url === url && tab.status === "complete"
          ? tab
          : await updateTabAndWait(tab.id, url).catch(() => null);
        if (!loaded) {
          if (items.length === 0) return { success: false, tabId: tab.id, error: "쿠팡 검색 페이지 로딩 실패" };
          stopReason = "load_failed";
          break;
        }
        if (!(await sessionIsActive(optionsForRun.attemptId, optionsForRun.environmentId))) {
          return { success: false, cancelled: true, tabId: tab.id };
        }
        const current = await getTab(tab.id).catch(() => null);
        if (!matchesSearchPage(current?.url || loaded?.url || "", url)) {
          if (items.length === 0) {
            return {
              success: false,
              tabId: tab.id,
              wall: "redirect",
              error: "쿠팡 검색 페이지가 아닌 화면으로 이동했습니다 — 열린 탭에서 로그인/보안문자 여부를 확인하세요.",
            };
          }
          stopReason = "redirect";
          break;
        }
        await delay(PAGE_RENDER_DELAY_MS);
        if (!(await sessionIsActive(optionsForRun.attemptId, optionsForRun.environmentId))) {
          return { success: false, cancelled: true, tabId: tab.id };
        }
        let extraction;
        try {
          extraction = await execute(tab.id);
        } catch (error) {
          if (items.length === 0) return { success: false, tabId: tab.id, error: error?.message || "쿠팡 검색 결과 파싱 실패" };
          stopReason = "extraction_failed";
          break;
        }
        if (!extraction) {
          if (items.length === 0) return { success: false, tabId: tab.id, error: "쿠팡 검색 결과 파싱 실패" };
          stopReason = "extraction_failed";
          break;
        }
        wall = extraction.wall || wall;
        if (!(await sessionIsActive(optionsForRun.attemptId, optionsForRun.environmentId))) {
          return { success: false, cancelled: true, tabId: tab.id };
        }
        usedFallback ||= !!extraction.usedFallback;
        const pageItems = Array.isArray(extraction.items) ? extraction.items : [];
        if (pageItems.length === 0) {
          if (page === 1) {
            const hint = extraction.wall === "captcha"
              ? "쿠팡 보안문자(캡차) 화면이 감지되었습니다."
              : extraction.wall === "login"
                ? "쿠팡 로그인 화면이 감지되었습니다."
                : "상품 목록 마크업을 찾지 못했습니다.";
            return {
              success: false,
              tabId: tab.id,
              wall: extraction.wall || null,
              error: `쿠팡 검색 결과가 비어 있습니다 — ${hint} 열린 탭에서 화면을 확인하세요.`,
            };
          }
          stopReason = wall
            ? "provider_wall"
            : extraction.resultListObserved === true ? "empty_page" : "invalid_result";
          break;
        }
        for (let index = 0; index < pageItems.length; index += 1) {
          items.push(normalizePageItem(pageItems[index], items.length + 1, page, index + 1));
        }
        pagesScanned = page;
        if (page === maxPages) stopReason = wall ? "provider_wall" : "page_limit";
        if (page < maxPages) await delay(randomDelayMs(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS));
      }

      if (!(await sessionIsActive(optionsForRun.attemptId, optionsForRun.environmentId))) {
        return { success: false, cancelled: true, tabId: tab?.id || null };
      }
      if (items.length === 0) return { success: false, tabId: tab?.id || null, wall, error: "쿠팡 검색 결과에서 상품을 찾지 못했습니다" };
      return {
        success: true,
        tabId: tab.id,
        keyword,
        pagesScanned,
        items,
        usedFallback,
        wall,
        pagination: { requestedMaxPages: maxPages, stoppedAtPage, stopReason },
      };
    }

    return Object.freeze({ collect });
  }

  root.KidItemCoupangSerpCollector = Object.freeze({ create });
})(globalThis);
