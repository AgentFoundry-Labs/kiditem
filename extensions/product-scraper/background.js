importScripts("collection-session.js");
importScripts("interactive-tabs.js");
importScripts("1688-trend-collector.js");
importScripts("live-commerce-collector.js");

const DEFAULT_API = "http://localhost:4000/api/sourcing/extension";
const EXTRACT_TIMEOUT_MS = 20000;
const AUTH_TOKEN_KEY = "kiditem_auth_token";
const LEGACY_AUTH_TOKEN_KEYS = [
  "kiditem_sourcing_ingest_token",
  "kiditem_sourcing_ingest_token_expires_at",
  "kiditem_sourcing_ingest_token_max_expires_at",
];
const AUTH_REQUIRED_EVENT = "kiditem:extension-auth-required";
const AUTH_REFRESH_TIMEOUT_MS = 10_000;
const TREND_KEEPALIVE_PORT = "kiditem-1688-trend-keepalive";
const ALLOWED_WEB_ORIGINS = new Set([
  "http://localhost:3000",
  "https://staging.merchon.org",
]);
const ALLOWED_API_BASES = new Set([
  "http://localhost:4000/api/sourcing/extension",
  "http://127.0.0.1:4000/api/sourcing/extension",
  "https://staging.merchon.org/api/sourcing/extension",
]);
const KIDITEM_WEB_URL_PATTERNS = [
  "http://localhost:3000/*",
  "https://staging.merchon.org/*",
];

let apiBase = DEFAULT_API;
let pendingCollect = null;
let authRefreshInFlight = null;

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setLocal(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function approvedApiBase() {
  return normalizeApprovedApiBase(apiBase);
}

function normalizeApprovedApiBase(value) {
  try {
    const parsed = new URL(value);
    const normalized = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    return ALLOWED_API_BASES.has(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function isAllowedExternalSender(sender) {
  try {
    if (!sender?.url) return false;
    return ALLOWED_WEB_ORIGINS.has(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

async function getAuthToken() {
  const stored = await getLocal(AUTH_TOKEN_KEY);
  const token = stored[AUTH_TOKEN_KEY];
  return typeof token === "string" && token.trim() ? token : null;
}

function waitForAuthTokenChange(previousToken) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      resolve(token);
    };
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== "local") return;
      const nextToken = changes[AUTH_TOKEN_KEY]?.newValue;
      if (
        typeof nextToken === "string" &&
        nextToken.trim() &&
        nextToken !== previousToken
      ) {
        finish(nextToken);
      }
    };
    const timer = setTimeout(() => finish(null), AUTH_REFRESH_TIMEOUT_MS);
    chrome.storage.onChanged.addListener(handleStorageChange);
    getAuthToken().then((currentToken) => {
      if (currentToken && currentToken !== previousToken) finish(currentToken);
    });
  });
}

async function notifyKidItemAuthRequired() {
  const tabs = await chrome.tabs.query({ url: KIDITEM_WEB_URL_PATTERNS });
  await Promise.all(
    tabs
      .filter((tab) => tab?.id)
      .map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (eventName) =>
            window.dispatchEvent(new CustomEvent(eventName)),
          args: [AUTH_REQUIRED_EVENT],
        }).catch(() => null),
      ),
  );
}

function requestFreshAuthToken(previousToken) {
  if (authRefreshInFlight) return authRefreshInFlight;
  authRefreshInFlight = (async () => {
    const changedToken = waitForAuthTokenChange(previousToken);
    await notifyKidItemAuthRequired().catch(() => null);
    return changedToken;
  })().finally(() => {
    authRefreshInFlight = null;
  });
  return authRefreshInFlight;
}

async function fetchKidItem(url, init = {}, allowAuthRetry = true) {
  const token = await getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !allowAuthRetry) return response;

  const nextToken = await requestFreshAuthToken(token);
  if (!nextToken || nextToken === token) return response;
  return fetchKidItem(url, init, false);
}

async function backendRequestConfig() {
  const base = approvedApiBase();
  if (!base) {
    return { ok: false, error: "허용되지 않은 KidItem API 주소입니다." };
  }
  const headers = { "Content-Type": "application/json" };
  let token = await getAuthToken();
  if (!token) token = await requestFreshAuthToken(null);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!headers.Authorization) {
    return {
      ok: false,
      error: "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
    };
  }
  return { ok: true, base, headers, request: fetchKidItem };
}

