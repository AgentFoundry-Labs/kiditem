// KIDITEM OS — Alibaba/1688 소싱 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `sourcingEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

const LEGACY_AUTH_TOKEN_KEYS = [
  "kiditem_auth_token",
  "apiBase",
  "kiditem_sourcing_ingest_token",
  "kiditem_sourcing_ingest_token_expires_at",
  "kiditem_sourcing_ingest_token_max_expires_at",
];
const TREND_KEEPALIVE_PORT = "kiditem-1688-trend-keepalive";
const sourcingEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: LEGACY_AUTH_TOKEN_KEYS,
});

const productExtensionCollector = KidItemProductExtensionCollector.create({
  chrome, backendRequestConfig, injectContentScripts, enrichProductData,
});

async function backendRequestConfig(environmentId) {
  let environment;
  try {
    environment = sourcingEnvironmentContext.requireEnvironment(environmentId);
  } catch {
    return { ok: false, error: "지원하지 않는 KidItem 환경입니다." };
  }
  const token = await sourcingEnvironmentContext.getAccessToken(environmentId);
  if (!token) {
    return {
      ok: false,
      error: "선택한 KidItem 환경에서 로그인 후 다시 시도해주세요.",
    };
  }
  const apiBase = `${environment.apiOrigin}/api`;
  const base = `${apiBase}/sourcing/extension`;
  return {
    ok: true,
    apiBase,
    base,
    headers: { "Content-Type": "application/json" },
    request(url, init = {}) {
      const parsed = new URL(url);
      if (parsed.origin !== environment.apiOrigin) {
        throw new Error("KidItem API 환경이 일치하지 않습니다.");
      }
      return sourcingEnvironmentContext.authedFetch(
        environmentId,
        `${parsed.pathname}${parsed.search}`,
        init,
      );
    },
  };
}


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

async function cancelSourcingCollectionSession(runId, environmentId) {
  if (typeof collectionSessions.requestCancellation === "function") {
    try {
      await collectionSessions.requestCancellation(runId, environmentId);
    } catch (error) {
      console.warn(
        "[KIDITEM] local sourcing cancellation fence needs reconciliation:",
        error?.message || error,
      );
    }
  }
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (!session) return null;
  if (session.producer === "sourcing.1688_trend") {
    await trendCollector.cancel(runId, environmentId);
  } else if (session.producer === "sourcing.live_commerce") {
    await liveCommerceCollector.cancel(runId, environmentId);
  } else if (session.producer === "sourcing.tiktok_cc_trend") {
    await tiktokCcCollector.cancel(runId, environmentId);
  } else if (session.producer === "sourcing.keyword_suggestion") {
    await cancelSourcingKeywordSuggestions(runId, environmentId);
  } else if (session.producer === "sourcing.wing_catalog") {
    await cancelSourcingWingCatalog(runId, environmentId);
  } else {
    throw new Error("Unsupported collection producer");
  }
  return collectionSessions.get(runId);
}

async function recoverSourcingCollections(environmentId) {
  await Promise.all([
    KidItemWorkerKeepAlive.during(trendCollector.recover(environmentId)).catch((error) =>
      console.error(
        "[KIDITEM] 1688 source owner recovery failed:",
        error?.message || error,
      ),
    ),
    KidItemWorkerKeepAlive.during(tiktokCcCollector.recover(environmentId)).catch((error) =>
      console.error(
        "[KIDITEM] TikTok source owner recovery failed:",
        error?.message || error,
      ),
    ),
    KidItemWorkerKeepAlive.during(liveCommerceCollector.recover(environmentId)).catch((error) =>
      console.error(
        "[KIDITEM] Live Commerce source owner recovery failed:",
        error?.message || error,
      ),
    ),
  ]);
}

// MV3 service workers may be suspended during a multi-keyword daily 1688 trend run.
// The KidItem host content script sends a small heartbeat while the page is
// open so in-flight extraction promises and external response channels stay
// alive until the batch finishes.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TREND_KEEPALIVE_PORT) return;
  port.onMessage.addListener(() => {
    // Receiving the port message is the keepalive signal; no response needed.
  });
});

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

