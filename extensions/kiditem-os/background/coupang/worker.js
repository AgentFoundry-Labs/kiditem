// KIDITEM OS — 쿠팡 Wing/광고센터 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `adsEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

chrome.runtime.onMessage.addListener(KidItemAdCollectorDelay.handleMessage);

const COUPANG_CATALOG_CONTRACT_REVISION = 2;
if (
  KidItemCoupangCatalog.contractRevision !==
  COUPANG_CATALOG_CONTRACT_REVISION
) {
  throw new Error("쿠팡 카탈로그 수집기 계약 revision이 일치하지 않습니다");
}

// KidItem 웹앱이 열리는 커밋된 origin. externally_connectable / 대시보드 탭 조회 /
// 세션·auth 핸드셰이크가 모두 이 목록을 공유한다. (product-scraper 패턴)
const AD_ACTION_URL =
  "https://advertising.coupang.com/dashboard?kiditemExecuteActions=1#kiditemExecuteActions=1";
const WING_CATALOG_FORM_URL =
  "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
const WING_CATALOG_SEARCH_ENDPOINT = "/tenants/seller-web/pre-matching/search";
const COUPANG_SEARCH_URL = "https://www.coupang.com/np/search";
const COUPANG_AUTOCOMPLETE_ENDPOINT = "/np/search/autoComplete";
const WING_CATALOG_MAX_PAGES = 5;
const WING_CATALOG_PAGE_DELAY_MS = 2200;
const WING_RANK_STALE_AFTER_MS = 5 * 60 * 1000;
const WING_RANK_RESUME_ALARM = "wing-sales-rank-resume";
const COUPANG_KEYWORD_SEARCH_DELAY_MS = 1500;
const COUPANG_RANK_MAX_PAGES = 3;
const COUPANG_RANK_PAGE_RENDER_DELAY_MS = 1200;
const COUPANG_OVERLAP_PRODUCT_DETAIL_LIMIT = 200;
const COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS = 1200;
const COUPANG_SELLER_CATALOG_BATCH_LIMIT = 20;
const COUPANG_SELLER_CATALOG_MAX_ITEMS = 500;
const COUPANG_SELLER_CATALOG_RENDER_DELAY_MS = 1200;
const BATCH_SCRAPE_STATUS_KEY = "kiditem_batch_scrape";
const BATCH_SCRAPE_CANCEL_KEY = "kiditem_batch_scrape_cancel";
const RANK_CHECK_STATUS_KEY = "kiditem_rank_check"; // Wing 판매순위 배치 전용
const RANK_CHECK_CANCEL_KEY = "kiditem_rank_check_cancel";
const KEYWORD_RANK_STATUS_KEY = "kiditem_keyword_rank_check"; // 쿠팡 검색(SERP) 키워드 순위 배치 전용
const COMPETITOR_SELLER_CATALOG_STATUS_KEY =
  "kiditem_competitor_seller_catalog_check";
const COLLECTION_WINDOW_STORAGE_KEY = "kiditem_coupang_collection_window";
const CATALOG_COLLECTION_WINDOW_STORAGE_KEY =
  "kiditem_coupang_catalog_collection_window";

const adsEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: ["kiditem_auth_token", "apiBase"],
});
const coupangEnvironment = KidItemCoupangEnvironmentRuntime.create({
  chrome,
  environmentContext: adsEnvironmentContext,
});
const authedFetch = (environmentId, path, init) =>
  adsEnvironmentContext.authedFetch(environmentId, path, init);
const getAuthToken = (environmentId) =>
  adsEnvironmentContext.getAccessToken(environmentId);
const collectionWindows = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemCollectionWindow.create({
      chrome,
      storageKey: coupangEnvironment.stateKey(COLLECTION_WINDOW_STORAGE_KEY, environmentId),
      sessions: collectionSessions,
      statusKey: coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId),
      cancelKey: coupangEnvironment.stateKey(BATCH_SCRAPE_CANCEL_KEY, environmentId),
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
      markScraped: (targetId) =>
        authedFetch(environmentId, `/api/ads/scrape-targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markScraped", id: targetId }),
        }).then(() => undefined),
      notify: () => notifyDashboard(environmentId),
    }),
  ]),
);
const catalogCollectionWindows = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemCollectionWindow.create({
      chrome,
      storageKey: coupangEnvironment.stateKey(
        CATALOG_COLLECTION_WINDOW_STORAGE_KEY,
        environmentId,
      ),
    }),
  ]),
);
function collectionWindowFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return collectionWindows[environmentId];
}
function catalogCollectionWindowFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return catalogCollectionWindows[environmentId];
}
const collectionRuns = KidItemCollectionRuns.create({
  chrome,
  sessions: collectionSessions,
  collectionWindowFor,
  cancelScrape: (runId, environmentId) =>
    collectionWindowFor(environmentId).cancelRun(runId),
  cancelWingRank: requestWingSalesRankCancellation,
  cancelKeywordRank: requestCoupangKeywordRankCancellation,
  cancelCompetitorCatalog: requestCoupangCompetitorCatalogCancellation,
  cancelCatalog: (runId, environmentId) =>
    KidItemCoupangCatalogImport.cancel(
      runId,
      coupangCatalogImportDependencies(environmentId),
    ),
  loadScheduledTargets: loadScheduledScrapeTargets,
  startScheduledScrape: (input) =>
    handleScrapeTargets(input.targets, input.runId, input.startedAt, {
      producer: "advertising.scrape_targets",
      restartStrategy: "extension",
      sessionStarted: input.sessionStarted,
      environmentId: input.environmentId,
    }),
  startWingRank: startWingSalesRankCheck,
  restartCatalog: (runId, environmentId) =>
    KidItemCoupangCatalogImport.restart(
      runId,
      coupangCatalogImportDependencies(environmentId),
    ),
  startCatalog: (message, environmentId) =>
    KidItemCoupangCatalogImport.start(
      message,
      coupangCatalogImportDependencies(environmentId),
    ),
});
const wingFormRuntimeCompat = KidItemWingFormRuntimeCompat.create({ chrome });
const wingFormReadiness = KidItemWingFormReadiness.create({ chrome });
const wingImageFetch = KidItemWingImageFetch.create({
  runtimeId: chrome.runtime.id,
  fetchFn: fetch,
  FileReaderCtor: FileReader,
});
chrome.runtime.onMessage.addListener(wingImageFetch.handleMessage);
const WING_FORM_PORT_NAME = "kiditem-wing-form-v1";

function handleWingFormPort(port) {
  let started = false;
  port.onMessage.addListener((message) => {
    if (started) return;
    started = true;
    if (message?.action !== "registerToWingForm") {
      port.postMessage({ ok: false, error: "지원하지 않는 WING 폼 요청입니다." });
      port.disconnect();
      return;
    }
    registerToWingForm(message)
      .then((result) => port.postMessage(result))
      .catch((error) =>
        port.postMessage({
          ok: false,
          error: error?.message || "WING 상품등록 페이지 열기 실패",
        }),
      )
      .finally(() => port.disconnect());
  });
}

chrome.runtime.onConnectExternal.addListener((port) => {
  const senderEnvironment = adsEnvironmentContext.resolveSender(port.sender);
  if (!senderEnvironment) {
    port.disconnect();
    return;
  }
  if (port.name === WING_FORM_PORT_NAME) {
    handleWingFormPort(port);
    return;
  }
  port.disconnect();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  cleanupStorage();
  // 알람은 onInstalled에서만 등록 (서비스워커 재시작 시 유지됨)
  chrome.alarms.create("storage-cleanup", { periodInMinutes: 1440 });
  for (const environmentId of adsEnvironmentContext.environmentIds) {
    chrome.alarms.create(coupangEnvironment.alarmName("auto-scrape", environmentId), { periodInMinutes: 180 });
    chrome.alarms.create(coupangEnvironment.alarmName("keyword-rank-check", environmentId), { periodInMinutes: 720 });
    chrome.alarms.create(coupangEnvironment.alarmName(WING_RANK_RESUME_ALARM, environmentId), { periodInMinutes: 1 });
    chrome.alarms.create(coupangEnvironment.alarmName("coupang-keyword-serp-rank", environmentId), { periodInMinutes: 720 });
  }
  adsEnvironmentContext.migrateLegacyStorage().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "storage-cleanup") cleanupStorage();
  const scheduled = coupangEnvironment.parseAlarm(alarm.name);
  if (scheduled?.base === "auto-scrape") autoScrape(scheduled.environmentId);
  if (scheduled?.base === "keyword-rank-check") runScheduledWingSalesRankCheck(scheduled.environmentId);
  if (scheduled?.base === WING_RANK_RESUME_ALARM)
    resumeInterruptedWingSalesRankCheck(scheduled.environmentId);
  if (scheduled?.base === "coupang-keyword-serp-rank")
    runScheduledKeywordRankCheck(scheduled.environmentId);
  if (scheduled?.base === "kiditem-coupang-catalog-import-step") {
    KidItemCoupangCatalogImport.handleAlarm(
      alarm,
      coupangCatalogImportDependencies(scheduled.environmentId),
    );
  }
});

function cleanupStorage() {
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

    for (const [key, val] of Object.entries(all)) {
      // 싱크 기록 중 7일 지난 것 삭제
      if (
        key.startsWith("kiditem_last_sync_") &&
        val?.time &&
        now - val.time > MAX_AGE
      ) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
      console.log(`[KIDITEM] Storage 정리: ${keysToRemove.length}개 삭제`);
    }
  });
}

// 동기화 완료 후 대시보드 탭 자동 새로고침
function notifyDashboard(environmentId) {
  return adsEnvironmentContext.publish(environmentId, "kiditem-sync");
}

// 아이콘 클릭 시 사이드 패널 열기
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ═══ content script에서 메시지 수신 ═══
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "inputWingCategorySearch") {
    wingFormRuntimeCompat
      .insertText(
        sender?.tab?.id,
        sender?.url || sender?.tab?.url,
        msg.value,
      )
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error?.message || "WING 카테고리 검색 입력에 실패했습니다.",
        }),
      );
    return true;
  }

  if (msg.action === "bindKidItemEnvironment") {
    const tabId = sender?.tab?.id || msg.tabId;
    Promise.resolve()
      .then(async () => {
        adsEnvironmentContext.requireEnvironment(msg.environmentId);
        const connected = await adsEnvironmentContext.connectedEnvironmentIds();
        if (!connected.includes(msg.environmentId)) {
          throw new Error("선택한 환경에 로그인된 KidItem 탭이 없습니다.");
        }
        await coupangEnvironment.bindTab(tabId, msg.environmentId);
        return { success: true, environmentId: msg.environmentId };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 병합 전에는 쿠팡 워커가 `environmentIds`(문자열 배열)를, 소싱 워커가
  // `environments`(객체 배열)를 같은 액션 이름으로 돌려줬다. 하나의 확장에서는
  // 두 리스너가 같은 메시지에 경쟁 응답해 사이드패널이 비결정적으로 깨지므로,
  // 여기서만 응답하되 두 소비자가 모두 읽을 수 있게 양쪽 필드를 함께 담는다.
  if (msg.action === "getConnectedKidItemEnvironments") {
    adsEnvironmentContext.connectedEnvironmentIds()
      .then((environmentIds) =>
        sendResponse({
          success: true,
          environmentIds,
          environments: environmentIds.map((environmentId) =>
            adsEnvironmentContext.requireEnvironment(environmentId),
          ),
        }),
      )
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "kiditemApiRequest") {
    const path = typeof msg.path === "string" ? msg.path : "";
    if (!path.startsWith("/api/") || /^https?:/i.test(path)) {
      sendResponse({ success: false, error: "허용되지 않은 API 경로입니다." });
      return;
    }
    Promise.resolve()
      .then(async () => {
        const environmentId = msg.environmentId ||
          (await coupangEnvironment.environmentForTab(sender?.tab?.id));
        adsEnvironmentContext.requireEnvironment(environmentId);
        const headers = new Headers(msg.init?.headers || {});
        headers.delete("authorization");
        const response = await authedFetch(environmentId, path, {
          ...(msg.init || {}),
          headers,
        });
        const body = await response.json().catch(() => null);
        return { success: true, ok: response.ok, status: response.status, body };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "triggerAutoScrape") {
    const environmentId = msg.environmentId;
    autoScrape(environmentId)
      .then(() => {
        const key = coupangEnvironment.stateKey("kiditem_auto_scrape", environmentId);
        chrome.storage.local.get([key], (data) => {
          const result = data[key] || {};
          sendResponse({
            success: true,
            completed: result.completed || 0,
            total: result.total || 0,
          });
        });
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === "monthlyScrape") {
    const { year, month } = msg;
    if (!year || !month) {
      sendResponse({ success: false, error: "year/month 필수" });
      return;
    }
    const environmentId = msg.environmentId;
    const monthlySyncKey = coupangEnvironment.stateKey("kiditem_monthly_sync", environmentId);
    chrome.storage.local.set({
      [monthlySyncKey]: {
        year,
        month,
        completed: 0,
        total: 0,
        status: "starting",
      },
    });
    doMonthlyScrape(year, month, environmentId).catch((e) => {
      chrome.storage.local.set({
        [monthlySyncKey]: {
          year,
          month,
          completed: 0,
          total: 0,
          status: "error",
          error: e.message,
        },
      });
    });
    sendResponse({
      success: true,
      message: `${year}-${String(month).padStart(2, "0")} 일별 수집 시작`,
    });
    return; // sync response, no need for return true
  }

  // 배치 스크랩 진행률은 handleScrapeTargets 의 sequential 루프가 소유.
  // content script 의 auto-trigger 경로는 이 메시지를 보내지만, 카운트/상태는 오너(서비스워커)가 담당.
  // 여기서는 탭 자가 종료만 처리.
  if (msg.action === "reportBatchScrapeDone") {
    const tabId = sender?.tab?.id;
    if (tabId) {
      chrome.storage.local.get(COLLECTION_WINDOW_STORAGE_KEY, (data) => {
        const owned = data?.[COLLECTION_WINDOW_STORAGE_KEY];
        if (owned?.tabId === tabId) return;
        setTimeout(() => {
          try {
            chrome.tabs.remove(tabId);
          } catch {}
        }, 2000);
      });
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === "reportCollectionTargetProgress") {
    const runId = typeof msg.runId === "string" ? msg.runId : null;
    const progress = msg.progress;
    if (!runId || !progress || typeof progress !== "object") {
      sendResponse({ success: false, error: "invalid collection progress" });
      return;
    }
    const incoming = KidItemCollectionWindow.normalizeProgress(progress);
    if (!incoming) {
      sendResponse({ success: false, error: "invalid collection progress" });
      return;
    }
    collectionSessions
      .get(runId)
      .then((session) => {
        if (!session) throw new Error("collection session not found");
        if (["succeeded", "failed", "cancelled"].includes(session.status)) {
          return { ignored: true };
        }
        const normalized = KidItemCollectionWindow.normalizeProgress(
          incoming,
          session.progress || {},
        );
        return collectionSessions
          .progress(runId, normalized)
          .then(() => ({ ignored: false }));
      })
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) =>
        sendResponse({ success: false, error: error?.message || "progress update failed" }),
      );
    return true;
  }

  if (msg.action === "syncToServer") {
    const payload = msg.payload || {};
    const environmentIdPromise = msg.environmentId
      ? Promise.resolve(msg.environmentId)
      : coupangEnvironment.environmentForTab(sender?.tab?.id);
    environmentIdPromise.then((environmentId) => {
      adsEnvironmentContext.requireEnvironment(environmentId);
      return authedFetch(environmentId, `/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      }).then((response) => ({ response, environmentId }));
    })
      .then(({ response, environmentId }) => response.json().then((json) => ({ json, environmentId })))
      .then(({ json, environmentId }) => {
        if (json.success) {
          const key = coupangEnvironment.stateKey(
            `kiditem_last_sync_${payload.type || "unknown"}`,
            environmentId,
          );
          const count = Array.isArray(payload.data) ? payload.data.length : 0;
          chrome.storage.local.set({ [key]: { time: Date.now(), count } });
          // 대시보드 탭에 리로드 신호 전송
          notifyDashboard(environmentId);
        }
        sendResponse(json);
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true; // async response
  }
});

