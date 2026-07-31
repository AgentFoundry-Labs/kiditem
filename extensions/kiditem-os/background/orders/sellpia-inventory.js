(function installSellpiaInventoryCollector(root) {
  "use strict";

  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const SOURCE_ACCOUNT_KEY = "kiditem";
  const INVENTORY_PAGE_URL = "https://kiditem.sellpia.com/product_list_total.html";
  const INVENTORY_PAGE_MATCHES = [`${INVENTORY_PAGE_URL}*`];
  const DEFAULT_TIMEOUT_MS = 45_000;
  const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
  const DEFAULT_MAX_ROWS = 20_000;

  const ERRORS = Object.freeze({
    login: Object.freeze({
      success: false,
      errorCode: "sellpia_login_required",
      pendingLogin: true,
      error: "Sellpia login is required.",
    }),
    contract: Object.freeze({
      success: false,
      errorCode: "sellpia_download_contract_drift",
      error: "Sellpia inventory snapshot contract changed.",
    }),
    invalid: Object.freeze({
      success: false,
      errorCode: "sellpia_invalid_workbook",
      error: "Sellpia returned an invalid inventory snapshot.",
    }),
    timeout: Object.freeze({
      success: false,
      errorCode: "sellpia_background_timeout",
      error: "Sellpia background collection timed out.",
    }),
    network: Object.freeze({
      success: false,
      errorCode: "sellpia_network_failed",
      error: "Sellpia inventory collection failed.",
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

  function withTimeout(operation, timeoutMs) {
    let timer;
    return Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("SELLPIA_BACKGROUND_TIMEOUT")), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  async function waitForTabReady(chromeApi, tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab?.status === "complete") return;
      await delay(100);
    }
    throw new Error("SELLPIA_BACKGROUND_TIMEOUT");
  }

  async function requestSellpiaInventorySnapshot(maxBytes, timeoutMs, maxRows) {
    const failure = (errorCode) => ({ success: false, errorCode });
    const postgresIntegerMax = 2_147_483_647;
    const expectedOrigin = "https://kiditem.sellpia.com";
    const expectedPagePath = "/product_list_total.html";
    const expectedSnapshotPath = "/product_search.ajax.html";

    function textValue(value, { allowEmpty = false } = {}) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).trim();
      if (normalized) return normalized;
      return allowEmpty ? "" : null;
    }

    function optionalText(value) {
      return textValue(value);
    }

    function integerValue(value, { optional = false } = {}) {
      const normalized = textValue(value, { allowEmpty: true });
      if (normalized === null || normalized === "") return optional ? null : undefined;
      const digits = normalized.replace(/,/g, "");
      if (!/^\d+$/.test(digits)) return undefined;
      const parsed = Number(digits);
      if (!Number.isSafeInteger(parsed) || parsed > postgresIntegerMax) return undefined;
      return parsed;
    }

    function normalizeRow(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const productCode = textValue(value.product_code);
      const optionCode = value.option_code == null
        ? ""
        : textValue(value.option_code, { allowEmpty: true });
      const name = value.p_title == null
        ? ""
        : textValue(value.p_title, { allowEmpty: true });
      const currentStock = integerValue(value.stock_cnt);
      const purchasePrice = integerValue(value.buy_price, { optional: true });
      const salePrice = integerValue(value.sale_price, { optional: true });
      if (
        productCode === null
        || optionCode === null
        || name === null
        || currentStock === undefined
        || purchasePrice === undefined
        || salePrice === undefined
      ) return null;
      const optionName = optionalText(value.option_title);
      const barcode = optionalText(value.barcode);
      if (
        productCode.length > 100
        || optionCode.length > 100
        || name.length > 500
        || (optionName?.length ?? 0) > 500
        || (barcode?.length ?? 0) > 100
      ) return null;
      return {
        productCode,
        optionCode,
        name,
        optionName,
        barcode,
        currentStock,
        purchasePrice,
        salePrice,
      };
    }

    function looksLikeLogin(bytes) {
      const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(1024, bytes.length)));
      return /^\s*(?:<!doctype\s+html|<html|<form)/i.test(prefix)
        || /<input[^>]+type=["']?password/i.test(prefix);
    }

    async function readBoundedBytes(response, maximumBytes, declaredSize) {
      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) throw new Error("INVALID_RESPONSE_CHUNK");
          total += value.byteLength;
          if (total > maximumBytes) {
            try {
              await reader.cancel();
            } catch {
              /* the bounded response is already rejected */
            }
            return null;
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      }
      if (declaredSize === null) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.byteLength <= maximumBytes ? bytes : null;
    }

    if (
      location.origin !== expectedOrigin
      || location.pathname !== expectedPagePath
      || /login/i.test(location.pathname)
      || document.querySelector('input[type="password"]')
    ) return failure("sellpia_login_required");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = new URLSearchParams({
          mode: "soldout_manager",
          search_type: "1",
          search_key: "",
          search_key2: "",
          search_key3: "",
          search_key4: "",
          soldout_include: "Y",
          discontinued_include: "N",
          prd_type_req: "",
          prd_cate_req: "",
          market_type_req: "",
          limit: "0",
        });
        const response = await fetch(expectedSnapshotPath, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        let responseUrl;
        try {
          responseUrl = new URL(response.url, location.origin);
        } catch {
          return failure("sellpia_download_contract_drift");
        }
        if (
          response.status === 401
          || response.status === 403
          || response.redirected
          || responseUrl.origin !== expectedOrigin
          || responseUrl.pathname !== expectedSnapshotPath
        ) return failure("sellpia_login_required");
        if (!response.ok) {
          if (attempt === 0) continue;
          return failure("sellpia_network_failed");
        }

        const contentLength = response.headers.get("content-length");
        const declaredSize = contentLength === null ? null : Number(contentLength);
        if (
          declaredSize !== null
          && (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > maxBytes)
        ) return failure("sellpia_invalid_workbook");

        const bytes = await readBoundedBytes(response, maxBytes, declaredSize);
        if (!bytes || bytes.byteLength < 1) return failure("sellpia_invalid_workbook");
        if (declaredSize !== null && declaredSize !== bytes.byteLength) {
          return failure("sellpia_invalid_workbook");
        }
        if (looksLikeLogin(bytes)) return failure("sellpia_login_required");

        let rawRows;
        try {
          rawRows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          return failure("sellpia_download_contract_drift");
        }
        if (!Array.isArray(rawRows) || rawRows.length < 1 || rawRows.length > maxRows) {
          return failure("sellpia_invalid_workbook");
        }

        const rows = [];
        const identities = new Set();
        for (const rawRow of rawRows) {
          const row = normalizeRow(rawRow);
          if (!row) return failure("sellpia_invalid_workbook");
          const identity = `${row.productCode}-${row.optionCode}`;
          if (identities.has(identity)) return failure("sellpia_invalid_workbook");
          identities.add(identity);
          rows.push(row);
        }
        rows.sort((left, right) => {
          const leftIdentity = `${left.productCode}-${left.optionCode}`;
          const rightIdentity = `${right.productCode}-${right.optionCode}`;
          return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
        });
        return {
          success: true,
          snapshot: {
            source: "sellpia_product_search",
            version: 1,
            rowCount: rows.length,
            rows,
          },
        };
      } catch (error) {
        if (error?.name === "AbortError") return failure("sellpia_background_timeout");
        if (attempt === 1) return failure("sellpia_network_failed");
      } finally {
        clearTimeout(timer);
      }
    }
    return failure("sellpia_network_failed");
  }

  function publicFailure(errorCode) {
    if (errorCode === "sellpia_login_required") return { ...ERRORS.login };
    if (errorCode === "sellpia_download_contract_drift") return { ...ERRORS.contract };
    if (errorCode === "sellpia_invalid_workbook") return { ...ERRORS.invalid };
    if (errorCode === "sellpia_background_timeout") return { ...ERRORS.timeout };
    return { ...ERRORS.network };
  }

  function create(options) {
    const chromeApi = options.chrome;
    const timeoutMs = safeLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const maxBytes = safeLimit(options.maxBytes, DEFAULT_MAX_BYTES, DEFAULT_MAX_BYTES);
    const maxRows = safeLimit(options.maxRows, DEFAULT_MAX_ROWS, DEFAULT_MAX_ROWS);

    async function findOrCreateTab() {
      const tabs = await chromeApi.tabs.query({ url: INVENTORY_PAGE_MATCHES });
      const existing = tabs.find((tab) => Number.isInteger(tab?.id) && tab.active === false);
      if (existing) return { tab: existing, created: false };
      const tab = await chromeApi.tabs.create({ url: INVENTORY_PAGE_URL, active: false });
      return { tab, created: true };
    }

    async function collect(collection) {
      let tab = null;
      let created = false;
      let attached = false;
      let keepOpen = false;
      try {
        const located = await findOrCreateTab();
        tab = located.tab;
        created = located.created;
        if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
          return publicFailure("sellpia_network_failed");
        }
        if (created) {
          await collection.attachTab(tab, { owned: true });
          attached = true;
        }
        await waitForTabReady(chromeApi, tab.id, timeoutMs);
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            func: requestSellpiaInventorySnapshot,
            args: [maxBytes, timeoutMs, maxRows],
          }),
          timeoutMs + 1_000,
        );
        const result = injected?.[0]?.result;
        if (!result || result.success !== true) {
          const failure = publicFailure(result?.errorCode);
          if (failure.errorCode === "sellpia_login_required") {
            if (!attached) await collection.attachTab(tab, { owned: false });
            keepOpen = true;
          }
          return failure;
        }
        return {
          success: true,
          snapshot: result.snapshot,
          sourceOrigin: SOURCE_ORIGIN,
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
        };
      } catch (error) {
        return error?.message === "SELLPIA_BACKGROUND_TIMEOUT"
          ? publicFailure("sellpia_background_timeout")
          : publicFailure("sellpia_network_failed");
      } finally {
        if (created && Number.isInteger(tab?.id) && !keepOpen) {
          try {
            await collection.detachTab(tab, { owned: true });
          } catch {
            return publicFailure("sellpia_network_failed");
          }
        }
      }
    }

    return Object.freeze({ collect });
  }

  root.KidItemSellpiaInventory = Object.freeze({ create });
})(globalThis);
