importScripts("environment-context.js");
importScripts("collection-session.js");
importScripts("interactive-tabs.js");
importScripts("1688-trend-collector.js");
importScripts("live-commerce-collector.js");
importScripts("tiktok-cc-collector.js");

const EXTRACT_TIMEOUT_MS = 20000;
const LEGACY_AUTH_TOKEN_KEYS = [
  "kiditem_auth_token",
  "apiBase",
  "kiditem_sourcing_ingest_token",
  "kiditem_sourcing_ingest_token_expires_at",
  "kiditem_sourcing_ingest_token_max_expires_at",
];
const TREND_KEEPALIVE_PORT = "kiditem-1688-trend-keepalive";
const environmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: LEGACY_AUTH_TOKEN_KEYS,
});

const pendingCollects = new Map();

async function backendRequestConfig(environmentId) {
  let environment;
  try {
    environment = environmentContext.requireEnvironment(environmentId);
  } catch {
    return { ok: false, error: "지원하지 않는 KidItem 환경입니다." };
  }
  const token = await environmentContext.getAccessToken(environmentId);
  if (!token) {
    return {
      ok: false,
      error: "선택한 KidItem 환경에서 로그인 후 다시 시도해주세요.",
    };
  }
  const base = `${environment.apiOrigin}/api/sourcing/extension`;
  return {
    ok: true,
    base,
    headers: { "Content-Type": "application/json" },
    request(url, init = {}) {
      const parsed = new URL(url);
      if (parsed.origin !== environment.apiOrigin) {
        throw new Error("KidItem API 환경이 일치하지 않습니다.");
      }
      return environmentContext.authedFetch(
        environmentId,
        `${parsed.pathname}${parsed.search}`,
        init,
      );
    },
  };
}

const collectionSessions = KidItemCollectionSession.create({
  chrome,
  storageKey: "kiditem_collection_sessions",
  environmentContext,
});

const trendCollector = ProductScraper1688Trend.create({
  chrome,
  getBackendRequestConfig: backendRequestConfig,
  ensureContentScripts: injectContentScripts,
  sessions: collectionSessions,
});

const liveCommerceCollector = ProductScraperLiveCommerce.create({
  chrome,
  getBackendRequestConfig: backendRequestConfig,
  ensureContentScripts: injectLiveCommerceContentScripts,
  sessions: collectionSessions,
});

const tiktokCcCollector = ProductScraperTiktokCcTrend.create({
  chrome,
  getBackendRequestConfig: backendRequestConfig,
  ensureContentScripts: injectTiktokCcContentScripts,
  sessions: collectionSessions,
});

async function cancelCollectionSession(runId, environmentId) {
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (!session) return null;
  if (session.producer === "sourcing.1688_trend") {
    await trendCollector.cancel(runId);
  } else if (session.producer === "sourcing.live_commerce") {
    await liveCommerceCollector.cancel(runId);
  } else if (session.producer === "sourcing.tiktok_cc_trend") {
    await tiktokCcCollector.cancel(runId);
  } else {
    throw new Error("Unsupported collection producer");
  }
  return collectionSessions.get(runId);
}

async function restartCollectionSession(runId, environmentId) {
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (!session) throw new Error("Collection session not found");
  if (session.producer === "sourcing.1688_trend") {
    await trendCollector.restart(runId);
    return collectionSessions.get(runId);
  }
  if (session.producer === "sourcing.tiktok_cc_trend") {
    await tiktokCcCollector.restart(runId);
    return collectionSessions.get(runId);
  }
  if (session.producer === "sourcing.live_commerce") {
    await collectionSessions.requireAttention(runId, {
      reason: "manual_confirmation",
      message: "현재 방송 URL을 확인한 뒤 처음부터 다시 수집해주세요.",
    });
    return collectionSessions.get(runId);
  }
  throw new Error("Unsupported collection producer");
}

// MV3 service workers may be suspended during a multi-keyword 1688 run.
// The KidItem host content script sends a small heartbeat while the page is
// open so in-flight extraction promises and external response channels stay
// alive until the batch finishes.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TREND_KEEPALIVE_PORT) return;
  port.onMessage.addListener(() => {
    // Receiving the port message is the keepalive signal; no response needed.
  });
});