// ═══ 대시보드(외부 웹페이지)에서 메시지 수신 ═══
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const senderEnvironment = adsEnvironmentContext.resolveSender(sender);
  if (!senderEnvironment) {
    sendResponse({ success: false, error: "Untrusted KidItem web origin" });
    return false;
  }
  const environmentId = senderEnvironment.environmentId;
  msg = { ...msg, environmentId };
  const respond = (operation) => {
    Promise.resolve(operation)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Collection session request failed",
        }),
      );
    return true;
  };

  // 수집 세션 공통 액션(list/get/cancel/restart/openAttentionTab)은 통합
  // 서비스워커가 producer 로 도메인을 골라 처리한다. 도메인 워커가 각자
  // 응답하면 세 리스너가 같은 메시지에 경쟁 응답하게 된다.

  if (msg.action === "scrapeTargets") {
    // MV3 service worker가 긴 async chain 중 idle 종료되면 port가 닫혀 loop 중단됨.
    // 즉시 응답 + fire-and-forget. 진행률은 chrome.storage.local.kiditem_batch_scrape 에 기록.
    const producer = collectionRuns.resolveScrapeTargetProducer(msg.producer);
    if (!producer) {
      sendResponse({
        success: false,
        error: "Unsupported collection producer",
      });
      return false;
    }
    const urls = collectionRuns.validateScrapeTargets(msg.urls);
    if (!urls) {
      sendResponse({ success: false, error: "Invalid scrape target list" });
      return false;
    }
    const runId =
      typeof msg.runId === "string"
        ? msg.runId
        : collectionRuns.createRunId();
    const startedAt = Date.now();
    // Acknowledge the external request before awaiting MV3 session/storage
    // setup. The caller owns runId and polls the durable session separately.
    sendResponse({
      success: true,
      started: true,
      total: urls.length,
      runId,
      startedAt,
    });
    prepareScrapeTargets(urls, runId, startedAt, {
      producer,
      restartStrategy: "web",
      environmentId,
    })
      .then(({ runId: preparedRunId, producer: preparedProducer }) => {
        // MV3 service worker 는 30초 유휴면 종료된다. 수집은 수십 분이 걸리는데
        // 이 경로에는 keepalive 가 없어서, 웹 UI 가 2초마다 보내는 상태 폴링에
        // 우연히 기대고 있었다. 사용자가 KIDITEM 탭을 떠나거나 그 탭이 백그라운드로
        // 내려가면(폴링 타이머도 같이 스로틀됨) 유휴 종료 → 진행 중이던
        // collectTargets 의 promise chain·타임아웃·소유 창 정리가 통째로 사라지고,
        // 다음 콜드 스타트의 recover() 가 세션을 attention_required 로 뒤집는다.
        // 온채널/키워드 순위 배치와 같은 keepalive 를 여기에도 건다.
        const keepAlive = setInterval(() => {
          chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
        }, 20000);
        collectionWindowFor(environmentId)
          .collectTargets({
            runId: preparedRunId,
            targets: urls,
            startedAt,
            producer: preparedProducer,
            environmentId,
          })
          .catch((error) => {
            chrome.storage.local.set({
              [coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId)]: {
                runId: preparedRunId,
                status: "error",
                error: error?.message || String(error),
                startedAt,
                endedAt: Date.now(),
              },
            });
          })
          .finally(() => clearInterval(keepAlive));
      })
      .catch((error) => {
        chrome.storage.local.set({
          [coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId)]: {
            runId,
            total: urls.length,
            completed: 0,
            failed: 1,
            current: 0,
            status: "error",
            startedAt,
            endedAt: Date.now(),
            error: error?.message || "Collection session start failed",
          },
        });
      });
    return false;
  }

  if (msg.action === "getBatchScrapeStatus") {
    const statusKey = coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId);
    chrome.storage.local.get(statusKey, (data) => {
      const status = data[statusKey] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "cancelBatchScrape") {
    cancelBatchScrape(typeof msg.runId === "string" ? msg.runId : null, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ success: false, error: e?.message || "수집 중단 실패" }),
      );
    return true;
  }

  // ping 은 통합 서비스워커가 세 도메인의 capabilities 를 합쳐 한 번만 응답한다.
  // 이 도메인의 capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  if (msg.action === "startCoupangCatalogImport") {
    collectionRuns.startCatalog(msg, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 상품 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangCatalogImportStatus") {
    KidItemCoupangCatalogImport.getStatus(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangCatalogImportDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ status: "error", runId: msg.runId, error: e?.message || "쿠팡 상품 수집 상태 조회 실패" }));
    return true;
  }

  if (msg.action === "cancelCoupangCatalogImport") {
    KidItemCoupangCatalogImport.cancel(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangCatalogImportDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "쿠팡 상품 수집 중단 실패" }));
    return true;
  }

  if (msg.action === "searchWingCatalogProducts") {
    searchWingCatalogProducts(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "Wing 카탈로그 검색 실패",
        }),
      );
    return true;
  }

  if (msg.action === "deleteWingProduct") {
    deleteWingProduct(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ ok: false, error: e?.message || "WING 상품 삭제 실패" }),
      );
    return true;
  }

  if (msg.action === "registerToWingForm") {
    registerToWingForm(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ ok: false, error: e?.message || "WING 상품등록 페이지 열기 실패" }),
      );
    return true;
  }

  if (msg.action === "searchCoupangKeywordSuggestions") {
    searchCoupangKeywordSuggestions(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 인기 키워드 수집 실패",
        }),
      );
    return true;
  }

  if (msg.action === "checkCoupangKeywordRank") {
    checkCoupangKeywordRank(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 키워드 순위 수집 실패",
        }),
      );
    return true;
  }

  if (msg.action === "runCoupangKeywordRankCheck") {
    startCoupangKeywordRankCheck({ runId: msg.runId, environmentId })
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "키워드 순위 일괄 확인 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "runCoupangCompetitorSellerCatalog") {
    startCoupangCompetitorSellerCatalogCollection(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "판매자 상품 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangCompetitorSellerCatalogStatus") {
    const statusKey = coupangEnvironment.stateKey(COMPETITOR_SELLER_CATALOG_STATUS_KEY, environmentId);
    chrome.storage.local.get(statusKey, (data) => {
      const status = data[statusKey] || {
        status: "idle",
      };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "runWingSalesRankCheck") {
    startWingSalesRankCheck({ runId: msg.runId, environmentId })
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "Wing 판매순위 일괄 확인 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "cancelWingSalesRankCheck") {
    const requestedRunId = typeof msg.runId === "string" ? msg.runId : null;
    collectionRuns.cancel(requestedRunId, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          cancelled: false,
          error: e?.message || "Wing 판매순위 수집 중단 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getWingSalesRankCheckStatus") {
    const statusKey = coupangEnvironment.stateKey(RANK_CHECK_STATUS_KEY, environmentId);
    const cancelKey = coupangEnvironment.stateKey(RANK_CHECK_CANCEL_KEY, environmentId);
    chrome.storage.local.get(
      [statusKey, cancelKey],
      (data) => {
        const status = data[statusKey] || { status: "idle" };
        const cancellation = data[cancelKey];
        const runId = typeof msg.runId === "string" ? msg.runId : null;
        if (runId && status.runId && status.runId !== runId) {
          sendResponse({ status: "idle", runId, staleRunId: status.runId });
          return;
        }
        sendResponse({
          ...status,
          cancelRequested:
            !!cancellation?.cancelled &&
            (!cancellation.runId || cancellation.runId === status.runId),
        });
      },
    );
    return true;
  }

  if (msg.action === "runCoupangReviewCollection") {
    KidItemCoupangReviewCollector.start(
      { months: msg.months, runId: msg.runId },
      coupangReviewCollectorDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "쿠팡 리뷰 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangReviewCollectionStatus") {
    KidItemCoupangReviewCollector.getStatus(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangReviewCollectorDependencies(environmentId).stateKey,
    )
      .then((status) => sendResponse(status))
      .catch(() => sendResponse({ status: "idle" }));
    return true;
  }

  if (msg.action === "cancelCoupangReviewCollection") {
    KidItemCoupangReviewCollector.cancel(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangReviewCollectorDependencies(environmentId).stateKey,
    )
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          cancelled: false,
          error: e?.message || "쿠팡 리뷰 수집 중단 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangRankCheckStatus") {
    const statusKey = coupangEnvironment.stateKey(KEYWORD_RANK_STATUS_KEY, environmentId);
    chrome.storage.local.get(statusKey, (data) => {
      const status = data[statusKey] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "registerWingThumbnail") {
    registerWingThumbnail(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 Wing 대표이미지 등록 실패",
        }),
      );
    return true;
  }

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    adsEnvironmentContext.setAccessToken(environmentId, token)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "clearAuthToken") {
    adsEnvironmentContext.clearAccessToken(environmentId)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "openAndExecuteAdActions") {
    openAndExecuteAdActions(AD_ACTION_URL, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "광고 액션 실행 탭 생성 실패",
        }),
      );
    return true;
  }

  // ── 상품 수정 자동화: Wing 탭 열고 content script에 작업 위임 ──
  if (msg.action === "openAndEditProduct") {
    const { productName } = msg;
    openAndEditProduct(productName)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "상품 수정 탭 생성 실패",
        }),
      );
    return true;
  }
});

function coupangCatalogImportDependencies(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return {
    authedFetch: (path, init) => authedFetch(environmentId, path, init),
    alarmName: coupangEnvironment.alarmName(
      "kiditem-coupang-catalog-import-step",
      environmentId,
    ),
    stateKey: coupangEnvironment.stateKey(
      "kiditem_coupang_catalog_import",
      environmentId,
    ),
    collectionWindow: catalogCollectionWindowFor(environmentId),
    collectionSessions,
    notifyDashboard: () => notifyDashboard(environmentId),
    sendTabMessage,
    waitForTabComplete,
  };
}

function coupangReviewCollectorDependencies(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return {
    authedFetch: (path, init) => authedFetch(environmentId, path, init),
    stateKey: coupangEnvironment.stateKey(
      KidItemCoupangReviewCollector.stateKey,
      environmentId,
    ),
    createTab,
    waitForTabComplete,
    removeTab,
  };
}

async function loadScheduledScrapeTargets(environmentId) {
  const response = await authedFetch(environmentId, `/api/ads/scrape-targets`);
  if (!response.ok) {
    throw new Error(`수집 대상 조회 실패 (${response.status})`);
  }
  const json = await response.json();
  const targets = collectionRuns.validateScrapeTargets(json?.targets || []);
  if (!targets) throw new Error("현재 수집 대상이 없습니다");
  return targets;
}

// 단일 상품 직접 등록: formV2 탭을 열고 content script(wing-registration-fill)에 채움 데이터 전송.
// ⚠️ 제출은 하지 않는다 — content script 가 채우기만 하고 사용자가 확인 후 등록.
function waitForTabComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve(false);
        if (tab.status === "complete") return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 400);
      });
    };
    check();
  });
}