chrome.runtime.onInstalled.addListener(() => {
  void sourcingEnvironmentContext.migrateLegacyStorage();
});

function parseSourcing1688TrendStart(message) {
  if (
    !message
    || typeof message !== "object"
    || Array.isArray(message)
    || message.action !== "collectSourcing1688Trends"
    || typeof message.idempotencyKey !== "string"
    || message.idempotencyKey.trim().length === 0
    || message.idempotencyKey.length > 300
    || Object.keys(message).some((key) => key !== "action" && key !== "idempotencyKey")
  ) {
    throw new Error("Invalid 1688 source collection request");
  }
  return { idempotencyKey: message.idempotencyKey.trim() };
}

function parseSourcingTiktokCcTrendStart(message) {
  if (
    !message
    || typeof message !== "object"
    || Array.isArray(message)
    || message.action !== "collectSourcingTiktokCcTrends"
    || typeof message.idempotencyKey !== "string"
    || message.idempotencyKey.trim().length === 0
    || message.idempotencyKey.length > 300
    || Object.keys(message).some((key) =>
      key !== "action" && key !== "idempotencyKey" && key !== "maxItems" && key !== "region")
  ) {
    throw new Error("Invalid TikTok source collection request");
  }
  const result = { idempotencyKey: message.idempotencyKey.trim() };
  if (message.maxItems !== undefined) {
    if (!Number.isInteger(message.maxItems) || message.maxItems < 1 || message.maxItems > 100) {
      throw new Error("Invalid TikTok source collection request");
    }
    result.maxItems = message.maxItems;
  }
  if (message.region !== undefined) {
    const region = text(message.region, "");
    if (!/^[A-Za-z]{2,12}$/.test(region)) {
      throw new Error("Invalid TikTok source collection request");
    }
    result.region = region;
  }
  return result;
}

function parseSourcingLiveCommerceStart(message) {
  if (
    !message
    || typeof message !== "object"
    || Array.isArray(message)
    || message.action !== "collectSourcingLiveCommerce"
    || typeof message.idempotencyKey !== "string"
    || message.idempotencyKey.trim().length === 0
    || message.idempotencyKey.length > 300
    || Object.keys(message).some((key) => key !== "action" && key !== "idempotencyKey" && key !== "url")
  ) {
    throw new Error("Invalid Live Commerce source collection request");
  }
  const validated = liveCommerceCollector.validateLiveUrl(message.url);
  if (!validated.ok) throw new Error("Invalid Live Commerce source collection request");
  return {
    idempotencyKey: message.idempotencyKey.trim(),
    url: validated.url,
  };
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const environment = sourcingEnvironmentContext.resolveSender(sender);
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
    // 응답이 갈 때까지 서비스워커를 살려 둔다(MV3 유휴 종료 방지).
    KidItemWorkerKeepAlive.during(promise)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Collection session request failed",
        }),
      );
    return true;
  };

  // 수집 세션 공통 액션(list/get/cancel/openAttentionTab)과 ping 은
  // 통합 서비스워커가 처리한다. 도메인 워커가 각자 응답하면 세 리스너가 같은
  // 메시지에 경쟁 응답하게 된다. 이 도메인의 cancel 구현과 capabilities 는
  // 파일 끝의 KidItemDomains.register 로 넘긴다.

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    return respond(
      sourcingEnvironmentContext
        .migrateLegacyStorage()
        .then(() => sourcingEnvironmentContext.setAccessToken(environmentId, token))
        .then(() => ({ success: true })),
    );
  }

  if (msg.action === "clearAuthToken") {
    return respond(
      sourcingEnvironmentContext
        .clearAccessToken(environmentId)
        .then(() => sourcingEnvironmentContext.migrateLegacyStorage())
        .then(() => ({ success: true })),
    );
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // `getConnectedKidItemEnvironments` 는 쿠팡 워커가 단독으로 응답한다.
  // 두 도메인이 같은 프로필 저장소를 보면서 응답 모양만 달랐던 탓에 병합 후
  // 경쟁 응답이 되면 사이드패널이 비결정적으로 깨진다.

  if (msg.type === "COLLECT_CURRENT") {
    sourcingEnvironmentContext
      .connectedEnvironmentIds()
      .then((environmentIds) => {
        if (!environmentIds.includes(msg.environmentId)) {
          return { ok: false, error: "선택한 KidItem 환경에서 로그인해주세요." };
        }
        return productExtensionCollector.collect(msg.tabId, msg.environmentId);
      })
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || String(error) }),
      );
    return true;
  }

  if (["PRODUCT_DATA", "DESCRIPTION_DATA", "EXTRACTION_COMPLETE"].includes(msg.type)) {
    sendResponse(productExtensionCollector.onEvent(msg, sender));
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ running: false });
  }

  return true;
});

