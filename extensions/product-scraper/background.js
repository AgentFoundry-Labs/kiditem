const DEFAULT_API = "http://localhost:4000/api/sourcing/extension";
const EXTRACT_TIMEOUT_MS = 20000;
const INGEST_TOKEN_KEY = "kiditem_sourcing_ingest_token";
const INGEST_TOKEN_EXPIRES_AT_KEY = "kiditem_sourcing_ingest_token_expires_at";
const INGEST_TOKEN_MAX_EXPIRES_AT_KEY = "kiditem_sourcing_ingest_token_max_expires_at";
const RENEW_WINDOW_MS = 5 * 60 * 1000;
const ALLOWED_WEB_ORIGINS = new Set([
  "http://localhost:3000",
  "https://staging.merchon.org",
]);
const ALLOWED_API_BASES = new Set([
  "http://localhost:4000/api/sourcing/extension",
  "http://127.0.0.1:4000/api/sourcing/extension",
  "https://staging.merchon.org/api/sourcing/extension",
]);

let apiBase = DEFAULT_API;
let pendingCollect = null;

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

async function getIngestToken(apiBaseForRenewal) {
  const stored = await getLocal([
    INGEST_TOKEN_KEY,
    INGEST_TOKEN_EXPIRES_AT_KEY,
    INGEST_TOKEN_MAX_EXPIRES_AT_KEY,
  ]);
  const token = stored[INGEST_TOKEN_KEY];
  if (typeof token !== "string" || !token.trim()) return null;

  const expiresAt = Date.parse(stored[INGEST_TOKEN_EXPIRES_AT_KEY] || "");
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > RENEW_WINDOW_MS) {
    return token;
  }

  try {
    const resp = await fetch(`${apiBaseForRenewal}/session/renew`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return token;
    const next = await resp.json();
    if (typeof next.token !== "string") return token;
    await setLocal({
      [INGEST_TOKEN_KEY]: next.token,
      [INGEST_TOKEN_EXPIRES_AT_KEY]: next.expiresAt || null,
      [INGEST_TOKEN_MAX_EXPIRES_AT_KEY]: next.maxExpiresAt || null,
    });
    return next.token;
  } catch {
    return token;
  }
}

async function backendRequestConfig() {
  const base = approvedApiBase();
  if (!base) {
    return { ok: false, error: "허용되지 않은 KidItem API 주소입니다." };
  }
  const headers = { "Content-Type": "application/json" };
  const token = await getIngestToken(base);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!headers.Authorization) {
    return {
      ok: false,
      error: "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
    };
  }
  return { ok: true, base, headers };
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

  if (msg.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: { sourcingProductScraper: true },
    });
    return;
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
      [INGEST_TOKEN_KEY]: token,
      [INGEST_TOKEN_EXPIRES_AT_KEY]: typeof msg.expiresAt === "string" ? msg.expiresAt : null,
      [INGEST_TOKEN_MAX_EXPIRES_AT_KEY]:
        typeof msg.maxExpiresAt === "string" ? msg.maxExpiresAt : null,
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === "clearAuthToken") {
    chrome.storage.local.remove([
      INGEST_TOKEN_KEY,
      INGEST_TOKEN_EXPIRES_AT_KEY,
      INGEST_TOKEN_MAX_EXPIRES_AT_KEY,
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
    const resp = await fetch(url, {
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
    await fetch(`${config.base}/product-data`, {
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