async function registerToWingForm(message) {
  const product = message && message.product;
  if (!product || typeof product !== "object") {
    return { ok: false, error: "product 데이터가 없습니다." };
  }
  // 폼 채움만 하는 기본 경로에는 아직 provider side effect 가 없다. 실행 ID는
  // 실제 제출을 자동화하는 경우에만 필수다.
  const autoSubmit = message.autoSubmit === true;
  const executionId = typeof message?.executionId === "string" ? message.executionId.trim() : "";
  const expectedVendorId = typeof message?.expectedVendorId === "string" ? message.expectedVendorId.trim() : "";
  if (autoSubmit && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(executionId)) {
    return { ok: false, error: "등록 실행 ID가 올바르지 않습니다." };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(expectedVendorId)) {
    return { ok: false, error: "승인된 WING 판매자 식별자가 올바르지 않습니다." };
  }
  // ⚠️ 웹의 등록 확인 모달에서 "상품등록까지 자동 실행"을 켠 경우에만 true 가 실려 온다.
  //    엄격한 === true 비교로만 켠다. 값이 없거나 truthy 한 다른 값이면 제출하지 않는다.
  const url =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
  const tab = await interactiveTabs.createTab({
    url: "about:blank",
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  // 정적 document_start content script도 Wing 번들과 경합할 수 있다. 빈 탭에
  // 새 문서 초기화 스크립트를 먼저 등록한 뒤 Wing으로 이동해 provider 코드보다
  // 앞에서 전역 lodash 누락 기능을 보완한다. 이후 폼 채움 흐름은 기존과 동일하다.
  const preparedNavigation = await wingFormRuntimeCompat.prepareNavigation(
    tab.id,
    url,
  );
  if (!preparedNavigation.ok) {
    return {
      ok: false,
      tabId: tab.id,
      error: `WING 상품등록 화면을 열지 못했습니다. ${preparedNavigation.error}`,
    };
  }
  const loaded = await waitForTabComplete(tab.id, 60000);
  if (!loaded) {
    return {
      ok: false,
      tabId: tab.id,
      error: "WING 상품등록 화면 로딩 시간이 초과되었습니다.",
    };
  }
  // Wing formV2의 현재 배포 코드가 lodash import 없이 전역 `_.isEmpty`를
  // 호출해 옵션 Vue 컴포넌트 렌더를 중단한다. 번들 버전이 아니라 필요한
  // 런타임 capability만 MAIN world에서 확인·보완한다. Coupang이 고치면 no-op이다.
  const runtimeCompatibility = await wingFormRuntimeCompat.ensure(tab.id);
  if (!runtimeCompatibility.ok) {
    return {
      ok: false,
      tabId: tab.id,
      error: `WING 상품등록 화면을 준비하지 못했습니다. ${runtimeCompatibility.error}`,
    };
  }
  const readiness = await wingFormReadiness.wait(tab.id, url);
  if (!readiness.ok) {
    return {
      ok: false,
      tabId: tab.id,
      failure: readiness,
      error: readiness.code === "wing_form_content_not_ready"
        ? "WING 상품등록 확장 스크립트가 준비되지 않았습니다. 확장을 리로드한 뒤 다시 시도하세요."
        : "WING 상품등록 화면 준비 상태를 확인하지 못했습니다.",
    };
  }
  const formSessionId = globalThis.crypto?.randomUUID?.()
    || `wing-form-${tab.id}-${Date.now()}`;
  try {
    const fill = await chrome.tabs.sendMessage(tab.id, {
      action: "fillWingForm",
      formSessionId,
      product,
      autoSubmit,
      executionId,
      expectedVendorId,
    });
    // 채움이 실패했으면 성공으로 보고하지 않는다. 예전에는 ok:true 로 덮어써서
    // "폼은 열렸는데 아무것도 안 채워졌고 에러도 없는" 상태가 됐다.
    if (!fill?.ok) {
      return {
        ok: false,
        tabId: tab.id,
        fill,
        error: fill?.error || "WING 폼 자동 채우기에 실패했습니다. 열린 탭에서 직접 입력해 주세요.",
      };
    }
    // 제출까지 요청받았으면 제출 결과를 그대로 올려보낸다. 성공을 확증하지 못한 경우
    // (status:'unknown') 웹이 등록상품으로 올리지 않도록 submission 을 그대로 전달한다.
    return {
      ok: true,
      tabId: tab.id,
      fill,
      submission: fill.submission || { attempted: false },
      evidence: fill.evidence,
    };
  } catch (e) {
    return {
      ok: false,
      tabId: tab.id,
      error: `${e?.message || "content script 미응답"} — 확장을 리로드(chrome://extensions)한 뒤 다시 시도하세요.`,
    };
  }
}

/**
 * 등록상품 1건을 WING 에서 삭제한다. ⚠️ 되돌릴 수 없다.
 *
 * 웹은 **서버가 인가한** externalId 만 넘긴다(사용자가 화면에서 고른 값이 아니다).
 * 여기서는 그 ID 로 검색된 목록 화면을 열어 content script 에 넘기기만 한다.
 * 대상이 정확히 1건이 아니면 content script 가 아무것도 하지 않고 실패로 돌려준다.
 */
async function deleteWingProduct(message) {
  const listingId = typeof message?.listingId === "string" ? message.listingId.trim() : "";
  const operationId = typeof message?.operationId === "string" ? message.operationId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) {
    return { ok: false, error: "삭제 대상 리스팅 ID가 올바르지 않습니다." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    return { ok: false, error: "삭제 작업 ID가 올바르지 않습니다." };
  }
  // External messages are untrusted: freeze every provider fact through an
  // authenticated, one-time server claim before opening or clicking WING.
  const claimResponse = await authedFetch(
    message.environmentId,
    `/api/channels/listings/${encodeURIComponent(listingId)}/deletion-operations/${encodeURIComponent(operationId)}/extension-claim`,
    { method: "POST" },
  );
  if (!claimResponse.ok) {
    return { ok: false, error: `삭제 실행 권한을 확인하지 못했습니다 (${claimResponse.status}).` };
  }
  const claim = await claimResponse.json();
  const externalId = typeof claim?.externalId === "string" ? claim.externalId.trim() : "";
  const expectedVendorId = typeof claim?.expectedVendorId === "string" ? claim.expectedVendorId.trim() : "";
  const executionCapability = typeof claim?.executionCapability === "string" ? claim.executionCapability.trim() : "";
  if (!/^\d{6,20}$/.test(externalId) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(expectedVendorId)
    || !/^[0-9a-f-]{36}$/i.test(executionCapability)) {
    return { ok: false, error: "서버 삭제 실행 권한이 완전하지 않습니다." };
  }
  // 검색어를 URL 에 실어 대상 1건만 남은 목록을 연다. 전체 목록에서 찾게 하면
  // 페이지네이션 때문에 행을 못 찾거나 동명이인 행이 섞인다.
  const url =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/list" +
    `?searchType=VENDOR_INVENTORY_ID&keyword=${encodeURIComponent(externalId)}`;
  const tab = await interactiveTabs.createTab({
    url,
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  await coupangEnvironment.bindTab(tab.id, message.environmentId);
  await waitForTabComplete(tab.id, 60000);
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "deleteWingProduct",
      operationId,
      externalId,
      displayName: claim.displayName || null,
      expectedVendorId,
    });
    if (!result?.ok) {
      return {
        ok: false,
        tabId: tab.id,
        result,
        error: result?.error || "WING 상품 삭제에 실패했습니다. 열린 탭에서 직접 확인하세요.",
      };
    }
    // A DOM observation is not server-verifiable provider evidence. The web
    // caller records reconciling/uncertain; only independent provider API or
    // catalog reconciliation may deactivate the local listing.
    return { ok: true, tabId: tab.id, providerDeletionObserved: true };
  } catch (e) {
    return {
      ok: false,
      tabId: tab.id,
      error: `${e?.message || "content script 미응답"} — 확장을 리로드(chrome://extensions)한 뒤 다시 시도하세요.`,
    };
  }
}

async function searchWingCatalogProducts(message) {
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

  const maxPages = clampNumber(message.maxPages, 1, WING_CATALOG_MAX_PAGES, 2);
  const ownsSession = typeof message.collectionRunId !== "string";
  const runId = ownsSession
      ? await collectionRuns.beginWebCollection(
        "sourcing.wing_catalog",
        {
          collectionMode: "single_catalog",
          keywordFingerprint: stableInputFingerprint(keyword),
          keywordCount: 1,
          maxPages,
          startedAt: Date.now(),
        },
        message.runId,
        ["collectionMode", "keywordFingerprint"],
        message.environmentId,
      )
    : message.collectionRunId;
  const tab = Number.isInteger(message.collectionTabId)
    ? (await getTab(message.collectionTabId).catch(() => null)) ??
      (await getOrCreateWingCatalogTab())
    : await getOrCreateWingCatalogTab();
  const tabId = tab?.id;
  if (!tabId) {
    if (ownsSession) await collectionSessions.fail(runId);
    return { success: false, error: "Wing 카탈로그 검색 탭을 열 수 없습니다" };
  }
  if (typeof coupangEnvironment !== "undefined") {
    await coupangEnvironment.bindTab(tabId, message.environmentId);
  }
  await collectionRuns.attachTab(runId, tab);
  const cancelledResult = {
    success: false,
    cancelled: true,
    tabId,
    runId,
  };
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;

  const loaded = await waitForTabComplete(tabId, {
    expectedUrl: WING_CATALOG_FORM_URL,
    timeoutMs: 60000,
  }).catch((error) => ({
    error: error?.message || "Wing 상품등록 화면 로딩 실패",
  }));
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  if (loaded?.error) {
    if (ownsSession) await collectionSessions.fail(runId);
    if (ownsSession) await removeTab(tabId);
    return { success: false, error: loaded.error, tabId, runId };
  }
  if (!isWingCatalogFormUrl(loaded?.url || "")) {
    return collectionRuns.requireAttention(
      runId,
      tabId,
      "marketplace_login",
      "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
    );
  }

  const startedAt = Date.now();
  const pages = [];
  const rows = [];
  const seen = new Set();
  const warnings = [];
  let searchPage = 0;
  let stopReason = "max_pages_reached";
  let upstreamTotal = null;

  for (let index = 0; index < maxPages; index++) {
    const payload = {
      keyword,
      excludedProductIds: [],
      searchPage,
      searchOrder: "DEFAULT",
      sortType: "DEFAULT",
    };
    let response;
    try {
      response = await executeWingCatalogSearchWithRetry(tabId, payload);
    } catch (error) {
      if (await collectionRuns.isCancelled(runId)) return cancelledResult;
      if (ownsSession) {
        await collectionSessions.fail(runId);
      }
      await removeTab(tabId);
      throw error;
    }
    if (await collectionRuns.isCancelled(runId)) return cancelledResult;

    if (response?.errorCode === "wing_xsrf_token_missing") {
      if (rows.length === 0) {
        return collectionRuns.requireAttention(
          runId,
          tabId,
          "marketplace_login",
          response.error,
        );
      }
      warnings.push(`${searchPage}페이지: ${response.error}`);
      stopReason = "authentication_token_missing";
      break;
    }

    if (
      !response?.ok ||
      response.contentType?.includes("application/json") !== true
    ) {
      const messageText =
        response?.status === 429
          ? "Wing 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요."
          : "Wing이 JSON 대신 다른 응답을 반환했습니다.";
      if (rows.length === 0) {
        const retryExhausted =
          response?.status === 429 || response?.status >= 500;
        return collectionRuns.requireAttention(
          runId,
          tabId,
          retryExhausted ? "rate_limited" : "marketplace_login",
          retryExhausted
            ? messageText
            : "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
      }
      warnings.push(`${searchPage}페이지: ${messageText}`);
      stopReason = "non_json_response";
      break;
    }

    const body = response.body || {};
    const result = Array.isArray(body.result) ? body.result : [];
    upstreamTotal = upstreamTotal ?? resolveWingCatalogTotal(body);
    pages.push({
      searchPage,
      itemCount: result.length,
      nextSearchPage: body.nextSearchPage ?? null,
      total: resolveWingCatalogTotal(body),
    });

    for (const product of result) {
      const normalized = normalizeWingCatalogProduct(product);
      if (!normalized) continue;
      const key = `${normalized.productId || ""}:${normalized.itemId || ""}:${normalized.vendorItemId || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(normalized);
    }

    if (result.length === 0) {
      stopReason = "empty_page";
      break;
    }
    if (body.nextSearchPage == null) {
      stopReason = "no_next_search_page";
      break;
    }
    if (body.nextSearchPage === searchPage) {
      stopReason = "next_page_not_advancing";
      break;
    }
    searchPage = body.nextSearchPage;
    if (index < maxPages - 1) await sleep(WING_CATALOG_PAGE_DELAY_MS);
  }

  const reliableUpstreamTotal =
    upstreamTotal != null && upstreamTotal >= rows.length
      ? upstreamTotal
      : null;
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  const result = {
    success: true,
    opened: true,
    tabId,
    keyword,
    maxPages,
    stopReason,
    pages,
    rows,
    total: reliableUpstreamTotal ?? rows.length,
    collectedCount: rows.length,
    upstreamTotal: reliableUpstreamTotal,
    warnings,
    endpoint: WING_CATALOG_SEARCH_ENDPOINT,
    dateWindow: "last28d",
    startedAt,
    endedAt: Date.now(),
  };
  if (ownsSession) await collectionSessions.succeed(runId);
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  if (ownsSession) await removeTab(tabId);
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  return { ...result, runId };
}

async function searchCoupangKeywordSuggestions(message) {
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

  const maxResults = clampNumber(message.maxResults, 1, 50, 20);
  const runId = await collectionRuns.beginWebCollection(
    "advertising.keyword_rank",
    {
      collectionMode: "suggestions",
      keywordFingerprint: stableInputFingerprint(keyword),
      keywordCount: 1,
      maxResults,
      startedAt: Date.now(),
    },
    message.runId,
    ["collectionMode", "keywordFingerprint"],
    message.environmentId,
  );
  const tab = await getOrCreateCoupangSearchTab(keyword);
  const tabId = tab?.id;
  if (!tabId) {
    await collectionSessions.fail(runId);
    return { success: false, error: "쿠팡 검색 탭을 열 수 없습니다", runId };
  }
  if (typeof coupangEnvironment !== "undefined") {
    await coupangEnvironment.bindTab(tabId, message.environmentId);
  }
  await collectionRuns.attachTab(runId, tab);
  const cancelledResult = {
    success: false,
    cancelled: true,
    tabId,
    runId,
  };
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;

  const loaded = await waitForTabComplete(tabId, {
    expectedUrl: buildCoupangSearchUrl(keyword),
    timeoutMs: 60000,
  }).catch((error) => ({
    error: error?.message || "쿠팡 검색 화면 로딩 실패",
  }));
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  if (loaded?.error) {
    await collectionSessions.fail(runId);
    await removeTab(tabId);
    return { success: false, error: loaded.error, tabId, runId };
  }
  if (!isCoupangSearchUrl(loaded?.url || "")) {
    return collectionRuns.requireAttention(
      runId,
      tabId,
      "marketplace_login",
      "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
    );
  }

  await sleep(COUPANG_KEYWORD_SEARCH_DELAY_MS);
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  let response;
  try {
    response = await executeCoupangKeywordSuggestionSearch(
      tabId,
      keyword,
      maxResults,
    );
  } catch (error) {
    if (await collectionRuns.isCancelled(runId)) return cancelledResult;
    await collectionSessions.fail(runId);
    await removeTab(tabId);
    throw error;
  }
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  if (!response?.success) {
    return collectionRuns.requireAttention(
      runId,
      tabId,
      response?.status === 429 ? "rate_limited" : "marketplace_login",
      response?.error || "쿠팡 인기 키워드 수집을 계속하려면 확인이 필요합니다.",
    );
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
  const terminal = await collectionSessions.succeed(runId);
  if (
    terminal?.status === "cancelled" ||
    (await collectionRuns.isCancelled(runId))
  ) {
    return cancelledResult;
  }
  await removeTab(tabId);
  if (await collectionRuns.isCancelled(runId)) return cancelledResult;
  return { ...result, runId };
}

async function getOrCreateCoupangSearchTab(keyword) {
  const url = buildCoupangSearchUrl(keyword);
  const tab = await createTab({ url, active: false });
  if (!tab?.id) return tab;
  return waitForTabComplete(tab.id, {
    expectedUrl: url,
    timeoutMs: 60000,
  }).catch(() => tab);
}

async function executeCoupangKeywordSuggestionSearch(
  tabId,
  keyword,
  maxResults,
) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (requestKeyword, requestMaxResults, autocompleteEndpoint) => {
      const warnings = [];
      const candidates = [];
      const productNames = [];

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

      function collectFromDom() {
        const selectors = [
          'a[href*="/np/search"]',
          'a[href*="q="]',
          '[class*="related"] a',
          '[class*="suggest"] a',
          '[class*="keyword"] a',
        ];
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
      }

      function collectProductNamesFromDom() {
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
        const text = await response.text();
        if (!response.ok) {
          warnings.push(`쿠팡 자동완성 호출 실패 (${response.status})`);
        } else if (contentType.includes("application/json")) {
          try {
            collectFromJson(JSON.parse(text), "coupang-autocomplete");
          } catch {
            warnings.push("쿠팡 자동완성 JSON 파싱 실패");
          }
        } else {
          collectFromJson(text, "coupang-autocomplete");
        }
      } catch (error) {
        warnings.push(error?.message || "쿠팡 자동완성 호출 실패");
      }

      collectFromDom();
      collectProductNamesFromDom();

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
        source: items.some((item) => item.source === "coupang-autocomplete")
          ? "coupang-autocomplete"
          : "coupang-search-dom",
        items,
        productNameTokens,
        warnings,
      };
    },
    args: [keyword, maxResults, COUPANG_AUTOCOMPLETE_ENDPOINT],
  });
  return result?.result || null;
}

// ═══ Wing 상품분석 최근 28일 판매량순 × 자사 카탈로그 전체 ═══

async function startWingSalesRankCheck(options = {}) {
  const environmentId = options.environmentId;
  if (typeof adsEnvironmentContext !== "undefined") {
    adsEnvironmentContext.requireEnvironment(environmentId);
  }
  const rankStatusKey = typeof coupangEnvironment === "undefined"
    ? RANK_CHECK_STATUS_KEY
    : coupangEnvironment.stateKey(RANK_CHECK_STATUS_KEY, environmentId);
  const rankCancelKey = typeof coupangEnvironment === "undefined"
    ? RANK_CHECK_CANCEL_KEY
    : coupangEnvironment.stateKey(RANK_CHECK_CANCEL_KEY, environmentId);
  const now = Date.now();
  let runId = options.runId || collectionRuns.createRunId();
  let startedAt = now;
  const existingData = await getStorage(rankStatusKey);
  const existing = existingData[rankStatusKey];
  const existingIsActive =
    existing &&
    (existing.status === "running" || existing.status === "starting");
  const requestedSession =
    typeof options.runId === "string"
      ? await collectionSessions.get(options.runId)
      : null;
  const canRestartExisting = canRestartStoredDomainRun(
    existing,
    options.runId,
    requestedSession,
  );
  const lastHeartbeatAt = existing?.heartbeatAt || existing?.startedAt || 0;
  if (
    !options.forceRestart &&
    !canRestartExisting &&
    existingIsActive &&
    now - lastHeartbeatAt < WING_RANK_STALE_AFTER_MS
  ) {
    return {
      success: false,
      started: false,
      error: "이미 Wing 판매순위 확인이 진행 중입니다",
      runId: existing.runId || null,
    };
  }
  if (
    !options.forceRestart &&
    !canRestartExisting &&
    existingIsActive &&
    (await isWingSalesRankCancelled(existing.runId, environmentId))
  ) {
    await chrome.storage.local.remove(rankCancelKey);
    await chrome.storage.local.set({
      [rankStatusKey]: {
        ...existing,
        status: "cancelled",
        cancelled: true,
        cancelRequested: false,
        endedAt: Date.now(),
      },
    });
    return {
      success: true,
      started: false,
      cancelled: true,
      runId: existing.runId || null,
    };
  }
  await chrome.storage.local.remove(rankCancelKey);
  if (existingIsActive && !options.forceRestart && canRestartExisting) {
    runId = existing.runId || runId;
    startedAt = existing.startedAt || startedAt;
  }

  if (!options.sessionStarted) {
    if (options.restartStrategy === "extension") {
      await collectionSessions.start({
        runId,
        environmentId,
        producer: "advertising.wing_rank",
        classification: "background_preferred",
        restartStrategy: "extension",
        inputIdentity: { startedAt, scheduled: true },
      });
    } else {
      runId = await collectionRuns.beginWebCollection(
        "advertising.wing_rank",
        { collectionMode: "batch", startedAt, scheduled: false },
        options.runId,
        ["collectionMode"],
        environmentId,
      );
    }
  }

  const cancelledResult = {
    success: false,
    started: false,
    cancelled: true,
    runId,
  };
  const stopIfCancelled = async () => {
    if (!(await isWingSalesRankCancelled(runId, environmentId))) return false;
    await markStoredCollectionCancelled(rankStatusKey, runId);
    return true;
  };
  if (await stopIfCancelled()) return cancelledResult;

  let targetResponse;
  try {
    const response = await authedFetch(environmentId, `/api/ads/keyword-rank/wing-targets`);
    if (!response.ok)
      throw new Error(`자사 상품 대표 키워드 조회 실패 (${response.status})`);
    targetResponse = await response.json();
  } catch (error) {
    if (await stopIfCancelled()) return cancelledResult;
    const errorMessage = error?.message || "자사 상품 대표 키워드 조회 실패";
    await chrome.storage.local.set({
      [rankStatusKey]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "error",
        error: errorMessage,
        startedAt,
        endedAt: Date.now(),
      },
    });
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.fail(runId);
    return { success: false, started: false, error: errorMessage, runId };
  }

  if (await stopIfCancelled()) return cancelledResult;

  const targets = Array.isArray(targetResponse?.targets)
    ? targetResponse.targets.filter(
        (target) =>
          target && typeof target.keyword === "string" && target.keyword.trim(),
      )
    : [];
  const productTotal = Number(targetResponse?.productCount) || 0;
  const pendingProductTotal =
    Number(targetResponse?.pendingProductCount) || productTotal;
  const resumed = existingIsActive || targetResponse?.resumed === true;
  if (targets.length === 0) {
    if (await stopIfCancelled()) return cancelledResult;
    await chrome.storage.local.set({
      [rankStatusKey]: {
        runId,
        total: 0,
        productTotal,
        pendingProductTotal: 0,
        completed: 0,
        failed: 0,
        status: "done",
        startedAt,
        heartbeatAt: Date.now(),
        endedAt: Date.now(),
      },
    });
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.succeed(runId);
    return { success: true, started: false, total: 0, productTotal, runId };
  }

  if (await stopIfCancelled()) return cancelledResult;
  await chrome.storage.local.set({
    [rankStatusKey]: {
      runId,
      total: targets.length,
      productTotal,
      pendingProductTotal,
      completed: 0,
      failed: 0,
      current: null,
      status: "starting",
      startedAt,
      heartbeatAt: Date.now(),
      resumed,
    },
  });
  if (await stopIfCancelled()) return cancelledResult;
  await collectionSessions.progress(runId, {
    current: 0,
    total: targets.length,
    completed: 0,
    failed: 0,
    label: null,
  });
  if (await stopIfCancelled()) return cancelledResult;
  runWingSalesRankBatch(targets, productTotal, runId, startedAt, environmentId).catch(
    (error) => {
      chrome.storage.local.set({
        [rankStatusKey]: {
          runId,
          total: targets.length,
          productTotal,
          status: "error",
          error: error?.message || String(error),
          startedAt,
          heartbeatAt: Date.now(),
          endedAt: Date.now(),
        },
      });
      collectionSessions.fail(runId).catch(() => {});
    },
  );
  return {
    success: true,
    started: true,
    total: targets.length,
    productTotal,
    pendingProductTotal,
    resumed,
    runId,
  };
}

async function runWingSalesRankBatch(
  targets,
  productTotal,
  runId,
  startedAt,
  environmentId,
) {
  const rankStatusKey = typeof coupangEnvironment === "undefined"
    ? RANK_CHECK_STATUS_KEY
    : coupangEnvironment.stateKey(RANK_CHECK_STATUS_KEY, environmentId);
  const rankCancelKey = typeof coupangEnvironment === "undefined"
    ? RANK_CHECK_CANCEL_KEY
    : coupangEnvironment.stateKey(RANK_CHECK_CANCEL_KEY, environmentId);
  const total = targets.length;
  let completed = 0;
  let failed = 0;
  let rankedProducts = 0;
  let cancelled = false;
  let attentionRequired = false;
  let tabId = null;
  const failures = [];
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);

  try {
    for (let index = 0; index < targets.length; index++) {
      if (await isWingSalesRankCancelled(runId)) {
        cancelled = true;
        break;
      }
      const target = targets[index];
      const keyword = String(target.keyword || "").trim();
      const maxPages = clampNumber(
        target.maxPages,
        1,
        WING_CATALOG_MAX_PAGES,
        5,
      );
      await chrome.storage.local.set({
        [rankStatusKey]: {
          runId,
          total,
          productTotal,
          completed,
          failed,
          rankedProducts,
          current: keyword,
          currentProducts: Number(target.productCount) || 0,
          currentIndex: index + 1,
          status: "running",
          startedAt,
          heartbeatAt: Date.now(),
        },
      });
      await collectionSessions.progress(runId, {
        current: index + 1,
        total,
        completed,
        failed,
        label: keyword,
      });

      let completedTarget = false;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const search = await searchWingCatalogProducts({
            keyword,
            maxPages,
            collectionRunId: runId,
            collectionTabId: tabId,
            environmentId,
          });
          if (search?.tabId) tabId = search.tabId;
          if (await isWingSalesRankCancelled(runId)) {
            cancelled = true;
            break;
          }
          if (search?.attentionRequired) {
            attentionRequired = true;
            break;
          }
          if (!search?.success)
            throw new Error(search?.error || "Wing 상품분석 조회 실패");
          const sortedItems = sortWingCatalogRowsBySales(search.rows || []);
          const targetIds = new Set(
            Array.isArray(target.vendorItemIds)
              ? target.vendorItemIds.map(String)
              : [],
          );
          const matchedCount = sortedItems.filter(
            (item) =>
              item.vendorItemId && targetIds.has(String(item.vendorItemId)),
          ).length;
          if (await isWingSalesRankCancelled(runId)) {
            cancelled = true;
            break;
          }
          const sync = await postWingSalesRankSync({
            keyword,
            pagesScanned: Array.isArray(search.pages)
              ? search.pages.length
              : maxPages,
            collectedCount: Number(search.collectedCount) || sortedItems.length,
            totalResults: Number.isFinite(Number(search.upstreamTotal))
              ? Number(search.upstreamTotal)
              : null,
            items: sortedItems,
          }, environmentId);
          if (await isWingSalesRankCancelled(runId)) {
            cancelled = true;
            break;
          }
          if (!sync?.success)
            throw new Error(sync?.error || "Wing 판매순위 저장 실패");
          rankedProducts += matchedCount;
          completed++;
          completedTarget = true;
          break;
        } catch (error) {
          if (await isWingSalesRankCancelled(runId)) {
            cancelled = true;
            break;
          }
          lastError = error;
          if (attempt < 2) await sleep(randomDelayMs(5000, 9000));
        }
      }
      if (attentionRequired || cancelled) break;
      if (!completedTarget) {
        failed++;
        failures.push({
          keyword,
          error: lastError?.message || String(lastError),
        });
        console.error(
          `[KIDITEM] Wing 판매순위 확인 실패 (${keyword}):`,
          lastError?.message || lastError,
        );
      }

      if (await isWingSalesRankCancelled(runId)) {
        cancelled = true;
        break;
      }
      if (index < targets.length - 1) await sleep(randomDelayMs(1200, 2500));
      await chrome.storage.local.set({
        [rankStatusKey]: {
          runId,
          total,
          productTotal,
          completed,
          failed,
          rankedProducts,
          current: keyword,
          currentProducts: Number(target.productCount) || 0,
          currentIndex: index + 1,
          status: "running",
          startedAt,
          heartbeatAt: Date.now(),
        },
      });
    }
  } finally {
    clearInterval(keepAlive);
    if (tabId && !attentionRequired) await removeTab(tabId);
  }

  if (await isWingSalesRankCancelled(runId)) cancelled = true;
  await chrome.storage.local.remove(rankCancelKey);
  await chrome.storage.local.set({
    [rankStatusKey]: {
      runId,
      total,
      productTotal,
      completed,
      failed,
      rankedProducts,
      failures,
      current: null,
      status: cancelled
        ? "cancelled"
        : attentionRequired
          ? "attention_required"
          : failed > 0
            ? "error"
            : "done",
      startedAt,
      heartbeatAt: Date.now(),
      endedAt: Date.now(),
      cancelled,
    },
  });
  if (await isWingSalesRankCancelled(runId)) {
    cancelled = true;
    await markStoredCollectionCancelled(rankStatusKey, runId);
  }
  if (cancelled) {
    await collectionSessions.cancel(runId, { closeManagedTab: true });
  }
  else if (!attentionRequired && failed > 0) await collectionSessions.fail(runId);
  else if (!attentionRequired) await collectionSessions.succeed(runId);
  if (await isWingSalesRankCancelled(runId)) {
    cancelled = true;
    await markStoredCollectionCancelled(rankStatusKey, runId);
  }
  notifyDashboard(environmentId);
  return {
    success: !cancelled && !attentionRequired && failed === 0,
    completed,
    failed,
    total,
    productTotal,
    rankedProducts,
    runId,
    cancelled,
    attentionRequired,
  };
}

async function isWingSalesRankCancelled(runId, environmentId = null) {
  if (await collectionRuns.isCancelled(runId)) return true;
  const ownerEnvironmentId = environmentId || (await collectionSessions.get(runId))?.environmentId;
  const cancelKey = coupangEnvironment.stateKey(RANK_CHECK_CANCEL_KEY, ownerEnvironmentId);
  const data = await getStorage(cancelKey);
  const cancel = data[cancelKey];
  return !!cancel?.cancelled && (!cancel.runId || cancel.runId === runId);
}

async function requestWingSalesRankCancellation(runId = null, environmentId = null) {
  if (!runId) {
    return {
      success: false,
      cancelled: false,
      error: "Wing 판매순위 실행 ID가 필요합니다",
    };
  }
  const ownerEnvironmentId = environmentId || (await collectionSessions.get(runId))?.environmentId;
  const cancelKey = coupangEnvironment.stateKey(RANK_CHECK_CANCEL_KEY, ownerEnvironmentId);
  const statusKey = coupangEnvironment.stateKey(RANK_CHECK_STATUS_KEY, ownerEnvironmentId);
  await chrome.storage.local.set({
    [cancelKey]: {
      cancelled: true,
      runId,
      requestedAt: Date.now(),
    },
  });
  const data = await getStorage(statusKey);
  const status = data[statusKey] || { status: "idle" };
  if (runId && status.runId && status.runId !== runId) {
    await chrome.storage.local.remove(cancelKey);
    return { success: true, cancelled: false, staleRunId: status.runId };
  }
  if (status.status !== "running" && status.status !== "starting") {
    await chrome.storage.local.remove(cancelKey);
    return markStoredCollectionCancelled(statusKey, runId);
  }

  const activeRunId = status.runId || runId;
  return { success: true, cancelled: true, runId: activeRunId };
}

async function requestCoupangKeywordRankCancellation(runId, environmentId = null) {
  const ownerEnvironmentId = environmentId || (await collectionSessions.get(runId))?.environmentId;
  return markStoredCollectionCancelled(
    coupangEnvironment.stateKey(KEYWORD_RANK_STATUS_KEY, ownerEnvironmentId),
    runId,
  );
}

async function requestCoupangCompetitorCatalogCancellation(runId, environmentId = null) {
  const ownerEnvironmentId = environmentId || (await collectionSessions.get(runId))?.environmentId;
  return markStoredCollectionCancelled(
    coupangEnvironment.stateKey(COMPETITOR_SELLER_CATALOG_STATUS_KEY, ownerEnvironmentId),
    runId,
  );
}

async function markStoredCollectionCancelled(statusKey, runId) {
  const status = (await getStorage(statusKey))[statusKey];
  if (status?.runId && status.runId !== runId) {
    return { success: true, cancelled: false, runId };
  }
  await chrome.storage.local.set({
    [statusKey]: {
      ...(status || {}),
      runId,
      current: null,
      status: "cancelled",
      cancelled: true,
      endedAt: Date.now(),
    },
  });
  return { success: true, cancelled: true, runId };
}

function sortWingCatalogRowsBySales(rows) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort(
      (a, b) =>
        (Number(b?.salesLast28d) || 0) - (Number(a?.salesLast28d) || 0) ||
        (Number(b?.estimatedRevenue28d) || 0) -
          (Number(a?.estimatedRevenue28d) || 0) ||
        String(a?.productId || "").localeCompare(String(b?.productId || "")),
    )
    .map((item, index) => ({ ...item, salesRank: index + 1 }));
}

async function postWingSalesRankSync(capture, environmentId) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(environmentId, `/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "wing_sales_rank",
      source: "wing-pre-matching",
      timestamp: capturedAt,
      data: [{ ...capture, capturedAt }],
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      [coupangEnvironment.stateKey("kiditem_last_sync_wing_sales_rank", environmentId)]: { time: Date.now(), count: 1 },
    });
    notifyDashboard(environmentId);
  }
  return (
    json || {
      success: false,
      error: `sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function runScheduledWingSalesRankCheck(environmentId) {
  const token = await getAuthToken(environmentId);
  if (!token) return;
  try {
    await startWingSalesRankCheck({ restartStrategy: "extension", environmentId });
  } catch (error) {
    console.error(
      "[KIDITEM] Wing 판매순위 자동 확인 실패:",
      error?.message || error,
    );
  }
}

async function resumeInterruptedWingSalesRankCheck(environmentId) {
  const token = await getAuthToken(environmentId);
  if (!token) return;
  const statusKey = coupangEnvironment.stateKey(RANK_CHECK_STATUS_KEY, environmentId);
  const data = await getStorage(statusKey);
  const status = data[statusKey];
  if (!status || (status.status !== "running" && status.status !== "starting"))
    return;
  const lastHeartbeatAt = status.heartbeatAt || status.startedAt || 0;
  if (Date.now() - lastHeartbeatAt < WING_RANK_STALE_AFTER_MS) return;
  try {
    await collectionRuns.restart(status.runId, environmentId);
  } catch (error) {
    console.error(
      "[KIDITEM] 중단된 Wing 판매순위 재개 실패:",
      error?.message || error,
    );
  }
}

// ═══ 레거시 공개 쿠팡 검색 노출순위 (수동 호환용) ═══
// 공개 검색 페이지(www.coupang.com/np/search)를 열어 상품 목록을 DOM 순서대로 수집하고
// /api/ads/extension/sync 로 keyword_rank 페이로드를 전송한다. 순위 매칭/저장은 서버가 담당.

async function checkCoupangKeywordRank(message) {
  const environmentId = message.environmentId;
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };
  const maxPages = clampNumber(message.maxPages, 1, COUPANG_RANK_MAX_PAGES, 2);
  const runId = await collectionRuns.beginWebCollection(
    "advertising.keyword_rank",
    {
      collectionMode: "single_serp",
      keywordFingerprint: stableInputFingerprint(keyword),
      keywordCount: 1,
      maxPages,
      startedAt: Date.now(),
    },
    message.runId,
    ["collectionMode", "keywordFingerprint"],
    environmentId,
  );

  const capture = await captureCoupangKeywordSerp(keyword, maxPages, { runId, environmentId });
  if (await collectionRuns.isCancelled(runId)) {
    return { success: false, cancelled: true, runId, keyword };
  }
  if (!capture.success) {
    if (capture.tabId) {
      return collectionRuns.requireAttention(
        runId,
        capture.tabId,
        capture.wall === "captcha" ? "captcha" : "marketplace_login",
        capture.error ||
          "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어주세요.",
      );
    }
    await collectionSessions.fail(runId);
    if (capture.tabId) await removeTab(capture.tabId);
    return {
      success: false,
      runId,
      keyword,
      error: capture.error || "쿠팡 키워드 순위 수집 실패",
      wall: capture.wall || null,
      tabId: capture.tabId || null,
    };
  }

  let posted = false;
  let sync = null;
  if (message.post !== false) {
    const token = await getAuthToken(environmentId);
    if (token) {
      if (await collectionRuns.isCancelled(runId)) {
        return { success: false, cancelled: true, runId, keyword };
      }
      sync = await postKeywordRankSync(capture, environmentId).catch((e) => ({
        success: false,
        error: e?.message || "순위 데이터 전송 실패",
      }));
      posted = !!sync?.success;
    }
  }

  if (await collectionRuns.isCancelled(runId)) {
    return { success: false, cancelled: true, runId, keyword };
  }
  const terminal = await collectionSessions.succeed(runId);
  if (
    terminal?.status === "cancelled" ||
    (await collectionRuns.isCancelled(runId))
  ) {
    return { success: false, cancelled: true, runId, keyword };
  }
  if (capture.tabId) await removeTab(capture.tabId);
  if (await collectionRuns.isCancelled(runId)) {
    return { success: false, cancelled: true, runId, keyword };
  }
  return {
    success: true,
    runId,
    keyword,
    pagesScanned: capture.pagesScanned,
    items: capture.items,
    total: capture.items.length,
    usedFallback: !!capture.usedFallback,
    posted,
    sync,
    tabId: capture.tabId || null,
  };
}

// 등록된 트래커 전체를 순차 확인. 즉시 응답 + fire-and-forget (scrapeTargets 패턴).
// 진행률은 chrome.storage.local[KEYWORD_RANK_STATUS_KEY] 에 기록(Wing 판매순위 배치와 별도 키).
async function startCoupangKeywordRankCheck(options = {}) {
  const environmentId = options.environmentId;
  if (typeof adsEnvironmentContext !== "undefined") {
    adsEnvironmentContext.requireEnvironment(environmentId);
  }
  const keywordStatusKey = typeof coupangEnvironment === "undefined"
    ? (typeof KEYWORD_RANK_STATUS_KEY === "undefined"
        ? "kiditem_keyword_rank_check"
        : KEYWORD_RANK_STATUS_KEY)
    : coupangEnvironment.stateKey(KEYWORD_RANK_STATUS_KEY, environmentId);
  let runId = options.runId || collectionRuns.createRunId();
  const startedAt = Date.now();

  const existingData = await getStorage(keywordStatusKey);
  const existing = existingData[keywordStatusKey];
  const requestedSession =
    typeof options.runId === "string"
      ? await collectionSessions.get(options.runId)
      : null;
  const canRestartExisting = canRestartStoredDomainRun(
    existing,
    options.runId,
    requestedSession,
  );
  if (
    existing &&
    !canRestartExisting &&
    (existing.status === "running" || existing.status === "starting") &&
    Date.now() - (existing.startedAt || 0) < 30 * 60 * 1000
  ) {
    return {
      success: false,
      started: false,
      error: "이미 키워드 순위 확인이 진행 중입니다",
      runId: existing.runId || null,
    };
  }

  if (!options.sessionStarted) {
    runId = await collectionRuns.beginWebCollection(
      "advertising.keyword_rank",
      { startedAt, collectionMode: "all_trackers" },
      options.runId,
      ["collectionMode"],
      environmentId,
    );
  }

  const cancelledResult = {
    success: false,
    started: false,
    cancelled: true,
    runId,
  };
  const stopIfCancelled = async () => {
    if (!(await collectionRuns.isCancelled(runId))) return false;
    await requestCoupangKeywordRankCancellation(runId, environmentId);
    return true;
  };
  if (await stopIfCancelled()) return cancelledResult;

  let trackers = [];
  try {
    const res = await authedFetch(environmentId, `/api/ads/keyword-rank/trackers`);
    if (!res.ok) throw new Error(`키워드 트래커 조회 실패 (${res.status})`);
    const json = await res.json();
    trackers = Array.isArray(json)
      ? json
      : Array.isArray(json?.trackers)
        ? json.trackers
        : Array.isArray(json?.data)
          ? json.data
          : [];
  } catch (error) {
    if (await stopIfCancelled()) return cancelledResult;
    const errorMessage = error?.message || "키워드 트래커 조회 실패";
    await chrome.storage.local.set({
      [keywordStatusKey]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "error",
        error: errorMessage,
        startedAt,
        endedAt: Date.now(),
      },
    });
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.fail(runId);
    return { success: false, started: false, error: errorMessage, runId };
  }

  if (await stopIfCancelled()) return cancelledResult;

  const enabled = trackers.filter(
    (tracker) =>
      tracker &&
      tracker.enabled !== false &&
      typeof tracker.keyword === "string" &&
      tracker.keyword.trim(),
  );
  if (enabled.length === 0) {
    if (await stopIfCancelled()) return cancelledResult;
    await chrome.storage.local.set({
      [keywordStatusKey]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "done",
        startedAt,
        endedAt: Date.now(),
      },
    });
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.succeed(runId);
    return { success: true, started: false, total: 0, runId };
  }

  if (await stopIfCancelled()) return cancelledResult;
  await chrome.storage.local.set({
    [keywordStatusKey]: {
      runId,
      total: enabled.length,
      completed: 0,
      failed: 0,
      current: null,
      status: "starting",
      startedAt,
    },
  });
  if (await stopIfCancelled()) return cancelledResult;
  await collectionSessions.progress(runId, {
    current: 0,
    total: enabled.length,
    completed: 0,
    failed: 0,
    label: null,
  });
  if (await stopIfCancelled()) return cancelledResult;

  runCoupangKeywordRankBatch(enabled, runId, startedAt, environmentId).catch(async (e) => {
    if (await collectionRuns.isCancelled(runId)) return;
    chrome.storage.local.set({
      [keywordStatusKey]: {
        runId,
        total: enabled.length,
        status: "error",
        error: e?.message || String(e),
        startedAt,
        endedAt: Date.now(),
      },
    });
    collectionSessions.fail(runId).catch(() => {});
  });

  return { success: true, started: true, total: enabled.length, runId };
}

async function startCoupangCompetitorSellerCatalogCollection(message) {
  const environmentId = message.environmentId;
  if (typeof adsEnvironmentContext !== "undefined") {
    adsEnvironmentContext.requireEnvironment(environmentId);
  }
  const competitorStatusKey = typeof coupangEnvironment === "undefined"
    ? COMPETITOR_SELLER_CATALOG_STATUS_KEY
    : coupangEnvironment.stateKey(
        COMPETITOR_SELLER_CATALOG_STATUS_KEY,
        environmentId,
      );
  const sellerId =
    typeof message?.sellerId === "string" ? message.sellerId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(sellerId)) {
    return {
      success: false,
      started: false,
      error: "수집할 판매자 식별자가 올바르지 않습니다",
    };
  }

  let runId =
    typeof message?.runId === "string"
      ? message.runId
      : collectionRuns.createRunId();
  const startedAt = Date.now();
  const existingData = await getStorage(competitorStatusKey);
  const existing = existingData[competitorStatusKey];
  const requestedSession =
    typeof message?.runId === "string"
      ? await collectionSessions.get(message.runId)
      : null;
  const canRestartExisting = canRestartStoredDomainRun(
    existing,
    message?.runId,
    requestedSession,
  );
  if (
    existing &&
    !canRestartExisting &&
    (existing.status === "running" || existing.status === "starting") &&
    Date.now() - (existing.startedAt || 0) < 30 * 60 * 1000
  ) {
    return {
      success: false,
      started: false,
      error: `${existing.sellerName || "다른 판매자"} 상품을 이미 수집 중입니다`,
      runId: existing.runId || null,
    };
  }

  if (typeof message?.runId === "string") {
    if (
      requestedSession &&
      requestedSession.inputIdentity?.sellerId !== sellerId
    ) {
      throw new Error("Collection session seller owner does not match input");
    }
  }

  runId = await collectionRuns.beginWebCollection(
    "advertising.competitor_catalog",
    { sellerId, sellerCount: 1, startedAt },
    message?.runId,
    ["sellerId"],
    environmentId,
  );
  const cancelledResult = {
    success: false,
    started: false,
    cancelled: true,
    runId,
    sellerId,
  };
  const stopIfCancelled = async () => {
    if (!(await collectionRuns.isCancelled(runId))) return false;
    await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
    return true;
  };
  if (await stopIfCancelled()) return cancelledResult;

  let targets;
  try {
    targets = await fetchCoupangCompetitorSellerTargets(200, environmentId);
  } catch (error) {
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.fail(runId);
    throw error;
  }
  if (await stopIfCancelled()) return cancelledResult;
  const target = targets.find(
    (candidate) => String(candidate?.sellerId || "").trim() === sellerId,
  );
  if (!target || !isCoupangSellerStoreUrl(target.sellerStoreUrl)) {
    if (await stopIfCancelled()) return cancelledResult;
    await collectionSessions.fail(runId);
    return {
      success: false,
      started: false,
      error: "서버의 추적 판매자 목록에서 해당 판매자샵을 찾지 못했습니다",
    };
  }

  if (await stopIfCancelled()) return cancelledResult;
  await chrome.storage.local.set({
    [competitorStatusKey]: {
      runId,
      sellerId,
      sellerName: target.sellerName || sellerId,
      total: 1,
      completed: 0,
      failed: 0,
      current: `${target.sellerName || sellerId} 상품 준비 중`,
      status: "starting",
      startedAt,
    },
  });
  if (await stopIfCancelled()) return cancelledResult;

  runCoupangCompetitorSellerCatalogCollection(
    target,
    runId,
    startedAt,
    environmentId,
  ).catch(
    async (error) => {
      if (await collectionRuns.isCancelled(runId)) return;
      chrome.storage.local.set({
        [competitorStatusKey]: {
          runId,
          sellerId,
          sellerName: target.sellerName || sellerId,
          total: 1,
          completed: 0,
          failed: 1,
          current: null,
          status: "error",
          error: error?.message || String(error),
          startedAt,
          endedAt: Date.now(),
        },
      });
      collectionSessions.fail(runId).catch(() => {});
    },
  );

  return {
    success: true,
    started: true,
    total: 1,
    runId,
    sellerId,
    sellerName: target.sellerName || sellerId,
  };
}

async function runCoupangCompetitorSellerCatalogCollection(
  target,
  runId,
  startedAt,
  environmentId,
) {
  const competitorStatusKey = typeof coupangEnvironment === "undefined"
    ? COMPETITOR_SELLER_CATALOG_STATUS_KEY
    : coupangEnvironment.stateKey(
        COMPETITOR_SELLER_CATALOG_STATUS_KEY,
        environmentId,
      );
  let tabId = null;
  let attentionRequired = false;
  try {
    const tab = await createTab({
      url: target.sellerStoreUrl,
      active: false,
    });
    tabId = tab?.id || null;
    if (!tabId) throw new Error("쿠팡 판매자샵 탭을 열 수 없습니다");
    if (typeof coupangEnvironment !== "undefined") {
      await coupangEnvironment.bindTab(tabId, environmentId);
    }
    await collectionRuns.attachTab(runId, tab);
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }
    await collectionSessions.progress(runId, {
      current: 1,
      total: 1,
      completed: 0,
      failed: 0,
      label: target.sellerName || null,
    });

    await chrome.storage.local.set({
      [competitorStatusKey]: {
        runId,
        sellerId: target.sellerId,
        sellerName: target.sellerName || target.sellerId,
        total: 1,
        completed: 0,
        failed: 0,
        current: `${target.sellerName || target.sellerId} 전체상품 수집 중`,
        status: "running",
        startedAt,
      },
    });
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }

    const catalogs = await collectCoupangSellerCatalogs(tabId, [target], 1);
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId);
      return;
    }
    const catalog = catalogs[0];
    if (!catalog) {
      attentionRequired = true;
      const attention = await collectionRuns.requireAttention(
        runId,
        tabId,
        "marketplace_login",
        "판매자샵 수집을 계속하려면 쿠팡 로그인 또는 보안문자 확인이 필요합니다.",
      );
      if (attention?.cancelled) {
        await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
        return;
      }
      await chrome.storage.local.set({
        [competitorStatusKey]: {
          runId,
          sellerId: target.sellerId,
          sellerName: target.sellerName || target.sellerId,
          total: 1,
          completed: 0,
          failed: 0,
          current: null,
          status: "attention_required",
          startedAt,
        },
      });
      if (await collectionRuns.isCancelled(runId)) {
        await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      }
      return;
    }
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }
    const sync = await postCompetitorSellerCatalogSync([catalog], environmentId);
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }
    if (!sync?.success) {
      throw new Error(sync?.error || "판매자 상품 전송 실패");
    }

    await chrome.storage.local.set({
      [competitorStatusKey]: {
        runId,
        sellerId: target.sellerId,
        sellerName: catalog.sellerName || target.sellerName || target.sellerId,
        total: 1,
        completed: 1,
        failed: 0,
        catalogProductCount: catalog.collectedProductCount || 0,
        current: null,
        status: "done",
        startedAt,
        endedAt: Date.now(),
      },
    });
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }
    await collectionSessions.succeed(runId);
    notifyDashboard(environmentId);
  } catch (error) {
    if (await collectionRuns.isCancelled(runId)) {
      await requestCoupangCompetitorCatalogCancellation(runId, environmentId);
      return;
    }
    await collectionSessions.fail(runId);
    throw error;
  } finally {
    if (
      tabId &&
      !attentionRequired &&
      !(await collectionRuns.isCancelled(runId))
    ) {
      await removeTab(tabId).catch(() => {});
    }
  }
}

async function runCoupangKeywordRankBatch(trackers, runId, startedAt, environmentId) {
  const keywordStatusKey = typeof coupangEnvironment === "undefined"
    ? (typeof KEYWORD_RANK_STATUS_KEY === "undefined"
        ? "kiditem_keyword_rank_check"
        : KEYWORD_RANK_STATUS_KEY)
    : coupangEnvironment.stateKey(KEYWORD_RANK_STATUS_KEY, environmentId);
  const total = trackers.length;
  let completed = 0;
  let failed = 0;
  let resolvedSellerProductCount = 0;
  let trackedSellerCount = 0;
  const failures = [];
  let tabId = null;
  let attentionRequired = false;
  let cancelled = false;
  const cancelledResult = { success: false, cancelled: true, runId };
  const stopIfCancelled = async (reassert = false) => {
    if (!(await collectionRuns.isCancelled(runId))) return false;
    cancelled = true;
    if (reassert) await requestCoupangKeywordRankCancellation(runId, environmentId);
    return true;
  };

  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);

  try {
    for (let i = 0; i < trackers.length; i++) {
      if (await stopIfCancelled()) break;
      const tracker = trackers[i];
      const keyword = String(tracker.keyword || "").trim();
      const maxPages = clampNumber(
        tracker.maxPages,
        1,
        COUPANG_RANK_MAX_PAGES,
        2,
      );

      await chrome.storage.local.set({
        [keywordStatusKey]: {
          runId,
          total,
          completed,
          failed,
          current: keyword,
          currentIndex: i + 1,
          status: "running",
          startedAt,
        },
      });
      if (await stopIfCancelled(true)) break;
      await collectionSessions.progress(runId, {
        current: i + 1,
        total,
        completed,
        failed,
        label: keyword,
      });

      try {
        const capture = await captureCoupangKeywordSerp(keyword, maxPages, {
          tabId,
          runId,
          environmentId,
        });
        if (capture.tabId) tabId = capture.tabId;
        if (await stopIfCancelled()) break;
        if (!capture.success && capture.tabId) {
          attentionRequired = true;
          await collectionRuns.requireAttention(
            runId,
            capture.tabId,
            capture.wall === "captcha" ? "captcha" : "marketplace_login",
            capture.error || "쿠팡 검색 화면 확인이 필요합니다.",
          );
          break;
        }
        if (!capture.success)
          throw new Error(capture.error || "쿠팡 키워드 순위 수집 실패");
        if (await stopIfCancelled()) break;
        const sync = await postKeywordRankSync(capture, environmentId);
        if (await stopIfCancelled()) break;
        if (!sync?.success)
          throw new Error(sync?.error || "순위 데이터 전송 실패");
        completed++;
      } catch (error) {
        failed++;
        failures.push({ keyword, error: error?.message || String(error) });
        console.error(
          `[KIDITEM] 키워드 순위 확인 실패 (${keyword}):`,
          error?.message || error,
        );
      }

      if (attentionRequired || cancelled) break;

      if (i < trackers.length - 1) await sleep(randomDelayMs(4000, 8000));
    }

    if (tabId && !attentionRequired && !cancelled) {
      // 이미 식별된 지정/기존 판매자는 상품 상세 발굴보다 먼저 수집한다.
      // 상품 상세 대상이 많아 MV3 서비스워커가 중간 종료되더라도, 사용자가
      // 명시적으로 추적한 판매자샵의 최신 상품은 이번 실행 초반에 저장된다.
      const trackedSellerIds = new Set();
      const initialSellerTargets = await fetchCoupangCompetitorSellerTargets(
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
        environmentId,
      );
      if (await stopIfCancelled()) return cancelledResult;
      await chrome.storage.local.set({
        [keywordStatusKey]: {
          runId,
          total,
          completed,
          failed,
          current: `지정 판매자 ${initialSellerTargets.length}곳 상품 추적`,
          status: "running",
          startedAt,
        },
      });
      const initialSellerCatalogs = await collectCoupangSellerCatalogs(
        tabId,
        initialSellerTargets,
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      if (await stopIfCancelled()) return cancelledResult;
      if (initialSellerCatalogs.length > 0) {
        const initialCatalogSync = await postCompetitorSellerCatalogSync(
          initialSellerCatalogs,
          environmentId,
        );
        if (await stopIfCancelled()) return cancelledResult;
        if (!initialCatalogSync?.success) {
          throw new Error(
            initialCatalogSync?.error || "지정 판매자 상품 전송 실패",
          );
        }
        for (const catalog of initialSellerCatalogs) {
          if (catalog?.sellerId) trackedSellerIds.add(catalog.sellerId);
        }
      }

      const productTargets = await fetchCoupangCompetitorProductTargets(
        COUPANG_OVERLAP_PRODUCT_DETAIL_LIMIT,
        environmentId,
      );
      if (await stopIfCancelled()) return cancelledResult;
      await chrome.storage.local.set({
        [keywordStatusKey]: {
          runId,
          total,
          completed,
          failed,
          current: `겹치는 상품 ${productTargets.length}개 판매자 확인`,
          status: "running",
          startedAt,
        },
      });
      const sellerIdentities = await resolveCoupangCompetitorSellerIdentities(
        tabId,
        productTargets,
        async ({ processed, targetCount }) => {
          if (await collectionRuns.isCancelled(runId)) return;
          await chrome.storage.local.set({
            [keywordStatusKey]: {
              runId,
              total,
              completed,
              failed,
              current: `겹치는 상품 ${processed}/${targetCount} 판매자 확인`,
              status: "running",
              startedAt,
            },
          });
        },
      );
      if (await stopIfCancelled()) return cancelledResult;
      if (sellerIdentities.length > 0) {
        const identitySync =
          await postCompetitorSellerIdentitySync(sellerIdentities, environmentId);
        if (await stopIfCancelled()) return cancelledResult;
        if (!identitySync?.success) {
          throw new Error(
            identitySync?.error || "겹치는 상품 판매자 전송 실패",
          );
        }
      }
      resolvedSellerProductCount = sellerIdentities.length;

      const targets = await fetchCoupangCompetitorSellerTargets(
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
        environmentId,
      );
      if (await stopIfCancelled()) return cancelledResult;
      const remainingTargets = targets.filter(
        (target) => !trackedSellerIds.has(String(target?.sellerId || "")),
      );
      await chrome.storage.local.set({
        [keywordStatusKey]: {
          runId,
          total,
          completed,
          failed,
          current: `새로 확인한 판매자 ${remainingTargets.length}곳 상품 추적`,
          status: "running",
          startedAt,
        },
      });
      const sellerCatalogs = await collectCoupangSellerCatalogs(
        tabId,
        remainingTargets,
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      if (await stopIfCancelled()) return cancelledResult;
      if (sellerCatalogs.length > 0) {
        const sync = await postCompetitorSellerCatalogSync(sellerCatalogs, environmentId);
        if (await stopIfCancelled()) return cancelledResult;
        if (!sync?.success) {
          throw new Error(sync?.error || "겹치는 판매자 상품 전송 실패");
        }
        for (const catalog of sellerCatalogs) {
          if (catalog?.sellerId) trackedSellerIds.add(catalog.sellerId);
        }
      }
      trackedSellerCount = trackedSellerIds.size;
    }
  } finally {
    clearInterval(keepAlive);
    if (tabId && !attentionRequired && !cancelled) {
      await removeTab(tabId).catch(() => {});
    }
  }

  if (cancelled || (await stopIfCancelled())) return cancelledResult;
  await chrome.storage.local.set({
    [keywordStatusKey]: {
      runId,
      total,
      completed,
      failed,
      failures,
      resolvedSellerProductCount,
      trackedSellerCount,
      current: null,
      status: attentionRequired ? "attention_required" : "done",
      startedAt,
      endedAt: Date.now(),
    },
  });
  if (await stopIfCancelled(true)) return cancelledResult;
  if (!attentionRequired) await collectionSessions.succeed(runId);
  notifyDashboard(environmentId);

  console.log(
    `[KIDITEM] 키워드 순위 일괄 확인 완료: ${completed}/${total} 성공, ${failed} 실패`,
  );
  return {
    success: !attentionRequired,
    completed,
    failed,
    total,
    resolvedSellerProductCount,
    trackedSellerCount,
    runId,
    attentionRequired,
  };
}

// 12시간마다 자동 실행 — 토큰 없으면 조용히 건너뜀
async function runScheduledKeywordRankCheck(environmentId) {
  const token = await getAuthToken(environmentId);
  if (!token) return;
  try {
    await startCoupangKeywordRankCheck({ environmentId, restartStrategy: "extension" });
  } catch (e) {
    console.error("[KIDITEM] 키워드 순위 자동 확인 실패:", e?.message || e);
  }
}

async function captureCoupangKeywordSerp(keyword, maxPages, options = {}) {
  const items = [];
  let tabId = options.tabId || null;
  let pagesScanned = 0;
  let usedFallback = false;
  let wall = null;

  if (tabId) {
    const alive = await getTab(tabId).catch(() => null);
    if (!alive?.id) tabId = null;
  }

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = buildCoupangRankSearchUrl(keyword, page);

    if (!tabId) {
      const tab = await getOrCreateCoupangRankSearchTab(pageUrl);
      tabId = tab?.id || null;
      if (!tabId)
        return { success: false, error: "쿠팡 검색 탭을 열 수 없습니다" };
      if (options.runId) await collectionRuns.attachTab(options.runId, tab);
      if (typeof coupangEnvironment !== "undefined") {
        await coupangEnvironment.bindTab(tabId, options.environmentId);
      }
    } else {
      const loaded = await updateTabAndWait(tabId, pageUrl, {
        active: false,
      }).catch(() => null);
      if (!loaded) {
        if (items.length === 0)
          return { success: false, tabId, error: "쿠팡 검색 페이지 로딩 실패" };
        break;
      }
    }

    const currentTab = await getTab(tabId).catch(() => null);
    if (!isCoupangSearchUrl(currentTab?.url || "")) {
      if (items.length === 0) {
        return {
          success: false,
          tabId,
          wall: "redirect",
          error:
            "쿠팡 검색 페이지가 아닌 화면으로 이동했습니다 — 열린 탭에서 로그인/보안문자 여부를 확인하세요.",
        };
      }
      break;
    }

    await sleep(COUPANG_RANK_PAGE_RENDER_DELAY_MS);

    let extraction;
    try {
      extraction = await executeCoupangSerpExtraction(tabId);
    } catch (error) {
      if (items.length === 0) {
        return {
          success: false,
          tabId,
          error: error?.message || "쿠팡 검색 결과 파싱 실패",
        };
      }
      break;
    }
    if (!extraction) {
      if (items.length === 0)
        return { success: false, tabId, error: "쿠팡 검색 결과 파싱 실패" };
      break;
    }

    wall = extraction.wall || wall;
    usedFallback = usedFallback || !!extraction.usedFallback;

    const pageItems = Array.isArray(extraction.items) ? extraction.items : [];
    if (pageItems.length === 0) {
      if (page === 1) {
        const hint =
          extraction.wall === "captcha"
            ? "쿠팡 보안문자(캡차) 화면이 감지되었습니다."
            : extraction.wall === "login"
              ? "쿠팡 로그인 화면이 감지되었습니다."
              : "상품 목록 마크업을 찾지 못했습니다.";
        return {
          success: false,
          tabId,
          wall: extraction.wall || null,
          error: `쿠팡 검색 결과가 비어 있습니다 — ${hint} 열린 탭에서 화면을 확인하세요.`,
        };
      }
      break; // 마지막 페이지 도달
    }

    for (let index = 0; index < pageItems.length; index++) {
      const raw = pageItems[index];
      items.push({
        rank: items.length + 1,
        page,
        positionInPage: index + 1,
        isAd: !!raw.isAd,
        productId: raw.productId || null,
        itemId: raw.itemId || null,
        vendorItemId: raw.vendorItemId || null,
        name: raw.name || null,
        priceKrw: raw.priceKrw ?? null,
        reviewCount: raw.reviewCount ?? null,
        ratingScore: raw.ratingScore ?? null,
        link: raw.link || null,
      });
    }
    pagesScanned = page;

    if (page < maxPages) await sleep(randomDelayMs(1500, 3000));
  }

  if (items.length === 0) {
    return {
      success: false,
      tabId,
      wall,
      error: "쿠팡 검색 결과에서 상품을 찾지 못했습니다",
    };
  }

  return {
    success: true,
    tabId,
    keyword,
    pagesScanned,
    items,
    usedFallback,
    wall,
  };
}

async function resolveCoupangCompetitorSellerIdentities(
  tabId,
  targets,
  onProgress = null,
) {
  if (!tabId) return [];
  const detailsByProduct = new Map();
  const identities = [];
  const validTargets = targets.filter((target) =>
    isCoupangProductDetailUrl(target?.link),
  );
  const targetKeys = new Set(
    validTargets.map((target) => buildCoupangProductDetailKey(target)),
  );
  let processed = 0;
  for (const target of targets) {
    if (!isCoupangProductDetailUrl(target?.link)) continue;
    const detailKey = buildCoupangProductDetailKey(target);
    let detail = detailsByProduct.get(detailKey);
    if (detail === undefined) {
      try {
        const loaded = await updateTabAndWait(tabId, target.link, {
          active: false,
        });
        if (!loaded) throw new Error("상품 상세 페이지 로딩 실패");
        const current = await getTab(tabId).catch(() => null);
        if (!isCoupangProductDetailUrl(current?.url || "")) {
          throw new Error("상품 상세가 아닌 페이지로 이동했습니다");
        }
        await sleep(COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS);
        detail = await executeCoupangSellerDetailExtraction(tabId);
        if (!detail) {
          await sleep(COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS);
          detail = await executeCoupangSellerDetailExtraction(tabId);
        }
      } catch (error) {
        console.warn(
          "[KIDITEM] 겹치는 상품 판매자 확인 실패:",
          error?.message || error,
        );
        detail = null;
      }
      detailsByProduct.set(detailKey, detail);
      processed += 1;
      if (typeof onProgress === "function") {
        await onProgress({ processed, targetCount: targetKeys.size });
      }
      if (processed < targetKeys.size) await sleep(randomDelayMs(900, 1500));
    }
    if (!detail?.sellerName || !detail?.sellerId || !detail?.sellerStoreUrl) {
      continue;
    }
    identities.push({
      keyword: target.keyword,
      productKey: target.productKey,
      productId: target.productId || null,
      vendorItemId: target.vendorItemId || null,
      link: target.link,
      sellerName: detail.sellerName,
      sellerId: detail.sellerId,
      sellerStoreUrl: detail.sellerStoreUrl,
      capturedAt: new Date().toISOString(),
    });
  }
  return identities;
}

function buildCoupangProductDetailKey(target) {
  const vendorItemId = String(target?.vendorItemId || "").trim();
  if (vendorItemId) return `vendor-item:${vendorItemId}`;
  const productId = String(target?.productId || "").trim();
  if (productId) return `product:${productId}`;
  return `link:${String(target?.link || "")}`;
}

function isCoupangProductDetailUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.coupang.com" &&
      /^\/vp\/products\/\d+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function executeCoupangSellerDetailExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const sellerAnchor = anchors.find((anchor) => {
        try {
          const parsed = new URL(anchor.href);
          return (
            parsed.protocol === "https:" &&
            parsed.hostname === "shop.coupang.com" &&
            /^\/(?:vid\/)?[A-Za-z0-9_-]+/.test(parsed.pathname)
          );
        } catch {
          return false;
        }
      });
      if (!sellerAnchor) return null;
      return {
        href: sellerAnchor.href,
        text: sellerAnchor.textContent || "",
      };
    },
  });
  return (
    globalThis.KidItemCoupangSellerDetail?.extractCoupangSellerShopLink(
      result?.result,
    ) || null
  );
}

async function collectCoupangSellerCatalogs(tabId, targets, limit) {
  if (!tabId || limit <= 0) return [];
  const candidates = [];
  const queued = new Set();
  for (const target of targets) {
    const sellerId = String(target?.sellerId || "").trim();
    const sellerStoreUrl = String(target?.sellerStoreUrl || "").trim();
    if (
      !sellerId ||
      !isCoupangSellerStoreUrl(sellerStoreUrl) ||
      queued.has(sellerId)
    ) {
      continue;
    }
    queued.add(sellerId);
    candidates.push({
      sellerId,
      sellerName: target.sellerName || null,
      sellerStoreUrl,
      keyword: String(target.keyword || "").trim(),
      priorityScore: Number(target.priorityScore) || 0,
      overlapProductCount: Number(target.overlapProductCount) || 0,
    });
    if (candidates.length >= limit) break;
  }

  const catalogs = [];
  for (const candidate of candidates) {
    try {
      const loaded = await updateTabAndWait(tabId, candidate.sellerStoreUrl, {
        active: false,
      });
      if (!loaded) throw new Error("판매자샵 로딩 실패");
      const current = await getTab(tabId).catch(() => null);
      if (!isCoupangSellerStoreUrl(current?.url || "")) {
        throw new Error("판매자샵이 아닌 페이지로 이동했습니다");
      }
      await sleep(COUPANG_SELLER_CATALOG_RENDER_DELAY_MS);
      await selectNewestSellerCatalogSort(tabId);
      await sleep(COUPANG_SELLER_CATALOG_RENDER_DELAY_MS);
      const catalog = await executeCoupangSellerCatalogExtraction(tabId);
      if (catalog?.products?.length) {
        catalogs.push({
          ...candidate,
          sellerName: catalog.sellerName || candidate.sellerName,
          totalProductCount: catalog.totalProductCount,
          collectedProductCount: catalog.products.length,
          isTruncated:
            Number.isFinite(catalog.totalProductCount) &&
            catalog.totalProductCount > catalog.products.length,
          sort: "newest",
          capturedAt: new Date().toISOString(),
          products: catalog.products,
        });
      }
    } catch (error) {
      console.warn(
        `[KIDITEM] 판매자샵 최신 상품 수집 실패 (${candidate.sellerId}):`,
        error?.message || error,
      );
    }
    if (catalogs.length < candidates.length) {
      await sleep(randomDelayMs(700, 1300));
    }
  }
  return catalogs;
}

async function fetchCoupangCompetitorSellerTargets(limit, environmentId) {
  const response = await authedFetch(
    environmentId,
    `/api/ads/competitors/seller-targets?days=30&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`겹치는 판매자 목록 조회 실패 (${response.status})`);
  }
  const json = await response.json().catch(() => null);
  return Array.isArray(json?.targets) ? json.targets : [];
}

async function fetchCoupangCompetitorProductTargets(limit, environmentId) {
  const response = await authedFetch(
    environmentId,
    `/api/ads/competitors/product-detail-targets?days=30&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`겹치는 상품 목록 조회 실패 (${response.status})`);
  }
  const json = await response.json().catch(() => null);
  return Array.isArray(json?.targets) ? json.targets : [];
}

function isCoupangSellerStoreUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "shop.coupang.com" &&
      /^\/(?:vid\/)?[A-Za-z0-9_-]+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function selectNewestSellerCatalogSort(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const target = Array.from(
        document.querySelectorAll("li.sortkey, [role=button], button"),
      ).find((element) => (element.textContent || "").trim() === "최신순");
      if (!target) return false;
      target.click();
      return true;
    },
  });
  return result?.result === true;
}

async function executeCoupangSellerCatalogExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxItems) => {
      const sleepInPage = (ms) =>
        new Promise((resolve) => globalThis.setTimeout(resolve, ms));
      const productAnchors = () =>
        Array.from(document.querySelectorAll('a[href*="/vp/products/"]'));

      let stableRounds = 0;
      let previousCount = -1;
      for (let round = 0; round < 45; round += 1) {
        const count = productAnchors().length;
        if (count >= maxItems) break;
        stableRounds = count === previousCount ? stableRounds + 1 : 0;
        if (stableRounds >= 3) break;
        previousCount = count;
        globalThis.scrollTo(0, document.documentElement.scrollHeight);
        await sleepInPage(650);
      }

      const digits = (value) => {
        const normalized = String(value || "").replace(/[^\d]/g, "");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const totalMatch = (document.body?.innerText || "").match(
        /전체\s*\(([\d,]+)\)/,
      );
      const totalProductCount = totalMatch ? digits(totalMatch[1]) : null;
      const seen = new Set();
      const products = [];
      for (const anchor of productAnchors()) {
        if (products.length >= maxItems) break;
        let parsed;
        try {
          parsed = new URL(anchor.getAttribute("href") || "", location.origin);
        } catch {
          continue;
        }
        const productId =
          (parsed.pathname.match(/\/vp\/products\/(\d+)/) || [])[1] || null;
        const itemId = parsed.searchParams.get("itemId") || null;
        const vendorItemId = parsed.searchParams.get("vendorItemId") || null;
        const key = vendorItemId || itemId || productId;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const name = (anchor.querySelector(".name")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        if (!name) continue;
        const priceKrw = digits(
          anchor.querySelector(".price-value")?.textContent || "",
        );
        const reviewCount = digits(
          anchor.querySelector(".rating-total-count")?.textContent || "",
        );
        const image = anchor.querySelector("img");
        const rawImageUrl = [
          image?.getAttribute("data-img-src"),
          image?.getAttribute("data-src"),
          image?.currentSrc,
          image?.getAttribute("src"),
        ].find(
          (value) =>
            typeof value === "string" &&
            value.trim() &&
            !value.trim().startsWith("data:"),
        );
        let imageUrl = null;
        if (rawImageUrl) {
          try {
            imageUrl = new URL(rawImageUrl, location.href).href;
          } catch {
            imageUrl = null;
          }
        }
        products.push({
          sourceRank: products.length + 1,
          productId,
          itemId,
          vendorItemId,
          name,
          priceKrw,
          reviewCount,
          imageUrl,
          link: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        });
      }

      const sellerName =
        Array.from(document.querySelectorAll("h1,h2,h3,strong,span,div"))
          .map((element) => (element.textContent || "").trim())
          .find(
            (text) =>
              text &&
              text.length <= 120 &&
              (document.body?.innerText || "").includes(
                `${text}의 판매자샵입니다.`,
              ),
          ) || null;
      return { sellerName, totalProductCount, products };
    },
    args: [COUPANG_SELLER_CATALOG_MAX_ITEMS],
  });
  return result?.result || null;
}

async function getOrCreateCoupangRankSearchTab(url) {
  const tab = await createTab({ url, active: false });
  if (!tab?.id) return tab;
  return waitForTabComplete(tab.id, {
    expectedUrl: url,
    timeoutMs: 60000,
  }).catch(() => tab);
}

async function executeCoupangSerpExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function digitsToNumber(text) {
        const digits = String(text || "").replace(/[^\d]/g, "");
        if (!digits) return null;
        const numeric = Number(digits);
        return Number.isFinite(numeric) ? numeric : null;
      }

      function detectAccessWall() {
        if (/login\.coupang\.com/i.test(location.hostname)) return "login";
        if (/captcha|securityCheck|verification/i.test(location.href))
          return "captcha";
        if (
          document.querySelector(
            'form[action*="captcha" i], #captcha, [class*="captcha" i], input[name*="captcha" i]',
          )
        ) {
          return "captcha";
        }
        const bodyText = (document.body?.innerText || "").slice(0, 4000);
        if (/보안\s*문자|자동\s*입력\s*방지/.test(bodyText)) return "captcha";
        if (/로그인이\s*필요/.test(bodyText)) return "login";
        return null;
      }

      // 레거시 li.search-product 와 신규 product-list 마크업을 모두 시도하고,
      // 전부 실패하면 결과 컨테이너 안의 상품 링크(a[href*="/vp/products/"])를 DOM 순서로 수집
      function findProductElements() {
        const knownSelectors = [
          "ul#productList > li.search-product",
          "ul.search-product-list > li.search-product",
          "li.search-product",
          '#product-list > li[class*="ProductUnit" i]',
          'ul[class*="ProductList" i] > li',
          'li[class*="ProductUnit" i]',
        ];
        for (const selector of knownSelectors) {
          const found = Array.prototype.slice
            .call(document.querySelectorAll(selector))
            .filter((el) => el.querySelector('a[href*="/vp/products/"]'));
          if (found.length > 0) return { elements: found, usedFallback: false };
        }

        const container =
          document.querySelector("#productList") ||
          document.querySelector("#product-list") ||
          document.querySelector('[class*="product-list" i]') ||
          document.querySelector("main") ||
          document.body;
        const seen = new Set();
        const elements = [];
        for (const anchor of container.querySelectorAll(
          'a[href*="/vp/products/"]',
        )) {
          const item = anchor.closest("li") || anchor;
          if (seen.has(item)) continue;
          seen.add(item);
          elements.push(item);
        }
        return { elements, usedFallback: true };
      }

      function parseProductLink(anchor) {
        if (!anchor)
          return {
            link: null,
            productId: null,
            itemId: null,
            vendorItemId: null,
          };
        const rawHref = anchor.getAttribute("href") || "";
        try {
          const parsed = new URL(rawHref, location.origin);
          const productId =
            (parsed.pathname.match(/\/vp\/products\/(\d+)/) || [])[1] || null;
          return {
            link: parsed.origin + parsed.pathname + parsed.search,
            productId,
            itemId: parsed.searchParams.get("itemId") || null,
            vendorItemId: parsed.searchParams.get("vendorItemId") || null,
          };
        } catch {
          return {
            link: rawHref || null,
            productId: null,
            itemId: null,
            vendorItemId: null,
          };
        }
      }

      // 광고 슬롯 감지 — 배지 클래스 / data 속성 / href 신호 / "광고"·"AD" 배지 텍스트를 조합.
      // 판단이 안 서면 isAd=false 쪽으로 기운다.
      function detectIsAd(element, anchor) {
        if (
          element.querySelector(
            '[class*="ad-badge" i], [class*="adBadge" i], [class*="AdMark" i], [class*="sponsored" i], .search-product__ad-badge',
          )
        ) {
          return true;
        }
        if (/search-product__ad|AdMark/i.test(element.className || ""))
          return true;
        if (
          element.querySelector(
            "[data-adsplatform], [data-ads-platform], [data-ad-marker]",
          )
        )
          return true;
        const href = anchor ? anchor.getAttribute("href") || "" : "";
        if (/sourceType=srp_product_ads|adsPlatform/i.test(href)) return true;
        for (const badge of element.querySelectorAll("span, em, div")) {
          const text = (badge.textContent || "").trim();
          if (text.length > 4) continue;
          if (text === "광고" || text === "AD") return true;
        }
        return false;
      }

      function extractName(element, anchor) {
        const nameEl =
          element.querySelector(".name") ||
          element.querySelector('[class*="productName" i]') ||
          element.querySelector('[class*="product-name" i]');
        let name = nameEl ? nameEl.textContent : "";
        if (!name) {
          const img = element.querySelector("img[alt]");
          if (img && img.getAttribute("alt")) name = img.getAttribute("alt");
        }
        if (!name && anchor) name = anchor.textContent;
        name = String(name || "")
          .replace(/\s+/g, " ")
          .trim();
        return name ? name.slice(0, 300) : null;
      }

      function extractPrice(element) {
        const priceEl =
          element.querySelector(".price-value") ||
          element.querySelector('[class*="priceValue" i]') ||
          element.querySelector('[class*="sale-price" i]') ||
          element.querySelector('strong[class*="price" i]') ||
          element.querySelector('[class*="price" i] strong');
        return priceEl ? digitsToNumber(priceEl.textContent) : null;
      }

      function extractReviewCount(element) {
        const countEl =
          element.querySelector(".rating-total-count") ||
          element.querySelector('[class*="ratingCount" i]') ||
          element.querySelector('[class*="rating-total" i]');
        return countEl ? digitsToNumber(countEl.textContent) : null;
      }

      function extractRatingScore(element) {
        const ratingEl =
          element.querySelector("em.rating") ||
          element.querySelector('[class*="ratingValue" i]') ||
          element.querySelector(".rating");
        if (!ratingEl) return null;
        const direct = Number.parseFloat((ratingEl.textContent || "").trim());
        if (Number.isFinite(direct) && direct > 0 && direct <= 5) return direct;
        const width = Number.parseFloat(ratingEl.style?.width || "");
        if (Number.isFinite(width) && width > 0 && width <= 100)
          return Math.round((width / 20) * 10) / 10;
        return null;
      }

      function extractImageUrl(element) {
        const image = element.querySelector("img");
        const rawImageUrl =
          image?.currentSrc ||
          image?.getAttribute("src") ||
          image?.getAttribute("data-img-src") ||
          image?.getAttribute("data-src") ||
          "";
        if (!rawImageUrl) return null;
        try {
          return new URL(rawImageUrl, location.href).href;
        } catch {
          return null;
        }
      }

      const wall = detectAccessWall();
      const { elements, usedFallback } = findProductElements();
      const items = [];
      for (const element of elements) {
        const anchor =
          element.matches && element.matches('a[href*="/vp/products/"]')
            ? element
            : element.querySelector('a[href*="/vp/products/"]');
        if (!anchor) continue;
        const linkInfo = parseProductLink(anchor);
        items.push({
          isAd: detectIsAd(element, anchor),
          productId: linkInfo.productId,
          itemId: linkInfo.itemId,
          vendorItemId: linkInfo.vendorItemId,
          name: extractName(element, anchor),
          priceKrw: extractPrice(element),
          reviewCount: extractReviewCount(element),
          ratingScore: extractRatingScore(element),
          imageUrl: extractImageUrl(element),
          link: linkInfo.link,
        });
      }

      return { items, usedFallback, wall };
    },
  });
  return result?.result || null;
}

async function postKeywordRankSync(capture, environmentId) {
  const capturedAt = new Date().toISOString();
  const payload = {
    type: "keyword_rank",
    source: "coupang-search",
    timestamp: capturedAt,
    data: [
      {
        keyword: capture.keyword,
        capturedAt,
        pagesScanned: capture.pagesScanned,
        listSize: capture.items.length,
        items: capture.items,
      },
    ],
  };
  const response = await authedFetch(environmentId, `/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      [coupangEnvironment.stateKey("kiditem_last_sync_keyword_rank", environmentId)]: { time: Date.now(), count: 1 },
    });
    notifyDashboard(environmentId);
  }
  return (
    json || {
      success: false,
      error: `sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function postCompetitorSellerCatalogSync(catalogs, environmentId) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(environmentId, `/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "competitor_seller_catalog",
      source: "coupang-seller-shop",
      timestamp: capturedAt,
      data: catalogs,
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      [coupangEnvironment.stateKey("kiditem_last_sync_competitor_seller_catalog", environmentId)]: {
        time: Date.now(),
        count: catalogs.length,
      },
    });
    notifyDashboard(environmentId);
  }
  return (
    json || {
      success: false,
      error: `판매자 상품 sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function postCompetitorSellerIdentitySync(identities, environmentId) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(environmentId, `/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "competitor_seller_identity",
      source: "coupang-overlap-product-detail",
      timestamp: capturedAt,
      data: identities,
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      [coupangEnvironment.stateKey("kiditem_last_sync_competitor_seller_identity", environmentId)]: {
        time: Date.now(),
        count: identities.length,
      },
    });
  }
  return (
    json || {
      success: false,
      error: `판매자 확인 sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

function buildCoupangRankSearchUrl(keyword, page) {
  return `${COUPANG_SEARCH_URL}?q=${encodeURIComponent(keyword)}&channel=user&page=${page}&listSize=36`;
}

function randomDelayMs(minMs, maxMs) {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function stableScrapeTargetFingerprint(producer, targets) {
  const urls = (Array.isArray(targets) ? targets : [])
    .map((target) => String(target?.url || ""))
    .filter(Boolean)
    .sort();
  return stableInputFingerprint(`${producer}\n${urls.join("\n")}`);
}

function canRestartStoredDomainRun(existing, requestedRunId, session) {
  return (
    typeof requestedRunId === "string" &&
    requestedRunId === existing?.runId &&
    requestedRunId === session?.runId &&
    ["attention_required", "failed", "cancelled", "succeeded"].includes(
      session.status,
    )
  );
}

function stableInputFingerprint(value) {
  const normalized = String(value || "").normalize("NFKC").trim();
  let primary = 2166136261;
  let secondary = 0x9e3779b9 ^ normalized.length;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    primary ^= code;
    primary = Math.imul(primary, 16777619);
    secondary ^= code + index;
    secondary = Math.imul(secondary ^ (secondary >>> 16), 0x5bd1e995);
  }
  return `fp64:${(primary >>> 0).toString(16).padStart(8, "0")}${(secondary >>> 0).toString(16).padStart(8, "0")}`;
}

async function getOrCreateWingCatalogTab() {
  return createTab({ url: WING_CATALOG_FORM_URL, active: false });
}

async function executeWingCatalogSearchWithRetry(tabId, payload) {
  // 요청 제한(429)은 참을성 있게 지수 백오프로 재시도한다. 카탈로그가 커지면
  // 페이지 수가 많아 짧은 재시도로는 계속 429에 걸린다.
  const MAX_ATTEMPTS = 4;
  let response = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    response = await executeWingCatalogSearch(tabId, payload);
    const retryable =
      response?.status === 429 || response?.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) return response;
    // 429 는 더 길게 대기(4s→8s→16s), 5xx 는 1s→2s→4s.
    const baseMs = response?.status === 429 ? 4000 : 1000;
    await sleep(baseMs * 2 ** (attempt - 1));
  }
  return response;
}

async function executeWingCatalogSearchInPage(requestPayload, endpoint) {
  const xsrfCookie = String(document.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("XSRF-TOKEN="));
  const encodedXsrfToken = xsrfCookie?.slice("XSRF-TOKEN=".length) || "";
  let xsrfToken = "";
  try {
    xsrfToken = decodeURIComponent(encodedXsrfToken);
  } catch {
    xsrfToken = encodedXsrfToken;
  }
  if (!xsrfToken) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      body: null,
      errorCode: "wing_xsrf_token_missing",
      error:
        "Wing 검색 인증 토큰을 찾지 못했습니다. Wing 탭을 새로고침하거나 다시 로그인해 주세요.",
    };
  }

  try {
    // 타임아웃 없는 in-page fetch 는 Wing API stall 시 injection 이 영원히 안 끝나
    // executeScript 가 resolve 안 되고 배치가 그 키워드에서 멈춘다. 20s 로 제한.
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": xsrfToken,
      },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(20000),
    });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    let body = null;
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      body,
      textPreview: body ? null : text.slice(0, 200),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      body: null,
      error: error?.message || String(error),
    };
  }
}

async function executeWingCatalogSearch(tabId, payload) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: executeWingCatalogSearchInPage,
    args: [payload, WING_CATALOG_SEARCH_ENDPOINT],
  });
  return result?.result || null;
}

function normalizeWingCatalogProduct(product) {
  if (!product || typeof product !== "object") return null;
  const productId =
    product.productId == null ? null : String(product.productId);
  if (!productId) return null;
  const salePrice = toNullableNumber(product.salePrice);
  const salesLast28d = toNullableNumber(product.salesLast28d);
  const pvLast28Day = toNullableNumber(product.pvLast28Day);
  return {
    productId,
    itemId: product.itemId == null ? null : String(product.itemId),
    vendorItemId:
      product.vendorItemId == null ? null : String(product.vendorItemId),
    productName: String(product.productName || ""),
    itemName: product.itemName ? String(product.itemName) : null,
    brandName: product.brandName ? String(product.brandName) : null,
    manufacture: product.manufacture ? String(product.manufacture) : null,
    categoryHierarchy: Array.isArray(product.displayCategoryInfo)
      ? product.displayCategoryInfo[0]?.categoryHierarchy || null
      : null,
    imagePath: product.imagePath ? String(product.imagePath) : null,
    salePrice,
    rating: toNullableNumber(product.rating),
    ratingCount: toNullableNumber(product.ratingCount),
    pvLast28Day,
    salesLast28d,
    estimatedRevenue28d:
      salePrice != null && salesLast28d != null
        ? Math.round(salePrice * salesLast28d)
        : null,
    conversionRate28d:
      pvLast28Day != null && pvLast28Day > 0 && salesLast28d != null
        ? salesLast28d / pvLast28Day
        : null,
    deliveryInfo: product.deliveryInfo ? String(product.deliveryInfo) : null,
  };
}

function resolveWingCatalogTotal(body) {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.total,
    body.totalCount,
    body.productTotalCount,
    body.totalProductCount,
    body.count,
    body.pagination?.total,
    body.pagination?.totalCount,
    body.pageInfo?.total,
    body.pageInfo?.totalCount,
  ];
  for (const candidate of candidates) {
    const numeric = toNullableNumber(candidate);
    if (numeric != null) return numeric;
  }
  return null;
}

function toNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function isWingCatalogFormUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("/tenants/seller-web/vendor-inventory/formV2")
    );
  } catch {
    return false;
  }
}

async function openAndEditProduct(value) {
  const productName = typeof value === "string" ? value.trim() : "";
  if (!productName) return { success: false, error: "상품명이 없습니다" };
  await chrome.storage.local.set({
    kiditem_pending_edit: { productName, ts: Date.now() },
  });
  const tab = await interactiveTabs.createTab({
    url: buildWingProductSearchUrl(productName),
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  await waitForTabComplete(tab.id, { timeoutMs: 30000 });
  await sleep(3000);
  return sendTabMessage(tab.id, { action: "searchAndEdit", productName });
}

async function registerWingThumbnail(message) {
  const productName =
    typeof message.productName === "string" ? message.productName.trim() : "";
  const image = message.image || {};
  if (!productName)
    return { success: false, error: "쿠팡 등록 상품명이 없습니다" };
  if (
    typeof image.dataUrl !== "string" ||
    !image.dataUrl.startsWith("data:image/")
  ) {
    return { success: false, error: "대표이미지 데이터가 없습니다" };
  }

  const tab = await interactiveTabs.createTab({
    url: buildWingProductSearchUrl(productName),
    reason: INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
  });
  if (!tab?.id) return { success: false, error: "Wing 탭을 열 수 없습니다" };
  const tabId = tab.id;

  const loaded = await waitForTabComplete(tabId, { timeoutMs: 60000 }).catch(
    (error) => ({
      error: error?.message || "Wing 탭 로딩 실패",
    }),
  );
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isWingInventoryUrl(loaded?.url || "")) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      pendingLogin: true,
      opened: true,
      tabId,
      error:
        "쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 실행하세요.",
    };
  }

  await sleep(1500);
  const openResult = await sendTabMessage(tabId, {
    action: "kiditemOpenWingProductEdit",
    productName,
  });
  if (!openResult?.success) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      opened: true,
      tabId,
      error: openResult?.error || "Wing 상품 수정 화면을 열 수 없습니다",
    };
  }

  await waitForTabComplete(tabId, {
    expectedUrl: openResult.editUrl || undefined,
    timeoutMs: 60000,
  }).catch(() => null);
  await sleep(2500);

  const uploadResult = await sendTabMessage(tabId, {
    action: "kiditemUploadWingThumbnail",
    productName,
    image,
  });
  if (!uploadResult?.success) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      opened: true,
      tabId,
      error: uploadResult?.error || "Wing 대표이미지 업로드 실패",
    };
  }

  await interactiveTabs.focusTab(
    tabId,
    INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
  );
  return {
    success: true,
    opened: true,
    tabId,
    screenshotUrl: uploadResult.screenshotUrl,
  };
}

function buildWingProductSearchUrl(productName) {
  return `https://wing.coupang.com/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1`;
}

function buildCoupangSearchUrl(keyword) {
  return `${COUPANG_SEARCH_URL}?component=&q=${encodeURIComponent(keyword)}&channel=user`;
}

function isCoupangSearchUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.coupang.com" &&
      parsed.pathname.includes("/np/search")
    );
  } catch {
    return false;
  }
}

