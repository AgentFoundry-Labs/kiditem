(function initializeKidItemWingSearchCollector(root) {
  "use strict";

  // Wing's pre-matching endpoint is a provider-specific source capture seam.
  // The worker supplies only browser/session/attention adapters; request,
  // pagination, retry, normalization, and proof policy stay here.
  const SEARCH_ENDPOINT = "/tenants/seller-web/pre-matching/search";
  const FORM_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
  const MAX_PAGES = 5;
  const DEFAULT_MAX_PAGES = 2;
  const PAGE_DELAY_MS = 2200;
  const PAGE_TIMEOUT_MS = 60000;
  const HTTP_RETRY_ATTEMPTS = 4;
  const PRODUCERS = new Set([
    "sourcing.wing_catalog",
    "advertising.wing_rank",
    "advertising.wing_tracked_products",
  ]);

  function requiredDependencies(options) {
    if (
      !options?.chrome?.tabs?.create ||
      !options.chrome.tabs.get ||
      !options.chrome.scripting?.executeScript ||
      typeof options.sessions?.getOwned !== "function" ||
      typeof options.sessions?.attachTab !== "function" ||
      typeof options.environment?.bindTab !== "function" ||
      typeof options.waitForTabComplete !== "function" ||
      typeof options.attention !== "function"
    ) {
      throw new Error("Wing search collector dependencies are required.");
    }
    return options;
  }

  function nullableNumber(value) {
    if (
      value == null ||
      typeof value === "boolean" ||
      Array.isArray(value) ||
      (typeof value === "object" && value !== null)
    ) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function clampPages(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_MAX_PAGES;
    return Math.max(1, Math.min(MAX_PAGES, Math.floor(numeric)));
  }

  function isFormUrl(value) {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === "wing.coupang.com" &&
        url.pathname === "/tenants/seller-web/vendor-inventory/formV2"
      );
    } catch {
      return false;
    }
  }

  function normalizeProduct(product) {
    if (!product || typeof product !== "object") return null;
    const productId = product.productId == null ? null : String(product.productId);
    if (!productId) return null;
    const salePrice = nullableNumber(product.salePrice);
    const salesLast28d = nullableNumber(product.salesLast28d);
    const pvLast28Day = nullableNumber(product.pvLast28Day);
    return {
      productId,
      itemId: product.itemId == null ? null : String(product.itemId),
      vendorItemId:
        product.vendorItemId == null ? null : String(product.vendorItemId),
      productName: String(product.productName || ""),
      itemName: product.itemName ? String(product.itemName) : null,
      brandName: product.brandName ? String(product.brandName) : null,
      manufacture: product.manufacture ? String(product.manufacture) : null,
      categoryHierarchy: Array.isArray(product.displayCategoryInfo)
        ? product.displayCategoryInfo[0]?.categoryHierarchy || null
        : null,
      imagePath: product.imagePath ? String(product.imagePath) : null,
      salePrice,
      rating: nullableNumber(product.rating),
      ratingCount: nullableNumber(product.ratingCount),
      pvLast28Day,
      salesLast28d,
      estimatedRevenue28d:
        salePrice != null && salesLast28d != null
          ? Math.round(salePrice * salesLast28d)
          : null,
      conversionRate28d:
        pvLast28Day != null && pvLast28Day > 0 && salesLast28d != null
          ? salesLast28d / pvLast28Day
          : null,
      deliveryInfo: product.deliveryInfo ? String(product.deliveryInfo) : null,
    };
  }

  function resolveTotal(body) {
    if (!body || typeof body !== "object") return null;
    const candidates = [
      body.total,
      body.totalCount,
      body.productTotalCount,
      body.totalProductCount,
      body.count,
      body.pagination?.total,
      body.pagination?.totalCount,
      body.pageInfo?.total,
      body.pageInfo?.totalCount,
    ];
    for (const candidate of candidates) {
      const numeric = nullableNumber(candidate);
      if (numeric != null) return numeric;
    }
    return null;
  }

  function raceWithAbort(operation, signal) {
    if (!signal) return operation;
    signal.throwIfAborted?.();
    return new Promise((resolve, reject) => {
      let settled = false;
      const abort = () => {
        if (settled) return;
        settled = true;
        reject(signal.reason || new Error("operation_aborted"));
      };
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(operation).then(
        (value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function callbackOrPromise(api, args) {
    return new Promise((resolve, reject) => {
      let callbackSettled = false;
      const callback = (value) => {
        callbackSettled = true;
        const error = api?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message || "Chrome API request failed"));
          return;
        }
        resolve(value);
      };
      try {
        const result = args(callback);
        if (result && typeof result.then === "function") {
          result.then((value) => {
            if (!callbackSettled) resolve(value);
          }, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async function executeWingCatalogSearchInPage(requestPayload, endpoint) {
    const xsrfCookie = String(document.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("XSRF-TOKEN="));
    const encodedXsrfToken = xsrfCookie?.slice("XSRF-TOKEN=".length) || "";
    let xsrfToken = "";
    try {
      xsrfToken = decodeURIComponent(encodedXsrfToken);
    } catch {
      xsrfToken = encodedXsrfToken;
    }
    if (!xsrfToken) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: null,
        errorCode: "wing_xsrf_token_missing",
        error:
          "Wing 검색 인증 토큰을 찾지 못했습니다. Wing 탭을 새로고침하거나 다시 로그인해 주세요.",
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": xsrfToken,
        },
        body: JSON.stringify(requestPayload),
        // Keep the provider fetch bounded even when the page-side request stalls.
        signal: AbortSignal.timeout(20000),
      });
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      let body = null;
      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        body,
        textPreview: body ? null : text.slice(0, 200),
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: null,
        error: error?.message || String(error),
      };
    }
  }

  function create(options) {
    const {
      chrome: chromeApi,
      sessions,
      environment,
      waitForTabComplete,
      attention,
    } = requiredDependencies(options);

    function getTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.get(tabId, callback),
      ).then((tab) => {
        if (!tab?.id) throw new Error("Wing 검색 탭을 조회할 수 없습니다.");
        return tab;
      });
    }

    function createTab() {
      return callbackOrPromise(chromeApi, (callback) =>
        chromeApi.tabs.create({ url: FORM_URL, active: false }, callback),
      ).then((tab) => {
        if (!tab?.id) throw new Error("Wing 카탈로그 검색 탭을 열 수 없습니다");
        return tab;
      });
    }

    function removeTab(tabId) {
      return callbackOrPromise(chromeApi, (callback) => chromeApi.tabs.remove(tabId, callback))
        .catch(() => undefined);
    }

    async function executeSearch(tabId, payload) {
      const [result] = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: executeWingCatalogSearchInPage,
        args: [payload, SEARCH_ENDPOINT],
      });
      return result?.result || null;
    }

    async function isCancelled(runId, environmentId) {
      const session = await sessions.getOwned(runId, environmentId);
      if (!session) return true;
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(runId, environmentId, session.producer))) return true;
      return false;
    }

    async function requestWithRetry(tabId, payload, runId, environmentId, signal) {
      let response = null;
      for (let attempt = 1; attempt <= HTTP_RETRY_ATTEMPTS; attempt += 1) {
        signal?.throwIfAborted?.();
        if (await isCancelled(runId, environmentId)) {
          throw new Error("COLLECTION_CANCELLED");
        }
        response = await executeSearch(tabId, payload);
        const retryable = response?.status === 429 || response?.status >= 500;
        if (!retryable || attempt === HTTP_RETRY_ATTEMPTS) return response;
        const baseMs = response.status === 429 ? 4000 : 1000;
        await raceWithAbort(delay(baseMs * 2 ** (attempt - 1)), signal);
      }
      return response;
    }

    async function requireAttention(runId, tabId, reason, message) {
      const result = await attention(runId, tabId, reason, message);
      return result || {
        success: false,
        attentionRequired: true,
        runId,
        tabId,
        error: message,
      };
    }

    async function collect(input = {}) {
      const signal = input.signal;
      signal?.throwIfAborted?.();
      const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
      if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

      const maxPages = clampPages(input.maxPages);
      const runId = input.attemptId;
      const environmentId = input.environmentId;
      if (typeof runId !== "string" || !runId) {
        throw new Error("wing_catalog_source_owner_attempt_required");
      }
      if (typeof environmentId !== "string" || !environmentId) {
        throw new Error("wing_catalog_source_owner_environment_required");
      }
      const ownerSession = await sessions.getOwned(runId, environmentId);
      if (
        !ownerSession ||
        (ownerSession.environmentId !== undefined &&
          ownerSession.environmentId !== environmentId) ||
        !PRODUCERS.has(ownerSession.producer)
      ) {
        throw new Error("wing_catalog_source_owner_session_invalid");
      }
      signal?.throwIfAborted?.();

      let tab = null;
      let created = false;
      if (Number.isInteger(input.collectionTabId)) {
        tab = await getTab(input.collectionTabId).catch(() => null);
      }
      if (!tab) {
        tab = await createTab();
        created = true;
      }
      const tabId = tab.id;
      let releasedCreatedTab = false;
      const closeCreatedTab = async () => {
        if (!created || releasedCreatedTab) return;
        releasedCreatedTab = true;
        await removeTab(tabId);
      };
      if (await isCancelled(runId, environmentId)) {
        await closeCreatedTab();
        return { success: false, cancelled: true, tabId, runId };
      }
      try {
        await environment.bindTab(tabId, environmentId);
        if (await isCancelled(runId, environmentId)) {
          await closeCreatedTab();
          return { success: false, cancelled: true, tabId, runId };
        }
        const attachment = await sessions.attachTab(runId, {
          tabId,
          windowId: tab.windowId,
        });
        if (attachment === null) {
          await closeCreatedTab();
          return { success: false, cancelled: true, tabId, runId };
        }
        // Once the session accepts the tab, it is the sole close owner. The
        // session cancellation path closes managed tabs after the owner fence;
        // this collector must not close the same tab again when its next
        // cancellation check observes that fence.
        created = false;
        if (await isCancelled(runId, environmentId)) {
          await closeCreatedTab();
          return { success: false, cancelled: true, tabId, runId };
        }
        signal?.throwIfAborted?.();
        const cancelledResult = async () => {
          await closeCreatedTab();
          return {
            success: false,
            cancelled: true,
            tabId,
            runId,
          };
        };
        if (await isCancelled(runId, environmentId)) return cancelledResult();

      const loaded = await raceWithAbort(
        waitForTabComplete(tabId, {
          expectedUrl: FORM_URL,
          timeoutMs: PAGE_TIMEOUT_MS,
        }),
        signal,
      ).catch((error) => ({
        error: error?.message || "Wing 상품등록 화면 로딩 실패",
      }));
      signal?.throwIfAborted?.();
      if (await isCancelled(runId, environmentId)) return cancelledResult();
      if (loaded?.error) {
        return { success: false, error: loaded.error, tabId, runId };
      }
      if (!isFormUrl(loaded?.url || "")) {
        const attentionResult = await requireAttention(
          runId,
          tabId,
          "marketplace_login",
          "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
        created = false;
        return attentionResult;
      }

      const startedAt = Date.now();
      const pages = [];
      const rows = [];
      const seen = new Set();
      const warnings = [];
      let searchPage = 0;
      let stopReason = "max_pages_reached";
      let upstreamTotal = null;

      for (let index = 0; index < maxPages; index += 1) {
        if (await isCancelled(runId, environmentId)) return cancelledResult();
        const payload = {
          keyword,
          excludedProductIds: [],
          searchPage,
          searchOrder: "DEFAULT",
          sortType: "DEFAULT",
        };
        let response;
        try {
          response = await raceWithAbort(
            requestWithRetry(
              tabId,
              payload,
              runId,
              environmentId,
              signal,
            ),
            signal,
          );
        } catch (error) {
          if (await isCancelled(runId, environmentId)) return cancelledResult();
          throw error;
        }
        if (await isCancelled(runId, environmentId)) return cancelledResult();

        if (response?.errorCode === "wing_xsrf_token_missing") {
          if (rows.length === 0) {
            const attentionResult = await requireAttention(runId, tabId, "marketplace_login", response.error);
            created = false;
            return attentionResult;
          }
          warnings.push(`${searchPage}페이지: ${response.error}`);
          stopReason = "authentication_token_missing";
          break;
        }

        if (
          !response?.ok ||
          response.contentType?.includes("application/json") !== true
        ) {
          const message =
            response?.status === 429
              ? "Wing 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요."
              : "Wing이 JSON 대신 다른 응답을 반환했습니다.";
          if (rows.length === 0) {
            const retryExhausted =
              response?.status === 429 || response?.status >= 500;
            const attentionResult = await requireAttention(
              runId,
              tabId,
              retryExhausted ? "rate_limited" : "marketplace_login",
              retryExhausted
                ? message
                : "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
            );
            created = false;
            return attentionResult;
          }
          warnings.push(`${searchPage}페이지: ${message}`);
          stopReason = "non_json_response";
          break;
        }

        const body = response.body || {};
        const result = Array.isArray(body.result) ? body.result : [];
        upstreamTotal = upstreamTotal ?? resolveTotal(body);
        pages.push({
          searchPage,
          itemCount: result.length,
          resultArrayObserved: Array.isArray(body.result),
          nextSearchPage: body.nextSearchPage ?? null,
          total: resolveTotal(body),
        });

        for (const product of result) {
          const normalized = normalizeProduct(product);
          if (!normalized) continue;
          const key = `${normalized.productId || ""}:${normalized.itemId || ""}:${normalized.vendorItemId || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(normalized);
        }

        if (result.length === 0) {
          stopReason = "empty_page";
          break;
        }
        if (body.nextSearchPage == null) {
          stopReason = "no_next_search_page";
          break;
        }
        if (body.nextSearchPage === searchPage) {
          stopReason = "next_page_not_advancing";
          break;
        }
        searchPage = body.nextSearchPage;
        if (index < maxPages - 1) {
          await raceWithAbort(delay(PAGE_DELAY_MS), signal);
        }
      }

      const reliableUpstreamTotal =
        upstreamTotal != null && upstreamTotal >= rows.length
          ? upstreamTotal
          : null;
      if (await isCancelled(runId, environmentId)) return cancelledResult();
      const result = {
        success: true,
        opened: true,
        tabId,
        keyword,
        maxPages,
        stopReason,
        pages,
        rows,
        total: reliableUpstreamTotal ?? rows.length,
        collectedCount: rows.length,
        upstreamTotal: reliableUpstreamTotal,
        warnings,
        endpoint: SEARCH_ENDPOINT,
        dateWindow: "last28d",
        startedAt,
        endedAt: Date.now(),
      };
      if (await isCancelled(runId, environmentId)) return cancelledResult();
      return { ...result, runId };
      } catch (error) {
        await closeCreatedTab();
        throw error;
      }
    }

    return Object.freeze({ collect });
  }

  root.KidItemWingSearchCollector = Object.freeze({ create });
})(globalThis);