const collectionSessions = KidItemCollectionSession.create({
  chrome,
  storageKey: "kiditem_collection_sessions",
  webUrlPatterns: KIDITEM_WEB_URL_PATTERNS,
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

async function cancelCollectionSession(runId) {
  const session = await collectionSessions.get(runId);
  if (!session) return null;
  if (session.producer === "sourcing.1688_trend") {
    await trendCollector.cancel(runId);
  } else if (session.producer === "sourcing.live_commerce") {
    await liveCommerceCollector.cancel(runId);
  } else {
    throw new Error("Unsupported collection producer");
  }
  return collectionSessions.get(runId);
}

async function restartCollectionSession(runId) {
  const session = await collectionSessions.get(runId);
  if (!session) throw new Error("Collection session not found");
  if (session.producer === "sourcing.1688_trend") {
    await trendCollector.restart(runId);
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["apiBase"], (result) => {
    if (result.apiBase) apiBase = result.apiBase;
  });
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!isAllowedExternalSender(sender)) {
    sendResponse({ success: false, error: "forbidden_origin" });
    return;
  }
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
    return respond(collectionSessions.list());
  }
  if (msg.action === "getCollectionSession") {
    return respond(collectionSessions.get(msg.runId));
  }
  if (msg.action === "cancelCollectionSession") {
    return respond(cancelCollectionSession(msg.runId));
  }
  if (msg.action === "openCollectionAttentionTab") {
    return respond(collectionSessions.openAttentionTab(msg.runId));
  }
  if (msg.action === "restartCollectionSession") {
    return respond(restartCollectionSession(msg.runId));
  }

  if (msg.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        sourcingProductScraper: true,
        sourcing1688TrendCollector: true,
        sourcingLiveCommerceCollector: true,
        browserCollectionSessions: true,
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
      .start(validated.keywords, validated.maxResultsPerKeyword)
      .then(sendResponse);
    return true;
  }

  if (msg.action === "get1688TrendCollectionStatus") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    trendCollector.getStatus(msg.runId).then(sendResponse);
    return true;
  }

  if (msg.action === "cancel1688TrendCollection") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    trendCollector.cancel(msg.runId).then(sendResponse);
    return true;
  }

  if (msg.action === "collectLiveCommerceUrl") {
    if (!validateOptionalRunId(msg.runId)) {
      sendResponse({ success: false, error: "invalid runId" });
      return;
    }
    return respond(liveCommerceCollector.collect(msg.url, msg.runId));
  }

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    const approvedMessageApiBase = normalizeApprovedApiBase(msg.apiBase);
    if (approvedMessageApiBase) apiBase = approvedMessageApiBase;
    chrome.storage.local.set({
      ...(approvedMessageApiBase ? { apiBase: approvedMessageApiBase } : {}),
      [AUTH_TOKEN_KEY]: token,
    }, () => {
      chrome.storage.local.remove(LEGACY_AUTH_TOKEN_KEYS, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (msg.action === "clearAuthToken") {
    chrome.storage.local.remove([
      AUTH_TOKEN_KEY,
      ...LEGACY_AUTH_TOKEN_KEYS,
    ], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "COLLECT_CURRENT") {
    if (msg.apiBase) apiBase = msg.apiBase;
    collectFromTab(msg.tabId).then(sendResponse);
    return true;
  }

  if (msg.type === "PRODUCT_DATA") {
    handleProductData(msg.data, sender.tab?.id);
    sendResponse({ ok: true });
  }

  if (msg.type === "DESCRIPTION_DATA") {
    sendDescriptionToBackend(msg.data);
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

function collectFromTab(tabId) {
  return new Promise((resolve) => {
    if (pendingCollect) {
      clearTimeout(pendingCollect.timer);
      pendingCollect.resolve({ ok: false, error: "cancelled" });
    }

    const timer = setTimeout(() => {
      if (pendingCollect?.resolve === resolve) {
        pendingCollect = null;
        resolve({ ok: false, error: "추출 시간 초과 (20초)" });
      }
    }, EXTRACT_TIMEOUT_MS);

    pendingCollect = { resolve, timer, tabId };

    chrome.tabs.sendMessage(tabId, { type: "TRIGGER_EXTRACT" }, (resp) => {
      if (chrome.runtime.lastError) {
        injectContentScripts(tabId).then((ok) => {
          if (!ok) {
            clearTimeout(timer);
            pendingCollect = null;
            resolve({ ok: false, error: "콘텐츠 스크립트 주입 실패. 페이지를 새로고침 해주세요." });
            return;
          }
          chrome.tabs.sendMessage(tabId, { type: "TRIGGER_EXTRACT" }, (resp2) => {
            if (chrome.runtime.lastError) {
              clearTimeout(timer);
              pendingCollect = null;
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

async function handleProductData(data, tabId) {
  if (data._detail_url && data.source_platform === "1688") {
    const desc = await fetchDescriptionContent(data._detail_url, data.source_url);
    if (desc) {
      data.description_images = desc.description_images;
      data.description_text = desc.description_text;
      data.description_image_count = desc.description_image_count;
    }
  }

  chrome.storage.local.set({ lastExtraction: data });
  const result = await sendToBackend(data);

  if (pendingCollect && pendingCollect.tabId === tabId) {
    clearTimeout(pendingCollect.timer);
    const cb = pendingCollect.resolve;
    pendingCollect = null;

    if (result.ok) {
      cb({ ok: true });
    } else {
      cb({ ok: false, error: result.error || "백엔드 전송 실패" });
    }
  }
}

async function sendToBackend(productData) {
  try {
    const config = await backendRequestConfig();
    if (!config.ok) return config;
    const url = `${config.base}/product-data`;
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

async function sendDescriptionToBackend(data) {
  const stored = await chrome.storage.local.get("lastExtraction");
  if (stored.lastExtraction && stored.lastExtraction.source_url === data.source_url) {
    stored.lastExtraction.description_images = data.description_images;
    stored.lastExtraction.description_text = data.description_text;
    stored.lastExtraction.description_image_count = data.description_image_count;
    chrome.storage.local.set({ lastExtraction: stored.lastExtraction });
  }

  try {
    const config = await backendRequestConfig();
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