async function openAndExecuteAdActions(url = AD_ACTION_URL, environmentId) {
  const tab = await interactiveTabs.createTab({
    url,
    reason: INTERACTIVE_TAB_REASONS.AD_MUTATION,
  });
  await coupangEnvironment.bindTab(tab.id, environmentId);
  return new Promise((resolve) => {
      const tabId = tab.id;
      let sent = false;
      const cleanup = () => chrome.tabs.onUpdated.removeListener(onUpdated);
      const timeout = setTimeout(() => {
        cleanup();
        if (!sent)
          resolve({ success: true, opened: true, tabId, pendingLogin: true });
      }, 180000);

      const sendRunMessage = () => {
        if (sent) return;
        sent = true;
        clearTimeout(timeout);
        cleanup();
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "runApprovedQueuedAdActions" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: true,
                  opened: true,
                  tabId,
                  warning: chrome.runtime.lastError.message,
                });
                return;
              }
              resolve({ success: true, opened: true, tabId, response });
            },
          );
        }, 3000);
      };

      function onUpdated(updatedTabId, changeInfo, updatedTab) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        const currentUrl = updatedTab?.url || "";
        if (!currentUrl.startsWith("https://advertising.coupang.com/")) return;
        sendRunMessage();
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function isWingInventoryUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("vendor-inventory/list")
    );
  } catch {
    return false;
  }
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => resolve(data || {}));
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 조회 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.remove(tabId, () =>
        resolve({ success: !chrome.runtime.lastError }),
      );
    } catch {
      resolve({ success: false });
    }
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 생성 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

