// KIDITEM OS — Alibaba/1688 소싱 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `sourcingEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

const EXTRACT_TIMEOUT_MS = 20000;
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

const pendingCollects = new Map();

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

const SOURCING_COLLECTION_POLL_MS = 250;

function count(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function operationResult(source, collected, failed) {
  const outcome = failed > 0 ? "partial" : collected > 0 ? "complete" : "no_change";
  return {
    status: "succeeded",
    result: {
      outcome,
      summary: {
        discovered: collected,
        accepted: collected,
        duplicate: 0,
        unchanged: 0,
        failed,
      },
      sources: [{ source, outcome, accepted: collected, failed }],
    },
  };
}

function failedOperation(errorCode, errorMessage) {
  return {
    status: "failed",
    errorCode,
    errorMessage,
  };
}

function assertOperationActive(operation) {
  operation.signal?.throwIfAborted?.();
}

function operationFenceLost() {
  const error = new Error("operation_runtime_fence_lost");
  error.code = "operation_runtime_fence_lost";
  error.status = 409;
  return error;
}

function isOperationFenceLost(value) {
  return value === "operation_runtime_fence_lost";
}

// The operation runtime owns cancellation. Once it aborts a claimed attempt,
// close the matching collector session as well so a stale browser tab cannot
// continue extracting or submit a late owner result.
function bindOperationAbort(operation, cancel) {
  const signal = operation.signal;
  if (!signal?.addEventListener) return () => undefined;
  let detached = false;
  const onAbort = () => {
    if (detached) return;
    void Promise.resolve(cancel()).catch(() => undefined);
  };
  if (signal.aborted) onAbort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    detached = true;
    signal.removeEventListener?.("abort", onAbort);
  };
}

function sleepUntilOperationPoll(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error("operation_cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, SOURCING_COLLECTION_POLL_MS);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("operation_cancelled"));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

async function waitForTrendCollector(operation, collector, source) {
  for (;;) {
    assertOperationActive(operation);
    const status = await collector.getStatus(operation.runId, operation.environmentId);
    assertOperationActive(operation);
    if (!status?.success) {
      return failedOperation(
        `${source}_collection_status_unavailable`,
        "The browser collection status was unavailable.",
      );
    }
    const collected = count(status.collected);
    const failed = Array.isArray(status.errors) ? status.errors.length : 0;
    const current = count(status.currentKeywordIndex ?? status.currentTargetIndex);
    const total = count(status.totalKeywords ?? status.totalTargets);
    await operation.heartbeat({
      progress: total > 0 ? Math.min(1, current / total) : 0,
      stage: status.status === "attention_required" ? "attention_required" : "collecting_browser",
      progressCurrent: current,
      progressTotal: total,
    });
    if (status.status === "attention_required") {
      return { status: "attention_required", attentionReason: "marketplace_login" };
    }
    if (status.status === "completed") return operationResult(source, collected, failed);
    if (status.status === "failed") {
      if (isOperationFenceLost(status.error) || isOperationFenceLost(status.errorCode)) {
        throw operationFenceLost();
      }
      return failedOperation(
        `${source}_collection_failed`,
        "The browser collection could not be completed.",
      );
    }
    if (status.status === "cancelled") {
      throw operation.signal?.reason || new Error("operation_cancelled");
    }
    await sleepUntilOperationPoll(operation.signal);
  }
}

function normalize1688OperationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("1688_operation_input_invalid");
  }
  if (!Array.isArray(input.keywords) || input.keywords.length > 20) {
    throw new Error("1688_operation_input_invalid");
  }
  const keywords = input.keywords.map((value) => text(value, ""));
  if (keywords.some((value) => !value || value.length > 120)) {
    throw new Error("1688_operation_input_invalid");
  }
  return keywords;
}

function normalizeTiktokOperationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("tiktok_cc_operation_input_invalid");
  }
  const result = {};
  if (input.maxItems !== undefined) {
    if (!Number.isInteger(input.maxItems) || input.maxItems < 1 || input.maxItems > 100) {
      throw new Error("tiktok_cc_operation_input_invalid");
    }
    result.maxItems = input.maxItems;
  }
  if (input.region !== undefined) {
    const region = text(input.region, "");
    if (!/^[A-Za-z]{2,12}$/.test(region)) {
      throw new Error("tiktok_cc_operation_input_invalid");
    }
    result.region = region;
  }
  return result;
}

