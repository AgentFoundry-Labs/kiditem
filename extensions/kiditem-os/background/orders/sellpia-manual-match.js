(function installSellpiaManualMatchCollector(root) {
  "use strict";

  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const PAGE_URL = `${SOURCE_ORIGIN}/product_manual_match.html`;
  const PAGE_MATCHES = [`${PAGE_URL}*`];
  const DEFAULT_TAB_READY_TIMEOUT_MS = 45_000;
  const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
  const DEFAULT_MAX_TARGETS = 20_000;
  const DEFAULT_MAX_ROWS = 100_000;

  const ERRORS = Object.freeze({
    login: Object.freeze({
      success: false,
      errorCode: "sellpia_manual_match_login_required",
      pendingLogin: true,
      error: "Sellpia login is required.",
    }),
    contract: Object.freeze({
      success: false,
      errorCode: "sellpia_manual_match_contract_drift",
      error: "Sellpia manual-match contract changed.",
    }),
    invalid: Object.freeze({
      success: false,
      errorCode: "sellpia_manual_match_invalid_snapshot",
      error: "Sellpia returned an invalid manual-match snapshot.",
    }),
    timeout: Object.freeze({
      success: false,
      errorCode: "sellpia_manual_match_timeout",
      error: "Sellpia manual-match collection timed out.",
    }),
    network: Object.freeze({
      success: false,
      errorCode: "sellpia_manual_match_network_failed",
      error: "Sellpia manual-match collection failed.",
    }),
  });

  function safeLimit(value, fallback, maximum) {
    return Number.isInteger(value) && value > 0 && value <= maximum
      ? value
      : fallback;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForTabReady(chromeApi, tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab?.status === "complete") return;
      await delay(100);
    }
    throw new Error("SELLPIA_MANUAL_MATCH_TIMEOUT");
  }

  async function requestSellpiaManualMatchSnapshot(
    targetCodes,
    maxTargets,
    maxRows,
    requestTimeoutMs,
  ) {
    const EXPECTED_ORIGIN = "https://kiditem.sellpia.com";
    const PAGE_PATH = "/product_manual_match.html";
    const CODE_PATTERN = /^\d+(?:-\d+)*$/;
    const POSTGRES_INTEGER_MAX = 2_147_483_647;
    const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;
    const SEARCH_CONCURRENCY = 4;
    const STATUS_CONCURRENCY = 4;
    const STATUS_BATCH_SIZE = 100;

    const failure = (errorCode, stage) => ({
      success: false,
      errorCode,
      ...(stage ? { stage } : {}),
    });

    function contractDrift(stage) {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    }

    function cleanText(value, maximum) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }

    function positiveInteger(value) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).replace(/,/g, "").trim();
      if (!/^\d+$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= POSTGRES_INTEGER_MAX
        ? parsed
        : null;
    }

    function sellpiaCode(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const productCode = cleanText(value.product_code, 100);
      const optionCode = value.option_code === "" || value.option_code == null
        ? null
        : cleanText(value.option_code, 100);
      if (!productCode || !/^\d+$/.test(productCode)) return null;
      if (optionCode !== null && !/^\d+$/.test(optionCode)) return null;
      return optionCode === null ? productCode : `${productCode}-${optionCode}`;
    }

    function loginDocument() {
      return /login/i.test(location.pathname)
        || Boolean(document.querySelector('input[type="password"]'));
    }

    async function requestJson(pathname, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(pathname, {
          method: "POST",
          body,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const responseUrl = new URL(response.url, location.origin);
        if (
          response.status === 401
          || response.status === 403
          || response.redirected
          || responseUrl.origin !== location.origin
          || /login/i.test(responseUrl.pathname)
        ) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const declaredLength = response.headers.get("content-length");
        if (
          declaredLength !== null
          && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_CHARS)
        ) throw new Error("INVALID_RESPONSE");
        const text = await response.text();
        if (text.length < 1 || text.length > MAX_RESPONSE_CHARS) {
          throw new Error("INVALID_RESPONSE");
        }
        if (/^\s*(?:<!doctype\s+html|<html|<form)/i.test(text)) {
          throw new Error("LOGIN_REQUIRED");
        }
        try {
          return JSON.parse(text);
        } catch {
          contractDrift("response-json");
        }
      } finally {
        clearTimeout(timer);
      }
    }

    async function mapConcurrent(values, concurrency, worker) {
      const results = new Array(values.length);
      let cursor = 0;
      const runners = Array.from(
        { length: Math.min(concurrency, Math.max(1, values.length)) },
        async () => {
          while (cursor < values.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(values[index], index);
          }
        },
      );
      await Promise.all(runners);
      return results;
    }

    if (
      location.origin !== EXPECTED_ORIGIN
      || location.pathname !== PAGE_PATH
      || loginDocument()
    ) return failure("sellpia_manual_match_login_required");
    if (
      !Array.isArray(targetCodes)
      || targetCodes.length > maxTargets
      || targetCodes.some((code) => typeof code !== "string" || !CODE_PATTERN.test(code))
      || targetCodes.some((code, index) => index > 0 && code <= targetCodes[index - 1])
    ) return failure("sellpia_manual_match_invalid_snapshot");

    const shopUid = cleanText(document.querySelector("#makeshop_uid")?.value, 100);
    if (!shopUid) return failure("sellpia_manual_match_contract_drift", "shop-uid");

    try {
      const searched = await mapConcurrent(targetCodes, SEARCH_CONCURRENCY, async (targetCode) => {
        const response = await requestJson(PAGE_PATH, new URLSearchParams({
          modekey: "get_product_search_matched",
          search_value: targetCode,
          search_type: "product_code",
        }));
        if (response === null || response === false) return [];
        if (!Array.isArray(response) || response.length > maxRows) {
          contractDrift(`search-response:${targetCode}`);
        }
        return response.flatMap((entry) => {
          const code = sellpiaCode(entry);
          const aliasTitle = cleanText(entry?.match_title, 500);
          const matchMd5 = cleanText(entry?.match_md5, 128);
          if (
            code !== targetCode
            || !matchMd5
            || !/^[a-f0-9]{16,128}$/i.test(matchMd5)
          ) contractDrift(`search-row:${targetCode}`);
          if (!aliasTitle) return [];
          const itemCount = positiveInteger(entry?.item_count);
          if (itemCount === null) contractDrift(`search-quantity:${targetCode}`);
          return [{ productCode: code, aliasTitle, matchMd5, itemCount }];
        });
      });
      const candidates = searched.flat();
      if (candidates.length > maxRows) return failure("sellpia_manual_match_invalid_snapshot");

      const candidatesByMd5 = new Map();
      for (const candidate of candidates) {
        const values = candidatesByMd5.get(candidate.matchMd5) || [];
        const existing = values.find((value) =>
          value.productCode === candidate.productCode
          && value.aliasTitle === candidate.aliasTitle);
        if (existing && existing.itemCount !== candidate.itemCount) {
          contractDrift(`search-quantity-conflict:${candidate.productCode}`);
        }
        if (!existing) {
          values.push(candidate);
        }
        candidatesByMd5.set(candidate.matchMd5, values);
      }
      const matchMd5Values = [...candidatesByMd5.keys()].sort();

      const statusBatches = [];
      for (let offset = 0; offset < matchMd5Values.length; offset += STATUS_BATCH_SIZE) {
        statusBatches.push({
          offset,
          values: matchMd5Values.slice(offset, offset + STATUS_BATCH_SIZE),
        });
      }
      const statusEntries = await mapConcurrent(
        statusBatches,
        STATUS_CONCURRENCY,
        async ({ offset, values: batch }) => {
          const body = new URLSearchParams({ modekey: "get_match_data", shop_uid: shopUid });
          batch.forEach((matchMd5) => body.append("data[]", matchMd5));
          const response = await requestJson(PAGE_PATH, body);
          if (!response || typeof response !== "object" || Array.isArray(response)) {
            contractDrift(`status-response:${offset}`);
          }
          return batch.map((matchMd5) => {
            const matchedType = cleanText(response[matchMd5]?.matched_type, 1);
            if (matchedType !== "M" && matchedType !== "P" && matchedType !== "E") {
              contractDrift(`status-row:${matchMd5.slice(0, 12)}`);
            }
            return [matchMd5, matchedType];
          });
        },
      );
      const matchedTypeByMd5 = new Map(statusEntries.flat());

      const aggregated = new Map();
      for (const candidate of candidates) {
        const matchedType = matchedTypeByMd5.get(candidate.matchMd5);
        if (matchedType === undefined) {
          contractDrift(`status-target:${candidate.matchMd5.slice(0, 12)}`);
        }
        const row = { ...candidate, matchedType };
        const key = [row.productCode, row.aliasTitle, row.itemCount, row.matchedType].join("\u0000");
        const previous = aggregated.get(key);
        aggregated.set(key, previous ? {
          ...previous,
          evidenceCount: previous.evidenceCount + 1,
        } : {
          productCode: row.productCode,
          aliasTitle: row.aliasTitle,
          itemCount: row.itemCount,
          matchedType: row.matchedType,
          evidenceCount: 1,
        });
      }
      const rows = [...aggregated.values()].sort((left, right) => {
        const leftIdentity = [
          left.productCode,
          left.aliasTitle,
          String(left.itemCount).padStart(10, "0"),
          left.matchedType,
        ].join("\u0000");
        const rightIdentity = [
          right.productCode,
          right.aliasTitle,
          String(right.itemCount).padStart(10, "0"),
          right.matchedType,
        ].join("\u0000");
        return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
      });
      if (rows.length > maxRows) return failure("sellpia_manual_match_invalid_snapshot");
      return {
        success: true,
        snapshot: {
          source: "sellpia_product_manual_match",
          version: 1,
          targetCount: targetCodes.length,
          targetCodes,
          rowCount: rows.length,
          rows,
        },
      };
    } catch (error) {
      if (error?.name === "AbortError" || error?.message === "SELLPIA_MANUAL_MATCH_TIMEOUT") {
        return failure("sellpia_manual_match_timeout");
      }
      if (error?.message === "LOGIN_REQUIRED") {
        return failure("sellpia_manual_match_login_required");
      }
      if (error?.message?.startsWith("CONTRACT_DRIFT:")) {
        return failure(
          "sellpia_manual_match_contract_drift",
          error.message.slice("CONTRACT_DRIFT:".length, 160),
        );
      }
      if (error?.message === "INVALID_RESPONSE") {
        return failure("sellpia_manual_match_invalid_snapshot");
      }
      return failure("sellpia_manual_match_network_failed");
    }
  }

  function publicFailure(errorCode, stage) {
    if (errorCode === "sellpia_manual_match_login_required") return { ...ERRORS.login };
    if (errorCode === "sellpia_manual_match_contract_drift") {
      return {
        ...ERRORS.contract,
        ...(stage ? { stage } : {}),
        ...(stage ? { error: `${ERRORS.contract.error} [${stage}]` } : {}),
      };
    }
    if (errorCode === "sellpia_manual_match_invalid_snapshot") return { ...ERRORS.invalid };
    if (errorCode === "sellpia_manual_match_timeout") return { ...ERRORS.timeout };
    return { ...ERRORS.network };
  }

  function create(options) {
    const chromeApi = options.chrome;
    const tabReadyTimeoutMs = safeLimit(
      options.tabReadyTimeoutMs,
      DEFAULT_TAB_READY_TIMEOUT_MS,
      DEFAULT_TAB_READY_TIMEOUT_MS,
    );
    const requestTimeoutMs = safeLimit(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const maxTargets = safeLimit(
      options.maxTargets,
      DEFAULT_MAX_TARGETS,
      DEFAULT_MAX_TARGETS,
    );
    const maxRows = safeLimit(options.maxRows, DEFAULT_MAX_ROWS, DEFAULT_MAX_ROWS);

    async function findOrCreateTab() {
      const tabs = await chromeApi.tabs.query({ url: PAGE_MATCHES });
      const existing = tabs.find((tab) => Number.isInteger(tab?.id) && tab.active === false);
      if (existing) return { tab: existing, created: false };
      const tab = await chromeApi.tabs.create({ url: PAGE_URL, active: false });
      return { tab, created: true };
    }

    async function collect(collection, targetCodes) {
      let tab = null;
      let created = false;
      let attached = false;
      let keepOpen = false;
      try {
        if (!Array.isArray(targetCodes)) return publicFailure("sellpia_manual_match_invalid_snapshot");
        const located = await findOrCreateTab();
        tab = located.tab;
        created = located.created;
        if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
          return publicFailure("sellpia_manual_match_network_failed");
        }
        if (created) {
          await collection.attachTab(tab, { owned: true });
          attached = true;
        }
        await collection.progress({
          current: 0,
          total: 2,
          completed: 0,
          failed: 0,
          label: "Sellpia 수동상품매칭 근거를 수집하고 있습니다.",
        });
        await waitForTabReady(chromeApi, tab.id, tabReadyTimeoutMs);
        const injected = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: requestSellpiaManualMatchSnapshot,
          args: [targetCodes, maxTargets, maxRows, requestTimeoutMs],
        });
        const result = injected?.[0]?.result;
        if (!result || result.success !== true) {
          const failure = publicFailure(result?.errorCode, result?.stage);
          if (failure.errorCode === "sellpia_manual_match_login_required") {
            if (!attached) await collection.attachTab(tab, { owned: false });
            keepOpen = true;
          }
          return failure;
        }
        return {
          success: true,
          snapshot: result.snapshot,
          sourceOrigin: SOURCE_ORIGIN,
        };
      } catch (error) {
        return error?.message === "SELLPIA_MANUAL_MATCH_TIMEOUT"
          ? publicFailure("sellpia_manual_match_timeout")
          : publicFailure("sellpia_manual_match_network_failed");
      } finally {
        if (created && Number.isInteger(tab?.id) && !keepOpen) {
          try {
            await collection.detachTab(tab, { owned: true });
          } catch {
            return publicFailure("sellpia_manual_match_network_failed");
          }
        }
      }
    }

    return Object.freeze({ collect });
  }

  root.KidItemSellpiaManualMatch = Object.freeze({ create });
})(globalThis);
