(function installSellpiaInventoryCollector(root) {
  "use strict";

  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const SOURCE_ACCOUNT_KEY = "kiditem";
  const INVENTORY_PAGE_URL = "https://kiditem.sellpia.com/product_list_total.html";
  const INVENTORY_PAGE_MATCHES = [`${INVENTORY_PAGE_URL}*`];
  const DEFAULT_TIMEOUT_MS = 45_000;
  const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

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
      error: "Sellpia workbook download contract changed.",
    }),
    invalid: Object.freeze({
      success: false,
      errorCode: "sellpia_invalid_workbook",
      error: "Sellpia returned an invalid workbook.",
    }),
    timeout: Object.freeze({
      success: false,
      errorCode: "sellpia_background_timeout",
      error: "Sellpia background download timed out.",
    }),
    network: Object.freeze({
      success: false,
      errorCode: "sellpia_network_failed",
      error: "Sellpia workbook download failed.",
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

  async function requestSellpiaInventoryWorkbook(maxBytes, timeoutMs) {
    const failure = (errorCode) => ({ success: false, errorCode });
    const expectedOrigin = "https://kiditem.sellpia.com";
    const expectedPagePath = "/product_list_total.html";
    const expectedDownloadPath = "/product_search.down.html";

    function hasDownloadContract() {
      if (location.origin !== expectedOrigin || location.pathname !== expectedPagePath) {
        return false;
      }
      if (document.querySelector('input[type="password"]')) return false;
      const modal = document.querySelector("#div_prod_down");
      const form = modal?.querySelector("#downForm");
      const optionSelector = form?.querySelector('#downopt[name="downopt"]');
      const optionProduct = optionSelector?.querySelector('option[value="2"]');
      const excelFormat = form?.querySelector('[name="downtype"][value="excel"]');
      const downloadAction = form?.querySelector("#down_act");
      if (!form || !optionProduct || !excelFormat || !downloadAction) return false;
      const method = (form.getAttribute("method") || "").trim().toLowerCase();
      let action;
      try {
        action = new URL(form.getAttribute("action") || "", location.origin);
      } catch {
        return false;
      }
      return method === "post"
        && action.origin === expectedOrigin
        && action.pathname === expectedDownloadPath;
    }

    function parseFileName(disposition) {
      if (typeof disposition !== "string" || !/\battachment\b/i.test(disposition)) {
        return null;
      }
      const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
      const quoted = disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1];
      const plain = disposition.match(/filename\s*=\s*([^;\s]+)/i)?.[1];
      let candidate = encoded || quoted || plain || "";
      if (encoded) {
        try {
          candidate = decodeURIComponent(encoded);
        } catch {
          return null;
        }
      }
      candidate = candidate
        .split(/[\\/]/)
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 180);
      return /\.xlsx?$/i.test(candidate) ? candidate : null;
    }

    function startsWith(bytes, magic) {
      return magic.every((value, index) => bytes[index] === value);
    }

    function supportedBiffBof(view, offset, size) {
      if (size !== 8 && size !== 16) return false;
      const version = view.getUint16(offset, true);
      const subtype = view.getUint16(offset + 2, true);
      return subtype === 0x0010
        && (
          (size === 8 && (version === 0x0000 || version === 0x0500))
          || (size === 16 && version === 0x0600)
        );
    }

    function isBoundedBiffWorksheetStream(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 0;
      let recordCount = 0;
      let hasLabelRecord = false;
      while (offset < bytes.byteLength) {
        if (offset + 4 > bytes.byteLength) return false;
        const type = view.getUint16(offset, true);
        const size = view.getUint16(offset + 2, true);
        const end = offset + 4 + size;
        recordCount += 1;
        if (
          size > 8_224
          || end > bytes.byteLength
          || recordCount > 1_000_000
        ) return false;
        if (recordCount === 1) {
          if (type !== 0x0809 || !supportedBiffBof(view, offset + 4, size)) {
            return false;
          }
        } else if (type === 0x0809) {
          return false;
        }
        if (type === 0x000a) {
          return size === 0 && hasLabelRecord && end === bytes.byteLength;
        }
        if (type === 0x0204 && size > 0) hasLabelRecord = true;
        offset = end;
      }
      return false;
    }

    function workbookEnvelope(bytes) {
      if (
        bytes.byteLength >= 8
        && startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      ) return "xls";
      if (
        bytes.byteLength >= 4
        && (
          startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
          || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
          || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
        )
      ) return "xlsx";
      if (isBoundedBiffWorksheetStream(bytes)) return "xls";
      return null;
    }

    function looksLikeHtml(bytes, contentType) {
      if (/text\/html|application\/xhtml\+xml/i.test(contentType || "")) return true;
      const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(512, bytes.length)));
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
              /* response is already rejected by the byte bound */
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

    function toBase64(bytes) {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    }

    if (
      location.origin !== expectedOrigin
      || /login/i.test(location.pathname)
      || document.querySelector('input[type="password"]')
    ) return failure("sellpia_login_required");
    if (!hasDownloadContract()) return failure("sellpia_download_contract_drift");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = new URLSearchParams({
          downopt: "2",
          downtype: "excel",
        });
        const response = await fetch("/product_search.down.html", {
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
          || responseUrl.pathname !== expectedDownloadPath
        ) return failure("sellpia_login_required");
        if (!response.ok) {
          if (attempt === 0) continue;
          return failure("sellpia_network_failed");
        }

        const contentType = response.headers.get("content-type") || "";
        if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          return failure("sellpia_login_required");
        }
        const fileName = parseFileName(response.headers.get("content-disposition"));
        if (!fileName) return failure("sellpia_download_contract_drift");
        const contentLength = response.headers.get("content-length");
        const declaredSize = contentLength === null ? null : Number(contentLength);
        if (
          declaredSize !== null
          && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > maxBytes)
        ) {
          return failure("sellpia_invalid_workbook");
        }

        const bytes = await readBoundedBytes(response, maxBytes, declaredSize);
        if (!bytes || bytes.byteLength < 1) {
          return failure("sellpia_invalid_workbook");
        }
        if (
          declaredSize !== null
          && declaredSize !== bytes.byteLength
        ) return failure("sellpia_invalid_workbook");
        if (looksLikeHtml(bytes, contentType)) return failure("sellpia_login_required");
        const envelope = workbookEnvelope(bytes);
        if (!envelope) return failure("sellpia_invalid_workbook");
        if (
          (envelope === "xls" && !/\.xls$/i.test(fileName))
          || (envelope === "xlsx" && !/\.xlsx$/i.test(fileName))
        ) return failure("sellpia_invalid_workbook");

        return {
          success: true,
          workbookBase64: toBase64(bytes),
          fileName,
          mimeType: envelope === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.ms-excel",
          size: bytes.byteLength,
        };
      } catch (error) {
        if (error?.name === "AbortError") {
          return failure("sellpia_background_timeout");
        }
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

    async function findOrCreateTab() {
      const tabs = await chromeApi.tabs.query({ url: INVENTORY_PAGE_MATCHES });
      const existing = tabs.find((tab) =>
        Number.isInteger(tab?.id) && tab.active === false);
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
            func: requestSellpiaInventoryWorkbook,
            args: [maxBytes, timeoutMs],
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
          workbookBase64: result.workbookBase64,
          fileName: result.fileName,
          mimeType: result.mimeType,
          size: result.size,
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