async function updateTabAndWait(tabId, url, options = {}) {
  const before = await getTab(tabId).catch(() => null);
  if (before?.active && options.allowActive !== true) {
    throw new Error("active user tab is collection-protected");
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url, active: !!options.active }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      waitForTabComplete(tabId, {
        expectedUrl: url,
        previousUrl: before?.url || null,
      })
        .then(resolve)
        .catch(reject);
    });
  });
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  return new Promise((resolve, reject) => {
    let done = false;
    let sawNavigation = false;
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timeout);
    };
    const finish = (tab) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(tab || {});
    };
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Wing 탭 로딩 타임아웃"));
    }, timeoutMs);
    const onRemoved = (removedTabId) => {
      if (removedTabId !== tabId || done) return;
      done = true;
      cleanup();
      reject(new Error("Wing 탭이 닫혔습니다"));
    };
    const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "loading") {
        sawNavigation = true;
        return;
      }
      if (
        changeInfo.status === "complete" &&
        isExpectedTab(updatedTab, { ...options, sawNavigation })
      ) {
        finish(updatedTab);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (isExpectedTab(tab, options)) finish(tab);
    });
  });
}

function isExpectedTab(tab, options = {}) {
  if (tab?.status !== "complete") return false;
  if (!options.expectedUrl) return true;
  const currentUrl = tab.url || "";
  if (matchesExpectedWingPage(currentUrl, options.expectedUrl)) return true;
  if (options.sawNavigation && isWingInventoryUrl(currentUrl)) return true;
  if (options.previousUrl && currentUrl === options.previousUrl) return false;
  return Boolean(currentUrl && !isWingInventoryUrl(currentUrl));
}