async function injectContentScripts(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || "";

    // 1. Content scripts FIRST — registers message listener
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "content/sourcing/extractors/common.js",
        "content/sourcing/extractors/alibaba.js",
        "content/sourcing/extractors/1688.js",
        "content/sourcing/content.js",
      ],
    });

    // 2. Wait for content scripts to initialize
    await new Promise((r) => setTimeout(r, 300));

    // 3. Bridge script SECOND — posts message that content.js is now listening for
    let bridgeFile = null;
    if (url.includes("1688.com")) bridgeFile = "content/sourcing/extractors/1688-bridge.js";
    else if (url.includes("alibaba.com")) bridgeFile = "content/sourcing/extractors/page-bridge.js";

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
      files: ["content/sourcing/live-commerce-extractor.js", "content/sourcing/live-commerce-content.js"],
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
      files: ["content/sourcing/tiktok-cc-extractor.js", "content/sourcing/tiktok-cc-content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/sourcing/tiktok-cc-hook.js"],
      world: "MAIN",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    console.log("[bg] tiktok cc script injection failed:", error.message);
    return false;
  }
}

async function enrichProductData(data) {
  if (data._detail_url && data.source_platform === "1688") {
    let detailUrl = null;
    try {
      detailUrl = KiditemSourcingUrlPolicy.parseAllowedSupplierUrl(data._detail_url);
    } catch (error) {
      console.warn("[bg] blocked untrusted 1688 detail URL:", error?.message || String(error));
    }
    const desc = detailUrl ? await fetchDescriptionContent(detailUrl, data.source_url) : null;
    if (desc) {
      data.description_images = desc.description_images;
      data.description_text = desc.description_text;
      data.description_image_count = desc.description_image_count;
    }
  }

  return data;
}

async function fetchDescriptionContent(detailUrl, sourceUrl) {
  try {
    const resp = await fetch(detailUrl, {
      redirect: "error",
      credentials: "include",
    });
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

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["sourcing"],
  externalActions: {
    collectSourcing1688Trends: {
      validate: parseSourcing1688TrendStart,
      handle: ({ idempotencyKey }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          trendCollector.run({ environmentId, idempotencyKey }),
        ),
    },
    collectSourcingTiktokCcTrends: {
      validate: parseSourcingTiktokCcTrendStart,
      handle: ({ idempotencyKey, maxItems, region }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          tiktokCcCollector.run({ environmentId, idempotencyKey, maxItems, region }),
        ),
    },
    collectSourcingLiveCommerce: {
      validate: parseSourcingLiveCommerceStart,
      handle: ({ idempotencyKey, url }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          liveCommerceCollector.run({ environmentId, idempotencyKey, url }),
        ),
    },
  },
  capabilities: {
    sourcingProductScraper: true,
    sourcing1688TrendCollector: true,
    sourcingLiveCommerceCollector: true,
    sourcingTiktokCcCollector: true,
    browserCollectionSessions: true,
    kiditemEnvironmentProfilesV1: true,
  },
  cancelCollectionSession: (runId, environmentId) =>
    cancelSourcingCollectionSession(runId, environmentId),
  cancelAdditionalCollections: (environmentId) =>
    productExtensionCollector.cancelEnvironment(environmentId),
  retryAdditionalCollections: (environmentId) =>
    productExtensionCollector.retryAdditionalCollections(environmentId),
  recoverCollections: (environmentId) =>
    recoverSourcingCollections(environmentId),
});