async function runSourcing1688TrendOperation(operation) {
  assertOperationActive(operation);
  await operation.heartbeat({
    progress: 0,
    stage: "waiting_browser",
    progressCurrent: 0,
    progressTotal: 1,
  });
  const keywords = normalize1688OperationInput(operation.input);
  if (keywords.length === 0) return operationResult("1688", 0, 0);
  const started = await trendCollector.start(
    keywords,
    20,
    operation.environmentId,
    operation.runId,
    { attemptToken: operation.attemptToken },
  );
  if (!started?.success) {
    return failedOperation("1688_browser_collection_start_failed", "The 1688 browser collection could not start.");
  }
  const unbindAbort = bindOperationAbort(operation, () =>
    trendCollector.cancel(operation.runId, operation.environmentId));
  try {
    assertOperationActive(operation);
    return await waitForTrendCollector(operation, trendCollector, "1688");
  } finally {
    unbindAbort();
  }
}

async function runSourcingTiktokCcTrendOperation(operation) {
  assertOperationActive(operation);
  await operation.heartbeat({
    progress: 0,
    stage: "waiting_browser",
    progressCurrent: 0,
    progressTotal: 1,
  });
  const input = normalizeTiktokOperationInput(operation.input);
  const started = await tiktokCcCollector.start(
    input,
    operation.environmentId,
    operation.runId,
    { attemptToken: operation.attemptToken },
  );
  if (!started?.success) {
    return failedOperation("tiktok_cc_browser_collection_start_failed", "The TikTok browser collection could not start.");
  }
  const unbindAbort = bindOperationAbort(operation, () =>
    tiktokCcCollector.cancel(operation.runId, operation.environmentId));
  try {
    assertOperationActive(operation);
    return await waitForTrendCollector(operation, tiktokCcCollector, "tiktok_cc_trend");
  } finally {
    unbindAbort();
  }
}

async function runSourcingLiveCommerceOperation(operation) {
  assertOperationActive(operation);
  const validated = liveCommerceCollector.validateLiveUrl(operation.input?.url);
  if (!validated.ok) {
    return failedOperation("live_commerce_operation_input_invalid", "The live-commerce URL is invalid.");
  }
  await operation.heartbeat({
    progress: 0,
    stage: "waiting_browser",
    progressCurrent: 0,
    progressTotal: 1,
  });
  const unbindAbort = bindOperationAbort(operation, () =>
    liveCommerceCollector.cancel(operation.runId, operation.environmentId));
  try {
    assertOperationActive(operation);
    const collected = await liveCommerceCollector.collect(
      validated.url,
      operation.runId,
      operation.environmentId,
      { attemptToken: operation.attemptToken },
    );
    assertOperationActive(operation);
    if (collected?.errorCode === "operation_runtime_fence_lost") {
      throw operationFenceLost();
    }
    if (collected?.status === "attention_required") {
      return { status: "attention_required", attentionReason: "marketplace_login" };
    }
    if (!collected?.success) {
      return failedOperation("live_commerce_browser_collection_failed", "The live-commerce browser collection could not be completed.");
    }
    await operation.heartbeat({
      progress: 1,
      stage: "persisted",
      progressCurrent: 1,
      progressTotal: 1,
    });
    return operationResult(
      `live_commerce_${text(collected.source, "browser")}`,
      count(collected.broadcastCount) + count(collected.productCount),
      0,
    );
  } finally {
    unbindAbort();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void sourcingEnvironmentContext.migrateLegacyStorage();
});

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

async function handleProductData(data, tabId, environmentId) {
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
  // Browser-owned sourcing work is claimed only by the exact Operation key.
  // Do not add a generic URL/action dispatcher here: the owner routes fence
  // each result against the operation run and attempt token.
  operations: {
    "sourcing.collect_1688_trends": runSourcing1688TrendOperation,
    "sourcing.collect_tiktok_cc_trends": runSourcingTiktokCcTrendOperation,
    "sourcing.collect_live_commerce_url": runSourcingLiveCommerceOperation,
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
});