function matchesExpectedWingPage(currentUrl, expectedUrl) {
  try {
    const current = new URL(currentUrl);
    const expected = new URL(expectedUrl);
    if (current.hostname !== expected.hostname) return false;
    if (!current.pathname.includes("vendor-inventory/list")) return false;
    const currentPage = current.searchParams.get("page") || "1";
    const expectedPage = expected.searchParams.get("page") || "1";
    return currentPage === expectedPage;
  } catch {
    return false;
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            chrome.runtime.lastError.message || "content script 미응답",
          ),
        );
        return;
      }
      resolve(response);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 등록된 URL 을 **순차적으로** 처리. 전용 비활성 창의 단일 탭을 URL 별로
 * 탐색하고 manualSync 를 실행한다. 성공/실패/취소 같은 terminal 상태에서만 창을 닫는다.
 *
 * 과거 병렬(3초 간격) 구현은 이전 탭이 백그라운드화되면서 Chrome throttle 로
 * 달력 setDateRange 타임아웃 → 첫 탭만 성공 버그가 있었다. 순차로 바꿔 이를 제거.
 */
async function prepareScrapeTargets(
  urls,
  runId = collectionRuns.createRunId(),
  startedAt = Date.now(),
  options = {},
) {
  const environmentId = options.environmentId;
  if (typeof adsEnvironmentContext !== "undefined") {
    adsEnvironmentContext.requireEnvironment(environmentId);
  }
  const batchStatusKey = typeof coupangEnvironment === "undefined"
    ? BATCH_SCRAPE_STATUS_KEY
    : coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId);
  const batchCancelKey = typeof coupangEnvironment === "undefined"
    ? BATCH_SCRAPE_CANCEL_KEY
    : coupangEnvironment.stateKey(BATCH_SCRAPE_CANCEL_KEY, environmentId);
  if (!urls || urls.length === 0) {
    throw new Error("수집 대상 URL이 없습니다");
  }
  const producer = collectionRuns.resolveScrapeTargetProducer(options.producer);
  if (!producer) throw new Error("Unsupported collection producer");
  if (!options.sessionStarted) {
    if (options.restartStrategy === "extension") {
      await collectionSessions.start({
        runId,
        environmentId,
        producer,
        classification: "background_preferred",
        restartStrategy: "extension",
        inputIdentity: {
          collectionMode: "scrape_targets",
          targetFingerprint: stableScrapeTargetFingerprint(producer, urls),
          targetCount: urls.length,
          startedAt,
        },
      });
    } else {
      runId = await collectionRuns.beginWebCollection(
        producer,
        {
          collectionMode: "scrape_targets",
          targetFingerprint: stableScrapeTargetFingerprint(producer, urls),
          targetCount: urls.length,
          startedAt,
        },
        runId,
        ["collectionMode", "targetFingerprint"],
        environmentId,
      );
    }
  }

  await chrome.storage.local.remove(batchCancelKey);
  await chrome.storage.local.set({
    [batchStatusKey]: {
      runId,
      total: urls.length,
      completed: 0,
      failed: 0,
      current: 0,
      status: "starting",
      startedAt,
    },
  });

  return { runId, producer };
}