function validateTrendStartMessage(msg) {
  if (!Array.isArray(msg?.keywords) || msg.keywords.length < 1 || msg.keywords.length > 20) {
    return { ok: false, error: "keywords must contain 1 to 20 strings" };
  }
  const keywords = [];
  for (const raw of msg.keywords) {
    if (typeof raw !== "string") {
      return { ok: false, error: "each keyword must be a string" };
    }
    const keyword = raw.trim();
    if (!keyword || keyword.length > 100) {
      return { ok: false, error: "each keyword must contain 1 to 100 characters" };
    }
    keywords.push(keyword);
  }

  const requestedLimit = msg.maxResultsPerKeyword === undefined
    ? 20
    : msg.maxResultsPerKeyword;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
    return { ok: false, error: "maxResultsPerKeyword must be an integer from 1 to 20" };
  }
  return { ok: true, keywords, maxResultsPerKeyword: requestedLimit };
}

function validateOptionalRunId(value) {
  return value === undefined ||
    (typeof value === "string" && value.length > 0 && value.length <= 200);
}

function validateTiktokCcStartMessage(msg) {
  const options = {};
  if (msg.maxItems !== undefined) {
    if (!Number.isInteger(msg.maxItems) || msg.maxItems < 1 || msg.maxItems > 500) {
      return { ok: false, error: "maxItems must be an integer from 1 to 500" };
    }
    options.maxItems = msg.maxItems;
  }
  if (msg.region !== undefined) {
    if (typeof msg.region !== "string" || !/^[A-Za-z]{2,8}$/.test(msg.region)) {
      return { ok: false, error: "region must be 2 to 8 letters" };
    }
    options.region = msg.region;
  }
  return { ok: true, options };
}

chrome.runtime.onInstalled.addListener(() => {
  void environmentContext.migrateLegacyStorage();
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const environment = environmentContext.resolveSender(sender);
  if (!environment) {
    sendResponse({ success: false, error: "forbidden_origin" });
    return;
  }
  const environmentId = environment.environmentId;
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    sendResponse({ success: false, error: "invalid_message" });
    return;
  }

  const respond = (promise) => {
    Promise.resolve(promise)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Collection session request failed",
        }),
      );
    return true;
  };

  if (msg.action === "listCollectionSessions") {
    return respond(collectionSessions.list(environmentId));
  }
  if (msg.action === "getCollectionSession") {
    return respond(collectionSessions.getOwned(msg.runId, environmentId));
  }
  if (msg.action === "cancelCollectionSession") {
    return respond(cancelCollectionSession(msg.runId, environmentId));
  }
  if (msg.action === "openCollectionAttentionTab") {
    return respond(
      collectionSessions.getOwned(msg.runId, environmentId).then((session) => {
        if (!session) throw new Error("Collection session not found");
        return collectionSessions.openAttentionTab(msg.runId);
      }),
    );
  }
  if (msg.action === "restartCollectionSession") {
    return respond(restartCollectionSession(msg.runId, environmentId));
  }

  if (msg.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        sourcingProductScraper: true,
        sourcing1688TrendCollector: true,
        sourcingLiveCommerceCollector: true,
        sourcingTiktokCcCollector: true,
        browserCollectionSessions: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    return;
  }

  if (msg.action === "start1688TrendCollection") {
    const validated = validateTrendStartMessage(msg);
    if (!validated.ok) {
      sendResponse({ success: false, error: validated.error });
      return;
    }
    trendCollector
      .start(validated.keywords, validated.maxResultsPerKeyword, environmentId)
      .then(sendResponse);
    return true;
  }

  if (msg.action === "get1688TrendCollectionStatus") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    trendCollector.getStatus(msg.runId, environmentId).then(sendResponse);
    return true;
  }

  if (msg.action === "cancel1688TrendCollection") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    trendCollector.cancel(msg.runId, environmentId).then(sendResponse);
    return true;
  }

  if (msg.action === "startTiktokCcCollection") {
    const validated = validateTiktokCcStartMessage(msg);
    if (!validated.ok) {
      sendResponse({ success: false, error: validated.error });
      return;
    }
    tiktokCcCollector.start(validated.options, environmentId).then(sendResponse);
    return true;
  }

  if (msg.action === "getTiktokCcCollectionStatus") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    tiktokCcCollector.getStatus(msg.runId, environmentId).then(sendResponse);
    return true;
  }

  if (msg.action === "cancelTiktokCcCollection") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    tiktokCcCollector.cancel(msg.runId, environmentId).then(sendResponse);
    return true;
  }

  if (msg.action === "collectLiveCommerceUrl") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    return respond(liveCommerceCollector.collect(msg.url, msg.runId, environmentId));
  }

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    return respond(
      environmentContext
        .migrateLegacyStorage()
        .then(() => environmentContext.setAccessToken(environmentId, token))
        .then(() => ({ success: true })),
    );
  }

  if (msg.action === "clearAuthToken") {
    return respond(
      environmentContext
        .clearAccessToken(environmentId)
        .then(() => environmentContext.migrateLegacyStorage())
        .then(() => ({ success: true })),
    );
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getConnectedKidItemEnvironments") {
    environmentContext
      .connectedEnvironmentIds()
      .then((environmentIds) =>
        sendResponse({
          success: true,
          environments: environmentIds.map((environmentId) =>
            environmentContext.requireEnvironment(environmentId),
          ),
        }),
      )
      .catch((error) =>
        sendResponse({ success: false, error: error?.message || String(error) }),
      );
    return true;
  }

  if (msg.type === "COLLECT_CURRENT") {
    environmentContext
      .connectedEnvironmentIds()
      .then((environmentIds) => {
        if (!environmentIds.includes(msg.environmentId)) {
          return { ok: false, error: "선택한 KidItem 환경에서 로그인해주세요." };
        }
        return collectFromTab(msg.tabId, msg.environmentId);
      })
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || String(error) }),
      );
    return true;
  }

  if (msg.type === "PRODUCT_DATA") {
    const pending = pendingCollects.get(sender.tab?.id);
    if (!pending) {
      sendResponse({ ok: false, error: "수집 환경을 확인할 수 없습니다." });
      return;
    }
    handleProductData(msg.data, sender.tab.id, pending.environmentId);
    sendResponse({ ok: true });
  }

  if (msg.type === "DESCRIPTION_DATA") {
    const pending = pendingCollects.get(sender.tab?.id);
    if (!pending) {
      sendResponse({ ok: false, error: "수집 환경을 확인할 수 없습니다." });
      return;
    }
    sendDescriptionToBackend(msg.data, pending.environmentId);
    sendResponse({ ok: true });
  }

  if (msg.type === "EXTRACTION_COMPLETE") {
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ running: false });
  }

  return true;
});

