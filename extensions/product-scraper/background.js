const DEFAULT_API = "http://localhost:4000/api/sourcing/extension";
const EXTRACT_TIMEOUT_MS = 20000;

let apiBase = DEFAULT_API;
let pendingCollect = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["apiBase"], (result) => {
    if (result.apiBase) apiBase = result.apiBase;
  });
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
  const url = `${apiBase}/product-data`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    await fetch(`${apiBase}/product-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