async function handleScrapeTargets(
  urls,
  runId = collectionRuns.createRunId(),
  startedAt = Date.now(),
  options = {},
) {
  if (!urls || urls.length === 0) {
    return { success: false, error: "수집 대상 URL이 없습니다" };
  }
  const prepared = await prepareScrapeTargets(
    urls,
    runId,
    startedAt,
    options,
  );

  return collectionWindowFor(options.environmentId).collectTargets({
    runId: prepared.runId,
    targets: urls,
    startedAt,
    producer: prepared.producer,
    environmentId: options.environmentId,
  });
}

async function cancelBatchScrape(runId = null, environmentId) {
  return collectionWindowFor(environmentId).cancelRun(runId);
}

/**
 * 단일 URL 스크래핑:
 * 1. 새 탭 열기
 * 2. 로딩 완료 대기
 * 3. content script에 manualSync 전송
 * 4. 응답 대기 후 탭 닫기
 */
/**
 * 3시간마다 자동 실행 — 서버에서 등록 URL 가져와서 순차 스크래핑
 */
async function autoScrape(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  const autoScrapeKey = coupangEnvironment.stateKey("kiditem_auto_scrape", environmentId);
  console.log("[KIDITEM] 자동 수집 시작");

  try {
    const res = await authedFetch(environmentId, `/api/ads/scrape-targets`);
    const json = await res.json();
    const targets = json.targets || [];

    if (targets.length === 0) {
      console.log("[KIDITEM] 등록된 수집 URL 없음");
      chrome.storage.local.set({
        [autoScrapeKey]: { time: Date.now(), count: 0, status: "empty" },
      });
      return;
    }

    const urls = collectionRuns.validateScrapeTargets(targets);
    if (!urls) throw new Error("현재 자동 수집 대상이 올바르지 않습니다");
    const result = await handleScrapeTargets(
      urls,
      collectionRuns.createRunId(),
      Date.now(),
      {
        producer: "advertising.scrape_targets",
        restartStrategy: "extension",
        environmentId,
      },
    );

    console.log(
      `[KIDITEM] 자동 수집 완료: ${result.completed}/${result.total} 성공`,
    );

    // 결과 저장
    chrome.storage.local.set({
      [autoScrapeKey]: {
        time: Date.now(),
        completed: result.completed,
        failed: result.failed,
        total: result.total,
        status: "done",
      },
    });

    // 배지 표시 (수집 건수)
    if (result.completed > 0) {
      chrome.action.setBadgeText({ text: String(result.completed) });
      chrome.action.setBadgeBackgroundColor({ color: "#3182f6" });
      // 30초 후 배지 제거
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 30000);
    }
  } catch (e) {
    console.error("[KIDITEM] 자동 수집 실패:", e.message);
    chrome.storage.local.set({
      [autoScrapeKey]: {
        time: Date.now(),
        count: 0,
        status: "error",
        error: e.message,
      },
    });
  }
}