function collectFromTab(tabId, environmentId) {
  return new Promise((resolve) => {
    const previous = pendingCollects.get(tabId);
    if (previous) {
      clearTimeout(previous.timer);
      previous.resolve({ ok: false, error: "cancelled" });
    }

    const timer = setTimeout(() => {
      if (pendingCollects.get(tabId)?.resolve === resolve) {
        pendingCollects.delete(tabId);
        resolve({ ok: false, error: "추출 시간 초과 (20초)" });
      }
    }, EXTRACT_TIMEOUT_MS);

    pendingCollects.set(tabId, { resolve, timer, tabId, environmentId });

    chrome.tabs.sendMessage(tabId, { type: "TRIGGER_EXTRACT" }, (resp) => {
      if (chrome.runtime.lastError) {
        injectContentScripts(tabId).then((ok) => {
          if (!ok) {
            clearTimeout(timer);
            pendingCollects.delete(tabId);
            resolve({ ok: false, error: "콘텐츠 스크립트 주입 실패. 페이지를 새로고침 해주세요." });
            return;
          }
          chrome.tabs.sendMessage(tabId, { type: "TRIGGER_EXTRACT" }, (resp2) => {
            if (chrome.runtime.lastError) {
              clearTimeout(timer);
              pendingCollects.delete(tabId);
              resolve({ ok: false, error: "페이지를 새로고침 후 다시 시도해주세요." });
            }
          });
        });
      }
    });
  });
}

async function injectContentScripts(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || "";

    // 1. Content scripts FIRST — registers message listener
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "extractors/common.js",
        "extractors/alibaba.js",
        "extractors/1688.js",
        "content.js",
      ],
    });

    // 2. Wait for content scripts to initialize
    await new Promise((r) => setTimeout(r, 300));

    // 3. Bridge script SECOND — posts message that content.js is now listening for
    let bridgeFile = null;
    if (url.includes("1688.com")) bridgeFile = "extractors/1688-bridge.js";
    else if (url.includes("alibaba.com")) bridgeFile = "extractors/page-bridge.js";

    if (bridgeFile) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [bridgeFile],
        world: "MAIN",
      });
    }

    await new Promise((r) => setTimeout(r, 500));
    return true;
  } catch (e) {
    console.log("[bg] script injection failed:", e.message);
    return false;
  }
}

async function injectLiveCommerceContentScripts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["live-commerce-extractor.js", "live-commerce-content.js"],
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    console.log("[bg] live commerce script injection failed:", error.message);
    return false;
  }
}

