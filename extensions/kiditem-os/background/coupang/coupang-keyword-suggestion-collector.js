(function installCoupangKeywordSuggestionCollector(root) {
  "use strict";

  const SEARCH_URL = "https://www.coupang.com/np/search";
  const AUTOCOMPLETE_ENDPOINT = "/np/search/autoComplete";
  const PRODUCER = "sourcing.keyword_suggestion";
  const SEARCH_DELAY_MS = 1500;
  const PAGE_TIMEOUT_MS = 60000;

  function requiredDependencies(options) {
    if (
      !options?.chrome?.scripting?.executeScript ||
      typeof options.chrome.tabs?.remove !== "function" ||
      typeof options.createTab !== "function" ||
      typeof options.bindTab !== "function" ||
      typeof options.waitForTabComplete !== "function" ||
      typeof options.sessions?.getOwned !== "function" ||
      typeof options.sessions?.attachTab !== "function" ||
      typeof options.attention !== "function"
    ) {
      throw new Error("Coupang keyword suggestion collector dependencies are required.");
    }
    return options;
  }

  function buildSearchUrl(keyword) {
    return `${SEARCH_URL}?component=&q=${encodeURIComponent(keyword)}&channel=user`;
  }

  function isSearchUrl(value) {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname.toLowerCase() === "www.coupang.com" &&
        url.port === "" &&
        url.username === "" &&
        url.password === "" &&
        /^\/np\/search\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  function errorMessage(error, fallback) {
    return error?.message || fallback;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function executeKeywordSuggestionPage(requestKeyword, requestMaxResults, autocompleteEndpoint) {
    const warnings = [];
    const candidates = [];
    const productNames = [];
    let domEvidence = false;
    let structuredResponse = false;
    let providerError = null;
    let providerAttention = false;
    let providerStatus = 0;

    function addKeyword(value, source) {
      if (typeof value !== "string") return;
      const keyword = value.replace(/\s+/g, " ").trim();
      if (!isUsableKeyword(keyword, requestKeyword)) return;
      candidates.push({ keyword, source });
    }

    function isUsableKeyword(value, seed) {
      if (value.length < 2 || value.length > 40) return false;
      if (/https?:\/\//i.test(value)) return false;
      if (/^[\d\s,.-]+$/.test(value)) return false;
      if (/[₩원%]/.test(value)) return false;
      if (
        ["검색", "바로가기", "쿠팡", "로켓배송", "무료배송"].includes(value)
      )
        return false;
      const compact = value.replace(/\s+/g, "").toLowerCase();
      const compactSeed = String(seed || "")
        .replace(/\s+/g, "")
        .toLowerCase();
      return compact.length > 1 && compact !== compactSeed;
    }

    function collectFromJson(value, source) {
      if (typeof value === "string") {
        addKeyword(value, source);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) collectFromJson(item, source);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        if (
          /keyword|query|term|suggest|name|label|word/i.test(key) &&
          typeof nested === "string"
        ) {
          addKeyword(nested, source);
          continue;
        }
        collectFromJson(nested, source);
      }
    }

    function errorEnvelope(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      if (value.success === false || value.ok === false) return true;
      for (const key of ["error", "errors", "errorCode", "error_code"]) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const nested = value[key];
        if (nested !== null && nested !== undefined && String(nested).trim()) {
          return true;
        }
      }
      if (
        value.code !== undefined &&
        value.code !== null &&
        value.code !== 0 &&
        value.code !== "0" &&
        String(value.code).trim() !== ""
      ) {
        return true;
      }
      const message = typeof value.message === "string" ? value.message : "";
      return /access\s*denied|unauthori[sz]ed|forbidden|too\s*many\s*requests|로그인|인증|접근\s*거부/i.test(message);
    }

    function errorEnvelopeMessage(value) {
      if (!value || typeof value !== "object") return "쿠팡 자동완성 응답에서 오류를 반환했습니다.";
      for (const key of ["error", "errors", "message", "errorCode", "error_code", "code"]) {
        const nested = value[key];
        if (nested !== null && nested !== undefined && String(nested).trim()) {
          return String(nested);
        }
      }
      return "쿠팡 자동완성 응답에서 오류를 반환했습니다.";
    }

    function hasSuggestionCollection(value, depth = 0) {
      if (Array.isArray(value)) return true;
      if (!value || typeof value !== "object" || depth > 3) return false;
      for (const [key, nested] of Object.entries(value)) {
        if (!/suggest|keyword|query|term|result|item|product|data|list/i.test(key)) {
          continue;
        }
        if (Array.isArray(nested)) return true;
        if (typeof nested === "string" && nested.trim()) return true;
        if (nested && typeof nested === "object" && hasSuggestionCollection(nested, depth + 1)) {
          return true;
        }
      }
      return false;
    }

    function collectFromDom() {
      if (!globalThis.document || typeof document.querySelectorAll !== "function") {
        return;
      }
      const selectors = [
        'a[href*="/np/search"]',
        'a[href*="q="]',
        '[class*="related"] a',
        '[class*="suggest"] a',
        '[class*="keyword"] a',
      ];
      const before = candidates.length;
      for (const element of document.querySelectorAll(selectors.join(","))) {
        addKeyword(element.textContent || "", "coupang-search-dom");
        try {
          const href = element.getAttribute("href") || "";
          const parsed = new URL(href, location.origin);
          addKeyword(
            parsed.searchParams.get("q") ||
              parsed.searchParams.get("keyword") ||
              "",
            "coupang-search-dom",
          );
        } catch {}
      }
      if (candidates.length > before) domEvidence = true;
    }

    function collectProductNamesFromDom() {
      if (!globalThis.document || typeof document.querySelectorAll !== "function") {
        return;
      }
      const selectors = [
        ".search-product-wrap .name",
        ".search-product .name",
        ".descriptions .name",
        "a.search-product-link",
        "li.search-product",
        '[class*="search-product"] [class*="name"]',
      ];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length < 4 || text.length > 180) continue;
        if (/장바구니|구매|광고|무료배송|로켓배송만 보기/.test(text))
          continue;
        productNames.push(text);
        domEvidence = true;
      }
    }

    try {
      const params = new URLSearchParams({ keyword: requestKeyword });
      const response = await fetch(
        `${autocompleteEndpoint}?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
          },
        },
      );
      const contentType = response.headers.get("content-type") || "";
      const text = String(await response.text() || "");
      const trimmedText = text.trim();
      if (!response.ok) {
        warnings.push(`쿠팡 자동완성 호출 실패 (${response.status})`);
        if ([401, 403, 429].includes(response.status)) {
          providerError = response.status === 429
            ? "쿠팡 자동완성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
            : "쿠팡 자동완성 인증이 필요합니다. 쿠팡 탭에서 다시 로그인해주세요.";
          providerAttention = true;
          providerStatus = response.status;
        }
      }
      const looksLikeJson =
        contentType.includes("application/json") ||
        /^[\[{]/.test(trimmedText);
      if (looksLikeJson && trimmedText) {
        try {
          const parsed = JSON.parse(trimmedText);
          if (
            Array.isArray(parsed) ||
            (parsed && typeof parsed === "object")
          ) {
            if (errorEnvelope(parsed)) {
              providerError = errorEnvelopeMessage(parsed);
              providerAttention = providerAttention || /access\s*denied|unauthori[sz]ed|forbidden|too\s*many\s*requests|로그인|인증|접근\s*거부/i.test(providerError);
            } else {
              collectFromJson(parsed, "coupang-autocomplete");
              structuredResponse = hasSuggestionCollection(parsed);
            }
          } else {
            warnings.push("쿠팡 자동완성 JSON 구조가 유효하지 않습니다");
          }
        } catch {
          warnings.push("쿠팡 자동완성 JSON 파싱 실패");
        }
      } else if (trimmedText) {
        warnings.push("쿠팡 자동완성 응답이 JSON이 아닙니다");
      }
    } catch (error) {
      warnings.push(error?.message || "쿠팡 자동완성 호출 실패");
    }

    collectFromDom();
    collectProductNamesFromDom();

    if (providerError) {
      return {
        success: false,
        attentionRequired: providerAttention,
        status: providerStatus,
        error: providerError,
        warnings,
      };
    }
    if (!structuredResponse && !domEvidence) {
      return {
        success: false,
        error: "쿠팡 키워드 응답에서 사용할 수 있는 검색 근거를 찾지 못했습니다.",
        warnings,
      };
    }

    const seen = new Set();
    const items = [];
    for (const candidate of candidates) {
      const key = candidate.keyword.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        rank: items.length + 1,
        keyword: candidate.keyword,
        source: candidate.source,
      });
      if (items.length >= requestMaxResults) break;
    }

    const tokenCounts = new Map();
    const stopWords = new Set([
      "쿠팡",
      "로켓",
      "로켓배송",
      "무료배송",
      "무료",
      "배송",
      "정품",
      "국내",
      "당일",
      "오늘",
      "새상품",
      "상품",
      "구매",
      "할인",
      "특가",
      "옵션",
      "색상",
      "랜덤",
    ]);
    for (const name of productNames) {
      const tokens = name
        .replace(/[()[\]{}"'`~!@#$%^&*_+=|\\:;,.<>/?·•]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 20)
        .filter((token) => !/^[\d개입묶음세트]+$/.test(token))
        .filter((token) => !stopWords.has(token));
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
      }
    }
    const productNameTokens = Array.from(tokenCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"),
      )
      .slice(0, requestMaxResults);

    return {
      success: true,
      source: items.some((item) => item.source === "coupang-autocomplete") || structuredResponse
        ? "coupang-autocomplete"
        : "coupang-search-dom",
      items,
      productNameTokens,
      warnings,
    };
  }

  function create(options) {
    const {
      chrome: chromeApi,
      sessions,
      createTab,
      bindTab,
      waitForTabComplete,
      attention,
      delay = sleep,
    } = requiredDependencies(options);

    async function cancellationRequested(runId, environmentId, cancellation) {
      if (typeof cancellation === "function" && await cancellation()) return true;
      const session = await sessions.getOwned(runId, environmentId);
      if (!(session && session.producer === PRODUCER)) return true;
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(runId, environmentId, PRODUCER))) return true;
      return false;
    }

    async function removeCreatedTab(tabId) {
      if (!Number.isInteger(tabId)) return;
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          const result = chromeApi.tabs.remove(tabId, finish);
          if (result && typeof result.then === "function") {
            result.then(finish, finish);
          } else if (chromeApi.tabs.remove.length < 2) {
            finish();
          }
        } catch {
          finish();
        }
      });
    }

    async function execute(tabId, keyword, maxResults) {
      const [result] = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: executeKeywordSuggestionPage,
        args: [keyword, maxResults, AUTOCOMPLETE_ENDPOINT],
      });
      return result?.result || null;
    }

    async function collect(message = {}) {
      const keyword = typeof message.keyword === "string" ? message.keyword.trim() : "";
      if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

      const maxResults = message.maxResults === undefined ? 20 : message.maxResults;
      const runId = message.runId;
      const environmentId = message.environmentId;
      const cancelledResult = {
        success: false,
        cancelled: true,
        runId,
      };
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        return cancelledResult;
      }

      const url = buildSearchUrl(keyword);
      let tab;
      try {
        tab = await createTab({ url, active: false });
      } catch (error) {
        return {
          success: false,
          error: errorMessage(error, "쿠팡 검색 탭을 열 수 없습니다"),
          runId,
        };
      }
      const tabId = tab?.id;
      if (!tabId) {
        return { success: false, error: "쿠팡 검색 탭을 열 수 없습니다", runId };
      }
      const tabCancelledResult = { ...cancelledResult, tabId };

      // Bind and attach immediately after creation. Readiness must never race
      // an unowned tab: cancellation and environment fences apply during load.
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        await removeCreatedTab(tabId);
        return { ...cancelledResult, tabId };
      }
      try {
        await bindTab(tabId, environmentId);
        if (await cancellationRequested(runId, environmentId, message.cancellation)) {
          await removeCreatedTab(tabId);
          return { ...cancelledResult, tabId };
        }
        const attached = await sessions.attachTab(runId, {
          tabId,
          windowId: tab.windowId,
          closeOnCancel: true,
        });
        if (!attached) {
          await removeCreatedTab(tabId);
          return (await cancellationRequested(runId, environmentId, message.cancellation))
            ? { ...cancelledResult, tabId }
            : { success: false, error: "쿠팡 검색 수집 세션에 탭을 연결할 수 없습니다", tabId, runId };
        }
      } catch (error) {
        await removeCreatedTab(tabId);
        return {
          success: false,
          error: errorMessage(error, "쿠팡 검색 수집 세션에 탭을 연결할 수 없습니다"),
          tabId,
          runId,
        };
      }

      const loaded = await waitForTabComplete(tabId, {
        expectedUrl: url,
        timeoutMs: PAGE_TIMEOUT_MS,
      }).catch((error) => ({
        error: errorMessage(error, "쿠팡 검색 화면 로딩 실패"),
      }));
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        return tabCancelledResult;
      }
      if (loaded?.error || loaded === false) {
        return {
          success: false,
          error: loaded?.error || "쿠팡 검색 화면 로딩 실패",
          tabId,
          runId,
        };
      }
      if (!isSearchUrl(loaded?.url || "")) {
        return attention(
          runId,
          tabId,
          "marketplace_login",
          "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
      }

      await delay(SEARCH_DELAY_MS);
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        return tabCancelledResult;
      }

      let response;
      try {
        response = await execute(tabId, keyword, maxResults);
      } catch (error) {
        if (await cancellationRequested(runId, environmentId, message.cancellation)) {
          return tabCancelledResult;
        }
        return {
          success: false,
          error: errorMessage(error, "쿠팡 키워드 추출 실패"),
          tabId,
          runId,
        };
      }
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        return tabCancelledResult;
      }
      if (!response?.success) {
        const attentionResult = await attention(
          runId,
          tabId,
          response?.status === 429 || response?.reason === "rate_limited"
            ? "rate_limited"
            : "marketplace_login",
          response?.error || "쿠팡 인기 키워드 수집을 계속하려면 확인이 필요합니다.",
        );
        return response?.warnings?.length
          ? { ...(attentionResult || {}), warnings: response.warnings }
          : attentionResult;
      }

      const result = {
        success: true,
        opened: true,
        tabId,
        keyword,
        source: response.source || "coupang-search-page",
        items: Array.isArray(response.items) ? response.items : [],
        productNameTokens: Array.isArray(response.productNameTokens)
          ? response.productNameTokens
          : [],
        total: Array.isArray(response.items) ? response.items.length : 0,
        warnings: response.warnings || [],
        startedAt: Date.now(),
        endedAt: Date.now(),
      };
      if (await cancellationRequested(runId, environmentId, message.cancellation)) {
        return tabCancelledResult;
      }
      return { ...result, runId };
    }

    return Object.freeze({ collect });
  }

  root.KidItemCoupangKeywordSuggestionCollector = Object.freeze({ create });
})(globalThis);