/**
 * 월별 일별 동기화 — 하루씩 Wing 매출분석 페이지 열고 스크래핑
 */
async function doMonthlyScrape(year, month, environmentId) {
  const monthlySyncKey = coupangEnvironment.stateKey("kiditem_monthly_sync", environmentId);
  const today = new Date();
  const lastDay = new Date(year, month, 0).getDate();
  // 미래 날짜는 수집 불필요 (당월이면 오늘까지만)
  const endDay =
    year === today.getFullYear() && month === today.getMonth() + 1
      ? Math.min(today.getDate(), lastDay)
      : lastDay;

  const total = endDay;
  chrome.storage.local.set({
    [monthlySyncKey]: {
      year,
      month,
      completed: 0,
      total,
      status: "running",
    },
  });

  const urls = [];
  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    urls.push({
      id: `wing-sales-${dateStr}`,
      url: `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${dateStr}&end_date=${dateStr}`,
      label: `매출분석 ${dateStr}`,
    });
  }

  const result = await handleScrapeTargets(
    urls,
    collectionRuns.createRunId(),
    Date.now(),
    { producer: "dashboard.wing_sales", restartStrategy: "web", environmentId },
  );

  chrome.storage.local.set({
    [monthlySyncKey]: {
      year,
      month,
      completed: result.completed,
      total,
      status: result.success ? "done" : "error",
    },
  });
  notifyDashboard(environmentId);
}

collectionRuns.recover().catch((error) => {
  console.error(
    "[KIDITEM] 브라우저 수집 세션 복구 실패:",
    error?.message || error,
  );
});

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["advertising", "channels", "dashboard"],
  capabilities: {
    wingCatalogSearch: true,
    wingCatalogSearchSource: "wing-pre-matching",
    coupangKeywordSuggestions: true,
    coupangKeywordSuggestionSource: "coupang-search-page",
    coupangProductNameTokens: true,
    coupangKeywordRank: true,
    coupangKeywordRankSource: "coupang-search-page",
    coupangCompetitorSeller: true,
    coupangCompetitorSellerSource: "coupang-product-detail",
    coupangCompetitorSellerCatalog: true,
    coupangCompetitorSellerCatalogSource: "coupang-seller-shop-newest-first",
    coupangCompetitorSellerCatalogOnDemand: true,
    wingCatalogSalesRank: true,
    wingCatalogSalesRankCancel: true,
    wingCatalogSalesRankSource: "wing-pre-matching-sales-28d",
    coupangCatalogSnapshot: true,
    coupangCatalogSnapshotSource: "wing-inventory-v1",
    coupangReviewCollection: true,
    coupangReviewCollectionSource: "wing-cs-product-review",
    browserCollectionSessions: true,
    kiditemEnvironmentProfilesV1: true,
    wingFormRegister: true,
    wingFormRegisterSource: "wing-formV2-fill",
    wingFormReadinessV2: true,
    wingFormPortV1: true,
  },
  cancelCollectionSession: (runId, environmentId) =>
    collectionRuns
      .cancel(runId, environmentId)
      .then(() => collectionSessions.getOwned(runId, environmentId)),
  restartCollectionSession: (runId, environmentId) =>
    collectionRuns.restart(runId, environmentId),
});