async function injectTiktokCcContentScripts(tabId) {
  try {
    // Content scripts FIRST (ISOLATED) so the capture listener is ready, then the
    // MAIN-world hook. Programmatic hook injection is best-effort — it cannot
    // retroactively capture API calls fired before it wrapped fetch/XHR, so the
    // manifest document_start declaration is the primary capture path.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tiktok-cc-extractor.js", "tiktok-cc-content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tiktok-cc-hook.js"],
      world: "MAIN",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    console.log("[bg] tiktok cc script injection failed:", error.message);
    return false;
  }
}

async function handleProductData(data, tabId, environmentId) {
  if (data._detail_url && data.source_platform === "1688") {
    const desc = await fetchDescriptionContent(data._detail_url, data.source_url);
    if (desc) {
      data.description_images = desc.description_images;
      data.description_text = desc.description_text;
      data.description_image_count = desc.description_image_count;
    }
  }

  chrome.storage.local.set({
    lastExtraction: data,
    lastExtractionEnvironmentId: environmentId,
  });
  const result = await sendToBackend(data, environmentId);

  const pending = pendingCollects.get(tabId);
  if (pending && pending.environmentId === environmentId) {
    clearTimeout(pending.timer);
    const cb = pending.resolve;
    pendingCollects.delete(tabId);

    if (result.ok) {
      cb({ ok: true });
    } else {
      cb({ ok: false, error: result.error || "백엔드 전송 실패" });
    }
  }
}

async function sendToBackend(productData, environmentId) {
  let url = "";
  try {
    const config = await backendRequestConfig(environmentId);
    if (!config.ok) return config;
    url = `${config.base}/product-data`;
    const resp = await config.request(url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(productData),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[bg] ${resp.status} ${url}: ${body.slice(0, 500)}`);
      return { ok: false, error: `HTTP ${resp.status}: ${body.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[bg] fetch error:", e.message, url);
    return { ok: false, error: `${e.message} (${url})` };
  }
}

async function sendDescriptionToBackend(data, environmentId) {
  const stored = await chrome.storage.local.get("lastExtraction");
  if (stored.lastExtraction && stored.lastExtraction.source_url === data.source_url) {
    stored.lastExtraction.description_images = data.description_images;
    stored.lastExtraction.description_text = data.description_text;
    stored.lastExtraction.description_image_count = data.description_image_count;
    chrome.storage.local.set({ lastExtraction: stored.lastExtraction });
  }

  try {
    const config = await backendRequestConfig(environmentId);
    if (!config.ok) return;
    await config.request(`${config.base}/product-data`, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({ ...data, page_type: "description" }),
    });
  } catch (e) {
    console.log("[bg] description send failed:", e.message);
  }
}

async function fetchDescriptionContent(detailUrl, sourceUrl) {
  try {
    const resp = await fetch(detailUrl);
    if (!resp.ok) return null;
    const html = await resp.text();

    let content = html;
    const marker = "var offer_details=";
    const markerIdx = html.indexOf(marker);
    if (markerIdx !== -1) {
      const jsonStart = markerIdx + marker.length;
      let depth = 0, inStr = false, esc = false, endPos = -1;
      for (let ci = jsonStart; ci < html.length; ci++) {
        const c = html.charAt(ci);
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        if (c === "}") { depth--; if (depth === 0) { endPos = ci + 1; break; } }
      }
      if (endPos > jsonStart) {
        try {
          const parsed = JSON.parse(html.substring(jsonStart, endPos));
          if (parsed.content) content = parsed.content;
        } catch (e) {}
      }
    }

    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let m;
    while ((m = imgRegex.exec(content)) !== null) {
      const src = m[1];
      if (src.startsWith("data:")) continue;
      if (src.includes("icon") || src.includes("logo")) continue;
      const full = src.startsWith("//") ? "https:" + src : src;
      if (!images.includes(full)) images.push(full);
    }

    const textRegex = /<(?:p|h[1-6]|li|td|th|div|span)[^>]*>([^<]{5,})<\//gi;
    const textBlocks = [];
    const seen = {};
    while ((m = textRegex.exec(content)) !== null) {
      const t = m[1].replace(/&[^;]+;/g, " ").trim();
      if (t.length < 5 || t.length > 2000 || seen[t]) continue;
      seen[t] = true;
      textBlocks.push(t);
    }

    if (images.length === 0 && textBlocks.length === 0) return null;

    return {
      source_url: sourceUrl,
      page_type: "description",
      description_images: images,
      description_text: textBlocks.join("\n").slice(0, 10000),
      description_image_count: images.length,
    };
  } catch (e) {
    console.log("[bg] description fetch failed:", e.message);
    return null;
  }
}
