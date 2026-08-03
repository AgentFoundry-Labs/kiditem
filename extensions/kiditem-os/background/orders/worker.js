// KIDITEM OS — 마켓 주문수집 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `ordersEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

const ordersEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  requiresAuth: false,
  legacyStorageKeys: ["apiBase", "kiditem_auth_token"],
});
const SELLPIA_MANUAL_MATCH_PORT_NAME = "kiditem-sellpia-manual-match-v1";
const orderCollectionLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "orders.mall",
  classification: "background_preferred",
  restartStrategy: "web",
  requireRunId: true,
  normalizeFailure(provider, value) {
    return KidItemOrderCollectionFailure.createEvidence(provider, value);
  },
  classifyFailure(value) {
    const error = value?.error || value;
    return value?.pendingLogin === true
      || value?.pendingAuth === true
      || value?.errorCode === "login_required"
      || value?.errorCode === "operator_action_required"
      || isMallAccessError(error)
      ? "marketplace_login"
      : null;
  },
});
const coupangShipmentSummaryLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "orders.coupang_shipment_summary",
  classification: "background_preferred",
  restartStrategy: "web",
  requireRunId: true,
  forceDeferredTerminal: true,
  deferredLabel: "쿠팡 쉽먼트 조회 완료 · 서버 저장 중",
  failedLabel: "쿠팡 쉽먼트 조회 실패",
  succeededLabel: "쿠팡 쉽먼트 조회 완료",
  classifyFailure(value) {
    return value?.pendingLogin === true
      || value?.errorCode === "coupang_shipment_session_required"
      ? "marketplace_login"
      : null;
  },
});
const coupangRocketPoLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "orders.coupang_rocket_po",
  classification: "background_preferred",
  restartStrategy: "web",
  requireRunId: true,
  deferredLabel: "쿠팡 로켓 PO 수집 완료 · 서버 저장 중",
  failedLabel: "쿠팡 로켓 PO 수집 실패",
  succeededLabel: "쿠팡 로켓 PO 수집 완료",
  classifyFailure(value) {
    const error = value?.error || value;
    return value?.pendingLogin === true
      || value?.errorCode === "coupang_po_session_required"
      || isMallAccessError(error)
      ? "marketplace_login"
      : null;
  },
});
const sellpiaInventoryLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "inventory.sellpia",
  classification: "background_preferred",
  restartStrategy: "extension",
  requireRunId: true,
  forceDeferredTerminal: true,
  deferredLabel: "Sellpia snapshot collected · import in progress",
  failedLabel: "Sellpia inventory import failed",
  succeededLabel: "Sellpia inventory import completed",
  classifyFailure(value) {
    if (value?.errorCode === "sellpia_login_required") return "marketplace_login";
    if (value?.errorCode === "sellpia_background_timeout") return "background_timeout";
    return null;
  },
});
const sellpiaInventory = KidItemSellpiaInventory.create({ chrome });
const sellpiaManualMatchLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "orders.sellpia_manual_match",
  classification: "background_preferred",
  restartStrategy: "extension",
  requireRunId: true,
  forceDeferredTerminal: true,
  deferredLabel: "Sellpia manual-match evidence collected · import in progress",
  failedLabel: "Sellpia manual-match evidence import failed",
  succeededLabel: "Sellpia manual-match evidence import completed",
  classifyFailure(value) {
    if (value?.errorCode === "sellpia_manual_match_login_required") {
      return "marketplace_login";
    }
    if (value?.errorCode === "sellpia_manual_match_timeout") return "background_timeout";
    return null;
  },
});
const sellpiaManualMatch = KidItemSellpiaManualMatch.create({ chrome });
const sellpiaPostProcessing = KidItemSellpiaPostProcessing;
const sellpiaInvoiceTargets = sellpiaPostProcessing.createTargetStore({
  chrome,
  storageKeyForEnvironment: (base, environmentId) =>
    ordersEnvironmentContext.storageKey(base, environmentId),
});
const coupangPoSession = KidItemCoupangPoSession.create({
  chrome,
  attachOrderCollectionTab,
  waitForTabReady,
});
const rocketPoCollection = KidItemRocketPoCollection.create({
  chrome,
  coupangPoSession,
  withTimeout,
});

function runSellpiaManualMatchCollection(message) {
  return sellpiaManualMatchLifecycle.run(
    message,
    {
      sourceOrigin: "https://kiditem.sellpia.com",
      sourcePath: "/product_manual_match.html",
      targetCount: Array.isArray(message.targetCodes) ? message.targetCodes.length : -1,
    },
    (collection) => sellpiaManualMatch.collect(collection, message.targetCodes),
  );
}

function sellpiaInventoryOperationAlertContext(operation) {
  return {
    operationKey: `browser-collection:${operation.runId}`,
    attempt: Number.isInteger(operation.attempt) && operation.attempt > 0
      ? operation.attempt
      : 1,
    updatedAt: Date.now(),
  };
}

function sellpiaInventoryOperationAlertMetadata(operation, alertContext, patch = {}) {
  alertContext.updatedAt = Math.max(Date.now(), alertContext.updatedAt + 1);
  return {
    browserCollection: true,
    runId: operation.runId,
    producer: "inventory.sellpia",
    collectionAttempt: alertContext.attempt,
    collectionUpdatedAt: alertContext.updatedAt,
    attentionReason: patch.attentionReason || null,
  };
}

async function startSellpiaInventoryOperationAlert(operation) {
  const alertContext = sellpiaInventoryOperationAlertContext(operation);
  const fullScope = operation?.input?.scope === "full";
  await browserOperationRuntimeEnvironmentContext.authedFetch(
    operation.environmentId,
    "/api/operation-alerts/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationKey: alertContext.operationKey,
        type: "browser_collection",
        title: fullScope ? "Sellpia 수익성 데이터 갱신" : "Sellpia 재고 갱신",
        message: fullScope
          ? "Sellpia 현재고와 상품별 이익현황을 수집하고 있습니다."
          : "Sellpia 현재고 동기화를 실행하고 있습니다.",
        sourceType: "browser_collection_session",
        sourceId: "inventory.sellpia",
        href: "/inventory-hub?tab=sellpia-sync",
        severity: "info",
        progress: 0,
        metadata: sellpiaInventoryOperationAlertMetadata(
          operation,
          alertContext,
        ),
      }),
    },
  ).catch(() => undefined);
  return alertContext;
}

async function updateSellpiaInventoryOperationAlert(
  operation,
  alertContext,
  patch,
) {
  const operationKey = alertContext.operationKey;
  await browserOperationRuntimeEnvironmentContext.authedFetch(
    operation.environmentId,
    `/api/operation-alerts/${encodeURIComponent(operationKey)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: patch.status,
        message: patch.message,
        progress: patch.progress,
        severity: patch.severity,
        metadata: sellpiaInventoryOperationAlertMetadata(
          operation,
          alertContext,
          patch,
        ),
      }),
    },
  ).catch(() => undefined);
}

function startSellpiaFreshnessHeartbeat(operation, claimToken) {
  let stopped = false;
  const heartbeat = async () => {
    if (stopped) return;
    await browserOperationRuntimeEnvironmentContext.authedFetch(
      operation.environmentId,
      `/api/inventory/sellpia-freshness/claims/${encodeURIComponent(claimToken)}/heartbeat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    ).catch(() => undefined);
  };
  const intervalId = setInterval(() => { void heartbeat(); }, 20_000);
  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

async function failSellpiaFreshnessClaim(operation, claimToken, errorCode, errorMessage) {
  await browserOperationRuntimeEnvironmentContext.authedFetch(
    operation.environmentId,
    `/api/inventory/sellpia-freshness/claims/${encodeURIComponent(claimToken)}/fail`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorCode, errorMessage }),
    },
  ).catch(() => undefined);
}

async function claimSellpiaFreshnessLease(operation) {
  const requestClaim = () => browserOperationRuntimeEnvironmentContext.authedFetch(
    operation.environmentId,
    "/api/inventory/sellpia-freshness/claims",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  let response = await requestClaim();
  let claim = response.ok ? await response.json().catch(() => null) : null;

  // The first claim may only reconcile an expired prior generation. When a
  // newer generation is already pending, claim that exact work once instead
  // of surfacing a false operator-attention state.
  if (
    response.ok
    && claim?.claimed === false
    && claim?.state?.status === "refresh_required"
    && claim?.state?.activeSync == null
  ) {
    response = await requestClaim();
    claim = response.ok ? await response.json().catch(() => null) : null;
  }

  return { response, claim };
}

async function runSellpiaInventoryOperation(operation) {
  const alertContext = await startSellpiaInventoryOperationAlert(operation);
  const { response: claimResponse, claim: freshnessClaim } =
    await claimSellpiaFreshnessLease(operation);
  if (!claimResponse.ok) {
    await updateSellpiaInventoryOperationAlert(operation, alertContext, {
      status: "failed",
      message: "Sellpia 현재고 동기화를 시작하지 못했습니다.",
      progress: 0,
      severity: "error",
    });
    return {
      status: "failed",
      errorCode: "sellpia_freshness_claim_failed",
      errorMessage: "Sellpia freshness lease could not be claimed.",
    };
  }
  if (!freshnessClaim?.claimed) {
    await updateSellpiaInventoryOperationAlert(operation, alertContext, {
      status: "pending",
      message: "Sellpia 현재고 갱신 상태를 확인해주세요.",
      progress: 0,
      severity: "warning",
      attentionReason: "sellpia_refresh_not_claimable",
    });
    return {
      status: "attention_required",
      attentionReason: "sellpia_refresh_not_claimable",
    };
  }
  const stopFreshnessHeartbeat = startSellpiaFreshnessHeartbeat(
    operation,
    freshnessClaim.claimToken,
  );
  try {
    const collected = await sellpiaInventoryLifecycle.run(
      {
        runId: operation.runId,
        environmentId: operation.environmentId,
        deferTerminal: true,
      },
      {
        sourceOrigin: "https://kiditem.sellpia.com",
        sourceAccountKey: "kiditem",
      },
      (collection) => sellpiaInventory.collect(collection),
    );
    if (collected?.success !== true || !collected.snapshot) {
      const loginRequired = collected?.pendingLogin
        || collected?.collectionSession?.status === "attention_required";
      await failSellpiaFreshnessClaim(
        operation,
        freshnessClaim.claimToken,
        loginRequired ? "sellpia_login_required" : "sellpia_network_failed",
        loginRequired
          ? "Sellpia login is required."
          : "Sellpia inventory collection failed.",
      );
      if (loginRequired) {
        await updateSellpiaInventoryOperationAlert(operation, alertContext, {
          status: "pending",
          message: "Sellpia 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
          progress: 0,
          severity: "warning",
          attentionReason: "sellpia_login_required",
        });
        return {
          status: "attention_required",
          attentionReason: "sellpia_login_required",
        };
      }
      await updateSellpiaInventoryOperationAlert(operation, alertContext, {
        status: "failed",
        message: "Sellpia 현재고 동기화에 실패했습니다.",
        progress: 0,
        severity: "error",
      });
      return {
        status: "failed",
        errorCode: typeof collected?.errorCode === "string"
          ? collected.errorCode.slice(0, 120)
          : "sellpia_collection_failed",
        errorMessage: "Sellpia inventory collection failed.",
      };
    }

    const scope = freshnessClaim?.state?.activeSync?.scope === "full"
      || operation?.input?.scope === "full"
      ? "full"
      : "inventory";
    let productProfitCount = 0;
    if (scope === "full") {
      await updateSellpiaInventoryOperationAlert(operation, alertContext, {
        status: "running",
        message: "Sellpia 상품별 이익현황을 수집하고 있습니다.",
        progress: 0.45,
        severity: "info",
      });
      const productProfit = await collectSellpiaProductProfit();
      if (productProfit?.success !== true || !productProfit.payload) {
        const loginRequired = productProfit?.pendingLogin === true;
        await failSellpiaFreshnessClaim(
          operation,
          freshnessClaim.claimToken,
          loginRequired ? "sellpia_login_required" : "sellpia_download_contract_drift",
          loginRequired
            ? "Sellpia login is required."
            : "Sellpia product-profit evidence collection failed.",
        );
        await sellpiaInventoryLifecycle.finalize(
          operation.runId,
          "failed",
          "Sellpia product-profit evidence collection failed.",
        ).catch(() => undefined);
        await updateSellpiaInventoryOperationAlert(operation, alertContext, {
          status: loginRequired ? "pending" : "failed",
          message: loginRequired
            ? "Sellpia 로그인이 필요합니다. 로그인 후 다시 시도해주세요."
            : "Sellpia 상품별 이익현황 수집에 실패했습니다.",
          progress: 0.45,
          severity: loginRequired ? "warning" : "error",
          attentionReason: loginRequired ? "sellpia_login_required" : null,
        });
        return loginRequired
          ? { status: "attention_required", attentionReason: "sellpia_login_required" }
          : {
              status: "failed",
              errorCode: "sellpia_product_profit_collection_failed",
              errorMessage: "Sellpia product-profit evidence collection failed.",
            };
      }

      const productProfitIngest = await browserOperationRuntimeEnvironmentContext.authedFetch(
        operation.environmentId,
        "/api/sellpia-product-sales/ingest",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productProfit.payload),
        },
      );
      if (!productProfitIngest.ok) {
        await failSellpiaFreshnessClaim(
          operation,
          freshnessClaim.claimToken,
          "sellpia_download_contract_drift",
          "Sellpia product-profit evidence ingest failed.",
        );
        await sellpiaInventoryLifecycle.finalize(
          operation.runId,
          "failed",
          "Sellpia product-profit evidence ingest failed.",
        ).catch(() => undefined);
        await updateSellpiaInventoryOperationAlert(operation, alertContext, {
          status: "failed",
          message: "Sellpia 상품별 이익현황을 저장하지 못했습니다.",
          progress: 0.6,
          severity: "error",
        });
        return {
          status: "failed",
          errorCode: "sellpia_product_profit_ingest_failed",
          errorMessage: "Sellpia product-profit evidence ingest failed.",
        };
      }
      productProfitCount = Number.isInteger(productProfit.productCount)
        ? productProfit.productCount
        : 0;
    }

    const trigger = typeof freshnessClaim?.state?.refreshReason === "string"
      ? freshnessClaim.state.refreshReason
      : "manual_request";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([JSON.stringify(collected.snapshot)], { type: "application/json" }),
      "sellpia-inventory-snapshot-v1.json",
    );
    formData.append("kind", "browser");
    formData.append("claimToken", freshnessClaim.claimToken);
    formData.append("activeGeneration", freshnessClaim.activeGeneration);
    formData.append("trigger", trigger);
    formData.append("sourceOrigin", "https://kiditem.sellpia.com");
    formData.append("sourceAccountKey", "kiditem");

    const importResponse = await browserOperationRuntimeEnvironmentContext.authedFetch(
      operation.environmentId,
      "/api/inventory/sellpia-sync/import",
      { method: "POST", body: formData },
    );
    if (!importResponse.ok) {
      await failSellpiaFreshnessClaim(
        operation,
        freshnessClaim.claimToken,
        "sellpia_invalid_workbook",
        "Sellpia snapshot import failed.",
      );
      await sellpiaInventoryLifecycle.finalize(
        operation.runId,
        "failed",
        "Sellpia snapshot import failed.",
      ).catch(() => undefined);
      await updateSellpiaInventoryOperationAlert(operation, alertContext, {
        status: "failed",
        message: "Sellpia 현재고 동기화 결과를 저장하지 못했습니다.",
        progress: scope === "full" ? 0.75 : 0.5,
        severity: "error",
      });
      return {
        status: "failed",
        errorCode: "sellpia_import_failed",
        errorMessage: "Sellpia snapshot import failed.",
      };
    }
    const imported = await importResponse.json().catch(() => ({}));
    await sellpiaInventoryLifecycle.finalize(
      operation.runId,
      "succeeded",
      "Sellpia inventory import completed.",
    ).catch(() => undefined);
    await updateSellpiaInventoryOperationAlert(operation, alertContext, {
      status: "succeeded",
      message: scope === "full"
        ? "Sellpia 수익성 데이터 갱신이 완료되었습니다. ABC 등급을 자동 계산합니다."
        : "Sellpia 현재고 동기화가 완료되었습니다.",
      progress: 1,
      severity: "info",
    });
    return {
      status: "succeeded",
      result: {
        scope,
        rowCount: Number.isInteger(collected.snapshot.rowCount)
          ? collected.snapshot.rowCount
          : 0,
        productProfitCount,
        importRunId: typeof imported?.run?.id === "string" ? imported.run.id : null,
      },
    };
  } finally {
    stopFreshnessHeartbeat();
  }
}

async function ordersOperationRequestJson(operation, path, options = {}) {
  const response = await browserOperationRuntimeEnvironmentContext.authedFetch(
    operation.environmentId,
    path,
    options,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`operation_owner_api_${response.status}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("operation_owner_api_invalid_response");
  }
}

async function ordersOperationHeartbeat(operation, progress) {
  if (typeof operation?.heartbeat !== "function") return;
  await operation.heartbeat(progress).catch(() => undefined);
}

function ordersOperationKstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function ordersOperationKstMonthBounds() {
  const current = ordersOperationKstDate();
  const [year, month] = current.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function ordersOperationMessage(value, fallback) {
  const message = typeof value?.error === "string" ? value.error.trim() : "";
  return (message || fallback).slice(0, 300);
}

function ordersOperationNeedsAttention(value) {
  return value?.pendingLogin === true
    || value?.errorCode === "login_required"
    || value?.errorCode === "operator_action_required"
    || value?.errorCode === "coupang_po_session_required"
    || value?.errorCode === "coupang_shipment_session_required";
}

function ordersOperationCount(value) {
  const candidates = [
    value?.rowCount,
    value?.count,
    value?.poCount,
    Array.isArray(value?.rows) ? value.rows.length : null,
    Array.isArray(value?.orders) ? value.orders.length : null,
  ];
  return candidates.find((count) => Number.isInteger(count) && count >= 0) ?? 0;
}

function isOperationCollectableMall(account) {
  if (!account || account.enabled !== true || typeof account.key !== "string") {
    return false;
  }
  return [
    "icecream-mall",
    "kidsnote",
    "kkomangse",
    "onch",
    "kakao",
    "domeggook",
    "kidkids",
    "lotte-on",
    "gs-shop",
    "always",
    "boribori",
    "teacher-mall",
    "art09",
    "haebub-mall",
  ].includes(account.key);
}

async function collectMarketplaceOrdersForOperation(account, collectionDate, collection) {
  switch (account.key) {
    case "icecream-mall":
      return collectIcecreamMallOrders(collectionDate, null, collection);
    case "kidsnote":
      return collectKidsnoteOrders({
        from: collectionDate,
        to: collectionDate,
        status: "",
        withDetail: true,
      }, collection);
    case "kkomangse":
      return collectKkomangseOrders(collection);
    case "onch":
      return collectOnchannelOrders(collectionDate, collection);
    case "kakao":
      return collectKakaoOrders(null, collection);
    case "domeggook":
      return collectDomeggookOrders(collectionDate, collection);
    case "kidkids":
      return collectKidkidsOrders(null, null, collection);
    case "lotte-on":
      return collectLotteonOrders(collection);
    case "gs-shop":
      return collectGsshopOrders(collection);
    case "always":
      return collectAlwayzOrders(collection);
    case "boribori":
      return collectBoriboriOrders({}, collection);
    case "teacher-mall":
      return collectTeachervilleOrders(collection);
    case "art09":
      return collectArt09Orders(collectionDate, collection);
    case "haebub-mall":
      return collectHaebeopOrders({ date: collectionDate }, collection);
    default:
      return {
        success: false,
        errorCode: "unsupported_marketplace",
        error: "This marketplace is not supported by the browser operation.",
      };
  }
}

async function runMarketplaceOrderCollectionOperation(operation) {
  let accounts;
  try {
    accounts = await ordersOperationRequestJson(
      operation,
      "/api/orders/collection/malls",
    );
  } catch {
    return {
      status: "failed",
      errorCode: "marketplace_account_list_failed",
      errorMessage: "Marketplace accounts could not be loaded.",
    };
  }
  const targets = Array.isArray(accounts)
    ? accounts.filter(isOperationCollectableMall)
    : [];
  if (targets.length === 0) {
    return {
      status: "attention_required",
      attentionReason: "marketplace_collection_account_required",
    };
  }

  const requestedDate = typeof operation.input?.collectionDate === "string"
    ? operation.input.collectionDate
    : ordersOperationKstDate();
  const collected = await orderCollectionLifecycle.run(
    { runId: operation.runId, environmentId: operation.environmentId },
    KidItemOrderCollectionLifecycle.createIdentity("all-marketplaces", requestedDate),
    async (collection) => {
      const results = [];
      for (let index = 0; index < targets.length; index += 1) {
        const account = targets[index];
        await ordersOperationHeartbeat(operation, index / targets.length);
        try {
          const result = await collectMarketplaceOrdersForOperation(
            account,
            requestedDate,
            collection,
          );
          if (result?.success === true) {
            const count = ordersOperationCount(result);
            results.push({
              mallKey: account.key,
              mallName: typeof account.name === "string" ? account.name.slice(0, 120) : account.key,
              status: count === 0 || result.empty === true ? "empty" : "succeeded",
              rowCount: count,
            });
          } else {
            results.push({
              mallKey: account.key,
              mallName: typeof account.name === "string" ? account.name.slice(0, 120) : account.key,
              status: ordersOperationNeedsAttention(result) ? "attention_required" : "failed",
              rowCount: 0,
              errorCode: typeof result?.errorCode === "string"
                ? result.errorCode.slice(0, 120)
                : "marketplace_collection_failed",
              message: ordersOperationMessage(result, "Marketplace collection failed."),
            });
          }
        } catch (error) {
          results.push({
            mallKey: account.key,
            mallName: typeof account.name === "string" ? account.name.slice(0, 120) : account.key,
            status: "failed",
            rowCount: 0,
            errorCode: "marketplace_collection_failed",
            message: ordersOperationMessage(error, "Marketplace collection failed."),
          });
        }
      }
      const succeededCount = results.filter(({ status }) => status === "succeeded").length;
      const emptyCount = results.filter(({ status }) => status === "empty").length;
      const attentionCount = results.filter(({ status }) => status === "attention_required").length;
      const failedCount = results.filter(({ status }) => status === "failed").length;
      return {
        success: succeededCount + emptyCount > 0,
        pendingLogin: succeededCount + emptyCount === 0 && attentionCount > 0,
        results,
        succeededCount,
        emptyCount,
        attentionCount,
        failedCount,
      };
    },
  );
  await ordersOperationHeartbeat(operation, 1);
  if (collected?.pendingLogin === true) {
    return {
      status: "attention_required",
      attentionReason: "marketplace_login_required",
    };
  }
  const results = Array.isArray(collected?.results) ? collected.results : [];
  const succeededCount = Number.isInteger(collected?.succeededCount) ? collected.succeededCount : 0;
  const emptyCount = Number.isInteger(collected?.emptyCount) ? collected.emptyCount : 0;
  const attentionCount = Number.isInteger(collected?.attentionCount) ? collected.attentionCount : 0;
  const failedCount = Number.isInteger(collected?.failedCount) ? collected.failedCount : 0;
  if (succeededCount + emptyCount === 0 && attentionCount > 0) {
    return {
      status: "attention_required",
      attentionReason: "marketplace_login_required",
    };
  }
  if (succeededCount + emptyCount === 0 && failedCount > 0) {
    return {
      status: "failed",
      errorCode: "marketplace_collection_failed",
      errorMessage: "Marketplace order collection failed.",
    };
  }
  return {
    status: "succeeded",
    result: {
      collectionDate: requestedDate,
      targetCount: targets.length,
      succeededCount,
      emptyCount,
      attentionCount,
      failedCount,
      rowCount: results.reduce((total, item) => total + item.rowCount, 0),
      results,
    },
  };
}

async function runCoupangShipmentSummaryOperation(operation) {
  const maxPages = Number.isInteger(operation.input?.maxPages)
    ? operation.input.maxPages
    : 40;
  await ordersOperationHeartbeat(operation, 0.1);
  const collected = await collectCoupangShipmentDateSummary({ maxPages });
  if (collected?.success !== true || !Array.isArray(collected.dates)) {
    if (ordersOperationNeedsAttention(collected)) {
      return {
        status: "attention_required",
        attentionReason: "coupang_shipment_session_required",
      };
    }
    return {
      status: "failed",
      errorCode: typeof collected?.errorCode === "string"
        ? collected.errorCode.slice(0, 120)
        : "coupang_shipment_summary_failed",
      errorMessage: ordersOperationMessage(collected, "Coupang shipment query failed."),
    };
  }
  await ordersOperationHeartbeat(operation, 0.7);
  try {
    await ordersOperationRequestJson(operation, "/api/coupang-shipments/date-summary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: collected.dates }),
    });
  } catch {
    return {
      status: "failed",
      errorCode: "coupang_shipment_summary_save_failed",
      errorMessage: "Coupang shipment query results could not be saved.",
    };
  }
  await ordersOperationHeartbeat(operation, 1);
  return {
    status: "succeeded",
    result: {
      scannedPages: Number.isInteger(collected.scannedPages) ? collected.scannedPages : 0,
      totalRows: Number.isInteger(collected.totalRows) ? collected.totalRows : 0,
      dateCount: collected.dates.length,
    },
  };
}

async function resolveRocketAccountForOperation(operation) {
  const requestedAccountId = typeof operation.input?.channelAccountId === "string"
    ? operation.input.channelAccountId
    : null;
  let accounts = await ordersOperationRequestJson(operation, "/api/channels/accounts");
  let rocketAccounts = Array.isArray(accounts)
    ? accounts.filter((account) => account?.channel === "rocket")
    : [];
  if (rocketAccounts.length === 0) {
    const bootstrapped = await ordersOperationRequestJson(
      operation,
      "/api/channels/accounts/rocket/bootstrap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    rocketAccounts = bootstrapped?.id ? [bootstrapped] : [];
  }
  if (requestedAccountId) {
    return rocketAccounts.find(({ id }) => id === requestedAccountId) ?? null;
  }
  return rocketAccounts.length === 1 ? rocketAccounts[0] : null;
}

async function runCoupangRocketPurchaseOrderOperation(operation) {
  let account;
  try {
    account = await resolveRocketAccountForOperation(operation);
  } catch {
    return {
      status: "failed",
      errorCode: "rocket_channel_account_lookup_failed",
      errorMessage: "Rocket channel account could not be loaded.",
    };
  }
  if (!account?.id) {
    return {
      status: "attention_required",
      attentionReason: "rocket_channel_account_selection_required",
    };
  }
  const defaultBounds = ordersOperationKstMonthBounds();
  const from = typeof operation.input?.from === "string" ? operation.input.from : defaultBounds.from;
  const to = typeof operation.input?.to === "string" ? operation.input.to : defaultBounds.to;
  await ordersOperationHeartbeat(operation, 0.1);
  const collected = await orderCollectionLifecycle.run(
    { runId: operation.runId, environmentId: operation.environmentId },
    KidItemOrderCollectionLifecycle.createIdentity("coupang-rocket", to),
    (collection) => collectRocketPoRows({
      from,
      to,
      status: "",
      dateType: "WAREHOUSING_PLAN_DATE",
    }, collection),
  );
  if (collected?.success !== true || !Array.isArray(collected.rows) || !collected.evidence) {
    if (ordersOperationNeedsAttention(collected)) {
      return {
        status: "attention_required",
        attentionReason: "coupang_rocket_session_required",
      };
    }
    return {
      status: "failed",
      errorCode: typeof collected?.errorCode === "string"
        ? collected.errorCode.slice(0, 120)
        : "coupang_rocket_collection_failed",
      errorMessage: ordersOperationMessage(collected, "Coupang Rocket PO collection failed."),
    };
  }
  await ordersOperationHeartbeat(operation, 0.75);
  let preview;
  try {
    preview = await ordersOperationRequestJson(operation, "/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "previewRocket",
        channelAccountId: account.id,
        collection: collected.evidence,
        rows: collected.rows,
        editedQuantities: {},
        clampEditedQuantities: true,
        previewScope: "confirmation_requested",
      }),
    });
  } catch {
    return {
      status: "failed",
      errorCode: "coupang_rocket_catalog_save_failed",
      errorMessage: "Coupang Rocket PO collection could not be saved.",
    };
  }
  await ordersOperationHeartbeat(operation, 1);
  return {
    status: "succeeded",
    result: {
      channelAccountId: account.id,
      from,
      to,
      poCount: Number.isInteger(collected.poCount) ? collected.poCount : 0,
      rowCount: collected.rows.length,
      sourceImportRunId: typeof preview?.catalog?.run?.id === "string"
        ? preview.catalog.run.id
        : null,
    },
  };
}

function handleSellpiaManualMatchPort(port, senderEnvironment) {
  let started = false;
  const finish = (result) => {
    try {
      port.postMessage(result);
    } catch {
      // The web page may have closed while a read-only collection was finishing.
    }
    try {
      port.disconnect();
    } catch {
      // The terminal message and the remote disconnect may race.
    }
  };
  port.onMessage.addListener((message) => {
    if (message?.action === "keepAlive") return;
    if (started) return;
    started = true;
    if (message?.action !== "collectSellpiaManualMatch") {
      finish({
        success: false,
        runId: typeof message?.runId === "string" ? message.runId : "",
        errorCode: "sellpia_manual_match_network_failed",
        error: "Unsupported Sellpia manual-match request.",
      });
      return;
    }
    const environmentId = senderEnvironment.environmentId;
    const scopedMessage = { ...message, environmentId };
    ordersEnvironmentContext.connect(environmentId).catch(() => undefined);
    Promise.resolve(runSellpiaManualMatchCollection(scopedMessage))
      .then(finish)
      .catch((error) => finish({
        success: false,
        runId: scopedMessage.runId,
        errorCode: "sellpia_manual_match_network_failed",
        error: error?.message || "Sellpia manual-match collection failed.",
      }));
  });
}

async function lifecycleForRun(runId, environmentId) {
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (session?.producer === "inventory.sellpia") return sellpiaInventoryLifecycle;
  if (session?.producer === "orders.coupang_shipment_summary") {
    return coupangShipmentSummaryLifecycle;
  }
  if (session?.producer === "orders.coupang_rocket_po") {
    return coupangRocketPoLifecycle;
  }
  if (session?.producer === "orders.sellpia_manual_match") {
    return sellpiaManualMatchLifecycle;
  }
  if (session?.producer === "orders.mall") return orderCollectionLifecycle;
  return null;
}

async function cancelOrdersCollectionSession(runId, environmentId) {
  const lifecycle = await lifecycleForRun(runId, environmentId);
  return lifecycle ? lifecycle.cancel(runId) : null;
}

async function finalizeOrdersCollectionSession(runId, status, message, environmentId) {
  const lifecycle = await lifecycleForRun(runId, environmentId);
  return lifecycle ? lifecycle.finalize(runId, status, message) : null;
}

const ICECREAM_MALL_URL = "https://po.i-screammall.co.kr/main.do";
const ICECREAM_MALL_TAB_MATCHES = [
  "https://*.i-screammall.co.kr/*",
  "https://*.i-screammedia.com/*",
  "https://*.i-screammedia.co.kr/*",
];
const SELLPIA_ORDER_UPLOAD_URL = "https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE";
const SELLPIA_TAB_MATCHES = ["https://*.sellpia.com/*"];
// 송장 재출력 = 송장 업로드용 송장번호 소스(송장 채번된 주문).
const SELLPIA_REPRINT_URL = "https://kiditem.sellpia.com/order_delivery_reprint.html";
// 셀피아 전송 이후 후처리: 재고매칭 화면(조회/자동합포/자동재고매칭) + 송장채번 화면.
const SELLPIA_STOCKMATCH_URL = "https://kiditem.sellpia.com/order_stockmatch.html";
const SELLPIA_INVOICE_URL = "https://kiditem.sellpia.com/order_delivery_link.html";
// 판매현황(몰별·일별 매출) — 대시보드 '몰별 매출' 섹션 소스. order_search.ajax.html(mode=selldate) 스크랩.
const SELLPIA_SALE_SUMMARY_URL = "https://kiditem.sellpia.com/sale_summary.html?mode=main_link";
// 상품별 이익현황 — 재고 분석 '상품별 소진' 소스. stat_action.ajax.html(mode=stat_prd_profit) 스크랩.
const SELLPIA_PRODUCT_PROFIT_URL = "https://kiditem.sellpia.com/stat_prd_profit.html#none";
// 매일 자동수집 알람 + 캐시 키(웹앱이 열릴 때 백엔드로 flush).
const SELLPIA_SALES_CACHE_KEY = "sellpiaSaleSummaryCache";
const SELLPIA_SALES_ORGANIZATION_KEY = "sellpiaSaleSummaryOrganizationId";
const SELLPIA_SALES_ALARM = "sellpiaSaleSummaryDaily";
function sellpiaSalesKey(base, environmentId) {
  return ordersEnvironmentContext.storageKey(base, environmentId);
}
const COUPANG_SHIPMENT_URL = "https://supplier.coupang.com/ibs/asn/active";
const COUPANG_SUPPLIER_TAB_MATCHES = ["https://supplier.coupang.com/*"];
const KIDSNOTE_ORDER_URL = "https://shop.kidsnote.com/_manage/?body=3010";
const KIDSNOTE_TAB_MATCHES = ["https://shop.kidsnote.com/*"];
// 꼬망세(EduPre) 입점관리자 전체주문 (listmaxcount 크게 = 검색결과 전부)
const KKOMANGSE_ORDER_URL =
  "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000";
const KKOMANGSE_TAB_MATCHES = ["https://nstore.edupre.co.kr/*"];
// 온채널 입점관리자 전체주문 (리스트 스크랩 + 주문별 상세모달 fetch)
const ONCHANNEL_ORDER_URL = "https://www.onch3.co.kr/supplier/orders.php?state=all";
const ONCHANNEL_TAB_MATCHES = ["https://www.onch3.co.kr/*"];
// 키드키즈 파트너센터 출고관리 (목록 logis_index + 주문서 logis_down5 스크랩)
// ⚠️미로그인 시 management.htm → partner.kidkids.net/partnerLogin.htm → www.kidkids.net/join/partner_login.htm
// 로 리다이렉트된다. 즉 로그인 폼은 www.kidkids.net 에 있으므로 자동 로그인(executeScript)에는
// manifest host_permissions 에 https://www.kidkids.net/* 가 반드시 있어야 한다(없으면 주입 실패=로그인 불가).
const KIDKIDS_ORDER_URL = "https://partner.kidkids.net/new/pages/logis/management.htm";
const KIDKIDS_TAB_MATCHES = ["https://partner.kidkids.net/*"];
const LOTTEON_ORDER_URL = "https://store.lotteon.com/cm/main/index_SO.wsp";
const LOTTEON_TAB_MATCHES = ["https://store.lotteon.com/*"];
const GSSHOP_ORDER_URL = "https://partners.gsshop.com/logistics/partner-logistics-mng";
const GSSHOP_TAB_MATCHES = ["https://partners.gsshop.com/*"];
const ALWAYZ_ORDER_URL = "https://alwayzseller.ilevit.com/shippings";
const ALWAYZ_TAB_MATCHES = ["https://alwayzseller.ilevit.com/*"];
const KAKAO_ORDER_URL = "https://shopping-seller.kakao.com/order/seller/store-order/integrate/list";
const KAKAO_TAB_MATCHES = ["https://shopping-seller.kakao.com/*"];
// 보리보리/하프클럽 협력사(TRICYCLE seller-club) 주문/배송관리
const BORIBORI_ORDER_URL = "https://seller-club.co.kr/order/orderDeliList";
const BORIBORI_TAB_MATCHES = ["https://seller-club.co.kr/*"];
const BORIBORI_ORDER_TAB_MATCHES = ["https://seller-club.co.kr/order/orderDeliList*"];

// 티쳐몰(퍼스트몰 selleradmin) 입점사배송 주문상품 리스트
const TEACHERVILLE_ORDER_URL = "https://shop.teacherville.co.kr/selleradmin/order/catalog";
const TEACHERVILLE_TAB_MATCHES = ["https://shop.teacherville.co.kr/*"];
const ART09_ORDER_URL = "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1";
const ART09_TAB_MATCHES = ["https://zzogzzog1.cafe24.com/*"];

// 해법몰(제니마켓 mallseller) 입점업체 관리자 — 주문건수목록.
// ⭐엑셀 다운로드(basket_excel.php)는 암호 ZIP 이라 자동화가 어렵지만, 주문 상세 팝업
// (pop_order_info.php)이 수취인·주소·연락처·상품·금액을 모두 주므로 다운로드 없이 수집한다.
const HAEBEOP_ORDER_URL = "https://mallseller.genimarket.co.kr/mall/order/basket_list.php";
const HAEBEOP_TAB_MATCHES = ["https://mallseller.genimarket.co.kr/*"];
// 목록 검색의 "협력사" 기본값(우리 공급사명). 고객사(search_shop_name)와 혼동 주의.
const HAEBEOP_DEFAULT_VENDOR = "거영아이앤디";
const ICECREAM_DELIVERY_HEADERS = [
  "No",
  "주문번호",
  "배송번호",
  "사이트",
  "주문완료일시",
  "주문구분",
  "주문내역구분",
  "주문내역상태",
  "배송유형",
  "배송종류",
  "배송처리유형",
  "택배사",
  "송장번호",
  "배송조회",
  "주문판매유형",
  "거래명세서동봉여부",
  "합배송여부",
  "직배변경 사유",
  "상품번호",
  "상품명",
  "단품명",
  "출고수량",
  "추가입력옵션",
  "증정품",
  "정상가",
  "판매가",
  "판매가(합계)",
  "공급가",
  "공급가(합계)",
  "배송비",
  "Y주문번호",
  "입점사",
  "회원ID",
  "주문자",
  "수취인",
  "수취인휴대폰번호",
  "우편번호",
  "배송지",
  "배송요청사항",
  "배송지시일시",
  "출고지시일시",
  "출고완료일시",
];
const ICECREAM_EXCLUDED_DELIVERY_STATUSES = [
  "출고완료",
  "배송중",
  "배송완료",
  "구매확정",
  "반품접수",
  "회수지시",
  "회수확인",
  "회수완료",
];

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const senderEnvironment = ordersEnvironmentContext.resolveSender(sender);
  if (!senderEnvironment) {
    sendResponse({ success: false, error: "Untrusted KidItem web origin" });
    return false;
  }
  const environmentId = senderEnvironment.environmentId;
  msg = { ...msg, environmentId };
  ordersEnvironmentContext.connect(environmentId).catch(() => undefined);
  const respond = (operation) => {
    Promise.resolve(operation)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "Collection session request failed",
        });
      });
    return true;
  };

  // 수집 세션 공통 액션(list/get/cancel/restart/finalize/openAttentionTab)과
  // ping 은 통합 서비스워커가 처리한다. 도메인 워커가 각자 응답하면 세 리스너가
  // 같은 메시지에 경쟁 응답하게 된다. 이 도메인의 cancel/finalize 구현과
  // capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  if (msg?.action === "collectSellpiaInventory") {
    return respond(sellpiaInventoryLifecycle.run(
      msg,
      {
        sourceOrigin: "https://kiditem.sellpia.com",
        sourceAccountKey: "kiditem",
      },
      (collection) => sellpiaInventory.collect(collection),
    ));
  }

  if (msg?.action === "collectSellpiaManualMatch") {
    return respond(runSellpiaManualMatchCollection(msg));
  }

  if (msg?.action === "collectSellpiaDeliTracking") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity(
        "sellpia",
        typeof msg.endDate === "string" ? msg.endDate : msg.startDate,
      ),
      (collection) => collectSellpiaDeliTracking({
        startDate: typeof msg.startDate === "string" ? msg.startDate : null,
        endDate: typeof msg.endDate === "string" ? msg.endDate : null,
      }, collection),
    ));
  }

  // 판매현황(몰별 매출) 수집 — 읽기 전용(비파괴). 대시보드 '몰별 매출' 섹션 적재용.
  if (msg?.action === "collectSellpiaSaleSummary") {
    const organizationId = normalizeSellpiaSalesOrganizationId(msg.organizationId);
    if (!organizationId) {
      sendResponse({ success: false, error: "판매현황 수집 조직 정보가 없습니다." });
      return false;
    }
    const organizationKey = sellpiaSalesKey(
      SELLPIA_SALES_ORGANIZATION_KEY,
      environmentId,
    );
    chrome.storage.local
      .set({ [organizationKey]: organizationId })
      .then(() => collectSellpiaSaleSummary({
        startDate: typeof msg.startDate === "string" ? msg.startDate : null,
        endDate: typeof msg.endDate === "string" ? msg.endDate : null,
        keepTabOnLoginError: true, // 대화형: 로그인 유도 위해 탭 유지 (무인 알람은 미지정=닫음)
      }))
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "셀피아 판매현황 수집 실패" });
      });
    return true;
  }

  // 상품별 이익현황(월별 소진) 수집 — 읽기 전용. 재고 분석 '상품별 소진' 적재용.
  if (msg?.action === "collectSellpiaProductProfit") {
    // 이 capability는 임의 기간 조회가 아니라, 수익성 평가에 필요한 연속 증거
    // 창을 한 번 읽는 전용 계약이다. 기간은 페이지 컨텍스트가 KST 기준으로 정한다.
    collectSellpiaProductProfit()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "셀피아 상품별 소진 수집 실패" });
      });
    return true;
  }

  // 매일 자동수집 알람이 캐시해둔 판매현황 payload 조회(웹앱이 백엔드로 flush).
  if (msg?.action === "getSellpiaSalesCache") {
    const organizationId = normalizeSellpiaSalesOrganizationId(msg.organizationId);
    if (!organizationId) {
      sendResponse({ success: false, error: "판매현황 캐시 조직 정보가 없습니다." });
      return false;
    }
    const cacheKey = sellpiaSalesKey(SELLPIA_SALES_CACHE_KEY, environmentId);
    chrome.storage.local
      .get(cacheKey)
      .then((o) => {
        const cache = o?.[cacheKey] ?? null;
        sendResponse({
          success: true,
          cache: cache?.organizationId === organizationId ? cache : null,
        });
      })
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  }

  if (msg?.action === "clearSellpiaSalesCache") {
    const organizationId = normalizeSellpiaSalesOrganizationId(msg.organizationId);
    if (!organizationId) {
      sendResponse({ success: false, error: "판매현황 캐시 조직 정보가 없습니다." });
      return false;
    }
    const cacheKey = sellpiaSalesKey(SELLPIA_SALES_CACHE_KEY, environmentId);
    chrome.storage.local
      .get(cacheKey)
      .then((o) => {
        const cache = o?.[cacheKey] ?? null;
        if (cache?.organizationId !== organizationId) return;
        return chrome.storage.local.remove(cacheKey);
      })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  }

  if (msg?.action === "collectIcecreamMallOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("icecream-mall", msg.date),
      (collection) => collectIcecreamMallOrders(
        typeof msg.date === "string" ? msg.date : null,
        normalizeIcecreamMallCredentials(msg.credentials),
        collection,
      ),
    ));
  }

  if (msg?.action === "sendOrderFileToSellpia") {
    sendOrderFileToSellpia({
      shopName: typeof msg.shopName === "string" ? msg.shopName : null,
      fileName: typeof msg.fileName === "string" ? msg.fileName : null,
      fileBase64: typeof msg.fileBase64 === "string" ? msg.fileBase64 : null,
      targetOrderNumbers: sellpiaPostProcessing.normalizeTargetOrderNumbers(
        msg.targetOrderNumbers,
      ),
      environmentId,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          outcome: "unknown",
          error: error?.message || "셀피아 전송 실패",
        });
      });
    return true;
  }

  // 셀피아에 현재 올라와 있는 주문(판매처+주문번호+수취인) 스냅샷. 조회만 하는 비파괴 액션.
  if (msg?.action === "collectSellpiaOrderSnapshot") {
    collectSellpiaOrderSnapshot()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "셀피아 주문 조회 실패",
        });
      });
    return true;
  }

  // 셀피아 전송 이후 후처리(등록→조회→자동합포→자동재고매칭 + 미매칭 리포트). 비파괴 단계.
  if (msg?.action === "sellpiaPostTransfer") {
    runSellpiaPostTransfer(environmentId)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "셀피아 후처리 실패",
        });
      });
    return true;
  }

  // 셀피아 송장 자동채번(되돌리기 어려움). 프론트 확인 게이트 이후에만 호출된다.
  if (msg?.action === "sellpiaAutoInvoice") {
    runSellpiaAutoInvoice(environmentId)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "셀피아 송장채번 실패",
        });
      });
    return true;
  }

  if (msg?.action === "openCoupangShipmentPage") {
    openCoupangShipmentPage()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 화면 열기 실패",
        });
      });
    return true;
  }

  if (msg?.action === "clickCoupangShipmentDownloads") {
    clickCoupangShipmentDownloads({
      date: typeof msg.date === "string" ? msg.date : null,
      labels: msg.labels !== false,
      statements: msg.statements !== false,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 다운로드 실행 실패",
        });
      });
    return true;
  }

  // ── 원클릭 자동 수집: 발송일 기준 쉽먼트 목록(센터순) + Label/내역서 PDF 직접 fetch ──
  if (msg?.action === "collectCoupangShipmentDateSummary") {
    if (KidItemOrderCollectionLifecycle.validRunId(msg.runId)) {
      return respond(coupangShipmentSummaryLifecycle.run(
        msg,
        { source: "coupang-shipment-summary" },
        () => collectCoupangShipmentDateSummary({ maxPages: msg.maxPages }),
      ));
    }
    collectCoupangShipmentDateSummary({ maxPages: msg.maxPages })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 발송일 조회 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectCoupangShipmentList") {
    collectCoupangShipmentList({
      date: typeof msg.date === "string" ? msg.date : "",
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 목록 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "fetchCoupangShipmentPdfBatch") {
    fetchCoupangShipmentPdfBatch({
      items: Array.isArray(msg.items) ? msg.items : [],
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 PDF 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "clearCoupangCookies") {
    clearCoupangSupplierCookies()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쿠키 정리 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectRocketPoRows") {
    return respond(coupangRocketPoLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity(
        "coupang-rocket",
        typeof msg.to === "string" ? msg.to : msg.from,
      ),
      (collection) => collectRocketPoRows({
        from: typeof msg.from === "string" ? msg.from : null,
        to: typeof msg.to === "string" ? msg.to : null,
        status: ["RP", "PA", "RI", "CI", ""].includes(msg.status) ? msg.status : "RP",
        dateType:
          msg.dateType === "PURCHASE_ORDER_DATE"
            ? "PURCHASE_ORDER_DATE"
            : "WAREHOUSING_PLAN_DATE",
      }, collection),
    ));
  }

  if (msg?.action === "listRocketPos") {
    return respond(coupangRocketPoLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity(
        "coupang-rocket",
        typeof msg.to === "string" ? msg.to : msg.from,
      ),
      (collection) => listRocketPos({
        from: typeof msg.from === "string" ? msg.from : null,
        to: typeof msg.to === "string" ? msg.to : null,
        status: typeof msg.status === "string" ? msg.status : "",
      }, collection),
    ));
  }

  if (msg?.action === "collectKidsnoteOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity(
        "kidsnote",
        typeof msg.to === "string" ? msg.to : msg.from,
      ),
      (collection) => collectKidsnoteOrders({
        from: typeof msg.from === "string" ? msg.from : null,
        to: typeof msg.to === "string" ? msg.to : null,
        status: typeof msg.status === "string" ? msg.status : "",
        withDetail: msg.withDetail === true,
      }, collection),
    ));
  }

  if (msg?.action === "collectKkomangseOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("kkomangse", msg.date),
      (collection) => collectKkomangseOrders(collection),
    ));
  }

  if (msg?.action === "collectOnchannelOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("onch", msg.date),
      (collection) => collectOnchannelOrders(msg.date, collection),
    ));
  }

  if (msg?.action === "uploadOnchTracking") {
    uploadOnchTracking({ rows: Array.isArray(msg.rows) ? msg.rows : [] })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "온채널 송장 업로드 실패" });
      });
    return true;
  }

  if (msg?.action === "uploadKidkidsTracking") {
    uploadKidkidsTracking({ rows: Array.isArray(msg.rows) ? msg.rows : [] })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "키드키즈 송장 업로드 실패" });
      });
    return true;
  }

  if (msg?.action === "collectDomeggookOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("domeggook", msg.date),
      (collection) => collectDomeggookOrders(msg.date, collection),
    ));
  }

  if (msg?.action === "uploadDomeggookTracking") {
    uploadDomeggookTracking({
      fileBase64: typeof msg.fileBase64 === "string" ? msg.fileBase64 : "",
      fileName: typeof msg.fileName === "string" ? msg.fileName : "도매꾹_송장.xls",
      orderNos: Array.isArray(msg.orderNos) ? msg.orderNos : [],
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "도매꾹 송장 업로드 실패" });
      });
    return true;
  }

  if (msg?.action === "ensureMallLoggedIn") {
    return respond(ensureMallLoginWithLifecycle(msg));
  }

  if (msg?.action === "collectKidkidsOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("kidkids", msg.date),
      (collection) => collectKidkidsOrders(msg.date, msg.planDate, collection),
    ));
  }

  if (msg?.action === "collectHaebeopOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("haebub-mall", msg.date),
      (collection) => collectHaebeopOrders(
        { date: msg.date, fromDate: msg.fromDate, toDate: msg.toDate, vendor: msg.vendor },
        collection,
      ),
    ));
  }

  if (msg?.action === "collectLotteonOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("lotte-on", msg.date),
      (collection) => collectLotteonOrders(collection),
    ));
  }

  if (msg?.action === "collectGsshopOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("gs-shop", msg.date),
      (collection) => collectGsshopOrders(collection),
    ));
  }

  if (msg?.action === "collectAlwayzOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("always", msg.date),
      (collection) => collectAlwayzOrders(collection),
    ));
  }

  if (msg?.action === "collectKakaoOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("kakao", msg.date),
      (collection) => collectKakaoOrders(msg.date, collection),
    ));
  }

  if (msg?.action === "collectBoriboriOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("boribori", msg.date),
      (collection) => collectBoriboriOrders({
        password: typeof msg.password === "string" ? msg.password : "",
      }, collection),
    ));
  }

  if (msg?.action === "collectTeachervilleOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("teacher-mall", msg.date),
      (collection) => collectTeachervilleOrders(collection),
    ));
  }

  if (msg?.action === "collectArt09Orders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("art09", msg.date),
      (collection) => collectArt09Orders(msg.date, collection),
    ));
  }

  if (msg?.action === "collectCoupangDirectOrders") {
    return respond(orderCollectionLifecycle.run(
      msg,
      KidItemOrderCollectionLifecycle.createIdentity("coupang-direct", msg.date),
      (collection) => collectCoupangDirectOrders(collection),
    ));
  }

  return false;
});

function normalizeIcecreamMallCredentials(value) {
  if (!value || typeof value !== "object") return null;
  const loginId = typeof value.loginId === "string" ? value.loginId.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (!loginId || !password) return null;
  return { loginId, password };
}

// ── 공통: 몰 미로그인 / 페이지 접근불가 에러 처리 ──
// 미로그인 상태로 수집하면 백그라운드 탭이 로그인 페이지로 리다이렉트되고, 그 순간 executeScript 는
// "Cannot access contents of the page" 또는 "Frame with ID 0 was removed" 같은 크롬 날것 에러를 던진다.
// 이런 에러는 사실상 "로그인 필요"라서, 사용자용 메시지로 바꾸고 로그인 탭을 앞으로 띄운다.
function isMallAccessError(err) {
  const m = String((err && err.message) || err || "").toLowerCase();
  return (
    m.includes("cannot access contents") ||
    m.includes("frame with id") ||
    m.includes("no frame with id") ||
    m.includes("frame was removed") ||
    m.includes("cannot access a chrome") ||
    m.includes("cannot be scripted") ||
    m.includes("must request permission") ||
    m.includes("receiving end does not exist") ||
    m.includes("no tab with id") ||
    // 몰 화면에서의 같은 오리진 요청이 네트워크 레벨에서 죽는 건 대체로 로그인 페이지로 밀려난
    // 경우다. raw "Failed to fetch" 를 그대로 올리면 원인도 조치 방법도 알 수 없다.
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed")
  );
}

async function attachOrderCollectionTab(collection, tab, owned) {
  if (!collection) return;
  await collection.attachTab(tab, { owned });
}

// 페이지 접근불가(=대체로 미로그인) 안내 결과. pendingLogin=true 로 프론트가 "로그인 필요"로 표시.
function mallAccessErrorResult(mallName) {
  return {
    success: false,
    pendingLogin: true,
    error:
      `${mallName} 로그인이 필요합니다. ${mallName}에 로그인되어 있는지 확인하세요. ` +
      `방금 열린 ${mallName} 탭에서 로그인한 뒤 다시 '수집하기'를 눌러주세요.`,
  };
}

// 그 외(타임아웃·스크립트 예외 등)는 원문 오류 내용을 몰 이름과 함께 그대로 노출.
function mallGenericErrorResult(mallName, err) {
  return { success: false, error: `${mallName} 수집 오류: ${String((err && err.message) || err)}` };
}

/**
 * 셀피아에 지금 올라와 있는 주문을 판매처(수취인 괄호 이름)+주문번호로 읽어온다.
 * 업로드 직후 주문은 order_collect 대기목록에, 등록된 주문은 재고매칭에 있으므로 둘을 합친다.
 * 웹앱은 이걸 수집 기록과 대조해 "아직 셀피아에 안 올라간 주문"을 계산한다. 조회만 하는 비파괴 액션.
 */
async function collectSellpiaOrderSnapshot() {
  // 포커스를 뺏지 않도록 백그라운드 탭을 따로 열어 조회하고, 끝나면 닫는다.
  // 사용자가 보고 있는 탭/기존 셀피아 탭은 건드리지 않는다.
  const tab = await chrome.tabs.create({ url: SELLPIA_ORDER_UPLOAD_URL, active: false });
  if (!tab?.id) return { success: false, error: "셀피아 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
  await waitForTabReady(tab.id);

  const byOrderNo = new Map();
  const pages = [
    { url: SELLPIA_ORDER_UPLOAD_URL, source: "pending" },
    { url: SELLPIA_STOCKMATCH_URL, source: "stockmatch" },
  ];
  let lastError = null;
  let visited = 0;
  for (const { url, source } of pages) {
    try {
      const current = await chrome.tabs.get(tab.id).catch(() => null);
      const path = String(url).split("?")[0];
      if (!current || !String(current.url || "").startsWith(path)) {
        await chrome.tabs.update(tab.id, { url });
        await waitForTabReady(tab.id);
      }
      const result = await runSellpiaStepInTab(tab.id, "orderSnapshot", 120000);
      if (!result?.success) {
        lastError = result?.error || null;
        continue;
      }
      visited += 1;
      for (const row of result.rows || []) {
        if (!byOrderNo.has(row.orderNo)) byOrderNo.set(row.orderNo, { ...row, source });
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }
  if (visited === 0) {
    // 한 화면도 못 읽었으면 대체로 셀피아 미로그인이다. 로그인할 수 있게 탭을 남긴다.
    keepOpen = true;
    return {
      success: false,
      pendingLogin: true,
      error: lastError || "셀피아 주문 목록을 읽지 못했습니다. 셀피아 로그인 상태를 확인하세요.",
    };
  }
  return {
    success: true,
    orderCount: byOrderNo.size,
    rows: [...byOrderNo.values()],
    partial: visited < pages.length,
    error: visited < pages.length ? lastError : undefined,
  };
  } finally {
    // 조회가 끝났으면 우리가 연 백그라운드 탭을 닫는다.
    if (!keepOpen && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

/**
 * 주문접수 클릭 후 접수 여부를 확실히 판정하지 못했을 때, 셀피아 화면을 직접 조회해
 * 전송한 주문번호가 실제로 들어갔는지 확인한다(조회만 하는 비파괴 단계).
 * 업로드 직후 주문은 order_collect 대기목록에 앉고, 등록까지 진행됐다면 재고매칭에 있으므로
 * 두 화면을 순서대로 확인한다. 한쪽에서라도 찾으면 접수된 것이다.
 */
async function verifySellpiaOrderReceipt(tabId, targetOrderNumbers) {
  const targets = sellpiaPostProcessing.normalizeTargetOrderNumbers(targetOrderNumbers);
  if (targets.length === 0) return null; // 대조할 주문번호가 없으면 판정하지 않는다.
  const pages = [SELLPIA_ORDER_UPLOAD_URL, SELLPIA_STOCKMATCH_URL];
  let lastError = null;
  for (const url of pages) {
    try {
      const current = await chrome.tabs.get(tabId).catch(() => null);
      const path = String(url).split("?")[0];
      if (!current || !String(current.url || "").startsWith(path)) {
        await chrome.tabs.update(tabId, { url });
        await waitForTabReady(tabId);
      }
      const result = await runSellpiaStepInTab(tabId, "verify", 90000, targets);
      if (!result?.success) {
        lastError = result?.error || null;
        continue;
      }
      if (result.foundCount > 0) return { ...result, verifiedOn: url };
      lastError = null;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }
  return {
    success: true,
    foundCount: 0,
    requestedCount: targets.length,
    missingCount: targets.length,
    found: [],
    missing: targets,
    error: lastError,
  };
}

// ── 셀피아 전송 (API 아님 — order_collect 화면에 판매처 선택 + 파일 주입 + 주문접수 클릭) ──
async function sendOrderFileToSellpia({
  shopName,
  fileName,
  fileBase64,
  targetOrderNumbers,
  environmentId,
}) {
  if (!fileBase64 || !fileName) {
    return {
      success: false,
      outcome: "not_submitted",
      error: "셀피아로 보낼 파일이 없습니다.",
    };
  }
  const invoiceTargets = sellpiaPostProcessing.normalizeTargetOrderNumbers(
    targetOrderNumbers,
  );
  if (invoiceTargets.length === 0) {
    return {
      success: false,
      outcome: "not_submitted",
      error:
        "이번 파일의 주문번호가 없어 셀피아 전송을 시작하지 않았습니다. 송장채번 대상을 안전하게 제한할 수 없습니다.",
    };
  }

  let tab;
  try {
    tab = await findOrCreateSellpiaTab();
    if (!tab.id) {
      return {
        success: false,
        outcome: "not_submitted",
        error: "셀피아 탭을 열 수 없습니다.",
      };
    }
    await waitForTabReady(tab.id);
  } catch (error) {
    return {
      success: false,
      outcome: "not_submitted",
      error: error?.message || "셀피아 주문접수 화면을 준비하지 못했습니다.",
    };
  }

  let injected;
  let injectionError = null;
  try {
    injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // Sellpia의 SlickGrid dataView는 페이지 전역에 있으므로 MAIN world에서
        // 행 증가를 직접 관찰해, 화면에 이미 접수된 뒤에도 DOM pager만 기다리지 않는다.
        world: "MAIN",
        func: injectSellpiaOrderFile,
        args: [{
          shopName: shopName || null,
          fileName,
          fileBase64,
          targetOrderNumbers: invoiceTargets,
        }],
      }),
      45000,
      "셀피아 주문접수 화면 주입 시간이 초과되었습니다.",
    );
  } catch (error) {
    // 응답 유실·타임아웃·탭 크래시. 접수됐는지 알 수 없으므로 아래 셀피아 조회로 확정한다.
    injected = null;
    injectionError = error?.message || "셀피아 주문접수 결과를 확인하지 못했습니다.";
  }

  const result = injected?.[0]?.result ?? {
    success: false,
    outcome: "unknown",
    error: injectionError || "셀피아 주문접수 화면에 접근하지 못했습니다.",
  };
  // 접수 여부가 불확실하면 운영자에게 묻지 말고 셀피아 화면을 직접 조회해 확정한다.
  if (result.outcome === "unknown") {
    const verified = await verifySellpiaOrderReceipt(tab.id, invoiceTargets).catch(
      (error) => ({ success: false, error: error?.message || String(error) }),
    );
    if (verified?.success && verified.foundCount > 0 && verified.missingCount === 0) {
      result.success = true;
      result.outcome = "submitted";
      result.verifiedBySellpiaLookup = true;
      result.acceptedTargetOrderNumbers = verified.found.map((row) => row.orderNo);
      result.verifiedReceivers = verified.found;
      result.error = undefined;
      result.message =
        `셀피아 주문 ${verified.foundCount}건 접수 확인 (수취인 대조 완료).`;
    } else if (verified?.success && verified.foundCount === 0) {
      // 셀피아에 한 건도 없으면 접수되지 않은 것이므로 안전하게 재전송할 수 있다.
      result.success = false;
      result.outcome = "not_submitted";
      result.verifiedBySellpiaLookup = true;
      result.error =
        "셀피아에서 이 파일의 주문을 찾지 못했습니다. 접수되지 않았으므로 다시 전송해도 됩니다.";
    } else if (verified?.success && verified.foundCount > 0) {
      // 일부만 들어간 경우는 재전송하면 중복이 되므로 확인 상태를 유지한다.
      result.verifiedBySellpiaLookup = true;
      result.verifiedReceivers = verified.found;
      result.error =
        `셀피아에 ${verified.foundCount}/${verified.requestedCount}건만 확인됐습니다. ` +
        "재전송하면 중복될 수 있으니 셀피아에서 직접 확인해주세요.";
    }
  }
  if (result.success === true && result.outcome === "submitted") {
    const acceptedTargets = sellpiaPostProcessing.normalizeTargetOrderNumbers(
      result.acceptedTargetOrderNumbers,
    );
    if (acceptedTargets.length === 0) {
      result.targetTrackingWarning =
        "새로 접수된 주문번호를 확인하지 못해 자동 송장채번 대상에 포함하지 않았습니다.";
    } else {
      try {
        const tracked = await sellpiaInvoiceTargets.remember(
          environmentId,
          acceptedTargets,
        );
        result.targetOrderCount = tracked.length;
      } catch (error) {
        result.targetTrackingWarning =
          error?.message || "송장채번 대상 주문번호를 보관하지 못했습니다.";
      }
    }
  }
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return { ...result, url: currentTab.url || tab.url || SELLPIA_ORDER_UPLOAD_URL };
}

async function findOrCreateSellpiaTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onUploadPage = tabs.find((tab) => (tab.url || "").includes("order_collect.html"));
  if (onUploadPage?.id) {
    return interactiveTabs.focusTab(
      onUploadPage.id,
      INTERACTIVE_TAB_REASONS.ORDER_FILE_UPLOAD,
    );
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: SELLPIA_ORDER_UPLOAD_URL });
    return interactiveTabs.focusTab(
      tabs[0].id,
      INTERACTIVE_TAB_REASONS.ORDER_FILE_UPLOAD,
    );
  }
  return interactiveTabs.createTab({
    url: SELLPIA_ORDER_UPLOAD_URL,
    reason: INTERACTIVE_TAB_REASONS.ORDER_FILE_UPLOAD,
  });
}

async function openCoupangShipmentPage() {
  const tab = await findOrCreateInteractiveCoupangSupplierTab(
    INTERACTIVE_TAB_REASONS.SHIPMENT_PAGE,
  );
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return {
    success: true,
    tabId: tab.id,
    url: currentTab.url || tab.url || COUPANG_SHIPMENT_URL,
  };
}

async function clickCoupangShipmentDownloads(options) {
  const tab = await findOrCreateInteractiveCoupangSupplierTab(
    INTERACTIVE_TAB_REASONS.SHIPMENT_DOWNLOAD,
  );
  if (!tab?.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickCoupangShipmentDownloadButtons,
      args: [options],
    }),
    90000,
    "쿠팡 쉽먼트 다운로드 버튼 실행 시간이 초과되었습니다.",
  );

  const result = injected[0]?.result ?? {
    success: false,
    error: "쿠팡 쉽먼트 화면에 접근하지 못했습니다.",
  };
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return {
    ...result,
    url: currentTab.url || tab.url || COUPANG_SHIPMENT_URL,
  };
}

// 백그라운드 쿠팡 supplier 탭: 기존 supplier 탭이 있으면 그대로 재사용(포커스를 뺏지 않음),
// 없을 때만 active:false 로 새 탭을 만든다. 목록/라벨/내역서는 same-origin fetch 라
// supplier.coupang.com 의 어떤 경로(로켓 발주 화면 등)에서도 동작한다 → 사용자 화면 그대로 유지.
async function findOrCreateBackgroundCoupangSupplierTab() {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  if (tabs[0]?.id) return tabs[0];
  return chrome.tabs.create({ url: COUPANG_SHIPMENT_URL, active: false });
}

// ── 발송일 조회(달력용): 최근 쉽먼트를 발송일별로 집계 (몇 건 / 박스수) ──
async function collectCoupangShipmentDateSummary(options) {
  const tab = await findOrCreateBackgroundCoupangSupplierTab();
  if (!tab?.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeCoupangShipmentDateSummary,
      args: [Math.min(Math.max(Number(options?.maxPages) || 40, 1), 60)],
    }),
    90000,
    "쿠팡 쉽먼트 발송일 조회 시간이 초과되었습니다.",
  );
  return (
    injected[0]?.result ?? {
      success: false,
      error: "쿠팡 쉽먼트 화면에 접근하지 못했습니다.",
    }
  );
}

// [페이지 주입] 최근 쉽먼트를 페이지네이션하며 발송일별로 집계.
async function scrapeCoupangShipmentDateSummary(maxPages) {
  const PAGE_FETCH_CONCURRENCY = 6;
  const SESSION_REQUIRED = "COUPANG_SHIPMENT_SESSION_REQUIRED";
  const RESPONSE_INVALID = "COUPANG_SHIPMENT_RESPONSE_INVALID";

  async function fetchPage(n) {
    const r = await fetch(
      `/ibs/shipment/parcel/list?pageNumber=${n}&centerCode=&carrierCode=&estimatedDeliveryDate=&shipmentSeq=&purchaseOrderSeq=`,
      { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } },
    );
    if (!r.ok) {
      // 쿠팡 접속이 많아 쿠키가 커지면 Tomcat 이 헤더 과다로 400(때때로 413/431)을 반환한다.
      if (r.status === 400 || r.status === 413 || r.status === 431) throw new Error("COUPANG_COOKIE_BLOAT");
      if (r.status === 401 || r.status === 403) throw new Error(SESSION_REQUIRED);
      throw new Error(`목록 조회 실패 (page ${n}, HTTP ${r.status})`);
    }
    const html = await r.text();
    const responseUrl = String(r.url || "");
    if (r.redirected || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(responseUrl)) {
      throw new Error(SESSION_REQUIRED);
    }
    // 미로그인/세션 만료 응답은 HTTP 200 로그인 HTML일 수 있다. parcel-tab 계약이 없으면
    // 정상적인 빈 결과가 아니므로 빈 배열로 축약하지 않는다.
    if (!/<table\b[^>]*\bid=["']parcel-tab["']/i.test(html)) {
      if (/(?:로그인|login|sign[ -]?in)/i.test(html)) throw new Error(SESSION_REQUIRED);
      throw new Error(RESPONSE_INVALID);
    }
    return html;
  }
  function parseRows(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table#parcel-tab");
    if (!table) throw new Error(RESPONSE_INVALID);
    const heads = Array.from(table.querySelectorAll("thead th")).map((h) => (h.textContent || "").trim());
    const idx = (name) => heads.findIndex((h) => h.includes(name));
    const iSeq = idx("쉽먼트 번호"), iOut = idx("발송일"), iBox = idx("박스수");
    if ([iSeq, iOut, iBox].some((index) => index < 0)) throw new Error(RESPONSE_INVALID);
    const requiredCellCount = Math.max(iSeq, iOut, iBox) + 1;
    const rows = [];
    for (const tr of table.querySelectorAll("tbody tr")) {
      const c = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
      // 쿠팡의 정상적인 빈 결과 placeholder는 단일 colspan 셀이다.
      if (c.length <= 1) continue;
      if (c.length < requiredCellCount) throw new Error(RESPONSE_INVALID);
      const seq = c[iSeq];
      const outbound = c[iOut];
      if (!seq || !/^\d{4}-\d{2}-\d{2}/.test(outbound)) throw new Error(RESPONSE_INVALID);
      rows.push({ seq, outbound, boxes: c[iBox] });
    }
    return rows;
  }
  try {
    const seen = new Set();
    const byDate = new Map();
    let scannedPages = 0;
    let totalRows = 0;
    let reachedLastPage = false;
    for (
      let batchStart = 1;
      batchStart <= maxPages && !reachedLastPage;
      batchStart += PAGE_FETCH_CONCURRENCY
    ) {
      const batchEnd = Math.min(
        batchStart + PAGE_FETCH_CONCURRENCY - 1,
        maxPages,
      );
      const pages = Array.from(
        { length: batchEnd - batchStart + 1 },
        (_, index) => batchStart + index,
      );
      const batchRows = await Promise.all(
        pages.map(async (page) => ({
          page,
          rows: parseRows(await fetchPage(page)),
        })),
      );

      for (const { page, rows } of batchRows) {
        scannedPages = page;
        if (rows.length === 0) {
          reachedLastPage = true;
          break;
        }
        for (const row of rows) {
          if (seen.has(row.seq)) continue;
          seen.add(row.seq);
          totalRows += 1;
          const date = row.outbound.slice(0, 10);
          const boxMatch = String(row.boxes || "").match(/(\d+)/);
          const current = byDate.get(date) || { count: 0, boxes: 0 };
          current.count += 1;
          current.boxes += boxMatch ? Number(boxMatch[1]) : 0;
          byDate.set(date, current);
        }
        if (rows.length < 10) {
          reachedLastPage = true;
          break;
        }
      }
    }
    const dates = [...byDate.entries()]
      .map(([date, v]) => ({ date, count: v.count, boxes: v.boxes }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { success: true, scannedPages, totalRows, dates };
  } catch (e) {
    const msg = String((e && e.message) || e);
    // 쿠팡 접속이 많아 쿠키가 커지면 supplier.coupang.com(Tomcat)이 400/413/431 로 요청을 거부한다.
    // 재시도로는 안 풀리므로(쿠키가 그대로) 쿠키 정리/재로그인 안내로 치환한다.
    if (msg === 'COUPANG_COOKIE_BLOAT') {
      return {
        success: false,
        errorCode: 'coupang_cookie_bloat',
        error: '쿠팡 접속이 많아 supplier.coupang.com 쿠키가 커져(HTTP 400) 요청이 거부됐습니다. 쿠팡 쿠키를 정리하거나 다시 로그인한 뒤 조회하세요.',
      };
    }
    if (msg === SESSION_REQUIRED || msg === 'Failed to fetch') {
      return {
        success: false,
        errorCode: 'coupang_shipment_session_required',
        error: 'Supplier Hub 로그인 세션이 없거나 만료되었습니다. supplier.coupang.com에 로그인한 뒤 다시 조회해주세요.',
      };
    }
    if (msg === RESPONSE_INVALID) {
      return {
        success: false,
        errorCode: 'coupang_shipment_response_invalid',
        error: '쿠팡 쉽먼트 목록 응답 형식이 예상과 다릅니다. 주문수집 확장프로그램을 새로고침한 뒤 다시 조회해주세요.',
      };
    }
    return { success: false, error: msg };
  }
}

// ── 원클릭 자동 수집: 발송일 기준 쉽먼트 목록 (직접 목록 API HTML 파싱) ──
// clickCoupangShipmentDownloads 는 화면 버튼을 눌러 파일명 없는 PDF 를 Downloads 로 흘리지만,
// 이쪽은 목록/라벨/내역서 엔드포인트를 세션 fetch 로 직접 받아 발송일·센터를 정확히 붙인다.
async function collectCoupangShipmentList(options) {
  const tab = await findOrCreateBackgroundCoupangSupplierTab();
  if (!tab?.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeCoupangShipmentList,
      args: [options?.date || ""],
    }),
    90000,
    "쿠팡 쉽먼트 목록 수집 시간이 초과되었습니다.",
  );
  return (
    injected[0]?.result ?? {
      success: false,
      error: "쿠팡 쉽먼트 화면에 접근하지 못했습니다.",
    }
  );
}

async function fetchCoupangShipmentPdfBatch(options) {
  const items = (options?.items || [])
    .filter((it) => it && it.seq && (it.kind === "label" || it.kind === "manifest"))
    .map((it) => ({ seq: String(it.seq), kind: it.kind }));
  if (items.length === 0) return { success: false, error: "요청한 PDF 항목이 없습니다." };

  const tab = await findOrCreateBackgroundCoupangSupplierTab();
  if (!tab?.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchCoupangShipmentPdfsInPage,
      args: [items],
    }),
    120000,
    "쿠팡 쉽먼트 PDF 수집 시간이 초과되었습니다.",
  );
  return (
    injected[0]?.result ?? {
      success: false,
      error: "쿠팡 쉽먼트 PDF 화면에 접근하지 못했습니다.",
    }
  );
}

// ── 쿠키 과다(400 Bad Request) 복구: supplier.coupang.com 에 적용되는 쿠키를 정리 ──
// 헤비하게 쓰면 쿠키가 누적돼 요청 헤더가 서버 상한을 넘고 Tomcat 이 400 을 뱉는다.
// 재시도로는 안 풀리므로 도메인 쿠키를 지워 초기화한다(정리 후 재로그인 필요).
// 주의: 쿠키 "값"은 읽어서 반환/전달/저장하지 않는다(이름만으로 remove). 파괴적이라 웹에서 확인 후 호출.
async function clearCoupangSupplierCookies() {
  if (!chrome.cookies || typeof chrome.cookies.getAll !== "function") {
    return {
      success: false,
      error: "쿠키 정리 권한이 없습니다. 확장프로그램을 최신 버전으로 다시 로드해주세요.",
    };
  }
  const url = "https://supplier.coupang.com/";
  let cookies;
  try {
    cookies = await chrome.cookies.getAll({ url });
  } catch (e) {
    return { success: false, error: "쿠팡 쿠키를 읽지 못했습니다: " + String((e && e.message) || e) };
  }
  let cleared = 0;
  for (const c of cookies) {
    // 호스트 권한을 가진 supplier 호스트 + 각 쿠키의 path 로 remove(값은 다루지 않음).
    // path 별 쿠키까지 지우려 supplier 호스트에 쿠키 path 를 붙인다(.coupang.com 도메인 쿠키 포함).
    const removeUrl = "https://supplier.coupang.com" + (c.path || "/");
    try {
      await chrome.cookies.remove({ url: removeUrl, name: c.name, storeId: c.storeId });
      cleared += 1;
    } catch (_) {
      /* 개별 실패는 무시하고 계속 */
    }
  }
  return { success: true, cleared, total: cookies.length };
}

// [페이지 주입] 발송일(YYYY-MM-DD) 로 쉽먼트 목록을 페이지네이션하며 전량 수집.
// ⚠️ estimatedDeliveryDate(입고예정일) 필터는 발송일과 1:1 이 아니라 누락되므로 무필터로 받고 발송일로 거른다.
// 목록 응답은 JSON 이 아니라 table#parcel-tab HTML 조각. 날짜 파라미터는 YYYYMMDD.
async function scrapeCoupangShipmentList(targetDate) {
  const wanted = (targetDate || "").slice(0, 10);
  async function fetchPage(n) {
    const r = await fetch(
      `/ibs/shipment/parcel/list?pageNumber=${n}&centerCode=&carrierCode=&estimatedDeliveryDate=&shipmentSeq=&purchaseOrderSeq=`,
      { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } },
    );
    if (!r.ok) {
      // 쿠팡 접속이 많아 쿠키가 커지면 Tomcat 이 헤더 과다로 400(때때로 413/431)을 반환한다.
      if (r.status === 400 || r.status === 413 || r.status === 431) throw new Error("COUPANG_COOKIE_BLOAT");
      throw new Error(`목록 조회 실패 (page ${n}, HTTP ${r.status})`);
    }
    return await r.text();
  }
  function parseRows(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table#parcel-tab") || doc.querySelector("table");
    if (!table) return [];
    const heads = Array.from(table.querySelectorAll("thead th")).map((h) => (h.textContent || "").trim());
    const idx = (name) => heads.findIndex((h) => h.includes(name));
    const iSeq = idx("쉽먼트 번호"), iStat = idx("쉽먼트 상태"), iOut = idx("발송일"),
      iIn = idx("입고예정일"), iCen = idx("센터"), iBox = idx("박스수"), iQty = idx("총 납품"),
      iPo = idx("발주서"), iInv = idx("송장");
    return Array.from(table.querySelectorAll("tbody tr"))
      .map((tr) => {
        const c = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
        if (c.length < 6) return null;
        return {
          seq: c[iSeq], status: c[iStat], outbound: c[iOut], inbound: c[iIn],
          center: c[iCen], boxes: c[iBox], qty: c[iQty], po: c[iPo], invoice: c[iInv],
        };
      })
      .filter(Boolean);
  }

  try {
    const seen = new Set();
    const matched = [];
    let scannedPages = 0;
    let emptyStreak = 0; // 대상 날짜 0건 페이지 연속 카운트(블록 종료 감지)
    const MAX_PAGES = 60;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = parseRows(await fetchPage(page));
      scannedPages = page;
      if (rows.length === 0) break; // 마지막 페이지 도달
      let hitThisPage = 0;
      for (const row of rows) {
        if ((row.outbound || "").slice(0, 10) !== wanted) continue;
        if (seen.has(row.seq)) continue;
        seen.add(row.seq);
        matched.push(row);
        hitThisPage += 1;
      }
      if (matched.length > 0) {
        emptyStreak = hitThisPage > 0 ? 0 : emptyStreak + 1;
        // 대상 날짜 블록을 지난 뒤 2페이지 연속 0건이면 종료(발송일은 목록 상단에 뭉쳐 있음)
        if (emptyStreak >= 2) break;
      }
      if (rows.length < 10) break; // 마지막 페이지
    }
    return {
      success: true,
      date: wanted,
      scannedPages,
      count: matched.length,
      shipments: matched,
    };
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg === 'COUPANG_COOKIE_BLOAT') {
      return {
        success: false,
        errorCode: 'coupang_cookie_bloat',
        error: '쿠팡 접속이 많아 supplier.coupang.com 쿠키가 커져(HTTP 400) 요청이 거부됐습니다. 쿠팡 쿠키를 정리하거나 다시 로그인한 뒤 조회하세요.',
      };
    }
    return { success: false, error: msg };
  }
}

// [페이지 주입] 주어진 (seq, kind) 목록의 Label/내역서 PDF 를 세션 fetch → base64.
// kind: "label" → pdf-label/generate, "manifest" → pdf-manifest/generate. parcelShipmentSeq = 쉽먼트 번호.
async function fetchCoupangShipmentPdfsInPage(items) {
  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  const files = [];
  for (const it of items) {
    const path = it.kind === "label" ? "pdf-label" : "pdf-manifest";
    try {
      const r = await fetch(
        `/ibs/shipment/parcel/${path}/generate?parcelShipmentSeq=${it.seq}`,
        { credentials: "include" },
      );
      if (!r.ok) {
        // 쿠키 과다(400/413/431)는 모든 PDF 에 동일하게 발생 → 즉시 중단하고 안내로 치환.
        if (r.status === 400 || r.status === 413 || r.status === 431) {
          return {
            success: false,
            errorCode: "coupang_cookie_bloat",
            error: "쿠팡 접속이 많아 supplier.coupang.com 쿠키가 커져(HTTP 400) PDF 요청이 거부됐습니다. 쿠팡 쿠키를 정리하거나 다시 로그인한 뒤 다시 시도하세요.",
          };
        }
        files.push({ seq: it.seq, kind: it.kind, ok: false, error: `HTTP ${r.status}` });
        continue;
      }
      const buf = await r.arrayBuffer();
      const b = new Uint8Array(buf);
      const isPdf = b[0] === 0x25 && b[1] === 0x50; // %P
      if (!isPdf) {
        files.push({ seq: it.seq, kind: it.kind, ok: false, error: "PDF 아님" });
        continue;
      }
      files.push({ seq: it.seq, kind: it.kind, ok: true, bytes: buf.byteLength, b64: toBase64(buf) });
    } catch (e) {
      files.push({ seq: it.seq, kind: it.kind, ok: false, error: String((e && e.message) || e) });
    }
  }
  return { success: true, files };
}

// ── 로켓 발주확정: 발주리스트(거래처확인요청) + 상세를 풀컬럼 스크래핑 ──
async function collectRocketPoRows({ from, to, status = "RP", dateType = "WAREHOUSING_PLAN_DATE" }, collection) {
  return rocketPoCollection.collect({ from, to, status, dateType }, collection);
}

// ── 로켓 발주 목록(PO 단위, SKU 상세 없이) — 화면 리스트용 빠른 조회 ──
async function listRocketPos({ from, to, status }, collection) {
  return rocketPoCollection.list({ from, to, status }, collection);
}

async function findOrCreateInteractiveCoupangSupplierTab(reason) {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  const shipmentTab = tabs.find((tab) => (tab.url || "").includes("/ibs/asn/active"));
  if (shipmentTab?.id) return interactiveTabs.focusTab(shipmentTab.id, reason);
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: COUPANG_SHIPMENT_URL });
    return interactiveTabs.focusTab(tabs[0].id, reason);
  }
  return interactiveTabs.createTab({ url: COUPANG_SHIPMENT_URL, reason });
}

// ── 꼬망세(EduPre) 주문 수집: 입점관리자 "선택엑셀다운"(get_search_excel) xlsx export 를 fetch ──
async function findOrCreateKkomangseTab() {
  const tabs = await chrome.tabs.query({ url: KKOMANGSE_TAB_MATCHES });
  const listTab = tabs.find((tab) => (tab.url || "").includes("_order_product.list"));
  if (listTab?.id) {
    await chrome.tabs.update(listTab.id, { url: KKOMANGSE_ORDER_URL }); // 검색 파라미터 보장 (백그라운드)
    return { tab: await chrome.tabs.get(listTab.id), created: false };
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KKOMANGSE_ORDER_URL });
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KKOMANGSE_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKkomangseOrders(collection) {
  const { tab, created } = await findOrCreateKkomangseTab();
  if (!tab?.id) return { success: false, error: "꼬망세(nstore.edupre.co.kr) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeKkomangseExport }),
      90000,
      "꼬망세 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "꼬망세 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("꼬망세"); }
    return mallGenericErrorResult("꼬망세", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// nstore.edupre.co.kr 페이지 컨텍스트: .form_list 직렬화 + _mode=get_search_excel 로 xlsx export fetch → base64.
async function scrapeKkomangseExport() {
  try {
    const form = document.querySelector(".form_list") || document.forms[0];
    if (!form) {
      return { success: false, error: "꼬망세 주문 폼을 찾지 못했습니다. nstore.edupre.co.kr 로그인을 확인하세요." };
    }
    const params = new URLSearchParams();
    for (const el of form.querySelectorAll("input[name],select[name],textarea[name]")) {
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      params.append(el.name, el.value);
    }
    params.set("_mode", "get_search_excel");
    const action = form.getAttribute("action") || location.pathname;
    const res = await fetch(action + "?" + params.toString(), { credentials: "include" });
    if (!res.ok) return { success: false, error: "꼬망세 엑셀 다운로드 실패 (HTTP " + res.status + ")" };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
      return { success: false, error: "엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다." };
    }
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
    }
    return { success: true, xlsxBase64: btoa(bin), size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 온채널(onch3) 주문 수집: orders.php 리스트(주문코드+일자) + 주문별 상세모달 fetch ──
async function findOrCreateOnchannelTab() {
  const tabs = await chrome.tabs.query({ url: ONCHANNEL_TAB_MATCHES });
  const orderTab = tabs.find((tab) => (tab.url || "").includes("/supplier/orders"));
  if (orderTab?.id) {
    return { tab: orderTab, created: false }; // 기존 주문 탭 재사용 (포커스 안 뺏음)
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ONCHANNEL_ORDER_URL }); // active 미지정 = 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ONCHANNEL_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectOnchannelOrders(dateFilter, collection) {
  const { tab, created } = await findOrCreateOnchannelTab();
  if (!tab?.id) return { success: false, error: "온채널(onch3.co.kr) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  // 모달 fetch 가 수십 번 → 작업이 길다. MV3 서비스워커 유휴 종료(=message port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeOnchannelOrders,
        args: [dateFilter || ""], // "YYYY-MM-DD" 면 그날 주문만
      }),
      120000,
      "온채널 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "온채널 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("온채널"); }
    return mallGenericErrorResult("온채널", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// onch3.co.kr 페이지 컨텍스트: 리스트에서 주문코드+일자 추출 → (dateFilter 면 그날만) → 주문별 모달 fetch → 파싱.
async function scrapeOnchannelOrders(dateFilter) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  try {
    // 1) 리스트: 주문코드 + 주문일자 (supplierOrderDetailModal arg + 행 첫 날짜)
    const listHtml = await (await fetch("/supplier/orders.php?state=all", { credentials: "include" })).text();
    const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
    const rows = [];
    const seen = new Set();
    for (const tr of ldoc.querySelectorAll("tr")) {
      const m = tr.innerHTML.match(/supplierOrderDetailModal\('([^']+)'\)/);
      if (!m) continue;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const dm = norm(tr.innerText).match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // 첫 날짜 = 주문일자
      rows.push({ orderCode: m[1], date: dm ? dm[0] : "" });
    }
    if (!rows.length) {
      return { success: false, error: "온채널 주문 목록을 찾지 못했습니다. onch3.co.kr 로그인을 확인하세요." };
    }
    // 그날 날짜 필터 (일자가 "YYYY-MM-DD ..." 이므로 startsWith). dateFilter 없으면 전체.
    const dayRows = dateFilter ? rows.filter((r) => r.date.startsWith(dateFilter)) : rows;
    if (!dayRows.length) {
      return { success: true, orders: [], count: 0 }; // 그날 신규 주문 없음 (정상)
    }
    const targets = dayRows.slice(0, 100); // 상한 (오늘만이라 보통 적음)

    // 검증된 상세모달 파서
    const parseModal = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let productPrice = 0;
      let shippingFee = 0;
      for (const t of doc.querySelectorAll("table")) {
        const trs = [...t.rows];
        const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
        const pi = hdr.findIndex((h) => /상품금액/.test(h));
        const si = hdr.findIndex((h) => /배송비/.test(h));
        if (pi >= 0 && si >= 0 && trs[1]) {
          const v = [...trs[1].cells].map((c) => num(c.innerText));
          productPrice = v[pi];
          shippingFee = v[si];
          break;
        }
      }
      let option = "";
      let qty = 1;
      for (const t of doc.querySelectorAll("table")) {
        const trs = [...t.rows];
        const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
        const oi = hdr.findIndex((h) => /^옵션/.test(h));
        const qi = hdr.findIndex((h) => /^수량/.test(h));
        if (oi >= 0 && qi >= 0 && trs[1]) {
          const v = [...trs[1].cells];
          option = norm(v[oi] ? v[oi].innerText : "");
          qty = num(v[qi] ? v[qi].innerText : "") || 1;
          break;
        }
      }
      const field = (re) => {
        for (const t of doc.querySelectorAll("table")) {
          for (const tr of t.rows) {
            const c = [...tr.cells];
            for (let i = 0; i + 1 < c.length; i++) {
              if (re.test(norm(c[i].innerText))) return norm(c[i + 1].innerText);
            }
          }
        }
        return "";
      };
      const addrRaw = field(/^주소$/);
      const zipM = addrRaw.match(/\(?(\d{5})\)?/);
      const txt = norm(doc.body ? doc.body.innerText : "");
      const pm = txt.match(/\(([A-Za-z0-9_-]+)\)\s*(.+?)\s*옵션/);
      return {
        productCode: pm ? pm[1] : "",
        productName: pm ? pm[2].trim() : "",
        option,
        qty,
        productPrice,
        shippingFee,
        customer: field(/받는\s*사람/),
        phone: field(/전화번호/),
        emergency: field(/비상\s*연락처/),
        zip: zipM ? zipM[1] : "",
        address: addrRaw.replace(/^\(?\d{5}\)?\s*/, "").trim(),
        message: field(/배송\s*메시지/),
      };
    };

    // 2) 주문별 상세모달 fetch (4개씩 병렬)
    const orders = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      await Promise.all(
        targets.slice(i, i + CONCURRENCY).map(async (r) => {
          try {
            const res = await fetch("/access/order_access.php?ubr=order_detail_supplier", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: "orderCode=" + encodeURIComponent(r.orderCode),
            });
            orders.push({ orderCode: r.orderCode, date: r.date, ...parseModal(await res.text()) });
          } catch {
            orders.push({ orderCode: r.orderCode, date: r.date }); // 모달 실패 시 최소 정보
          }
        }),
      );
    }
    return { success: true, orders, count: orders.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 키드키즈(kidkids) 주문 수집: 출고관리 목록(logis_index) → (planDate 시)출고예정등록 → 발주서02(logis_down4) ──
// 목록을 헤더 기준으로 읽어 od(CheckBox2)를 앵커 없이 모으고, planDate 가 오면 출고예정 미지정 주문에
// 출고예정일을 지정(mode=ain)한 뒤 발주서02(logis_down4)를 배치 조회해 주소·우편번호·공급단가까지 확보한다.
async function findOrCreateKidkidsTab() {
  const tabs = await chrome.tabs.query({ url: KIDKIDS_TAB_MATCHES });
  const mgmtTab = tabs.find((tab) => (tab.url || "").includes("/logis/management.htm"));
  if (mgmtTab?.id) return { tab: mgmtTab, created: false }; // 기존 출고관리 탭 재사용
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KIDKIDS_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KIDKIDS_ORDER_URL, active: false });
  return { tab, created: true };
}

async function collectKidkidsOrders(dateFilter, planDate, collection) {
  const { tab, created } = await findOrCreateKidkidsTab();
  if (!tab?.id) return { success: false, error: "키드키즈(partner.kidkids.net) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  // 주문서 fetch 가 주문 수만큼 → 길다. MV3 서비스워커 유휴 종료(=port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKidkidsOrders,
        // dateFilter: "YYYY-MM-DD" 면 그 주문일만(없으면 전체). planDate: 있으면 출고예정 미지정 주문에 출고예정일 지정.
        args: [dateFilter || "", planDate || ""],
      }),
      180000,
      "키드키즈 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "키드키즈 화면에 접근하지 못했습니다." };
    // 페이지 컨텍스트가 로그인 리다이렉트를 감지하면(로그인 필요), 빈 목록으로 오인하지 않도록
    // 다른 몰과 동일한 로그인 안내 결과로 바꾸고, 사용자가 로그인할 수 있게 탭을 열어 둔다.
    if (result && result.loginRequired) { keepOpen = created; return mallAccessErrorResult("키드키즈"); }
    return result;
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("키드키즈"); }
    return mallGenericErrorResult("키드키즈", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// ── 해법몰(genimarket mallseller) 주문 수집: 목록(basket_list) + 주문상세(pop_order_info) 스크랩 ──
// ⭐다운로드 없이 수집한다. 엑셀 다운로드(basket_excel.php)는 암호 ZIP 을 요구해 자동화가 어렵지만,
// 주문 상세 팝업이 수취인·주소·우편번호·연락처·상품·금액을 전부 담고 있어 그걸 읽는다.
// 검색 조건: search_ord_status=OY(결제완료), search_mall_name=협력사(우리 공급사명).
// ⚠️search_shop_name 은 "고객사"라 협력사명을 넣으면 0건이 된다.
// 상세에 없는 값(공급단가·제조사)은 빈칸으로 남고, 백엔드 변환기가 고정값 컬럼을 채운다.
async function findOrCreateHaebeopTab() {
  const tabs = await chrome.tabs.query({ url: HAEBEOP_TAB_MATCHES });
  if (tabs[0]?.id) {
    if (!(tabs[0].url || "").includes("/mall/order/")) {
      await chrome.tabs.update(tabs[0].id, { url: HAEBEOP_ORDER_URL }); // 백그라운드
      return { tab: await chrome.tabs.get(tabs[0].id), created: false };
    }
    return { tab: tabs[0], created: false }; // 기존 주문 화면 재사용
  }
  const tab = await chrome.tabs.create({ url: HAEBEOP_ORDER_URL, active: false });
  return { tab, created: true };
}

async function collectHaebeopOrders(options, collection) {
  const { tab, created } = await findOrCreateHaebeopTab();
  if (!tab?.id) return { success: false, error: "해법몰(mallseller.genimarket.co.kr) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  // 주문마다 상세를 받으므로 길어질 수 있다. MV3 유휴 종료(=port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeHaebeopOrders,
        args: [{
          date: options?.date || "",
          fromDate: options?.fromDate || "",
          toDate: options?.toDate || "",
          vendor: options?.vendor || HAEBEOP_DEFAULT_VENDOR,
        }],
      }),
      180000,
      "해법몰 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "해법몰 화면에 접근하지 못했습니다." };
    if (result && result.loginRequired) { keepOpen = created; return mallAccessErrorResult("해법몰"); }
    return result;
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("해법몰"); }
    return mallGenericErrorResult("해법몰", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// mallseller.genimarket.co.kr 페이지 컨텍스트: 목록 POST → orderid 수집 → 주문상세 GET → 주문 객체.
async function scrapeHaebeopOrders(options) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  try {
    if (/login/i.test(location.href) || document.querySelector('input[type="password"]')) {
      return { success: false, loginRequired: true };
    }
    const vendor = options?.vendor || "";
    // 발주일 범위: fromDate~toDate, 없으면 date 하루, 그것도 없으면 오늘.
    const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
    const from = options?.fromDate || options?.date || today;
    const to = options?.toDate || options?.date || today;

    // 1) 목록 검색 (결제완료 = OY). 페이지 링크가 있는 만큼 모두 읽어야 주문을 조용히 누락하지 않는다.
    const listRows = [];
    const queuedPages = [1];
    const fetchedPages = new Set();
    const MAX_LIST_PAGES = 100;
    while (queuedPages.length) {
      const page = queuedPages.shift();
      if (!page || fetchedPages.has(page)) continue;
      if (fetchedPages.size >= MAX_LIST_PAGES) {
        return { success: false, error: "해법몰 목록 페이지가 100페이지를 초과했습니다. 조회 조건을 좁혀 다시 시도하세요." };
      }
      fetchedPages.add(page);
      const body = new URLSearchParams();
      body.set("search_on", "ture");         // 사이트 원본 오타 그대로 보내야 검색이 걸린다
      body.set("page", String(page));
      body.set("s_status", "");
      body.set("search_ord_status", "OY");   // 결제완료
      body.set("str_date", from);
      body.set("end_date", to);
      body.set("search_shop_name", "");      // 고객사(비움)
      body.set("search_mall_name", vendor);  // 협력사
      body.set("searchopt", "prdcode");
      body.set("searchkey", "");
      body.set("s_member_grp", "");
      body.set("search_orderid", "");
      const listRes = await fetch("/mall/order/basket_list.php", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!listRes.ok) return { success: false, error: "해법몰 목록 조회 실패 (페이지 " + page + ", HTTP " + listRes.status + ")" };
      const listHtml = new TextDecoder("utf-8").decode(await listRes.arrayBuffer());
      if (/login|로그인/i.test(String(listRes.url || ""))) return { success: false, loginRequired: true };
      const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
      if (ldoc.querySelector('input[type="password"]')) return { success: false, loginRequired: true };

      // 목록 행: 선택 체크박스(select_checkbox)를 가진 tr.
      // ⚠️hidden orderid/idx 는 행 단위로 격리돼 있지 않다(중첩 테이블 하나에 전 행의 hidden 이 모여 있어
      // tr.querySelector 로는 잡히지 않는다). 그래서 주문번호는 목록 셀에서 읽는다.
      // 셀 구성: [선택][주문날짜][주문번호][주문자명][그룹][상품명][주문방법][은행/입금자][기능]
      for (const cb of ldoc.querySelectorAll('input[name="select_checkbox"]')) {
        let tr = cb;
        while (tr && tr.tagName !== "TR") tr = tr.parentElement;
        if (!tr) continue;
        const c = [...tr.cells].map((td) => norm(td.textContent));
        const orderid = (c[2] || "").replace(/[^0-9]/g, "");
        if (!orderid) continue;
        listRows.push({
          orderid,
          orderDate: c[1] || "",   // 2026-07-31 19:54:20
          ordName: c[3] || "",     // 주문자명
          group: c[4] || "",       // 그룹(일반 등)
          listProduct: c[5] || "",
          payMethod: c[6] || "",   // 주문방법 ("신 + 포") — 셀피아 양식의 결제방법 표기와 같다
        });
      }
      for (const link of ldoc.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href') || '';
        const nextPage = Number(new URL(href, location.href).searchParams.get('page'));
        if (Number.isInteger(nextPage) && nextPage > 0 && !fetchedPages.has(nextPage)) {
          queuedPages.push(nextPage);
        }
      }
    }
    if (!listRows.length) return { success: true, orders: [], count: 0 }; // 결제완료 신규 없음(정상)

    // 2) 주문 상세 파서 — 한 orderid 안에 여러 상품(basket)이 올 수 있다.
    const parseDetail = (html) => {
      const d = new DOMParser().parseFromString(html, "text/html");
      const val = (n) => { const e = d.querySelector(`[name="${n}"]`); return e ? norm(e.value) : ""; };
      // 상품행: select_basket_no 체크박스가 있는 tr = [_, 업체명, _, 상품명, 수량, 판매단가, 금액, 운송장, 상태, ...]
      const items = [];
      for (const cb of d.querySelectorAll('input[name="select_basket_no"]')) {
        let tr = cb;
        while (tr && tr.tagName !== "TR") tr = tr.parentElement;
        if (!tr) continue;
        const c = [...tr.cells].map((x) => norm(x.textContent));
        items.push({
          basket: norm(cb.value), vendor: c[1] || "", name: c[3] || "",
          qty: num(c[4]), unit: num(c[5]), sum: num(c[6]),
          invoice: c[7] === "-" ? "" : (c[7] || ""), status: c[8] || "",
        });
      }
      // 결제방법: 라벨 셀 다음 셀
      let payMethod = "";
      for (const tr of d.querySelectorAll("tr")) {
        const c = [...tr.cells];
        for (let i = 0; i + 1 < c.length; i += 1) {
          if (norm(c[i].textContent) === "결제방법" && !payMethod) payMethod = norm(c[i + 1].textContent);
        }
      }
      // 배송비 = 총결제금액 - 상품금액 합계 (상세에 배송비 단독 필드가 없다)
      const total = num(val("total_price"));
      const itemsSum = items.reduce((s, it) => s + it.sum, 0);
      const shipFee = Math.max(0, total - itemsSum);
      return {
        items, payMethod, total, shipFee,
        prdcode: val("prdcode"),
        sendId: val("send_id"), sendName: val("send_name"), sendEmail: val("send_email"),
        sendTel: val("send_tphone"), sendMobile: val("send_hphone"),
        sendPost: val("send_post"), sendAddr: val("send_address"),
        recvName: val("rece_name"), recvEmail: val("rece_email"),
        recvTel: val("rece_tphone"), recvMobile: val("rece_hphone"),
        recvPost: val("rece_post"), recvAddr: val("rece_address"),
        demand: val("demand"), memo: val("descript"),
      };
    };

    // 3) orderid 별로 한 번만 상세를 받는다(같은 주문의 여러 상품이 목록에 각각 행으로 나온다).
    const detailByOrder = new Map();
    const detailFailures = new Map();
    const orderIds = [...new Set(listRows.map((r) => r.orderid))];
    const CONCURRENCY = 4;
    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      await Promise.all(orderIds.slice(i, i + CONCURRENCY).map(async (oid) => {
        try {
          const res = await fetch("/mall/order/pop_order_info.php?orderid=" + encodeURIComponent(oid), {
            credentials: "include",
          });
          if (!res.ok) {
            detailFailures.set(oid, "HTTP " + res.status);
            return;
          }
          const html = new TextDecoder("utf-8").decode(await res.arrayBuffer());
          detailByOrder.set(oid, parseDetail(html));
        } catch (error) {
          detailFailures.set(oid, String((error && error.message) || error || "네트워크 오류"));
        }
      }));
    }
    if (detailFailures.size) {
      const failures = orderIds
        .filter((oid) => detailFailures.has(oid))
        .map((oid) => oid + " (" + detailFailures.get(oid) + ")");
      return { success: false, error: "해법몰 주문 상세 조회 실패: " + failures.join(", ") };
    }

    // 4) 주문 단위로 펼친다. 목록은 "어떤 주문이 결제완료인가"만 알려주고, 상품·금액·주소는 상세에서 온다.
    //    상세 상품행(basket)이 곧 셀피아 한 행이며 등록번호가 된다. 한 주문에 여러 상품이면 여러 행.
    //    같은 주문이 목록에 여러 번 나와도 상세는 한 번만 펼친다.
    const orders = [];
    const expanded = new Set();
    for (const r of listRows) {
      if (expanded.has(r.orderid)) continue;
      expanded.add(r.orderid);
      const d = detailByOrder.get(r.orderid);
      if (!d) return { success: false, error: "해법몰 주문 상세 조회 실패: " + r.orderid };
      // 결제완료 상태의 상품행만(목록 검색 조건과 같은 의미). 상태를 못 읽으면 전부 포함한다.
      const paid = d.items.filter((it) => !it.status || it.status.includes("결제완료"));
      const targets = paid.length ? paid : d.items;
      targets.forEach((item, i) => {
        orders.push({
          orderNo: r.orderid,
          regNo: item.basket,                 // 등록번호 = 장바구니 번호
          vendor: item.vendor || vendor,
          productName: item.name,
          productCode: d.prdcode,
          option: "",
          qty: item.qty,
          sellPrice: item.unit,
          sellAmount: item.sum,
          shipFee: i === 0 ? d.shipFee : 0,   // 배송비는 주문당 1회(첫 상품행)
          payMethod: r.payMethod || d.payMethod,
          orderDate: r.orderDate,
          invoice: item.invoice,
          ordName: d.sendName || r.ordName,
          group: r.group,
          ordId: d.sendId,
          ordEmail: d.sendEmail,
          ordTel: d.sendTel,
          ordMobile: d.sendMobile,
          ordPost: d.sendPost,
          ordAddr: d.sendAddr,
          recvName: d.recvName,
          recvTel: d.recvTel,
          recvMobile: d.recvMobile,
          recvPost: d.recvPost,
          recvAddr: d.recvAddr,
          demand: d.demand,
          memo: d.memo,
          status: item.status || "결제완료",
        });
      });
    }
    return { success: true, orders, count: orders.length, detailCount: detailByOrder.size };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 롯데ON(store.lotteon.com) 주문 수집: 판매자센터 배송관리 "신규주문" 엑셀을 백그라운드 다운로드 ──
// 롯데ON 판매자센터는 soapi.lotteon.com REST(Authorization: Bearer, 토큰은 sessionStorage.AuthToken).
// 개인정보 다운로드 사유(saveDownloadReason)를 먼저 등록해 encryptKey 를 받고, 그걸 _dnldKey 쿼리로
// downloadDeliveryExcel 에 넘겨 fileId 발급 → fileManage CDN 다운로드. 반환은 xlsx(OpenXML) base64.
async function findOrCreateLotteonTab() {
  const tabs = await chrome.tabs.query({ url: LOTTEON_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 로그인된 기존 탭 재사용
  const tab = await chrome.tabs.create({ url: LOTTEON_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectLotteonOrders(collection) {
  const { tab, created } = await findOrCreateLotteonTab();
  if (!tab?.id) return { success: false, error: "롯데ON(store.lotteon.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  // 롯데ON 판매자센터는 SPA + 토큰(sessionStorage.AuthToken)/SSO 로그인이라 확장이 ID/비번을 자동 입력할 수
  // 없다(캡차·통합회원 로그인). 미로그인이면 로그인 탭을 앞으로 띄워 사용자가 직접 로그인하도록 안내한다.
  let loginNeeded = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeLotteonOrders,
      }),
      120000,
      "롯데ON 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "롯데ON 화면에 접근하지 못했습니다." };
    if (!result.success && /로그인|인증|세션/.test(result.error || "")) {
      loginNeeded = true;
      return {
        success: false,
        pendingLogin: true,
        error:
          "롯데ON 판매자센터에 로그인되어 있지 않습니다. 방금 열린 롯데ON 탭에서 로그인한 뒤 다시 '수집하기'를 눌러주세요. (롯데ON은 통합회원 로그인이라 자동 로그인은 지원하지 않습니다.)",
      };
    }
    return result;
  } finally {
    // 로그인 안내로 띄운 탭은 사용자가 로그인해야 하므로 닫지 않는다.
    if (created && tab.id && !loginNeeded) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// store.lotteon.com 페이지 컨텍스트: sessionStorage 토큰으로 soapi 3단계(사유등록→엑셀요청→파일다운) 호출.
async function scrapeLotteonOrders() {
  try {
    const tok = sessionStorage.getItem("AuthToken");
    if (!tok) {
      return { success: false, error: "롯데ON 판매자센터 로그인이 필요합니다. 로그인 후 다시 시도하세요." };
    }
    const API = "https://soapi.lotteon.com";
    const H = {
      authorization: "Bearer " + tok,
      accept: "application/json",
      "content-type": 'application/json; charset="UTF-8"',
    };
    // 배송관리 신규주문 검색 조건 = 최근 31일(주문접수 owhoDttm) + 진행단계 11(신규주문/상품준비). 판매자센터 기본값과 동일.
    const ymd = (d) =>
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
    const end = new Date();
    const start = new Date(end.getTime() - 31 * 24 * 60 * 60 * 1000);

    // 1) 개인정보 다운로드 사유 등록 → encryptKey
    const saveRes = await fetch(API + "/soapi/v1/bocommon/auth/saveDownloadReason", {
      method: "POST",
      headers: H,
      credentials: "include",
      body: JSON.stringify({ dnldRsnCnts: "배송을 위한 주문정보 다운로드" }),
    });
    const saveJson = await saveRes.json();
    if (saveJson?.returnCode !== "SUCCESS" || !saveJson?.data) {
      return { success: false, error: "롯데ON 다운로드 사유 등록에 실패했습니다. (" + (saveJson?.returnCode || saveRes.status) + ")" };
    }
    const encryptKey = saveJson.data;

    // 2) 엑셀 다운로드 요청(_dnldKey 필수) → fileId 발급
    const params = new URLSearchParams({
      _dnldKey: encryptKey,
      searchDateType: "owhoDttm",
      strtDt: ymd(start),
      endDt: ymd(end),
      odPrgsStepCd: "11",
      dtlCndType: "",
      dtlCndCnts: "",
      sndDlYn: "",
      sndCloseYn: "",
      cmbnDvPsbYn: "all",
      cnclReqYn: "",
      alrdDvYn: "",
      menuId: "ML000003707",
      pageNo: "1",
      rowsPerPage: "500",
    });
    const dlRes = await fetch(
      API + "/soapi/v2/delivery/sodeliverymanagement/sodeliverymanagement/downloadDeliveryExcel?" + params.toString(),
      { headers: H, credentials: "include" },
    );
    const dlJson = await dlRes.json();
    if (dlJson?.returnCode !== "SUCCESS" || !dlJson?.data?.fileId) {
      if (dlJson?.returnCode === "REQUIRED_DOWN_LOAD_REASON") {
        return { success: false, error: "롯데ON 다운로드 사유 인증에 실패했습니다. 다시 시도하세요." };
      }
      return { success: false, error: "롯데ON 엑셀 생성에 실패했습니다. (" + (dlJson?.returnCode || dlRes.status) + ")" };
    }
    const fileId = dlJson.data.fileId;
    const fileName = dlJson.data.fileName || "롯데ON.xlsx";

    // 3) 발급된 fileId 로 실제 파일(xlsx) 다운로드 → base64
    const fileRes = await fetch(API + "/soapi/v1/bocommon/o/fileManage/download/" + fileId, {
      headers: { authorization: "Bearer " + tok, "x-timezone": "GMT+09:00" },
      credentials: "include",
    });
    if (!fileRes.ok) {
      return { success: false, error: "롯데ON 파일 다운로드에 실패했습니다. (" + fileRes.status + ")" };
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
    return { success: true, xlsxBase64: btoa(bin), fileName, size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 보리보리(seller-club) 주문 수집: 출고대기 일괄엑셀다운로드(사유+비번) 언마스킹 xlsx ──
// 셀피아 보리보리 양식 = 출고대기 언마스킹 다운로드와 동일(35컬럼 passthrough). 서버가 사유+비번으로
// 개인정보 언마스킹 → POST /order/rest/deli/downloadPkgOrdDeliList/excel-xlsx (검색조건+reason+password).
// 세션 쿠키만 있으면 seller-club 아무 페이지에서나 same-origin fetch 가능. 비번=seller-club 로그인 비밀번호.
async function findOrCreateBoriboriTab() {
  const orderTabs = await chrome.tabs.query({ url: BORIBORI_ORDER_TAB_MATCHES });
  if (orderTabs[0]?.id) return { tab: orderTabs[0], created: false }; // 주문/배송관리 탭 우선 재사용
  const tab = await chrome.tabs.create({ url: BORIBORI_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectBoriboriOrders(options = {}, collection) {
  const { tab, created } = await findOrCreateBoriboriTab();
  if (!tab?.id) return { success: false, error: "보리보리(seller-club.co.kr) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트로 fetch (ISOLATED 는 SameSite 로그인 쿠키 미전송 → 404)
        func: scrapeBoriboriOrders,
        args: [typeof options.password === "string" ? options.password : ""],
      }),
      120000,
      "보리보리 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "보리보리 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("보리보리"); }
    return mallGenericErrorResult("보리보리", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// ── 티쳐몰(퍼스트몰 selleradmin) 출고 전 주문 수집 ──
// 리스트 order/catalog 의 excel_down 이 셀피아 양식(엑셀템플릿 117 "티쳐몰 주문서") SpreadsheetML(36컬럼)을 반환.
// 실제 사이트 JS excel_down(step): order_seq='search' + seq=<양식id> + params(search-form 직렬화) POST.
async function findOrCreateTeachervilleTab() {
  const tabs = await chrome.tabs.query({ url: TEACHERVILLE_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 로그인된 기존 탭 재사용
  const tab = await chrome.tabs.create({ url: TEACHERVILLE_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectTeachervilleOrders(collection) {
  const { tab, created } = await findOrCreateTeachervilleTab();
  if (!tab?.id) return { success: false, error: "티쳐몰(shop.teacherville.co.kr) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    // search-form 은 order/catalog 에만 있으므로 다른 페이지면 이동.
    const cur = await chrome.tabs.get(tab.id);
    if (!(cur.url || "").includes("/selleradmin/order/catalog")) {
      await chrome.tabs.update(tab.id, { url: TEACHERVILLE_ORDER_URL });
      await waitForTabReady(tab.id);
    }
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트로 fetch (로그인 세션 쿠키 + jQuery serialize)
        func: scrapeTeachervilleOrders,
      }),
      120000,
      "티쳐몰 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "티쳐몰 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("티쳐몰"); }
    return mallGenericErrorResult("티쳐몰", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// shop.teacherville.co.kr(selleradmin) 페이지 컨텍스트: 출고 전 주문을 셀피아 양식(엑셀템플릿 117)으로
// order_process/excel_down POST → SpreadsheetML(.xls) base64. ⭐seq=117(티쳐몰 주문서)여야 데이터가 나옴.
async function scrapeTeachervilleOrders() {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const loginRequired = () => ({
      success: false,
      pendingLogin: true,
      errorCode: "login_required",
      error: "티쳐몰 로그인이 필요합니다. selleradmin에 로그인한 뒤 다시 수집해주세요.",
    });
    const providerContractChanged = (message) => ({
      success: false,
      errorCode: "provider_contract_changed",
      error: message,
    });
    const pageLooksLikeLogin = () => {
      const bodyText = document.body ? document.body.innerText || "" : "";
      const href = typeof location !== "undefined" ? String(location.href || "") : "";
      return (
        /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
        || Boolean(document.querySelector('input[type="password"]'))
      );
    };
    // 페이지/jQuery/엑셀폼 로딩 대기
    for (let i = 0; i < 30 && !(document.querySelector("form#excel_down_form") && (window.$ || window.jQuery)); i += 1) {
      await sleep(300);
    }
    const form = document.querySelector("form#excel_down_form");
    if (!form) {
      return pageLooksLikeLogin()
        ? loginRequired()
        : providerContractChanged("티쳐몰 주문 다운로드 폼을 찾지 못했습니다. 주문관리 화면 구조를 확인해주세요.");
    }
    // 목록(catalog_ajax)이 채워질 때까지 잠깐 더 대기 — 주문 행 체크박스가 지연 렌더된다.
    for (let i = 0; i < 20 && document.querySelectorAll('input[type="checkbox"][name="order_seq[]"]').length === 0; i += 1) {
      await sleep(300);
    }
    // 출고 전 상태 행(25 결제확인·35 상품준비·40 부분출고준비·45 출고준비)의 order_seq[] 수집.
    // 55 출고완료부터는 이미 출고된 주문이라 제외. (tr class 예: "list-row step25")
    const PRE_SHIP = ["25", "35", "40", "45"];
    const seqs = [];
    document.querySelectorAll('input[type="checkbox"][name="order_seq[]"]').forEach((c) => {
      const tr = c.closest("tr");
      const step = ((tr && tr.className) || "").match(/step(\d+)/);
      if (step && PRE_SHIP.includes(step[1]) && c.value) seqs.push(c.value);
    });
    if (seqs.length === 0) {
      if (pageLooksLikeLogin()) return loginRequired();
      const bodyText = document.body ? document.body.innerText || "" : "";
      if (/조회[^\n]{0,30}(?:주문|결과|데이터)[^\n]{0,20}(?:없|0건)|(?:주문|결과|데이터)[^\n]{0,30}(?:없|0건)/i.test(bodyText)) {
        return { success: true, empty: true, rowCount: 0 };
      }
      return providerContractChanged(
        "티쳐몰 주문 목록의 로딩 완료 여부를 확인하지 못했습니다. 주문관리 화면을 새로고침한 뒤 다시 수집해주세요.",
      );
    }
    // excel_down: 양식 117(티쳐몰 주문서) + 체크박스 order_seq 파이프 목록 + 다운로드 사유(5~50자).
    // excel_provider_seq(입점사 seq)/ship_set 은 폼 히든값을 그대로 사용. excel_type/step/params 는 보내지 않는다.
    const providerSeq = (form.querySelector('input[name="excel_provider_seq"]') || {}).value || "708";
    const shipSet = (form.querySelector('[name="excel_ship_set_code"]') || {}).value || "";
    const body = new URLSearchParams();
    body.set("order_seq", seqs.join("|") + "|");
    body.set("seq", "117");
    body.set("excel_provider_seq", providerSeq);
    body.set("excel_ship_set_code", shipSet);
    body.set("download_reason_select", "direct");
    body.set("download_reason_text", "배송준비확인");
    body.set("download_reason", "배송준비확인");
    const res = await fetch("/selleradmin/order_process/excel_down", {
      method: "POST",
      credentials: "include",
      body,
    });
    if (res.status === 401 || res.status === 403 || /login/i.test(String(res.url || ""))) {
      return loginRequired();
    }
    if (!res.ok) {
      return providerContractChanged("티쳐몰 엑셀 다운로드 응답을 확인하지 못했습니다 (HTTP " + res.status + ").");
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 100) {
      const responseText = new TextDecoder().decode(buf);
      if (/login|로그인|세션.*(?:만료|없)|type=["']?password/i.test(responseText)) {
        return loginRequired();
      }
      if (/(?:주문|결과|데이터)[^\n]{0,30}(?:없|0건)|no\s*(?:orders?|data)/i.test(responseText)) {
        return { success: true, empty: true, rowCount: 0 };
      }
      return providerContractChanged("티쳐몰 엑셀 응답 형식을 확인하지 못했습니다.");
    }
    // SpreadsheetML(XML) 텍스트 → base64 그대로 전달 (백엔드 SheetJS 가 파싱). btoa 는 latin1 바이트 기준.
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
    return { success: true, xlsxBase64: btoa(bin), fileName: "티쳐몰.xls", size: buf.length, orderCount: seqs.length };
  } catch (e) {
    const message = String((e && e.message) || e);
    return {
      success: false,
      errorCode: /failed to fetch|networkerror|network request failed|load failed/i.test(message)
        ? "network_failed"
        : "unknown_failure",
      error: /failed to fetch|networkerror|network request failed|load failed/i.test(message)
        ? "티쳐몰 주문 수집 요청에 실패했습니다. 네트워크 상태를 확인해주세요."
        : message,
    };
  }
}

// ── 아트공구(Cafe24) 주문 수집: 주문목록의 주문번호 → 배송정보 상세 fetch → Cafe24 CSV 행 ──
async function findOrCreateArt09Tab() {
  const tabs = await chrome.tabs.query({ url: ART09_TAB_MATCHES });
  const listTab = tabs.find((tab) => (tab.url || "").includes("/order_list.php"));
  if (listTab?.id) return { tab: listTab, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ART09_ORDER_URL });
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ART09_ORDER_URL, active: false });
  return { tab, created: true };
}

async function collectArt09Orders(date, collection) {
  const { tab, created } = await findOrCreateArt09Tab();
  if (!tab?.id) return { success: false, error: "아트공구(zzogzzog1.cafe24.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const current = await chrome.tabs.get(tab.id).catch(() => tab);
    if (!(current.url || "").includes("/order_list.php")) {
      await chrome.tabs.update(tab.id, { url: ART09_ORDER_URL });
      await waitForTabReady(tab.id);
    }
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeArt09Orders,
        args: [date || null],
      }),
      180000,
      "아트공구 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "아트공구 화면에 접근하지 못했습니다." };
    if (!result.success && result.pendingLogin) {
      keepOpen = true;
    }
    return result;
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("아트공구"); }
    return mallGenericErrorResult("아트공구", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

async function scrapeArt09Orders(dateFilter) {
  const ORDER_ID_RE = /\b\d{8}-\d{7}\b/g;
  const ORDER_DATETIME_RE = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
  const compact = (s) => clean(s).replace(/\s|[:：]/g, "").toLowerCase();
  const normalizeOrderItemId = (value, orderId) => {
    const match = clean(value).match(/\b\d{8}-\d{7}-\d{2,}\b/);
    return match && match[0].startsWith(`${orderId}-`) ? match[0] : "";
  };

  try {
    const listOrders = readVisibleOrderList();
    if (listOrders.length === 0) {
      // 미로그인 판정은 "주문목록 페이지를 벗어났는가"(로그인 리다이렉트)로만 한다.
      // 본문 "로그인" 텍스트와 input[type=password] 는 로그인된 Cafe24 admin 화면에도
      // 그대로 존재해서(로그인 기록·보안 입력칸) 둘 다 오탐을 낸다 — 라이브에서 확인됨.
      const path =
        typeof location !== "undefined" ? `${location.pathname}${location.search}` : "";
      const redirectedAwayFromOrders = path !== "" && !/order_list\.php/i.test(path);
      if (redirectedAwayFromOrders) {
        return {
          success: false,
          pendingLogin: true,
          error: "아트공구 로그인이 필요합니다. zzogzzog1.cafe24.com 에 로그인한 뒤 다시 수집해주세요.",
        };
      }
      return {
        success: true,
        rows: [],
        count: 0,
        orderCount: 0,
        failures: [],
      };
    }

    const rows = [];
    const failures = [];
    for (const order of listOrders) {
      try {
        const detail = await fetchOrderDetail(order.orderId);
        const items = detail.items.length > 0 ? detail.items : fallbackItems(order.productText);
        items.forEach((item) => {
          rows.push({
            shopName: "한국어 쇼핑몰",
            shopNo: "1",
            orderId: order.orderId,
            orderItemId: normalizeOrderItemId(item.orderItemId, order.orderId),
            message: detail.message || "",
            totalOrderAmount: "****",
            totalPaymentAmount: "****",
            productNo: item.productNo || "",
            productName: item.name || "",
            productNameWithOption: item.optionName || item.name || "",
            qty: item.qty || "1",
            salePrice: "****",
            receiver: detail.receiver || "",
            receiverPhone: detail.receiverPhone || "",
            receiverZip: detail.receiverZip || "",
            receiverAddress: detail.receiverAddress || "",
            receiverAddressDetail: detail.receiverAddressDetail || "",
            paymentType: detail.paymentType || "T",
            paymentMethod: detail.paymentMethod || "",
            orderedAt: detail.orderedAt || order.orderedAt || "",
            country: "",
          });
        });
      } catch (e) {
        failures.push(`${order.orderId}: ${String((e && e.message) || e)}`);
      }
    }

    if (rows.length === 0 && failures.length > 0) {
      return { success: false, error: "아트공구 주문 상세 수집 실패: " + failures.slice(0, 3).join(" / ") };
    }

    return {
      success: true,
      rows,
      count: rows.length,
      orderCount: new Set(rows.map((row) => row.orderId).filter(Boolean)).size,
      failures,
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }

  function readVisibleOrderList() {
    const candidates = [];
    let hasCheckedRows = false;
    for (const tr of Array.from(document.querySelectorAll("tr"))) {
      if (!isVisible(tr)) continue;
      const text = clean(tr.innerText || "");
      const ids = Array.from(text.matchAll(ORDER_ID_RE)).map((m) => m[0]);
      if (!ids.length) continue;
      const orderId = ids[0];
      const checkbox = tr.querySelector('input[type="checkbox"]');
      const orderLink = tr.querySelector('a[href*="order_id="], a[onclick*="order_id"]');
      if (!checkbox && !orderLink) continue;
      const checked = Boolean(checkbox && checkbox.checked);
      if (checked) hasCheckedRows = true;
      const cells = Array.from(tr.cells || []).map((cell) => clean(cell.innerText || cell.textContent || ""));
      const headers = tableHeaderCells(tr.closest("table")).map((cell) => compact(cell));
      const stateIndex = findHeaderIndex(headers, ["처리상태", "주문상태", "배송상태"]);
      if (stateIndex < 0 || !compact(cells[stateIndex] || "").includes(compact("배송준비전"))) continue;
      const productIndex = findHeaderIndex(headers, ["상품명", "주문상품명"]);
      const orderCellIndex = cells.findIndex((cell) => cell.includes(orderId));
      const orderedAt = (text.match(ORDER_DATETIME_RE) || [])[0] || "";
      if (dateFilter && (!orderedAt || orderedAt.slice(0, 10) !== dateFilter)) continue;
      const productText =
        productIndex >= 0 ? normalizeProductName(cells[productIndex] || "") : pickListProductText(cells, orderCellIndex);
      candidates.push({ orderId, orderedAt, productText, checked });
    }
    const filtered = hasCheckedRows ? candidates.filter((row) => row.checked) : candidates;
    const seen = new Set();
    const out = [];
    for (const item of filtered) {
      if (seen.has(item.orderId)) continue;
      seen.add(item.orderId);
      out.push(item);
    }
    return out;
  }

  function tableHeaderCells(table) {
    if (!table) return [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const cells = rowCells(tr);
      const headers = cells.map((cell) => compact(cell));
      if (headers.some((cell) => cell.includes("주문번호")) && headers.some((cell) => cell.includes("상품명"))) {
        return cells;
      }
    }
    return [];
  }

  function pickListProductText(cells, orderCellIndex) {
    const start = Math.max(0, orderCellIndex + 1);
    for (const cell of cells.slice(start)) {
      if (!cell) continue;
      if (/\b\d{8}-\d{7}\b/.test(cell)) continue;
      if (/^\*+$/.test(cell)) continue;
      if (/총\s*상품|금액|주문자|회원/.test(cell)) continue;
      if (cell.length > 8) return normalizeProductName(cell);
    }
    return "";
  }

  async function fetchOrderDetail(orderId) {
    const url = `/supp/php/s/order_shipping_info.php?order_id=${encodeURIComponent(orderId)}&menu_no=74`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`상세 HTTP ${res.status}`);
    const html = await decodeResponse(res);
    if (!/<html|<table|수령|상품|배송|주문/i.test(html)) throw new Error("상세 응답이 비어 있습니다");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rawAddress = readLabeledValue(doc, ["수령인주소", "수취인주소", "배송지주소", "배송주소", "주소"], ["우편"]);
    const detailAddress = readLabeledValue(doc, ["상세주소", "수령인상세주소", "수취인상세주소"], []);
    const zip = readLabeledValue(doc, ["수령인우편번호", "수취인우편번호", "우편번호"], []);
    const address = splitAddress(zip, rawAddress, detailAddress);
    return {
      receiver: readLabeledValue(doc, ["수령인", "수취인", "받는분", "받으시는분"], ["휴대", "전화", "연락", "우편", "주소"]),
      receiverPhone: readLabeledValue(doc, ["수령인휴대전화", "수취인휴대전화", "휴대전화", "휴대폰", "연락처", "전화번호"], []),
      receiverZip: address.zip,
      receiverAddress: address.address,
      receiverAddressDetail: address.detail,
      message: readLabeledValue(doc, ["배송메시지", "배송메세지", "배송요청사항", "배송요청"], []),
      paymentType: readLabeledValue(doc, ["결제구분"], []) || "T",
      paymentMethod: readLabeledValue(doc, ["결제수단", "결제방법"], []),
      orderedAt: readLabeledValue(doc, ["발주일", "주문일", "결제일", "주문일시"], []) || ((clean(doc.body?.innerText || "").match(ORDER_DATETIME_RE) || [])[0] || ""),
      items: parseItems(doc, orderId),
    };
  }

  async function decodeResponse(res) {
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "";
    const charset = (contentType.match(/charset=([^;]+)/i) || [])[1] || "";
    const encodings = [charset, "euc-kr", "utf-8"].filter(Boolean);
    let best = "";
    let bestScore = -1;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding).decode(buf);
        const score = (text.match(/[가-힣]/g) || []).length - (text.match(/\uFFFD/g) || []).length * 20;
        if (score > bestScore) {
          best = text;
          bestScore = score;
        }
      } catch {
        /* unsupported encoding */
      }
    }
    return best || new TextDecoder().decode(buf);
  }

  function parseItems(doc, orderId) {
    const out = [];
    for (const table of Array.from(doc.querySelectorAll("table"))) {
      const trs = Array.from(table.querySelectorAll("tr"));
      const headerInfo = findItemHeader(trs);
      if (!headerInfo) continue;
      const { index, headers } = headerInfo;
      const nameIndex = findHeaderIndex(headers, ["주문상품명", "상품명", "품목명"]);
      const optionIndex = findHeaderIndex(headers, ["옵션포함", "옵션", "옵션명"]);
      const orderItemIdIndex = findHeaderIndex(headers, ["품목별주문번호", "상품주문번호"]);
      const productNoIndex = findHeaderIndex(headers, ["상품번호", "상품코드", "품목코드", "상품품목코드"]);
      const qtyIndex = findHeaderIndex(headers, ["수량", "주문수량", "구매수량"]);
      if (nameIndex < 0 || qtyIndex < 0) continue;
      for (const tr of trs.slice(index + 1)) {
        const cells = rowCells(tr);
        if (cells.length < 2) continue;
        if (tr.querySelector?.('[colspan]')) continue;
        const normalized = cells.map((cell) => compact(cell));
        if (normalized.some((cell) => cell.includes("상품명")) && normalized.some((cell) => cell.includes("수량"))) continue;
        const name = normalizeProductName(cells[nameIndex] || "");
        if (!name || /합계|총계|배송비|결제정보|안내|설명/.test(name)) continue;
        const qty = numericText(cells[qtyIndex]);
        if (!qty || Number(qty) <= 0) continue;
        out.push({
          orderItemId: orderItemIdIndex >= 0
            ? normalizeOrderItemId(cells[orderItemIdIndex], orderId)
            : "",
          productNo: productNoIndex >= 0 ? productNumber(cells[productNoIndex]) : "",
          name,
          optionName: optionIndex >= 0 ? normalizeProductName(cells[optionIndex]) || name : name,
          qty,
        });
      }
      if (out.length > 0) return out;
    }
    return out;
  }

  function findItemHeader(trs) {
    for (let i = 0; i < Math.min(trs.length, 8); i += 1) {
      const headers = rowCells(trs[i]).map((cell) => compact(cell));
      const hasName = headers.some((cell) => cell.includes("상품명") || cell.includes("품목명"));
      const hasQty = headers.some((cell) => cell.includes("수량"));
      const hasProductNo = headers.some((cell) => cell.includes("상품번호") || cell.includes("상품코드"));
      if (hasName && (hasQty || hasProductNo)) return { index: i, headers };
    }
    return null;
  }

  function findHeaderIndex(headers, labels) {
    const normalized = labels.map((label) => compact(label));
    return headers.findIndex((header) => normalized.some((label) => header.includes(label)));
  }

  function rowCells(tr) {
    return Array.from(tr.cells || []).map((cell) => cellText(cell));
  }

  function readLabeledValue(doc, labels, excludes) {
    const normalizedLabels = labels.map((label) => compact(label));
    const normalizedExcludes = excludes.map((label) => compact(label));
    for (const tr of Array.from(doc.querySelectorAll("tr"))) {
      const cells = rowCells(tr);
      for (let i = 0; i < cells.length; i += 1) {
        const key = compact(cells[i]);
        if (!key) continue;
        if (normalizedExcludes.some((label) => key.includes(label))) continue;
        if (!normalizedLabels.some((label) => key.includes(label))) continue;
        const next = cleanMultiline(cells[i + 1] || "");
        if (next) return next;
        const stripped = stripLabels(cells[i], labels);
        if (stripped) return stripped;
      }
    }
    return "";
  }

  function stripLabels(value, labels) {
    let out = cleanMultiline(value);
    for (const label of labels) {
      out = out.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：]?", "gi"), "");
    }
    return cleanMultiline(out);
  }

  function splitAddress(zipValue, addressValue, detailValue) {
    let zip = clean(zipValue).replace(/[^0-9]/g, "").slice(0, 5);
    let addressRaw = cleanMultiline(addressValue);
    const match = addressRaw.match(/\b\d{5}\b/);
    if (!zip && match) zip = match[0];
    if (match) addressRaw = cleanMultiline(addressRaw.replace(match[0], ""));
    addressRaw = addressRaw.replace(/^\[|\]$/g, "").trim();
    const parts = addressRaw.split(/\n+/).map(clean).filter(Boolean);
    return {
      zip,
      address: parts[0] || addressRaw,
      detail: clean(detailValue) || parts.slice(1).join(" "),
    };
  }

  function fallbackItems(productText) {
    const name = normalizeProductName(productText);
    return name ? [{ productNo: "", name, optionName: name, qty: "1" }] : [];
  }

  function productNumber(value) {
    const m = clean(value).match(/\d{3,}/);
    return m ? m[0] : clean(value);
  }

  function numericText(value) {
    const m = clean(value).match(/\d+/);
    return m ? m[0] : "";
  }

  function normalizeProductName(value) {
    const lines = String(value || "")
      .split(/\r?\n| {2,}/)
      .map(clean)
      .filter(Boolean);
    const picked =
      lines.find((line) => !/공급사상품명|옵션|상품번호|품목번호|^\d+$/.test(line)) || lines[0] || "";
    return clean(picked.replace(/\[[^\]]*공급사상품명[^\]]*\]/g, ""));
  }

  function cellText(cell) {
    return cleanMultiline((cell && (cell.innerText || cell.textContent)) || "");
  }

  function cleanMultiline(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .join("\n");
  }

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}

// seller-club.co.kr 페이지 컨텍스트: 출고대기(stateCd=d) 일괄엑셀 언마스킹 다운로드 POST → base64 xlsx.
// 언마스킹은 "다운로드 사유"만 필요(비밀번호 불필요 — type:reason). reason="배송확인합니다".
async function scrapeBoriboriOrders(downloadPassword) {
  const boriboriLoginRequired = () => ({
    success: false,
    pendingLogin: true,
    errorCode: "login_required",
    error:
      "보리보리 로그인이 필요합니다. seller-club.co.kr 에 로그인한 뒤 다시 수집해주세요.",
  });
  // 미로그인이면 주문 화면 대신 로그인 화면으로 리다이렉트된다. 그 상태로 아래 fetch 를 돌리면
  // 브라우저가 원인 없는 raw "Failed to fetch" 만 던져 사용자에게 "로그인 필요"를 알릴 수 없다.
  // 그래서 주문 경로에 머물러 있는지 먼저 확인한다.
  try {
    const path = typeof location !== "undefined" ? String(location.pathname || "") : "";
    if (path && !/\/order\//i.test(path)) return boriboriLoginRequired();
  } catch (e) {
    /* location 접근 실패는 판정하지 않고 그대로 진행 */
  }
  try {
    const p = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 24 * 60 * 60 * 1000); // 결제완료 미처리분이 밀렸을 수 있어 60일
    const password = typeof downloadPassword === "string" ? downloadPassword : "";
    const downloadType = password ? "password" : "reason";
    // orderAdmin.js paramVo 기본값 + 결제완료(stateCd='c') + 사유/비번. (showExcelDownloadPkgModal 와 동일 body)
    const paramVo = {
      siteCd: "0", brandNo: null, brandCd: "", brandNm: "", brndTyp: "01",
      schDtAuto: "", schDtTyp: "05", strDt: ymd(start), endDt: ymd(end),
      prdNmTyp: "01", prdNm: "", stateCd: "c", soldOut: "",
      defaultMdNo: null, defaultMdNm: "", prdGroupNo: "0", prdGroupCd: "0", prdGroupNm: "",
      prdGroupNoArray: [], prdGroupCdArray: [], prdGroupNmArray: [], defaultMdNoArray: [], defaultMdNmArray: [],
      selAcntNo: null, selAcntNm: "", appId: "", grnkBrandNo: null, deliList: [],
      currentPage: 1, currentIndex: 0, rowCount: 1000,
      reason: "배송확인합니다", password, type: downloadType,
    };
    // 새 탭이면 SPA 인증 초기화 전에 fetch → 404. 준비될 때까지 재시도 (기존 로그인 탭이면 1회로 성공).
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const bodies = [
      paramVo,
      { ...paramVo, type: "reason" },
      { paramVo, type: downloadType, reason: paramVo.reason, password },
      { paramVo: { ...paramVo, type: "reason" }, type: "reason", reason: paramVo.reason, password },
      { ...paramVo, type: "reason", password: "" },
    ];
    const endpoints = [
      "/order/rest/deli/downloadPkgOrdDeliList/excel-xlsx",
      "/order/rest/deli/downloadPkgOrdDeliList",
    ];
    let lastFailure = null;
    for (const body of uniqueJsonBodies(bodies)) {
      for (const endpoint of endpoints) {
        let res = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          res = await fetch(endpoint, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body,
          });
          if (res.ok) break;
          if (res.status === 401 || res.status === 403) {
            await sleep(2000); // 인증(세션) 초기화 대기 후 재시도
            continue;
          }
          break; // 404(결제완료 0건)·그 외 상태는 재시도 무의미 (빠른 실패)
        }
        if (!res || !res.ok) {
          const failure = await boriboriHttpFailure(res);
          if (failure.empty || failure.pendingLogin) return failure;
          lastFailure = failure;
          continue;
        }
        const ct = res.headers.get("content-type") || "";
        const buf = new Uint8Array(await res.arrayBuffer());
        const kind = excelKind(ct, buf);
        if (kind) {
          let bin = "";
          for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
          return {
            success: true,
            xlsxBase64: btoa(bin),
            fileName: kind === "xls" ? "보리보리.xls" : "보리보리.xlsx",
            size: buf.length,
          };
        }
        const downloadError = boriboriDownloadError(buf, password);
        if (/로그인.*확인/.test(downloadError)) return boriboriLoginRequired();
        lastFailure = {
          success: false,
          errorCode: /비밀번호.*저장/.test(downloadError)
            ? "operator_action_required"
            : "provider_contract_changed",
          error: downloadError,
        };
        if (/비밀번호.*저장/.test(downloadError)) break;
      }
      if (lastFailure?.errorCode === "operator_action_required") break;
    }
    return lastFailure || {
      success: false,
      errorCode: "unknown_failure",
      error: "보리보리 다운로드가 거부되었습니다. 사유/비밀번호를 확인하세요.",
    };
  } catch (e) {
    const message = String((e && e.message) || e);
    // 주문 경로/401/403/로그인 응답으로 확인되지 않은 네트워크 오류를 로그인으로 추정하지 않는다.
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      return {
        success: false,
        errorCode: "network_failed",
        error: "보리보리 주문 수집 요청에 실패했습니다. 네트워크 상태를 확인해주세요.",
      };
    }
    return { success: false, errorCode: "unknown_failure", error: "보리보리 수집 오류: " + message };
  }

  function uniqueJsonBodies(items) {
    const seen = new Set();
    return items
      .map((item) => JSON.stringify(item))
      .filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function excelKind(contentType, bytes) {
    const isXlsx = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isXls =
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0;
    if (isXlsx) return "xlsx";
    if (isXls) return "xls";
    if (bytes.length >= 200 && /spreadsheet|excel|octet-stream/i.test(contentType)) return "xlsx";
    return null;
  }

  async function boriboriHttpFailure(response) {
    if (!response) {
      return {
        success: false,
        errorCode: "network_failed",
        error: "보리보리 엑셀 다운로드 응답이 없습니다. 네트워크 상태를 확인해주세요.",
      };
    }
    if (response.status === 401 || response.status === 403) {
      return boriboriLoginRequired();
    }
    let responseText = "";
    try {
      responseText = String(await response.text()).slice(0, 4000);
    } catch (e) {
      /* 상태 코드만으로 분류한다. */
    }
    if (/login|로그인|session|세션.*(?:만료|없)|unauthori/i.test(responseText)) {
      return boriboriLoginRequired();
    }
    if (response.status === 404) {
      // 404 자체는 라우트 변경/인증 초기화 실패일 수도 있다. 제공사 응답이 주문 없음임을 명시할 때만 empty다.
      if (/(?:조회|결제완료|주문|결과|데이터)[^\n]{0,40}(?:없|0건)|no\s*(?:orders?|data)/i.test(responseText)) {
        return { success: true, empty: true, rowCount: 0 };
      }
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "보리보리 주문 다운로드 경로를 확인하지 못했습니다. seller-club 화면 구조를 확인해주세요.",
      };
    }
    return {
      success: false,
      errorCode: "unknown_failure",
      error: "보리보리 엑셀 다운로드 실패 (" + response.status + ").",
    };
  }

  function boriboriDownloadError(bytes, sentPassword) {
    const decoded = new TextDecoder().decode(bytes.slice(0, 4000));
    try {
      const json = JSON.parse(decoded);
      const message = json && (json.message || json.returnMessage || json.error || json.msg);
      if (message) {
        const text = String(message);
        if (!sentPassword && /비밀번호|password|pwd/i.test(text)) {
          return "보리보리 언마스킹 다운로드에 비밀번호가 필요합니다. 몰 계정 관리에서 보리보리 비밀번호를 저장한 뒤 다시 수집해주세요.";
        }
        return "보리보리: " + text;
      }
    } catch {
      /* not json */
    }
    if (!sentPassword && /비밀번호|password|pwd/i.test(decoded)) {
      return "보리보리 언마스킹 다운로드에 비밀번호가 필요합니다. 몰 계정 관리에서 보리보리 비밀번호를 저장한 뒤 다시 수집해주세요.";
    }
    if (/login|로그인|session|세션/i.test(decoded)) {
      return "보리보리 seller-club 로그인을 확인한 뒤 다시 수집해주세요.";
    }
    return "보리보리 다운로드가 거부되었습니다. 사유/비밀번호를 확인하세요.";
  }
}

// ── 쿠팡직배송(사입) 발주 수집: 발주확정(PA) 발주 → 품목(/scm 상세) + 센터주소 ──
// 발주현황=발주확정(PA), 운송유형(SHIPMENT=쉽먼트/MILKRUN=밀크런) 그대로 담아 백엔드가 분리 생성.
// ⚠️품목 상세(/scm/purchase/order/get)는 po-web 컨텍스트서 fetch 하면 로그인페이지 → /scm 페이지로
// 이동한 뒤 그 컨텍스트에서 fetch 해야 인증됨. 목록/센터(po-web API)는 같은 origin이라 /scm 서도 됨.
async function collectCoupangDirectOrders(collection) {
  return coupangPoSession.run(collection, async (tab) => {
    const keepAlive = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    }, 20000);
    try {
      // 1) 발주확정 목록 (po-web API) → seq/센터/운송유형
      const listInjected = await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: scrapeCoupangPaList,
        }),
        60000,
        "쿠팡 발주 목록 수집 시간이 초과되었습니다.",
      );
      const listRes = listInjected[0]?.result;
      if (!listRes?.success) {
        return listRes ?? { success: false, error: "쿠팡 발주 목록에 접근하지 못했습니다." };
      }
      if (!listRes.pos.length) return { success: true, pos: [], centers: {}, count: 0 };

      // 2) /scm 컨텍스트로 이동 (품목 fetch 인증 위해). 첫 발주 상세 페이지.
      await chrome.tabs.update(tab.id, {
        url: "https://supplier.coupang.com/scm/purchase/order/get/" + listRes.pos[0].seq,
      });
      await waitForTabReady(tab.id);

      // 3) 품목(/scm) + 센터주소 수집
      const dataInjected = await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: scrapeCoupangDirectData,
          args: [listRes.pos],
        }),
        180000,
        "쿠팡 발주 품목 수집 시간이 초과되었습니다.",
      );
      return dataInjected[0]?.result ?? {
        success: false,
        error: "쿠팡 발주 상세에 접근하지 못했습니다.",
      };
    } catch (error) {
      if (isMallAccessError(error)) {
        return {
          ...mallAccessErrorResult("쿠팡직배송"),
          errorCode: "coupang_po_session_required",
        };
      }
      return mallGenericErrorResult("쿠팡직배송", error);
    } finally {
      clearInterval(keepAlive);
    }
  });
}

// po-web 페이지 컨텍스트: 발주확정(PA) 목록 fetch → seq/센터/운송유형/입고예정일/발주일.
async function scrapeCoupangPaList() {
  const poSessionError = () => ({
    success: false,
    pendingLogin: true,
    errorCode: "coupang_po_session_required",
    error:
      "쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
  });
  try {
    const p = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    // 쿠팡 발주유형이 긴급인지. 필드명이 확정적이지 않아 값에 담긴 신호로 판정한다.
    // 이 함수는 페이지 컨텍스트로 주입되므로 반드시 안쪽에 둔다.
    // UTC 타임스탬프를 KST(UTC+9) 날짜(YYYY-MM-DD)로. 이미 날짜만 오면 그대로 둔다.
    const kstYmd = (value) => {
      const raw = String(value == null ? "" : value).trim();
      if (!raw) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const t = Date.parse(raw);
      if (Number.isNaN(t)) return raw.slice(0, 10);
      // UTC+9 로 옮긴 뒤 UTC 게터로 읽는다. 로컬 게터를 쓰면 실행 PC 시간대에 따라
      // 또 한 번 밀린다.
      const k = new Date(t + 9 * 60 * 60 * 1000);
      return k.getUTCFullYear() + "-" + p(k.getUTCMonth() + 1) + "-" + p(k.getUTCDate());
    };
    // 발주유형. 실제 응답은 purchaseOrderType = "URGENT" | "NORMAL" 이고
    // purchaseOrderTypeDescription 에 "긴급"/"일반" 이 온다.
    const isUrgentCoupangPo = (po) => {
      const code = String((po && po.purchaseOrderType) || "").trim().toUpperCase();
      if (code) return code === "URGENT";
      return /긴급/.test(String((po && po.purchaseOrderTypeDescription) || ""));
    };
    // 쿠팡 발주목록 화면의 "기간검색 = 입고예정일 / 다음 30일" 과 같은 조회.
    // 파라미터는 실제 화면 요청에서 확인했다(searchDateType=WAREHOUSING_PLAN_DATE).
    // 발주일 기준으로 보면 앞으로 입고될 발주를 놓친다.
    const dayOffset = (days) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d;
    };
    const start = dayOffset(0);
    const end = dayOffset(30);
    const pos = [];
    for (let page = 1; page <= 40; page++) {
      const qs =
        "page=" + page + "&searchDateType=WAREHOUSING_PLAN_DATE&searchStartDate=" + ymd(start) +
        "&searchEndDate=" + ymd(end) +
        "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=PA" +
        "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";
      const res = await fetch("/po-web/app/purchase-order/list?" + qs, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok || text.trim().charAt(0) === "<") {
        if (page === 1) return poSessionError();
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (page === 1) return poSessionError();
        break;
      }
      const body = (j && j.body) || {};
      const list = body.body || [];
      for (const po of list) {
        const status = String(po.purchaseOrderStatus || po.purchaseOrderStatusCode || "").toUpperCase();
        const statusText = String(po.purchaseOrderStatusDescription || po.purchaseOrderStatusName || "");
        if (status && status !== "PA") continue;
        if (!status && statusText && !/발주\s*확정/.test(statusText)) continue;
        pos.push({
          seq: po.purchaseOrderSeq,
          center: po.centerName,
          transport: po.transportType, // SHIPMENT | MILKRUN
          // 쿠팡은 UTC 로 준다(2026-07-31T15:00:00Z = KST 08-01). 앞 10자만 자르면
          // 입고예정일이 하루씩 밀리므로 KST 기준 날짜로 바꿔 담는다.
          edd: kstYmd(po.expectedDeliveryDate),
          reg: kstYmd(po.createdAt) || po.createdAt,
          status: status || statusText || "PA",
          // 발주유형(긴급/일반). 쿠팡이 코드로 줄지 한글로 줄지 확정되지 않아 후보 필드를
          // 모두 보고 "긴급" 신호만 불리언으로 정규화한다. 못 읽으면 일반으로 본다.
          urgent: isUrgentCoupangPo(po),
        });
      }
      if (page >= (body.lastPageNumber || 1)) break;
    }
    return { success: true, pos };
  } catch (e) {
    if (String((e && e.message) || e) === "Failed to fetch") return poSessionError();
    return { success: false, error: "쿠팡 발주 목록 조회 실패(로그인 확인): " + String((e && e.message) || e) };
  }
}

// /scm 페이지 컨텍스트: 발주별 품목(/scm 상세 HTML 파싱) + 센터주소(po-web) 수집.
async function scrapeCoupangDirectData(pos) {
  try {
    const confirmedPos = Array.isArray(pos) ? pos.filter(isCoupangConfirmedPo) : [];
    const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
    // 센터주소맵 (po-web API, 같은 origin)
    const centers = {};
    try {
      const cj = await (await fetch("/po-web/app/center/purchasable/list", { credentials: "include" })).json();
      const cb = (cj && cj.body) || cj;
      const clist = Array.isArray(cb) ? cb : (cb && cb.body) || [];
      clist.forEach((c) => {
        if (c && c.centerName) centers[String(c.centerName).trim()] = { addr: c.address, zip: c.zipCode, contact: c.contact };
      });
    } catch { /* 센터맵 실패 — 주소 빈칸으로 진행 */ }

    // 품목 파싱: /scm 상세의 "바코드" 헤더 테이블. 각 품목행 td = [순번,상품번호,"바코드 상품명",매입유형,발주수량,납품가능,매입가,...,총발주매입금(idx9)]
    const parseItems = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const t of doc.querySelectorAll("table")) {
        if (!/바코드/.test(t.innerText)) continue;
        const items = [];
        for (const tr of t.querySelectorAll("tr")) {
          const c = [...tr.querySelectorAll("td")].map((x) => x.textContent.replace(/\s+/g, " ").trim());
          const m = c[2] && c[2].match(/^(\d{12,14})\s+(.+)/);
          if (m) items.push({ skuId: c[1], barcode: m[1], name: m[2], qty: num(c[4]), amount: num(c[9]) });
        }
        if (items.length) return items;
      }
      return [];
    };

    const out = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < confirmedPos.length; i += CONCURRENCY) {
      await Promise.all(
        confirmedPos.slice(i, i + CONCURRENCY).map(async (po) => {
          try {
            const html = await (await fetch("/scm/purchase/order/get/" + po.seq, { credentials: "include" })).text();
            out.push({ ...po, items: parseItems(html) });
          } catch {
            out.push({ ...po, items: [] });
          }
        }),
      );
    }
    return { success: true, pos: out, centers, count: out.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }

  function isCoupangConfirmedPo(po) {
    const status = String(po?.status || po?.purchaseOrderStatus || po?.purchaseOrderStatusCode || "").toUpperCase();
    const statusText = String(po?.purchaseOrderStatusDescription || po?.purchaseOrderStatusName || "");
    if (status) return status === "PA";
    if (statusText) return /발주\s*확정/.test(statusText);
    return true;
  }
}

// ── GS샵(partners.gsshop.com) 주문 수집: 협력사 배송관리 화면 UI 구동 + 클라이언트 조립 엑셀 blob 캡처 ──
// GS 는 서버 엑셀 엔드포인트가 없고 다운로드 클릭 시 브라우저가 xlsx 를 조립해 URL.createObjectURL 로 내려준다.
// → MAIN world 에서 createObjectURL 후킹 후 1주일 조회 → 다운로드 → 모달(도로명/전체주소 기본) 확인 → blob 캡처.
async function findOrCreateGsshopTab() {
  const tabs = await chrome.tabs.query({ url: GSSHOP_TAB_MATCHES });
  const mng = tabs.find((t) => (t.url || "").includes("partner-logistics-mng"));
  if (mng?.id) return { tab: mng, created: false }; // 기존 배송관리 탭 재사용
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: GSSHOP_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: GSSHOP_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectGsshopOrders(collection) {
  const { tab, created } = await findOrCreateGsshopTab();
  if (!tab?.id) return { success: false, error: "GS샵(partners.gsshop.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  // 조회+상세 fetch 후 클라이언트 엑셀 조립까지 길다. MV3 서비스워커 유휴 종료(=port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeGsshopOrders,
      }),
      140000,
      "GS샵 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "GS샵 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("GS샵"); }
    return mallGenericErrorResult("GS샵", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// partners.gsshop.com 페이지 컨텍스트(MAIN): 1주일 조회 → 다운로드 → 모달 확인 → 조립된 xlsx blob → base64.
async function scrapeGsshopOrders() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout, interval) => {
    const end = Date.now() + (timeout || 20000);
    while (Date.now() < end) {
      let v;
      try {
        v = fn();
      } catch (e) {
        v = null;
      }
      if (v) return v;
      await sleep(interval || 300);
    }
    return null;
  };
  const btnByText = (txt, inDialog) => {
    const scope = inDialog ? document.querySelector('[role=dialog]') : document;
    if (!scope) return null;
    return (
      Array.from(scope.querySelectorAll("button")).find(
        (b) =>
          (b.textContent || "").trim() === txt &&
          b.offsetParent !== null &&
          (inDialog || !b.closest("[role=dialog]")),
      ) || null
    );
  };
  try {
    // 0) SPA 렌더 대기 — 조회 버튼이 뜰 때까지
    const searchBtn = await waitFor(() => btnByText("조회"), 30000, 400);
    if (!searchBtn) {
      // 로그인/인증 벽 구분: SMS 인증방식이 걸리면 협력사 로그인 화면(인증번호 받기)이 뜬다.
      const bodyText = document.body ? document.body.innerText || "" : "";
      const href = typeof location !== "undefined" ? String(location.href || "") : "";
      if (/인증번호\s*받기|SMS\s*인증|인증방식/.test(bodyText)) {
        return {
          success: false,
          pendingAuth: true,
          errorCode: "operator_action_required",
          error:
            "GS샵 SMS 인증이 필요합니다. GS샵 협력사 로그인에서 [인증번호 받기]로 인증을 완료한 뒤 다시 '수집하기'를 눌러주세요.",
        };
      }
      if (
        /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
        || document.querySelector('input[type="password"]')
      ) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "GS샵 로그인이 필요합니다. 로그인한 뒤 다시 수집해주세요.",
        };
      }
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "GS샵 배송관리 화면에서 조회 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.",
      };
    }
    // 스트레이 경고 다이얼로그 닫기
    const warn = document.querySelector("[role=dialog]");
    if (warn && /조회된 데이터가 없|경고/.test(warn.textContent || "")) {
      const ok = btnByText("확인", true);
      if (ok) ok.click();
      await sleep(600);
    }
    // 1) createObjectURL 후킹 (클라이언트 조립 xlsx blob 캡처)
    const blobs = [];
    const origCOU = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj instanceof Blob) blobs.push(obj);
      } catch (e) {
        /* noop */
      }
      return origCOU(obj);
    };
    // 2) 출하지시일 기간 1주일 프리셋 (조회조건의 두 번째 '1주일' 버튼) — 없으면 기본 범위 유지
    const wks = Array.from(document.querySelectorAll("button")).filter(
      (b) => (b.textContent || "").trim() === "1주일" && b.offsetParent !== null,
    );
    if (wks[1]) wks[1].click();
    else if (wks[0]) wks[0].click();
    await sleep(700);
    // 3) 조회
    const sb = btnByText("조회");
    if (!sb) {
      URL.createObjectURL = origCOU;
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "GS샵 조회 버튼을 찾지 못했습니다. 배송관리 화면 구조를 확인해주세요.",
      };
    }
    sb.click();
    await sleep(4500); // query/list 응답 대기
    // 4) 조회결과 건수 — 총주문(n)
    const cntEl = await waitFor(
      () =>
        Array.from(document.querySelectorAll("*")).find(
          (el) => /^총주문\s*\(\d+\)$/.test((el.textContent || "").trim()) && el.children.length <= 2,
        ),
      8000,
      400,
    );
    if (!cntEl) {
      URL.createObjectURL = origCOU; // 후킹 원복
      const bodyText = document.body ? document.body.innerText || "" : "";
      const href = typeof location !== "undefined" ? String(location.href || "") : "";
      if (
        /login|로그인|세션.*(?:만료|없)|인증번호\s*받기|SMS\s*인증|인증방식/i.test(bodyText + " " + href)
        || document.querySelector('input[type="password"]')
      ) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "GS샵 로그인 세션을 확인하지 못했습니다. 로그인 또는 SMS 인증을 완료한 뒤 다시 수집해주세요.",
        };
      }
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "GS샵 주문 조회 결과 건수를 확인하지 못했습니다. 배송관리 화면 구조를 확인해주세요.",
      };
    }
    const countMatch = (cntEl.textContent || "").match(/\((\d+)\)/);
    const cnt = countMatch ? Number(countMatch[1]) : Number.NaN;
    if (!Number.isFinite(cnt)) {
      URL.createObjectURL = origCOU;
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "GS샵 주문 조회 건수 형식을 확인하지 못했습니다.",
      };
    }
    if (cnt === 0) {
      URL.createObjectURL = origCOU;
      return { success: true, empty: true, rowCount: 0 };
    }
    // 4.5) 총주문 탭 클릭 — 다운로드는 활성 서브탭의 그리드 데이터를 읽으므로 전체(총주문)를 활성화해야
    //      "먼저 조회를 실행해주세요" 경고 없이 데이터가 실린다. (탭 미활성 시 활성 그리드가 비어 다운로드 실패)
    if (cntEl) {
      cntEl.click();
      await sleep(2500);
    }
    // 5) 다운로드 → 모달(주소표기 도로명/전체주소 = 기본값 그대로)
    const dl = btnByText("다운로드");
    if (!dl) return { success: false, error: "GS샵 다운로드 버튼을 찾지 못했습니다." };
    dl.click();
    const modal = await waitFor(() => {
      const d = document.querySelector("[role=dialog]");
      return d && /주소|다운로드 방식/.test(d.textContent || "") ? d : null;
    }, 8000, 300);
    if (!modal) {
      return { success: false, error: "GS샵 다운로드 방식 모달이 열리지 않았습니다. 조회 후 다시 시도하세요." };
    }
    // 6) 모달 내 '다운로드' 확인
    const confirm = btnByText("다운로드", true);
    if (!confirm) return { success: false, error: "GS샵 다운로드 확인 버튼을 찾지 못했습니다." };
    confirm.click();
    // 7) 클라이언트가 조립한 xlsx blob 대기 (상세 fetch + 조립 → 최대 90초)
    const blob = await waitFor(() => (blobs.length ? blobs[blobs.length - 1] : null), 90000, 500);
    URL.createObjectURL = origCOU; // 후킹 원복
    if (!blob) {
      return { success: false, error: "GS샵 엑셀 생성(다운로드)에 실패했습니다." };
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
    return { success: true, xlsxBase64: btoa(bin), fileName: "GS샵.xlsx", size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 올웨이즈(alwayzseller.ilevit.com) 주문 수집: "팀모집완료(엑셀추출 이전)" → 엑셀추출하기 blob 캡처 ──
// SPA 가 pre-excel(x-access-token) 데이터를 클라이언트서 xlsx 로 조립해 URL.createObjectURL 로 내려준다.
// → MAIN world 에서 createObjectURL 후킹 + pre-excel 로 건수 확인 + 엑셀추출하기 클릭 → blob 캡처.
async function findOrCreateAlwayzTab() {
  const tabs = await chrome.tabs.query({ url: ALWAYZ_TAB_MATCHES });
  const shipTab = tabs.find((t) => (t.url || "").includes("/shippings"));
  if (shipTab?.id) return { tab: shipTab, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ALWAYZ_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ALWAYZ_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectAlwayzOrders(collection) {
  const { tab, created } = await findOrCreateAlwayzTab();
  if (!tab?.id) return { success: false, error: "올웨이즈(alwayzseller.ilevit.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeAlwayzOrders,
      }),
      120000,
      "올웨이즈 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "올웨이즈 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("올웨이즈"); }
    return mallGenericErrorResult("올웨이즈", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// alwayzseller.ilevit.com 페이지 컨텍스트(MAIN): pre-excel 건수 확인 → 엑셀추출하기 → 조립 xlsx blob → base64.
async function scrapeAlwayzOrders() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout, interval) => {
    const end = Date.now() + (timeout || 20000);
    while (Date.now() < end) {
      let v;
      try {
        v = fn();
      } catch (e) {
        v = null;
      }
      if (v) return v;
      await sleep(interval || 300);
    }
    return null;
  };
  const btnByText = (txt, scope) =>
    Array.from((scope || document).querySelectorAll("button, a")).find(
      (b) => (b.textContent || "").replace(/\s+/g, "").includes(txt.replace(/\s+/g, "")) && b.offsetParent !== null,
    ) || null;
  try {
    // 0) 엑셀추출하기 버튼 뜰 때까지 SPA 렌더 대기
    const exBtn = await waitFor(() => btnByText("엑셀추출하기"), 30000, 400);
    if (!exBtn) {
      const bodyText = document.body ? document.body.innerText || "" : "";
      const href = typeof location !== "undefined" ? String(location.href || "") : "";
      if (
        /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
        || document.querySelector('input[type="password"]')
      ) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "올웨이즈 로그인이 필요합니다. 로그인한 뒤 다시 수집해주세요.",
        };
      }
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "올웨이즈 배송관리 화면에서 엑셀추출하기 버튼을 찾지 못했습니다.",
      };
    }
    // 1) pre-excel API 로 신규주문(엑셀추출 이전) 건수 확인 (0이면 추출 안 함)
    const token = localStorage.getItem("@alwayz@seller@token@") || "";
    if (!token) {
      return {
        success: false,
        pendingLogin: true,
        errorCode: "login_required",
        error: "올웨이즈 로그인 세션이 없습니다. 로그인한 뒤 다시 수집해주세요.",
      };
    }
    let preResponse;
    try {
      preResponse = await fetch("https://alwayz-seller-back.ilevit.com/sellers/items/pre-shipping/pre-excel", {
        headers: { "x-access-token": token },
      });
    } catch (e) {
      return {
        success: false,
        errorCode: "network_failed",
        error: "올웨이즈 신규 주문 조회 요청에 실패했습니다. 네트워크 상태를 확인해주세요.",
      };
    }
    if (preResponse.status === 401 || preResponse.status === 403) {
      return {
        success: false,
        pendingLogin: true,
        errorCode: "login_required",
        error: "올웨이즈 로그인 세션이 만료되었습니다. 다시 로그인한 뒤 수집해주세요.",
      };
    }
    if (!preResponse.ok) {
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: `올웨이즈 신규 주문 조회 응답을 확인하지 못했습니다 (HTTP ${preResponse.status}).`,
      };
    }
    let pre;
    try {
      pre = await preResponse.json();
    } catch (e) {
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "올웨이즈 신규 주문 조회 응답 형식이 변경되었습니다.",
      };
    }
    if (!pre || !Array.isArray(pre.data)) {
      const message = String((pre && (pre.message || pre.error || pre.msg)) || "");
      if (/login|로그인|token|토큰|unauthori|세션/i.test(message)) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "올웨이즈 로그인 세션을 확인하지 못했습니다. 다시 로그인한 뒤 수집해주세요.",
        };
      }
      return {
        success: false,
        errorCode: "provider_contract_changed",
        error: "올웨이즈 신규 주문 조회 데이터 형식이 변경되었습니다.",
      };
    }
    const cnt = pre.data.length;
    if (cnt === 0) return { success: true, empty: true, rowCount: 0 }; // 인증된 팀모집완료 신규주문 없음
    // 2) createObjectURL 후킹 (클라이언트 조립 xlsx blob 캡처)
    const blobs = [];
    const origCOU = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj instanceof Blob) blobs.push(obj);
      } catch (e) {
        /* noop */
      }
      return origCOU(obj);
    };
    // 3) 엑셀추출하기 클릭 → (확인 모달 있으면 확인)
    (btnByText("엑셀추출하기") || exBtn).click();
    await sleep(900);
    const confirm = Array.from(document.querySelectorAll("[role=dialog] button, .modal button, button")).find(
      (b) => /^(확인|추출|다운로드|네|예)$/.test((b.textContent || "").trim()) && b.offsetParent !== null,
    );
    if (confirm) confirm.click();
    // 4) 조립된 xlsx blob 대기 (최대 60초)
    const blob = await waitFor(() => (blobs.length ? blobs[blobs.length - 1] : null), 60000, 500);
    URL.createObjectURL = origCOU; // 후킹 원복
    if (!blob) {
      return { success: false, error: "올웨이즈 엑셀 추출(다운로드)에 실패했습니다." };
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
    return { success: true, xlsxBase64: btoa(bin), fileName: "올웨이즈.xlsx", size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// partner.kidkids.net 페이지 컨텍스트: 목록(logis_index) → (planDate 시)출고예정등록 → 발주서02(logis_down4) 스크랩.
//
// ⚠️예전 방식(앵커 href + delivery_plan_date 필터)은 "출고예정일 미지정" 신규 주문을 통째로 놓쳤다.
// 신규 주문은 (1) CheckBox2 의 delivery_plan_date 가 비어 있고 (2) 상품명 링크(logis_down.htm)가
// "출고예정일을 입력하지 않았습니다" alert 로 대체돼, 두 조건 모두에서 걸러졌기 때문이다.
// 이제 목록을 헤더 기준으로 읽어 od(CheckBox2.value) 를 앵커 없이 모으고, planDate 가 오면 출고예정
// 미지정 주문에 한해 출고예정등록(go_plandate 재현: mode=ain)으로 출고예정일을 지정한 뒤, 발주서02
// (logis_down4.htm)를 mul_id 배치로 받아 주소·우편번호·공급단가까지 한 번에 확보한다.
//   · 발주서01 = logis_down5.htm (예전 사용, 3테이블·상품표 2회 렌더)
//   · 발주서02 = logis_down4.htm (단일 평면표: 주문×품목 1행, 우편번호/주소/공급단가/배송단가 포함)
//   · 조인 키 = 발주서02 "키코드" 열 == CheckBox2.value(od)
async function scrapeKidkidsOrders(dateFilter, planDate) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  const isAuthenticationGateUrl = (value) => {
    const normalized = String(value || "").toLowerCase();
    return (
      /login|partnerlogin|partner_login/.test(normalized) ||
      /\/security\/verify_user\.htm(?:[?#]|$)/.test(normalized)
    );
  };
  // 헤더 행에서 라벨을 포함하는 열 인덱스를 찾는다(고정 인덱스 대신 헤더 기준 → 컬럼 이동에 견고).
  const colFinder = (headerRow) => (label) =>
    headerRow ? [...headerRow.cells].findIndex((c) => norm(c.textContent).includes(label)) : -1;
  try {
    // 키드키즈는 로그인 직후 별도 본인확인 화면으로 이동할 수 있다. 이 화면은
    // 주문 목록이 아니므로 0건 성공으로 처리하지 않고 운영자 확인을 요청한다.
    if (isAuthenticationGateUrl(window.location.href)) {
      return { success: false, loginRequired: true };
    }
    // 1) 출고관리 목록 (page_view_cnt 크게 = 전부). management 는 partner.kidkids.net 동일 origin.
    // 목록도 euc-kr → arrayBuffer 로 받아 명시 디코딩(아니면 주문자명 한글 깨짐).
    const listRes = await fetch("/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=500", { credentials: "include" });
    const finalUrl = String(listRes.url || "").toLowerCase();
    const listHtml = new TextDecoder("euc-kr").decode(await listRes.arrayBuffer());
    const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
    // 미로그인이면 logis_index 요청이 로그인 페이지(partnerLogin/partner_login)로 리다이렉트되어
    // CheckBox2 행이 하나도 없다. 이걸 "주문 0건"과 구분하지 못하면 프론트가 "출고예정일 미지정"으로
    // 잘못 안내한다. 로그인 리다이렉트/비밀번호 폼을 감지해 명시적으로 로그인 필요를 신호한다.
    const firstCb = ldoc.querySelector('input[name="CheckBox2"]');
    if (!firstCb) {
      const looksLikeLogin =
        isAuthenticationGateUrl(finalUrl) ||
        Boolean(ldoc.querySelector('input[type="password"]'));
      if (looksLikeLogin) return { success: false, loginRequired: true };
      return { success: true, orders: [], count: 0 }; // 로그인 상태의 빈 목록 = 정상 0건
    }

    // CheckBox2 가 있는 목록 테이블 + 헤더 컬럼 매핑.
    let table = firstCb;
    while (table && table.tagName !== "TABLE") table = table.parentElement;
    if (!table) return { success: true, orders: [], count: 0 };
    const rows = [...table.rows];
    const headerRow = rows.find((r) => [...r.cells].some((c) => /상품명/.test(c.textContent)));
    const lc = colFinder(headerRow);
    const li = {
      ordName: lc("주문자명"),
      product: lc("상품명"),
      qty: lc("수량"),
      tel: lc("전화"),
      mobile: lc("휴대폰"),
      orderDate: lc("주문일"),
      orderNo: lc("주문번호"),
      planDate: lc("출고예정일"),
    };

    // 목록 행 파싱(앵커 비의존). dateFilter 주면 주문일 기준 그날만.
    const listRows = [];
    for (const cb of table.querySelectorAll('input[name="CheckBox2"]')) {
      let tr = cb;
      while (tr && tr.tagName !== "TR") tr = tr.parentElement;
      if (!tr) continue;
      const cells = [...tr.cells];
      const cell = (i) => (i >= 0 && cells[i] ? norm(cells[i].textContent) : "");
      const orderDate = cell(li.orderDate); // "2026-07-31 15:56:29"
      if (dateFilter && orderDate && !orderDate.startsWith(dateFilter)) continue;
      listRows.push({
        od: cb.value,
        orderNo: cell(li.orderNo) || cb.value, // 다품목 그룹 키(=om proxy)
        ordName: cell(li.ordName), // 주문자명(유치원) — 발주서02 "이름"보다 풀네임
        orderDate,
        listProduct: cell(li.product),
        listQty: num(cell(li.qty)),
        tel: cell(li.tel),
        mobile: cell(li.mobile),
        dpd: cb.getAttribute("delivery_plan_date") || cell(li.planDate),
      });
    }
    if (!listRows.length) {
      return { success: true, orders: [], count: 0 }; // 필터 결과 0건 (정상)
    }

    // 2) 출고예정등록(선택): planDate 가 오면 출고예정일 미지정 주문에 한해 mode=ain 으로 지정.
    //    이미 예정일이 있는 주문은 건드리지 않는다(재확인 alert·실주문 예정일 변경 방지). 되돌리기
    //    가능한 soft 상태 지정이며, 발송완료(mode=aan)와는 다르다.
    let planned = 0;
    if (planDate) {
      const targets = listRows.filter((r) => !r.dpd).map((r) => r.od);
      if (targets.length) {
        try {
          const body = new URLSearchParams();
          body.set("from_logis_index", "Y");
          body.set("mode", "ain");
          body.set("delivery_dt", planDate);
          body.set("mul_id", "|" + targets.join("|"));
          const pr = await fetch("/sales/sales_process.htm", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          if (pr.ok) planned = targets.length;
        } catch {
          /* 출고예정등록 실패해도 발주서02 는 미지정 주문도 반환하므로 수집은 진행 */
        }
      }
    }

    // 3) 주문번호(om proxy) 기준 대표 od 하나씩 → 발주서02 배치 조회(mul_id 파이프).
    const byOrderNo = new Map();
    for (const r of listRows) if (!byOrderNo.has(r.orderNo)) byOrderNo.set(r.orderNo, r);
    const reps = [...byOrderNo.values()];

    // 발주서02(logis_down4) 파서: 단일 평면표. 헤더행 + (주문×품목)당 데이터행.
    const parseDown4 = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const t = doc.querySelector("table");
      if (!t) return [];
      const trs = [...t.rows];
      const hdr = trs.find((r) => [...r.cells].some((c) => /상품명/.test(c.textContent)));
      if (!hdr) return [];
      const hc = colFinder(hdr);
      const ci = {
        name: hc("이름"), tel: hc("전화"), mobile: hc("휴대폰"), zip: hc("우편번호"), addr: hc("주소"),
        product: hc("상품명"), option: hc("옵션"), qty: hc("수량"), unit: hc("공급단가"), sum: hc("합계"),
        msg: hc("배송요청"), key: hc("키코드"),
      };
      const out = [];
      for (const r of trs) {
        if (r === hdr) continue;
        const cells = [...r.cells];
        const get = (i) => (i >= 0 && cells[i] ? norm(cells[i].textContent) : "");
        const key = get(ci.key);
        const product = get(ci.product);
        if (!key || !product) continue;
        out.push({
          key, product, option: get(ci.option), qty: num(get(ci.qty)),
          unit: num(get(ci.unit)), sum: num(get(ci.sum)),
          zip: get(ci.zip), addr: get(ci.addr), tel: get(ci.tel), mobile: get(ci.mobile), msg: get(ci.msg),
        });
      }
      return out;
    };

    // 발주서02 는 mul_id 파이프로 여러 주문을 한 번에 반환한다. URL 길이 방어 위해 80건씩 청크.
    const down4Rows = [];
    const CHUNK = 80;
    for (let i = 0; i < reps.length; i += CHUNK) {
      const ids = reps.slice(i, i + CHUNK).map((r) => r.od);
      try {
        const body = new URLSearchParams();
        body.set("from_logis_index", "Y");
        body.set("mul_id", "|" + ids.join("|"));
        body.set("mode", "xls_down");
        const res = await fetch("/logis/logis_down4.htm", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer()); // 발주서 = euc-kr
        down4Rows.push(...parseDown4(html));
      } catch {
        /* 청크 실패 — 스킵 */
      }
    }

    // 4) 키코드(od) 기준으로 발주서02 행을 묶고, 목록과 조인.
    const itemsByKey = new Map();
    const seenByKey = new Map(); // 다품목 om 확장으로 인한 동일 품목 중복 방지
    const recvByKey = new Map();
    for (const row of down4Rows) {
      if (!itemsByKey.has(row.key)) {
        itemsByKey.set(row.key, []);
        seenByKey.set(row.key, new Set());
      }
      const dedupeKey = [row.product, row.option, row.qty, row.unit].join("|");
      const seen = seenByKey.get(row.key);
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        itemsByKey.get(row.key).push(row);
      }
      if (!recvByKey.has(row.key)) recvByKey.set(row.key, row);
    }

    const orders = [];
    for (const rep of reps) {
      const rows4 = itemsByKey.get(rep.od) || [];
      const recv = recvByKey.get(rep.od);
      // 발주서02 상품명은 끝에 "[수량]"을 붙인다(예: "...(1BOX/12개)[3]"). 셀피아 상품명·매칭에는
      // 이 꼬리표가 없어야 하므로, 그 품목의 수량과 정확히 일치하는 끝 대괄호만 떼어낸다
      // (정품명에 든 대괄호나 "[키드아이템]" 접두는 보존).
      const stripQtyTag = (nameStr, qty) =>
        String(nameStr || "").replace(new RegExp("\\[\\s*" + qty + "\\s*\\]\\s*$"), "").trim();
      // 발주서02 가 비면(예외) 목록 정보라도 채워 누락을 막는다(가격은 0).
      const items = rows4.length
        ? rows4.map((it) => {
            const base = stripQtyTag(it.product, it.qty);
            return {
              name: it.option ? `${base} ${it.option}`.trim() : base,
              qty: it.qty,
              unit: it.unit,
              sum: it.sum,
            };
          })
        : rep.listProduct
          ? [{ name: rep.listProduct, qty: rep.listQty, unit: 0, sum: 0 }]
          : [];
      if (!items.length) continue;
      const zip = recv ? recv.zip : "";
      const addr = recv ? recv.addr : "";
      orders.push({
        om: rep.orderNo,
        // 셀피아 양식의 "이름"은 발주서02 "이름"(짧은 기관명, 예: 풍산초)을 쓴다. 목록 주문자명
        // (풍산초 병설유치원)이 아니다. 발주서02 이름이 없을 때만 목록 주문자명으로 보완한다.
        ordName: (recv && recv.name) || rep.ordName,
        orderDate: rep.orderDate,
        recvName: (recv && recv.name) || rep.ordName,
        recvAddr: [zip, addr].filter(Boolean).join(" "), // 변환기가 "우편번호 주소" 접두로 zip 분리
        recvTel: (recv && recv.tel) || rep.tel,
        recvMobile: (recv && recv.mobile) || rep.mobile,
        recvMsg: recv ? recv.msg : "",
        items,
      });
    }
    return { success: true, orders, count: orders.length, planned };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 도매꾹(domeggook) 주문 수집: 풀 자동 (엑셀 생성요청 → 완료 폴링 → CDN 다운로드) ──
// 엑셀다운로드는 서버 비동기 생성(~1분). 백그라운드 탭에서 "엑셀다운로드" 클릭 + 생성요청 모달
// submit 으로 오늘 포함 기간 export 를 생성 → getOrderList JSON 폴링(SUCCESS) → CDN CSV base64.
const DOMEGGOOK_LIST_URL = "https://domeggook.com/sc/order/lstAll";
const DOMEGGOOK_INPROCESS_URL = "https://domeggook.com/sc/order/lstInprocess";
const DOMEGGOOK_ORDERLIST_API = "https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1";

async function domeggookOrderList() {
  const res = await fetch(DOMEGGOOK_ORDERLIST_API, {
    credentials: "include",
    headers: { "x-requested-with": "XMLHttpRequest" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim().startsWith("{")) return null; // 로그인 필요 시 HTML
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// 생성완료(SUCCESS) + 전체주문(ORDER_ALL) CDN URL. afterReq 주면 그 요청시각 이후 것만(새로 생성분).
function pickDomeggookUrl(data, afterReq) {
  const items = Array.isArray(data && data.dat) ? data.dat : [];
  for (const d of items) {
    if (!d || d.state !== "SUCCESS" || !/ORDER_ALL/.test(d.dlBtn || "")) continue;
    if (afterReq && !(String(d.dateReq || "") > afterReq)) continue;
    const url = (String(d.dlBtn).match(/href=['"]([^'"]+)['"]/) || [])[1];
    if (url) return url;
  }
  return null;
}

async function findOrCreateDomeggookTab(navUrl) {
  const tabs = await chrome.tabs.query({ url: "https://domeggook.com/*" });
  const listTab = tabs.find((t) => (t.url || "").includes("/sc/order/lstAll"));
  if (listTab?.id) {
    await chrome.tabs.update(listTab.id, { url: navUrl }); // 기간 설정 URL 로 이동 (백그라운드)
    return { tab: await chrome.tabs.get(listTab.id), created: false };
  }
  const tab = await chrome.tabs.create({ url: navUrl, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectDomeggookOrders(date, collection) {
  // 로그인/기존 목록 확인 + 트리거 전 최신 요청시각(이후 새로 생성된 것만 고르기 위함)
  const before = await domeggookOrderList();
  if (!before) return { success: false, error: "domeggook.com 로그인이 필요합니다. 로그인 후 다시 시도하세요." };
  const beforeReq = ((before.dat || [])[0] || {}).dateReq || "";

  // 기간을 지정일로 설정한 URL 로 진입 (dt1=dt2=날짜). date 없으면 기본 기간.
  const dateDot = date ? String(date).replace(/-/g, ".") : ""; // 2026-06-30 → 2026.06.30
  const navUrl = dateDot
    ? DOMEGGOOK_LIST_URL + "?dtbase=ord&dt1=" + dateDot + "&dt2=" + dateDot
    : DOMEGGOOK_LIST_URL;

  const { tab, created } = await findOrCreateDomeggookTab(navUrl);
  if (!tab?.id) return { success: false, error: "도매꾹(domeggook.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await delay(1500); // 기간 필터 목록 렌더 대기
    // 1) 엑셀다운로드 → 생성요청 모달 submit (설정한 기간으로 export 생성 요청)
    const trig = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: triggerDomeggookExcelGen,
      }),
      30000,
      "도매꾹 생성 요청 시간이 초과되었습니다.",
    );
    const tr = trig[0]?.result;
    if (tr?.empty) return { success: true, empty: true }; // 주문 없음 — 오류 아님
    if (!tr?.success) return { success: false, error: tr?.error || "도매꾹 엑셀 생성 요청 실패" };
    // 2) 생성 완료 폴링 (최대 ~4분): SUCCESS + beforeReq 이후 파일. 도매꾹 생성이 느려 넉넉히.
    let url = null;
    for (let i = 0; i < 48; i++) {
      await delay(5000);
      url = pickDomeggookUrl(await domeggookOrderList(), beforeReq);
      if (url) break;
    }
    if (!url) {
      return { success: false, error: "도매꾹 엑셀 생성이 지연됩니다(최대 4분 대기 초과). 잠시 후 다시 시도하세요." };
    }
    // 3) CDN CSV fetch (SW = CORS 우회)
    const csvRes = await fetch(url, { credentials: "include" });
    if (!csvRes.ok) return { success: false, error: "도매꾹 CSV 다운로드 실패 (HTTP " + csvRes.status + ")" };
    const buf = new Uint8Array(await csvRes.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
    }
    return {
      success: true,
      csvBase64: btoa(bin), // EUC-KR 원본 bytes 그대로 (백엔드가 디코딩)
      fileName: url.split("/").pop() || "domeggook.csv",
      size: buf.length,
    };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("도매꾹"); }
    return mallGenericErrorResult("도매꾹", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// lstAll 페이지 컨텍스트: "엑셀다운로드" 클릭 → reqXlsNotice iframe(#gLayerFrame, 같은 오리진) submit.
async function triggerDomeggookExcelGen() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 주문이 없으면 도매꾹은 "다운로드할 주문내역이 없습니다" 류 native alert 를 띄우고 생성 모달을
  // 열지 않는다. alert 를 가로채 '주문 없음(empty)'으로 정상 처리한다(주문이 있으면 alert 는 안 뜬다).
  // window 가 없는 테스트/비브라우저 환경을 방어한다(MAIN world 에서는 항상 존재).
  const win = typeof window !== "undefined" ? window : null;
  const origAlert = win ? win.alert : null;
  let alertMsg = "";
  if (win) {
    win.alert = (m) => {
      alertMsg = String(m == null ? "" : m);
    };
  }
  const emptyByAlert = () => /없습니다|없음|no\s*(order|data|result)/i.test(alertMsg);
  try {
    const btn = [
      ...document.querySelectorAll(
        "#lList a, #lList button, #lList input[type='button'], #lList [role='button'], #lList [onclick]",
      ),
    ].find(
      (element) =>
        String(element.textContent || element.value || "").replace(/\s+/g, "") ===
        "엑셀다운로드",
    );
    if (!btn) return { success: false, error: "엑셀다운로드 버튼을 찾지 못했습니다. (로그인/화면 확인)" };
    btn.click();
    await sleep(300);
    if (emptyByAlert()) return { success: true, empty: true, message: alertMsg };
    let doc = null;
    let modalSeen = false;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      if (emptyByAlert()) return { success: true, empty: true, message: alertMsg };
      const iframe = document.querySelector("iframe#gLayerFrame, #gLayerFrame iframe");
      try {
        if (iframe?.contentDocument) {
          modalSeen = true;
        }
        if (iframe?.contentDocument?.querySelector("#lXlsReqNoticeBtnSubmit")) {
          doc = iframe.contentDocument;
          if (iframe.contentWindow) {
            iframe.contentWindow.confirm = () => true; // 혹시 모를 confirm 자동 승인
            iframe.contentWindow.alert = () => {};
          }
          break;
        }
        const dialog = document.querySelector("#gLayerFrame:not(iframe), [role='dialog']");
        if (dialog) modalSeen = true;
        if (dialog?.querySelector("#lXlsReqNoticeBtnSubmit")) {
          doc = document;
          break;
        }
      } catch (e) {
        /* 로딩 중 접근 예외 — 무시하고 재시도 */
      }
    }
    if (emptyByAlert()) return { success: true, empty: true, message: alertMsg };
    if (!modalSeen) return { success: false, error: "도매꾹 생성 요청 모달을 열지 못했습니다." };
    const submit = doc?.querySelector("#lXlsReqNoticeBtnSubmit");
    if (!submit) {
      if (emptyByAlert()) return { success: true, empty: true, message: alertMsg };
      return { success: false, error: "도매꾹 생성 요청 버튼을 찾지 못했습니다." };
    }
    submit.click();
    return { success: true };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  } finally {
    if (win) win.alert = origAlert;
  }
}

// ── 키즈노트(WISA) 주문 수집: _manage?body=3010 전체주문조회 테이블 스크래핑 ──
// 백그라운드 수집: 포커스를 뺏지 않고(active 미지정/false) 탭을 연다.
// created=true 면 우리가 새로 연 탭 → 수집 후 자동으로 닫는다(기존 사용자 탭은 건드리지 않음).
async function findOrCreateKidsnoteTab() {
  const tabs = await chrome.tabs.query({ url: KIDSNOTE_TAB_MATCHES });
  const manageTab = tabs.find((tab) => (tab.url || "").includes("/_manage/"));
  if (manageTab?.id) {
    return { tab: manageTab, created: false }; // 기존 _manage 탭 재사용 (포커스 안 뺏음)
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KIDSNOTE_ORDER_URL }); // active 미지정 = 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KIDSNOTE_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKidsnoteOrders({ from, to, status, withDetail }, collection) {
  const { tab, created } = await findOrCreateKidsnoteTab();
  if (!tab?.id) return { success: false, error: "키즈노트(shop.kidsnote.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKidsnoteOrders,
        args: [from, to, status || "", withDetail === true],
      }),
      190000,
      "키즈노트 주문 수집 시간이 초과되었습니다.",
    );
    return (
      injected[0]?.result ?? {
        success: false,
        error: "키즈노트 화면에 접근하지 못했습니다.",
      }
    );
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("키즈노트"); }
    return mallGenericErrorResult("키즈노트", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 탭이 이미 닫힘 — 무시 */
      }
    }
  }
}

// shop.kidsnote.com 페이지 컨텍스트에서 실행 (DOMParser + same-origin fetch + 쿠키).
async function scrapeKidsnoteOrders(from, to, status, withDetail) {
  try {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const num = (s) => Number(String(s == null ? "" : s).replace(/[^0-9.-]/g, "")) || 0;
    // all_date=N 이어야 start_date~finish_date(주문일시)로 필터됨. Y 면 전체 기간(날짜 무시).
    const listUrl = (p) =>
      "/_manage/?body=3010&search_date_type=1&all_date=N" +
      "&start_date=" + (from || "") + "&finish_date=" + (to || "") +
      (status ? "&ord_stat=" + encodeURIComponent(status) : "") +
      "&page=" + p;

    const orders = [];
    const seen = new Set();
    for (let p = 1; p <= 30; p++) {
      const res = await fetch(listUrl(p), { credentials: "include" });
      const html = await res.text();
      if (!res.ok) {
        if (p === 1) return { success: false, error: "키즈노트 주문 조회 실패 (HTTP " + res.status + ")" };
        break;
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = Array.from(doc.querySelectorAll("table")).find(
        (t) => /주문번호/.test((t.rows[0] && t.rows[0].innerText) || ""),
      );
      if (!table) {
        if (p === 1) {
          if (/type=["']?password|로그인|login/i.test(html)) {
            return {
              success: false,
              error: "shop.kidsnote.com 관리자 로그인이 필요합니다. 로그인 후 다시 시도하세요.",
            };
          }
          return { success: true, orders: [], count: 0 };
        }
        break;
      }
      let pageCount = 0;
      let reachedOlder = false;
      for (const r of Array.from(table.rows).slice(1)) {
        const m = r.innerHTML.match(/viewOrder\(['"]([^'"]+)['"]\)/);
        const ono = m && m[1];
        if (!ono || seen.has(ono)) continue;
        const c = Array.from(r.cells);
        if (c.length < 10) continue;
        const ymd = /^(\d{4})(\d{2})(\d{2})/.exec(ono);
        const orderDate = ymd ? ymd[1] + "-" + ymd[2] + "-" + ymd[3] : "";
        // WISA GET 날짜파라미터가 안 먹혀(검색=폼/세션) → 주문일(ono)로 클라 필터. 목록은 최신순 desc.
        if (to && orderDate && orderDate > to) continue; // 범위보다 최신 — 건너뛰고 계속
        if (from && orderDate && orderDate < from) {
          reachedOlder = true; // 범위보다 과거 — 이후는 다 더 과거이므로 중단
          continue;
        }
        seen.add(ono);
        pageCount++;
        const timeM = norm(c[4].innerText).match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        const pnoM =
          r.innerHTML.match(/check_pno\[\][^>]*value=["']([^"']+)["']/i) ||
          r.innerHTML.match(/value=["']([^"']+)["'][^>]*name=["']?check_pno/i);
        orders.push({
          ono: ono,
          pno: pnoM ? pnoM[1] : "",
          orderDate: orderDate,
          orderedAt: orderDate + (timeM ? " " + timeM[1] : ""),
          productName: norm(c[3].innerText),
          ordererName: norm(c[5].innerText),
          totalAmount: num(c[6].innerText),
          paidAmount: num(c[7].innerText),
          payMethod: norm(c[8].innerText),
          status: norm(c[9].innerText),
        });
      }
      if (reachedOlder) break;
      if (pageCount === 0 && orders.length > 0) break;
    }

    // 셀피아 변환용 상세 — "주문서 인쇄"(POST order@order_print.frm, check_pno) 가 마스킹 없이 깔끔.
    if (withDetail && orders.length) {
      const parseDetail = async (o) => {
        try {
          const body = "body=order@order_print.frm&check_pno[]=" + encodeURIComponent(o.pno || "");
          const dhtml = await (
            await fetch("/_manage/?", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: body,
            })
          ).text();
          const ddoc = new DOMParser().parseFromString(dhtml, "text/html");
          // 인쇄페이지는 섹션헤더(○)가 td/th 아님 → innerText 라인 단위 파싱(라벨 다음 줄=값).
          const lines = (ddoc.body ? ddoc.body.innerText : "").split("\n").map((s) => s.trim()).filter(Boolean);
          let sec = "";
          let buyer = "", receiver = "", contact = "", addrRaw = "", request = "", pay = "";
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const nv = lines[i + 1] || "";
            if (/^[○\s]*주문상품/.test(l)) sec = "product";
            else if (/^[○\s]*주문정보/.test(l)) sec = "info";
            else if (/^[○\s]*주문자/.test(l)) sec = "orderer";
            else if (/^[○\s]*배송지/.test(l)) sec = "ship";
            if (sec === "orderer" && l === "이름") buyer = nv.replace(/\s*\(.*\)\s*$/, "").trim();
            else if (sec === "ship" && l === "이름") receiver = nv;
            else if (sec === "ship" && /^연락처/.test(l)) contact = nv;
            else if (sec === "ship" && l === "주소") addrRaw = nv;
            else if (sec === "ship" && /메세지|메시지|요청/.test(l))
              request = /[<>{}=]|function|window\.|onload|confirm\(|\$\(/.test(nv) ? "" : nv;
            else if (sec === "info" && /결제방법|결제수단/.test(l)) pay = nv;
          }
          const zipM = addrRaw.match(/\[?\s*(\d{5})\s*\]?/);
          if (buyer) o.ordererName = buyer; // 마스킹 안 된 주문자명
          o.receiver = receiver;
          o.mobile = (contact.match(/01[0-9-]{7,}/) || contact.match(/[0-9][0-9-]{7,}/) || [""])[0];
          o.tel = "";
          o.zip = zipM ? zipM[1] : "";
          o.address = addrRaw.replace(/\[?\s*\d{5}\s*\]?\s*/, "").trim();
          o.request = request;
          if (pay) o.payMethod = pay;
          // 금액·배송비는 인쇄페이지가 부정확(상품합계/배송비 부풀려짐) → viewOrder 품목표가 정답.
          // viewOrder head: [_, 주문번호, 제품명, 상품가격, 수량, 할인적용, 금액, 배송비, 소계, 주문상태, 속성]
          o.items = [];
          try {
            const vhtml = await (
              await fetch("/_manage/?body=order@order_view.frm&ono=" + encodeURIComponent(o.ono), {
                credentials: "include",
              })
            ).text();
            const vdoc = new DOMParser().parseFromString(vhtml, "text/html");
            // 입금일시 = 상태이력의 "결제완료" 처리일시(분 단위; 초는 화면에 없음). 주문시각보다 정확.
            const vtext = (vdoc.body ? vdoc.body.innerText : "").replace(/[ \t]+/g, " ");
            const payM = vtext.match(/결제완료\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
            if (payM) o.paidAt = payM[1];
            const itemT = Array.from(vdoc.querySelectorAll("table")).find(
              (t) => /제품명|상품명/.test(norm(t.rows[0] && t.rows[0].innerText)) && /수량/.test(norm(t.innerText)),
            );
            if (itemT) {
              const head = Array.from(itemT.rows[0].cells).map((cc) => norm(cc.innerText));
              const ci = (n) => head.findIndex((h) => h.includes(n));
              const ni = ci("제품명") >= 0 ? ci("제품명") : ci("상품");
              const qi = ci("수량");
              const ai = ci("금액"); // 상품총액 = 수량 × 상품가격
              const fi = ci("배송비");
              for (const row of Array.from(itemT.rows).slice(1)) {
                const cc = Array.from(row.cells);
                if (cc.length < 9) continue; // 품목행은 11칸; 변경내역(colspan 1칸) 제외
                // 제품명 = 가장 긴 링크(공급사/재고상세/송장 링크 제외) → 상품명만.
                const nameCell = ni >= 0 ? cc[ni] : null;
                const links = nameCell
                  ? Array.from(nameCell.querySelectorAll("a")).map((a) => norm(a.innerText)).filter(Boolean)
                  : [];
                let nm = links.filter((t) => !/재고상세/.test(t)).sort((a, b) => b.length - a.length)[0] ||
                  norm(nameCell ? nameCell.innerText : "");
                if (!nm || /합계|소계|배송비|총결제|제품명/.test(nm)) continue;
                // 공급사/재고/택배 정보 컷 (주식회사… 현재고… [재고상세]… 택배사…)
                nm = nm.split(/\s*(?:주식회사|\(주\)|㈜|현재고\s*[:：]|재고상세|CJ대한통운|우체국|한진택배|롯데택배|로젠택배)/)[0].trim();
                o.items.push({
                  productName: nm,
                  qty: qi >= 0 ? num(cc[qi].innerText) : 0,
                  option: "",
                  amount: ai >= 0 ? num(cc[ai].innerText) : 0,
                  shipFee: fi >= 0 ? num(cc[fi].innerText) : 0,
                });
              }
            }
          } catch (ve) {
            o.detailError = "viewOrder: " + String((ve && ve.message) || ve);
          }
          if (!o.items.length) o.items = [{ productName: o.productName, qty: 1, option: "", amount: 0, shipFee: 0 }];
        } catch (e) {
          o.detailError = String((e && e.message) || e);
        }
      };
      for (let i = 0; i < orders.length; i += 4) {
        await Promise.all(orders.slice(i, i + 4).map(parseDetail));
      }
    }

    return { success: true, orders: orders, count: orders.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function clickCoupangShipmentDownloadButtons(options) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const targetDate = compactDate(options?.date || "");
  const wantLabels = options?.labels !== false;
  const wantStatements = options?.statements !== false;

  const table = findShipmentTable();
  if (!table) {
    return {
      success: false,
      error: "쿠팡 쉽먼트 조회 결과 표를 찾지 못했습니다.",
    };
  }

  const headerMap = buildHeaderMap(table);
  const rowElements = Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    return cells.length >= 6 && row.offsetParent !== null;
  });

  const rows = [];
  let labelCount = 0;
  let statementCount = 0;

  for (const row of rowElements) {
    const cells = Array.from(row.querySelectorAll("td"));
    const shipmentId = textAt(cells, headerMap, ["쉽먼트 번호", "shipment"]);
    const outboundAt = textAt(cells, headerMap, ["발송일"]);
    const inboundDate = textAt(cells, headerMap, ["입고예정일", "입고 예정일"]);
    const center = textAt(cells, headerMap, ["센터"]);
    const candidateDate = compactDate(inboundDate || outboundAt);
    if (targetDate && candidateDate !== targetDate) continue;

    let labelClicked = false;
    let statementClicked = false;

    if (wantLabels) {
      const button = findRowButton(row, ["label", "라벨"]);
      if (button) {
        button.click();
        labelClicked = true;
        labelCount += 1;
        await delay(450);
      }
    }
    if (wantStatements) {
      const button = findRowButton(row, ["내역서"]);
      if (button) {
        button.click();
        statementClicked = true;
        statementCount += 1;
        await delay(450);
      }
    }

    rows.push({
      shipmentId,
      outboundAt,
      inboundDate,
      center,
      labelClicked,
      statementClicked,
    });
  }

  if (rows.length === 0) {
    return {
      success: false,
      error: targetDate
        ? "선택한 날짜에 해당하는 쉽먼트 행을 찾지 못했습니다."
        : "다운로드할 쉽먼트 행을 찾지 못했습니다.",
    };
  }

  return {
    success: true,
    rows,
    labelCount,
    statementCount,
    url: location.href,
  };

  function findShipmentTable() {
    const tables = Array.from(document.querySelectorAll("table"));
    return tables.find((candidate) => {
      const text = (candidate.textContent || "").replace(/\s+/g, "");
      return text.includes("쉽먼트번호") && text.includes("입고예정일") && text.includes("센터");
    }) || null;
  }

  function buildHeaderMap(tableElement) {
    const headers = Array.from(tableElement.querySelectorAll("thead th, tr:first-child th"));
    const map = new Map();
    headers.forEach((header, index) => {
      const text = normalizeText(header.textContent || "");
      if (text) map.set(text, index);
    });
    return map;
  }

  function textAt(cells, map, names) {
    for (const name of names) {
      const normalized = normalizeText(name);
      const exact = map.get(normalized);
      if (typeof exact === "number" && cells[exact]) {
        return normalizeText(cells[exact].textContent || "");
      }
      const fuzzy = Array.from(map.entries()).find(([header]) => header.includes(normalized));
      if (fuzzy && cells[fuzzy[1]]) return normalizeText(cells[fuzzy[1]].textContent || "");
    }
    return "";
  }

  function findRowButton(row, labels) {
    const targets = labels.map((label) => label.toLowerCase());
    return Array.from(row.querySelectorAll("button, a, input[type='button']")).find((element) => {
      const text = normalizeText(
        element.tagName === "INPUT"
          ? element.value || element.getAttribute("aria-label") || ""
          : element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "",
      ).toLowerCase();
      return targets.some((target) => text.includes(target));
    }) || null;
  }

  function compactDate(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (digits.length >= 8) return digits.slice(0, 8);
    return "";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
}

async function injectSellpiaOrderFile(payload) {
  const shopName = payload.shopName;
  const fileName = payload.fileName;
  const fileBase64 = payload.fileBase64;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const targetOrderNumbers = Array.from(new Set(
    (Array.isArray(payload.targetOrderNumbers) ? payload.targetOrderNumbers : [])
      .map((value) => String(value == null ? "" : value).trim())
      .filter(Boolean),
  ));

  function targetForPendingRow(row) {
    const text = (value) => String(value == null ? "" : value).trim();
    const values = [
      row?.group_no,
      row?.c_group_no,
      row?.ord_no,
      row?.order_no,
      row?.shop_order_no,
      row?.provider_order_no,
      row?.seller_order_no,
      row?.om_order_no,
    ].map(text).filter(Boolean);
    for (const target of targetOrderNumbers) {
      for (const value of values) {
        if (value === target) return target;
        if (!value.endsWith(target)) continue;
        const prefix = value.slice(0, -target.length);
        if (/[_:|\/\s-]$/.test(prefix)) return target;
      }
    }
    return null;
  }

  function pendingTargetOrderNumbers() {
    try {
      if (!window.dataView || typeof window.dataView.getItems !== "function") return [];
      return Array.from(new Set(
        window.dataView.getItems()
          .map(targetForPendingRow)
          .filter(Boolean),
      ));
    } catch {
      return [];
    }
  }

  function parsePendingRowCount(value) {
    const match = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .match(/(?:^|\s)전체\s*([\d,]+)\s*개(?:\s|$)/);
    if (!match) return null;
    const count = Number(match[1].replace(/,/g, ""));
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  function pendingRowCount() {
    // 셀피아의 SlickGrid dataView는 페이지 전역에 노출되는 버전도 있고, 격리된
    // 확장 프로그램 실행 컨텍스트에서는 보이지 않는 버전도 있다. 실제 주문접수
    // 화면이 제공하는 #pager의 "전체 N 개"를 동일한 대기 주문 근거로 사용한다.
    try {
      if (window.dataView && typeof window.dataView.getLength === "function") {
        const count = Number(window.dataView.getLength());
        if (Number.isSafeInteger(count) && count >= 0) return count;
      }
    } catch {
      // 페이지 전역 접근 실패 시 아래의 DOM pager 근거로 계속 확인한다.
    }

    if (typeof document.querySelector !== "function") return null;
    const pagerStatus = document.querySelector("#pager .slick-pager-status");
    return parsePendingRowCount(pagerStatus?.textContent);
  }

  function visibleDialogText() {
    if (typeof document.querySelectorAll !== "function") return "";
    const nodes = document.querySelectorAll(
      ".jconfirm .jconfirm-content, .ui-dialog-content, .swal2-html-container, .swal2-title",
    );
    return Array.from(nodes)
      .filter((node) => {
        if (node.hidden) return false;
        if (typeof window.getComputedStyle !== "function") return true;
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      })
      .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
  }

  async function waitForStablePendingRowCount() {
    let previousCount = pendingRowCount();
    let stableChecks = 0;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const currentCount = pendingRowCount();
      const activeRequests = Number(window.jQuery?.active || 0);
      if (currentCount !== null && currentCount === previousCount && activeRequests === 0) {
        stableChecks += 1;
        if (stableChecks >= 2) return currentCount;
      } else {
        stableChecks = 0;
      }
      previousCount = currentCount;
      await delay(200);
    }
    return pendingRowCount();
  }

  async function waitForUploadEvidence(beforeCount, targetOrderNumbersBefore) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      // 셀피아는 일부 주문을 정상 접수하면서 이미 수집된 중복 주문 경고를 같은
      // 결과 팝업에 함께 표시한다. 새 대기 행이 실제로 늘었다면 그 증가분을
      // 우선 성공 근거로 인정하고, 행 증가가 없을 때만 팝업을 전체 거절로 본다.
      const afterCount = pendingRowCount();
      if (afterCount !== null && afterCount > beforeCount) {
        const beforeTargets = new Set(targetOrderNumbersBefore);
        const acceptedTargetOrderNumbers = pendingTargetOrderNumbers()
          .filter((orderNumber) => !beforeTargets.has(orderNumber));
        return {
          kind: "accepted",
          acceptedRows: afterCount - beforeCount,
          pendingRows: afterCount,
          acceptedTargetOrderNumbers,
        };
      }
      const dialogText = visibleDialogText();
      if (dialogText && /실패|오류|잘못|불가|업로드할 수 없|접수할 수 없/.test(dialogText)) {
        return { kind: "rejected", message: dialogText.slice(0, 300) };
      }
      await delay(300);
    }
    return { kind: "unknown" };
  }

  // 0) 화면/판매처 옵션 로딩 대기 — 새 탭은 옵션이 AJAX 로 늦게 채워진다.
  // 몰 표기명 ≠ 셀피아 판매처 등록명인 경우 별칭으로 치환 후 검색.
  // 키=shopName 공백제거, 값=셀피아 판매처명의 고유 부분문자열. 대부분은 부분일치로 잡히지만(키즈노트→
  // (주)키즈노트(외부몰) 등) 이름이 완전히 다르면(쿠팡직배송→쿠팡-직배송, 토스→비바리퍼블리카) 명시 필요.
  const SELLPIA_SHOP_ALIASES = {
    "롯데ON": "롯데온",
    "쿠팡직배송쉽먼트": "쿠팡-직배송", // 셀피아 판매처 = "쿠팡-직배송" (쉽먼트/밀크런 파일 모두 동일 판매처)
    "쿠팡직배송밀크런": "쿠팡-직배송",
    "쿠팡직배송": "쿠팡-직배송",
    "토스": "비바리퍼블리카", // 셀피아 판매처 = "(주) 비바리퍼블리카"
  };
  let shopSelect = null;
  let matched = null;
  const aliasKey = (shopName || "").replace(/\s+/g, "");
  const target = (SELLPIA_SHOP_ALIASES[aliasKey] || shopName || "").replace(/\s+/g, "");
  const pageReadyAt = Date.now() + 10000;
  while (Date.now() < pageReadyAt) {
    shopSelect = document.getElementById("search_om_shop");
    if (shopSelect && shopSelect.options.length > 1) {
      if (!shopName) break;
      matched = Array.from(shopSelect.options).find(
        (option) =>
          option.value && String(option.textContent || "").replace(/\s+/g, "").includes(target),
      );
      if (matched) break;
    }
    await delay(300);
  }

  const fileInput = document.getElementById("userfile");
  const submitButton = document.getElementById("btn_om_upload");

  if (!shopSelect || !fileInput) {
    return {
      success: false,
      outcome: "not_submitted",
      pendingPage: true,
      error:
        "셀피아 주문접수(파일 업로드) 화면 요소를 찾지 못했습니다. order_collect 화면이 열렸는지/로그인 상태인지 확인해주세요.",
    };
  }
  if (shopName && !matched) {
    return {
      success: false,
      outcome: "not_submitted",
      error: `셀피아 판매처 목록에서 '${shopName}' 을(를) 찾지 못했습니다. 셀피아 거래처 등록을 확인해주세요.`,
    };
  }

  // 1) 판매처 선택 — 셀피아가 이 시점에 엑셀양식을 비동기로 자동 로드한다.
  if (matched) setSelectValue(shopSelect, matched.value);

  // 2) 엑셀양식(om_excelformed) 자동 로드 대기 — 이걸 안 기다리고 주문접수하면
  //    "엑셀양식이 정해지지 않았습니다" 에러. (탭이 이미 열려 있으면 즉시 통과)
  const excelSelect = document.getElementById("om_excelformed");
  if (excelSelect) {
    const excelReadyAt = Date.now() + 10000;
    while (Date.now() < excelReadyAt && !excelSelect.value) {
      await delay(300);
    }
    if (!excelSelect.value) {
      return {
        success: false,
        outcome: "not_submitted",
        shop: matched ? String(matched.textContent || "").trim() : null,
        error:
          "셀피아 엑셀양식이 자동으로 설정되지 않았습니다. 해당 판매처의 엑셀양식을 셀피아에서 먼저 설정해주세요.",
      };
    }
  }

  // 3) 파일 주입 (file input 은 값 직접 설정 불가 → DataTransfer 로 files 세팅)
  let bytes;
  try {
    bytes = base64ToBytes(fileBase64);
  } catch (error) {
    return {
      success: false,
      outcome: "not_submitted",
      error: "전송 파일 디코딩에 실패했습니다.",
    };
  }
  const file = new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  if (fileInput.files.length !== 1) {
    return {
      success: false,
      outcome: "not_submitted",
      shop: matched ? String(matched.textContent || "").trim() : null,
      error: "셀피아 파일 입력칸에 파일을 넣지 못했습니다.",
    };
  }

  // 4) 주문접수 클릭 (om_fileupload())
  if (!submitButton) {
    return {
      success: false,
      outcome: "not_submitted",
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error: "파일은 주입했지만 '주문접수' 버튼을 찾지 못했습니다.",
    };
  }
  // 기존 대기 목록의 초기 AJAX 로딩을 업로드 성공으로 오인하지 않도록 기준 행 수가
  // 안정화된 뒤 클릭한다. 이후 실제 행 수 증가만 접수 성공 근거로 인정한다.
  const pendingRowsBefore = await waitForStablePendingRowCount();
  if (pendingRowsBefore === null) {
    return {
      success: false,
      outcome: "not_submitted",
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error:
        "셀피아 대기 주문 목록을 읽지 못해 주문접수를 실행하지 않았습니다. 화면을 새로고침한 뒤 다시 시도해주세요.",
    };
  }
  const pendingTargetOrderNumbersBefore = pendingTargetOrderNumbers();
  try {
    submitButton.click();
  } catch (error) {
    return {
      success: false,
      outcome: "unknown",
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error: error?.message || "주문접수 클릭 결과를 확인하지 못했습니다.",
    };
  }

  const uploadEvidence = await waitForUploadEvidence(
    pendingRowsBefore,
    pendingTargetOrderNumbersBefore,
  );
  if (uploadEvidence.kind === "rejected") {
    return {
      success: false,
      outcome: "unknown",
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error: `셀피아 주문접수 결과 확인 필요: ${uploadEvidence.message}`,
    };
  }
  if (uploadEvidence.kind !== "accepted") {
    return {
      success: false,
      outcome: "unknown",
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error:
        "주문접수 버튼은 실행됐지만 셀피아 접수 결과를 확인하지 못했습니다. 셀피아 대기 주문을 확인해주세요.",
    };
  }

  return {
    success: true,
    outcome: "submitted",
    shop: matched ? String(matched.textContent || "").trim() : null,
    excelFormat: excelSelect ? excelSelect.value : null,
    fileName,
    acceptedRows: uploadEvidence.acceptedRows,
    pendingRows: uploadEvidence.pendingRows,
    acceptedTargetOrderNumbers: uploadEvidence.acceptedTargetOrderNumbers,
  };

  function setSelectValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const result = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }
}

// ── 셀피아 전송 이후 후처리 오케스트레이션 ───────────────────────────────
// 전송(order_collect 주문접수) 다음: 등록 → [재고매칭 화면] 조회 → 자동합포 → 자동재고매칭
// → 미매칭(재고부족) 리포트. 실제 버튼 클릭 + $.prompt 자동응답 방식(셀피아 자체 로직/사용자
// localStorage 기준값을 그대로 재사용). 송장 자동채번은 되돌리기 어려우므로 별도(runSellpiaAutoInvoice).

async function runSellpiaStepInTab(tabId, step, timeoutMs, targetOrderNumbers = []) {
  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN", // 페이지 jQuery/전역(dataView, getList, $.prompt) 접근 필요.
      func: sellpiaPostProcessing.driveStep,
      args: [
        step,
        sellpiaPostProcessing.normalizeTargetOrderNumbers(targetOrderNumbers),
      ],
    }),
    timeoutMs,
    `셀피아 ${step} 단계 시간이 초과되었습니다.`,
  );
  return injected[0]?.result ?? { success: false, error: `셀피아 ${step} 화면에 접근하지 못했습니다.` };
}

// 등록(order_collect) → 재고매칭 화면 이동 → 조회 → 자동합포 → 자동재고매칭 + 미매칭 리포트.
async function runSellpiaPostTransfer(environmentId) {
  const tab = await findOrCreateSellpiaTab(); // order_collect 탭 포커스/생성
  if (!tab?.id) return { success: false, error: "셀피아 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  let cur = await chrome.tabs.get(tab.id).catch(() => tab);
  if (!(cur.url || "").includes("order_collect.html")) {
    await chrome.tabs.update(tab.id, { url: SELLPIA_ORDER_UPLOAD_URL });
    await waitForTabReady(tab.id);
  }

  // 1) 등록
  const register = await runSellpiaStepInTab(tab.id, "register", 70000);
  if (!register?.success) {
    return { success: false, step: "register", ...register, url: SELLPIA_ORDER_UPLOAD_URL };
  }

  // 2) 재고매칭 화면 이동
  await chrome.tabs.update(tab.id, { url: SELLPIA_STOCKMATCH_URL });
  await waitForTabReady(tab.id);

  // 3) 조회 → 자동합포 → 자동재고매칭 + 미매칭
  const process = await runSellpiaStepInTab(tab.id, "stockmatch", 200000);
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return {
    success: !!process?.success,
    step: "stockmatch",
    register,
    ...process,
    invoiceTargetCount: (await sellpiaInvoiceTargets.read(environmentId)).length,
    url: currentTab.url || SELLPIA_STOCKMATCH_URL,
  };
}

async function findOrCreateSellpiaInvoiceTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onInvoice = tabs.find((t) => (t.url || "").includes("order_delivery_link"));
  if (onInvoice?.id) return { tab: onInvoice, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: SELLPIA_INVOICE_URL });
    const tab = await chrome.tabs.get(tabs[0].id).catch(() => tabs[0]);
    return { tab, created: false };
  }
  const tab = await interactiveTabs.createTab({
    url: SELLPIA_INVOICE_URL,
    reason: INTERACTIVE_TAB_REASONS.TRACKING_MUTATION,
  });
  return { tab, created: true };
}

// ⚠️되돌리기 어려움: 송장채번 화면에서 실제 송장번호를 발급한다. 프론트 확인 이후에만 호출.
async function runSellpiaAutoInvoice(environmentId) {
  const targetOrderNumbers = await sellpiaInvoiceTargets.read(environmentId);
  if (targetOrderNumbers.length === 0) {
    return {
      success: false,
      error:
        "이번에 셀피아로 전송한 주문번호가 없습니다. 주문 파일을 먼저 전송한 뒤 후처리를 다시 실행하세요.",
    };
  }
  const { tab } = await findOrCreateSellpiaInvoiceTab();
  if (!tab?.id) return { success: false, error: "셀피아 송장채번 탭을 열 수 없습니다." };
  await interactiveTabs.focusTab(tab.id, INTERACTIVE_TAB_REASONS.TRACKING_MUTATION);
  await waitForTabReady(tab.id);
  const result = await runSellpiaStepInTab(
    tab.id,
    "invoice",
    160000,
    targetOrderNumbers,
  );
  if (result?.success && Array.isArray(result.selectedTargetOrderNumbers)) {
    await sellpiaInvoiceTargets.consume(
      environmentId,
      result.selectedTargetOrderNumbers,
    );
  }
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return { ...result, url: currentTab.url || SELLPIA_INVOICE_URL };
}

// 페이지 컨텍스트(MAIN world)에서 실행. 자체완결(외부 참조 금지). step: register|stockmatch|invoice.
async function collectIcecreamMallOrders(date, credentials, collection) {
  const { tab, created } = await findOrCreateIcecreamMallTab();
  if (!tab.id) {
    return { success: false, error: "아이스크림몰 탭을 열 수 없습니다." };
  }
  await attachOrderCollectionTab(collection, tab, created);

  await waitForTabReady(tab.id);
  const login = await withTimeout(
    ensureIcecreamMallLogin(tab.id, credentials),
    35000,
    "아이스크림몰 로그인 자동 입력 시간이 초과되었습니다.",
  );
  if (!login.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: login.pendingLogin ?? true,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: login.error || "아이스크림몰 로그인 자동 입력에 실패했습니다.",
    };
  }

  const deliveryInquiry = await withTimeout(
    openIcecreamMallDeliveryInquiry(tab.id),
    15000,
    "아이스크림몰 배송조회 화면 이동 시간이 초과되었습니다.",
  );
  if (!deliveryInquiry.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: deliveryInquiry.pendingLogin,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: deliveryInquiry.error,
    };
  }

  const deliveryFrameId = await findIcecreamMallDeliveryFrameId(tab.id);
  const target =
    deliveryFrameId == null ? { tabId: tab.id, allFrames: true } : { tabId: tab.id, frameIds: [deliveryFrameId] };
  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target,
      world: "MAIN", // ⭐페이지 컨텍스트로 실행: 조회(#btn_list) 클릭이 몰 프레임워크(WebSquare) 핸들러를
      // 확실히 발동시켜 그리드가 로딩됨. ISOLATED 월드 클릭은 핸들러를 못 깨워 "총 0건"에서 멈춘다.
      func: scrapeIcecreamMallDeliveryGrid,
      args: [date, ICECREAM_DELIVERY_HEADERS, ICECREAM_EXCLUDED_DELIVERY_STATUSES],
    }),
    35000,
    "아이스크림몰 배송목록 수집 시간이 초과되었습니다.",
  );

  const results = injected.map((item) => item.result).filter(Boolean);
  const candidates = results.filter((item) => item?.success && Array.isArray(item.rows));
  candidates.sort((a, b) => b.rows.length - a.rows.length);
  const best = candidates[0];

  if (!best) {
    const failure = summarizeScrapeFailures(results);
    return {
      success: false,
      pendingLogin: false,
      url: tab.url || ICECREAM_MALL_URL,
      error: failure || "아이스크림몰 배송조회 화면은 열었지만 배송목록 표를 찾지 못했습니다.",
    };
  }

  return {
    success: true,
    tabId: tab.id,
    url: tab.url || ICECREAM_MALL_URL,
    ...best,
  };
}

async function findIcecreamMallDeliveryFrameId(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallDeliveryFrame,
  });
  const candidates = injected
    .filter((item) => item.result?.candidate)
    .sort((a, b) => (b.result.score || 0) - (a.result.score || 0));
  return candidates[0]?.frameId ?? null;
}

function detectIcecreamMallDeliveryFrame() {
  const text = document.body?.innerText || "";
  const compact = text.replace(/\s+/g, "");
  const href = location.href || "";
  let score = 0;
  if (href.includes("deliveryInquiry.deliveryInquiryListView")) score += 10;
  if (compact.includes("배송조회")) score += 5;
  if (compact.includes("배송목록")) score += 5;
  if (compact.includes("주문번호") && compact.includes("배송번호")) score += 5;
  if (compact.includes("상품번호") || compact.includes("상품명")) score += 2;
  return {
    candidate: score > 0,
    score,
    href,
  };
}

function summarizeScrapeFailures(results) {
  const reasons = results.map((item) => item?.reason).filter(Boolean);
  const dataFail = results.find((item) => item?.reason === "data rows not found");
  if (dataFail) {
    // 주문은 있는데 전부 이미 출고/완료 상태라 제외된 경우.
    if ((dataFail.doneExcluded || 0) > 0 && (dataFail.orderRows || 0) > 0) {
      return `수집할 출고 전 주문이 없습니다. (최근 30일 주문 ${dataFail.orderRows}건이 전부 이미 출고완료/배송완료 등 처리됨)`;
    }
    // 표는 있는데 주문번호(YYYYMMDDM…) 형식 행이 0건.
    if ((dataFail.candidateRows || 0) > 0) {
      return (
        `배송목록 표(${dataFail.candidateRows}행)는 찾았지만 주문번호(YYYYMMDDM…) 형식의 주문이 없습니다. ` +
        "최근 30일 주문이 없거나, 주문번호가 마스킹되어 있을 수 있습니다."
      );
    }
    return "배송목록 표는 찾았지만 주문 행을 찾지 못했습니다. 조회 결과를 확인해주세요.";
  }
  if (reasons.includes("header not found")) {
    return "배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다. 표가 로딩된 뒤 다시 시도해주세요.";
  }
  if (reasons.includes("not delivery inquiry frame")) {
    return "배송조회 화면은 열었지만 수집 가능한 배송조회 프레임을 찾지 못했습니다.";
  }
  return "";
}

async function findOrCreateIcecreamMallTab() {
  const tabs = await chrome.tabs.query({ url: ICECREAM_MALL_TAB_MATCHES });
  const active = tabs.find((tab) => tab.active) || tabs[0];
  if (active) return { tab: active, created: false };

  const tab = await chrome.tabs.create({ url: ICECREAM_MALL_URL, active: false });
  return { tab, created: true };
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const done = () => resolve();
    const timeout = setTimeout(done, 10000);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        clearTimeout(timeout);
        done();
        return;
      }

      const listener = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        done();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function ensureIcecreamMallLogin(tabId, credentials) {
  if (!credentials) return { success: true, submitted: false };

  // 로그인 페이지는 main.do → loginForm.do 리다이렉트 + JS 렌더라 늦게 뜬다.
  // 첫 스캔에서 폼이 덜 그려졌다고 바로 실패 처리하지 말고, 창 안에서 계속 재시도한다.
  const loginDetectExpiresAt = Date.now() + 15000;
  let sawLoginForm = false;
  let lastIncompleteReason = null;

  while (Date.now() < loginDetectExpiresAt) {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: autoSubmitIcecreamMallLogin,
      args: [credentials],
    });
    const results = injected.map((item) => item.result).filter(Boolean);

    if (results.some((item) => item.state === "submitted")) {
      return waitForIcecreamMallLoginComplete(tabId);
    }
    if (results.some((item) => item.state === "credentials-missing")) {
      return {
        success: false,
        submitted: false,
        pendingLogin: true,
        error: "아이스크림몰 계정 ID와 비밀번호가 저장되어 있지 않습니다.",
      };
    }
    const incomplete = results.find((item) => item.state === "incomplete");
    if (incomplete) {
      sawLoginForm = true;
      lastIncompleteReason = incomplete.reason || lastIncompleteReason;
    }

    await delay(500);
  }

  if (sawLoginForm) {
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: `아이스크림몰 로그인 폼은 찾았지만 자동 로그인을 완료하지 못했습니다 (${lastIncompleteReason || "unknown"}). 로그인 화면 구조가 바뀌었을 수 있습니다.`,
    };
  }

  // 창 내내 로그인 폼(비밀번호 입력칸)을 한 번도 못 봤으면 이미 로그인된 상태로 본다.
  return { success: true, submitted: false };
}

async function waitForIcecreamMallLoginComplete(tabId) {
  const expiresAt = Date.now() + 25000;
  while (Date.now() < expiresAt) {
    await delay(500);
    await waitForTabReady(tabId);
    const state = await detectIcecreamMallLoginInFrames(tabId);
    if (!state.loginPage) {
      return { success: true, submitted: true };
    }
  }

  return {
    success: false,
    submitted: true,
    pendingLogin: true,
    error: "아이스크림몰 로그인 자동 입력은 완료했지만 로그인 후 화면으로 넘어가지 않았습니다. 계정 정보를 확인해주세요.",
  };
}

async function detectIcecreamMallLoginInFrames(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallLoginState,
  });
  const frames = injected.map((item) => item.result).filter(Boolean);
  return {
    loginPage: frames.some((item) => item.loginPage),
    frames,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 제네릭 자동 로그인: 탭에 로그인 폼(ID/비밀번호칸)이 보이면 저장된 계정으로 채워 제출한다.
// credentials 없으면 아무것도 안 함(세션에 의존 = 기존 동작). autoSubmitIcecreamMallLogin 휴리스틱 재사용.
async function ensureMallLogin(tabId, credentials, mallKey = null) {
  if (!credentials || !credentials.loginId || !credentials.password) {
    return { success: true, submitted: false };
  }
  const expiresAt = Date.now() + 15000;
  let sawIncompleteLoginForm = false;
  let lastIncompleteReason = null;
  let kidkidsManagementStableSince = null;
  while (Date.now() < expiresAt) {
    let results = [];
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: autoSubmitIcecreamMallLogin,
        args: [credentials],
      });
      results = injected.map((item) => item.result).filter(Boolean);
    } catch (e) {
      /* 프레임 아직 준비 안 됨 — 재시도 */
    }
    if (results.some((r) => r.state === "submitted")) {
      await delay(1500);
      await waitForTabReady(tabId); // 로그인 후 리다이렉트 정착
      await delay(1200);
      return { success: true, submitted: true };
    }
    // 어느 프레임에서도 로그인 폼이 없으면 이미 로그인된 상태로 간주.
    // 키드키즈는 management.htm 로드가 끝난 뒤 클라이언트 리다이렉트로 로그인 페이지를
    // 여는 구간이 있어, 첫 no-login-form 을 성공으로 처리하면 자동 로그인을 건너뛴다.
    if (results.length && results.every((r) => r.state === "no-login-form")) {
      if (mallKey !== "kidkids") {
        return { success: true, submitted: false };
      }

      let currentUrl = "";
      try {
        currentUrl = String((await chrome.tabs.get(tabId))?.url || "").toLowerCase();
      } catch {
        /* 탭 URL도 아직 준비되지 않음 — 제한시간 안에서 재시도 */
      }

      if (/\/security\/verify_user\.htm(?:[?#]|$)/.test(currentUrl)) {
        return {
          success: false,
          submitted: false,
          pendingLogin: true,
          error: "키드키즈 본인 인증이 필요합니다. 열린 탭에서 인증 후 다시 수집해 주세요.",
        };
      }

      const isKidkidsLoginUrl =
        /\/partnerlogin\.htm(?:[?#]|$)/.test(currentUrl) ||
        /\/join\/partner_login\.htm(?:[?#]|$)/.test(currentUrl);
      const isKidkidsManagementUrl =
        /^https:\/\/partner\.kidkids\.net\/new\/pages\/logis\/management\.htm(?:[?#]|$)/.test(
          currentUrl,
        );

      if (isKidkidsLoginUrl) {
        kidkidsManagementStableSince = null;
      } else if (isKidkidsManagementUrl) {
        kidkidsManagementStableSince ??= Date.now();
        if (Date.now() - kidkidsManagementStableSince >= 5000) {
          return { success: true, submitted: false };
        }
      } else {
        kidkidsManagementStableSince = null;
      }

      await delay(500);
      continue;
    }
    const incomplete = results.find((result) =>
      ["incomplete", "credentials-missing"].includes(result.state),
    );
    if (incomplete) {
      sawIncompleteLoginForm = true;
      lastIncompleteReason = incomplete.reason || incomplete.state;
    }
    await delay(500);
  }
  if (sawIncompleteLoginForm) {
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: `로그인 폼 자동 입력을 완료하지 못했습니다 (${lastIncompleteReason || "unknown"}). 열린 탭에서 로그인 후 다시 수집해 주세요.`,
    };
  }
  if (mallKey === "kidkids") {
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: "키드키즈 로그인 상태를 제한시간 안에 확인하지 못했습니다. 열린 탭에서 로그인 후 다시 수집해 주세요.",
    };
  }
  return { success: true, submitted: false }; // 폼 못 봄 → 이미 로그인 간주
}

// 수집 전 자동 로그인 보장: 몰 주문/홈 URL 을 백그라운드로 열어(미로그인 시 로그인 페이지로 리다이렉트)
// 저장된 계정으로 로그인 후 닫는다. 이후 수집 탭은 같은 세션 쿠키라 로그인 상태. credentials 없으면 스킵.
function ensureMallLoginWithLifecycle(message) {
  return orderCollectionLifecycle.run(
    message,
    KidItemOrderCollectionLifecycle.createIdentity(
      message.mallKey,
      message.date,
    ),
    (collection) =>
      ensureMallLoggedIn(message.mallKey, message.credentials, collection),
  );
}

async function ensureMallLoggedIn(mallKey, credentials, collection = null) {
  if (!credentials || !credentials.loginId || !credentials.password) {
    return { success: true, submitted: false };
  }
  const urls = {
    kidsnote: KIDSNOTE_ORDER_URL,
    kkomangse: KKOMANGSE_ORDER_URL,
    onch: ONCHANNEL_ORDER_URL,
    domeggook: DOMEGGOOK_LIST_URL,
    kidkids: KIDKIDS_ORDER_URL,
    boribori: BORIBORI_ORDER_URL,
    art09: ART09_ORDER_URL,
    "haebub-mall": HAEBEOP_ORDER_URL,
    "icecream-mall": ICECREAM_MALL_URL,
    "teacher-mall": TEACHERVILLE_ORDER_URL,
    "gs-shop": GSSHOP_ORDER_URL,
    // 롯데ON(SSO/AuthToken)·카카오(토큰)·올웨이즈(JWT localStorage)는 채울 로그인 폼이 없어
    // form-fill 자동로그인이 불가능하다. 각 collector 가 미로그인을 감지해 "로그인 필요"로 안내한다.
  };
  const url = urls[mallKey];
  if (!url) return { success: true, submitted: false }; // 자동 로그인 미지원 몰
  const tab = await chrome.tabs.create({ url, active: false }); // 백그라운드
  if (!tab?.id) return { success: false, error: "자동 로그인 탭을 열 수 없습니다." };
  if (collection) {
    try {
      await collection.attachTab(tab, { owned: true });
    } catch (error) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
      throw error;
    }
  }
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await delay(1000);
    const result = await withTimeout(
      ensureMallLogin(tab.id, credentials, mallKey),
      35000,
      "자동 로그인 시간이 초과되었습니다.",
    );
    if (!result.success || result.pendingLogin) {
      keepOpen = true;
    }
    return result;
  } catch (error) {
    keepOpen = true;
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: error instanceof Error ? error.message : "자동 로그인을 완료하지 못했습니다.",
    };
  } finally {
    if (!keepOpen) {
      if (collection) {
        try {
          await collection.detachTab(tab, { owned: false });
        } catch {
          /* 탭 종료는 계속 진행하고 다음 실행에서 stale 소유권을 정리한다. */
        }
      }
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

function detectIcecreamMallLoginState() {
  const passwordInput = findPasswordInput();
  return {
    loginPage: Boolean(passwordInput),
    href: location.href,
  };

  function findPasswordInput() {
    return Array.from(document.querySelectorAll("input")).find((input) => {
      const type = String(input.type || "").toLowerCase();
      const descriptor = inputDescriptor(input);
      return isVisibleInput(input) && (type === "password" || descriptor.includes("비밀번호") || descriptor.includes("password") || descriptor.includes("passwd") || descriptor.includes("pwd"));
    });
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleInput(input) {
    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !input.disabled
    );
  }
}

function autoSubmitIcecreamMallLogin(credentials) {
  const passwordInput = pickPasswordInput();
  if (!passwordInput) {
    // 비밀번호 입력칸이 아직 없음 → 로그인 폼 미표시(이미 로그인했거나 렌더 전). 호출부에서 재시도.
    return { state: "no-login-form" };
  }

  if (!credentials || !credentials.loginId || !credentials.password) {
    return { state: "credentials-missing" };
  }

  const supplierLoginInput = credentials.supplierLoginId
    ? pickSupplierLoginIdInput(passwordInput)
    : null;
  const loginInput = credentials.supplierLoginId
    ? pickCafe24ShopIdInput(passwordInput, supplierLoginInput)
    : pickLoginIdInput(passwordInput);
  if (!loginInput) {
    // 비번칸은 떴는데 ID칸이 아직 안 보임 → 다음 스캔에서 재시도.
    return { state: "incomplete", reason: "id-input-not-found" };
  }
  if (credentials.supplierLoginId && !supplierLoginInput) {
    return { state: "incomplete", reason: "supplier-id-input-not-found" };
  }

  setInputValue(loginInput, credentials.loginId);
  if (supplierLoginInput) {
    setInputValue(supplierLoginInput, credentials.supplierLoginId);
  }
  setInputValue(passwordInput, credentials.password);

  if (triggerLogin(passwordInput)) {
    return { state: "submitted" };
  }
  return { state: "incomplete", reason: "submit-not-found" };

  // 아이스크림몰 정확 셀렉터(#password) 우선, 못 찾으면 일반 휴리스틱.
  function pickPasswordInput() {
    const exact = document.querySelector("input#password, input[name='password']");
    if (exact && isVisibleInput(exact)) return exact;
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        const type = String(input.type || "").toLowerCase();
        const descriptor = inputDescriptor(input);
        return (
          isVisibleInput(input) &&
          (type === "password" ||
            descriptor.includes("비밀번호") ||
            descriptor.includes("password") ||
            descriptor.includes("passwd") ||
            descriptor.includes("pwd"))
        );
      }) || null
    );
  }

  // 아이스크림몰 정확 셀렉터(#loginId) 우선, 못 찾으면 폼/문서에서 랭킹.
  function pickLoginIdInput(anchor) {
    const exact = document.querySelector("input#loginId, input[name='loginId']");
    if (exact && isVisibleInput(exact)) return exact;
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return rankLoginInputs(inputs, anchor)[0] || null;
  }

  function pickSupplierLoginIdInput(anchor) {
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return (
      inputs.find((input) => /공급사|supplier|vendor/.test(inputDescriptor(input))) ||
      rankLoginInputs(inputs, anchor)[0] ||
      null
    );
  }

  function pickCafe24ShopIdInput(anchor, supplierInput) {
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length < 2 && form !== document) inputs = textInputs(document);
    const candidates = inputs.filter((input) => input !== supplierInput);
    return (
      candidates.find((input) =>
        /쇼핑몰|mall.?id|shop.?id|cafe24/.test(inputDescriptor(input)),
      ) ||
      candidates[0] ||
      null
    );
  }

  function textInputs(root) {
    return Array.from(root.querySelectorAll("input")).filter((input) => {
      const type = String(input.type || "text").toLowerCase();
      return ["", "text", "email", "tel", "search", "number"].includes(type) && isVisibleInput(input);
    });
  }

  // 1) onclick 에 doLogin 이 든 컨트롤 → 2) 텍스트가 "로그인" → 3) form submit 순으로 시도.
  function triggerLogin(anchor) {
    const byHandler = Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .filter(isVisibleControl)
      .find((el) => /dologin/i.test(el.getAttribute("onclick") || ""));
    if (byHandler) {
      byHandler.click();
      return true;
    }

    const form = anchor.closest("form");
    const byText = findLoginControl(form || document) || (form ? findLoginControl(document) : null);
    if (byText) {
      byText.click();
      return true;
    }

    if (form) {
      const submitControl = Array.from(
        form.querySelectorAll("input[type='submit'],button[type='submit']"),
      ).filter(isVisibleControl)[0];
      if (submitControl) {
        submitControl.click();
        return true;
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return true;
      }
      if (form.submit) {
        form.submit();
        return true;
      }
    }
    return false;
  }

  function findLoginControl(root) {
    const controls = Array.from(
      root.querySelectorAll("a,button,input[type='button'],input[type='submit'],[role='button'],[onclick]"),
    ).filter(isVisibleControl);
    return (
      controls.find((control) => {
        const text = String(
          control.textContent ||
            control.value ||
            control.getAttribute("title") ||
            control.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim();
        return text === "로그인" || text.toLowerCase() === "login";
      }) || null
    );
  }

  function rankLoginInputs(inputs, anchor) {
    return inputs
      .map((input) => ({ input, score: loginInputScore(input, anchor) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.input);
  }

  function loginInputScore(input, anchor) {
    const descriptor = [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 1;
    if (descriptor.includes("아이디")) score += 6;
    if (descriptor.includes("loginid")) score += 6;
    if (descriptor.includes("id")) score += 4;
    if (descriptor.includes("login")) score += 4;
    if (descriptor.includes("user")) score += 3;
    if (descriptor.includes("email")) score += 2;
    if (anchor && input.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) score += 3;
    return score;
  }

  function associatedLabelText(input) {
    const labels = [];
    if (input.labels) {
      labels.push(...Array.from(input.labels).map((label) => label.textContent || ""));
    }
    const parentLabel = input.closest("label");
    if (parentLabel) labels.push(parentLabel.textContent || "");
    return labels.join(" ");
  }

  function setInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisibleInput(input) {
    return isVisibleControl(input) && !input.readOnly;
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleControl(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.disabled
    );
  }
}

async function openIcecreamMallDeliveryInquiry(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: ensureIcecreamMallDeliveryInquiry,
  });

  return injected[0]?.result ?? {
    success: false,
    pendingLogin: true,
    error: "아이스크림몰 화면에 접근하지 못했습니다. 로그인 상태를 확인해주세요.",
  };
}

async function ensureIcecreamMallDeliveryInquiry() {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function hasDeliveryInquiryFrame() {
    const bodyText = document.body?.innerText || "";
    if (hasDeliveryInquiryText(bodyText)) {
      return true;
    }

    return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
      const src = String(frame.getAttribute("src") || "");
      if (src.includes("deliveryInquiry.deliveryInquiryListView")) return true;

      try {
        const frameText = frame.contentDocument?.body?.innerText || "";
        return hasDeliveryInquiryText(frameText);
      } catch {
        return false;
      }
    });
  }

  function clickDeliveryInquiryMenu() {
    const candidates = menuCandidates();
    const exact = candidates.find((item) => item.text === "배송 조회" || item.text === "배송조회");
    if (exact) {
      exact.element.click();
      return true;
    }

    const deliverySection = candidates.find((item) => item.text === "배송");
    deliverySection?.element.click();

    const afterSectionClick = menuCandidates().find(
      (item) => item.text === "배송 조회" || item.text === "배송조회",
    );
    if (afterSectionClick) {
      afterSectionClick.element.click();
      return true;
    }

    return false;
  }

  function menuCandidates() {
    return Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .map((element) => ({
        element,
        text: String(
          element.textContent ||
            element.value ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((item) => item.text.includes("배송"));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  if (hasDeliveryInquiryFrame()) {
    return { success: true, opened: false };
  }

  const clicked = clickDeliveryInquiryMenu();
  if (!clicked) {
    const bodyText = document.body?.innerText || "";
    return {
      success: false,
      pendingLogin: !bodyText.includes("배송"),
      error: "아이스크림몰 배송조회 메뉴를 찾지 못했습니다. 로그인 후 다시 시도해주세요.",
    };
  }

  const expiresAt = Date.now() + 12000;
  while (Date.now() < expiresAt) {
    if (hasDeliveryInquiryFrame()) {
      return { success: true, opened: true };
    }
    await delay(400);
  }

  return {
    success: false,
    pendingLogin: false,
    error: "배송조회 메뉴를 눌렀지만 배송목록 화면이 열리지 않았습니다.",
  };
}

async function scrapeIcecreamMallDeliveryGrid(date, expectedHeaders, excludedStatuses) {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  // 조회 기간을 [startYmd, endYmd] 로 설정. startDate/endDate 이름 우선, 없으면 값이 날짜인 input 첫 2개.
  function setDateRange(startYmd, endYmd) {
    const applyVal = (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    let startEl = document.querySelector("input[name='startDate'], input#startDate, input[name='startDt']");
    let endEl = document.querySelector("input[name='endDate'], input#endDate, input[name='endDt']");
    if (!startEl || !endEl) {
      const dateInputs = Array.from(document.querySelectorAll("input")).filter((input) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(input.value || "")),
      );
      startEl = startEl || dateInputs[0] || null;
      endEl = endEl || dateInputs[1] || null;
    }
    if (startEl) applyVal(startEl, startYmd);
    if (endEl) applyVal(endEl, endYmd);
    return Boolean(startEl && endEl);
  }

  function clickSearchButton() {
    const controls = Array.from(document.querySelectorAll("a,button,input[type='button']"));
    const byText = controls.find((control) => {
      const text = String(control.textContent || control.value || "").replace(/\s+/g, " ").trim();
      return text === "조회";
    });
    const search = document.getElementById("btn_list") || byText; // 배송조회 조회 버튼(#btn_list 우선)
    search?.click();
    return Boolean(search);
  }

  function findHeaderCells() {
    const candidates = collectCandidateRows()
      .map((row) => cellTexts(row))
      .filter((cells) => cells.length > 0);
    const header = candidates
      .map(normalizeHeaderCells)
      .filter((cells) => isDeliveryHeader(cells))
      .sort((a, b) => b.length - a.length)[0];

    const hasOrderRows = candidates.some((cells) =>
      cells.some((cell) => /^\d{8}M\d+/.test(cell || "")),
    );
    if (header && header.length >= 20) return header;
    return hasOrderRows ? expectedHeaders : header ?? [];
  }

  function findDataRows(headers) {
    const columnCount = headers.length;
    const statusIdx = headers.indexOf("주문내역상태");
    // 이미 처리 중/완료된 상태는 제외 = 출고 전 주문만 수집(중복 배송 방지).
    const rows = [];
    const seen = new Set();
    let candidateRows = 0; // 표에서 스캔한 행 수(진단용)
    let orderRows = 0; // 주문번호(YYYYMMDDM…) 형식 행 수(진단용)
    let doneExcluded = 0; // 이미 출고/완료로 제외된 주문 수(진단용)
    for (const row of collectCandidateRows()) {
      const cells = cellTexts(row);
      if (cells.length) candidateRows += 1;
      const orderIndex = cells.findIndex((cell) => /^\d{8}M\d+/.test(cell || ""));
      if (orderIndex < 0) continue;
      orderRows += 1;

      const hasNoColumn = headers[0] === "No";
      const start =
        hasNoColumn && orderIndex > 0 && /^\d+$/.test(cells[orderIndex - 1] || "")
          ? orderIndex - 1
          : orderIndex;
      if (cells.length - start < Math.min(columnCount, 12)) continue;

      const normalized = cells.slice(start, start + columnCount);
      while (normalized.length < columnCount) normalized.push("");

      const key = normalized.join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);

      // 출고 전 주문만: 배송중/배송완료 등 이미 처리 중이거나 완료된 상태는 제외.
      const status = statusIdx >= 0 ? String(normalized[statusIdx] || "") : "";
      if (excludedStatuses.some((excluded) => status.includes(excluded))) {
        doneExcluded += 1;
        continue;
      }

      rows.push(normalized);
    }
    // 출고 전(미출고) 주문 전부 반환. 조회일 무관 — 기간 내 미출고 주문을 셀피아로 전송(사용자가 미리보기 확인).
    return { rows, candidateRows, orderRows, doneExcluded };
  }

  function collectCandidateRows() {
    const selectors = [
      "table tr",
      "[role='row']",
      ".slick-row",
      ".aui-grid-row",
      ".tui-grid-row",
      ".x-grid-row",
      ".ui-jqgrid-btable tr",
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")));
  }

  function cellTexts(row) {
    const cells = Array.from(
      row.matches("tr")
        ? row.querySelectorAll("th,td")
        : row.querySelectorAll(
            [
              "[role='columnheader']",
              "[role='gridcell']",
              ".slick-cell",
              ".aui-grid-cell",
              ".tui-grid-cell",
              ".x-grid-cell",
              "th",
              "td",
            ].join(","),
          ),
    );
    return cells.map((cell) =>
      String(cell.textContent || "").replace(/\s+/g, " ").trim(),
    );
  }

  function normalizeHeaderCells(cells) {
    return cells.map((cell) => {
      if (cell === "거래명세서통봉여부") return "거래명세서동봉여부";
      return cell;
    });
  }

  function isDeliveryHeader(cells) {
    const compact = cells.join("\u001f");
    return (
      cells.includes("주문번호") &&
      cells.includes("배송번호") &&
      cells.includes("주문완료일시") &&
      (cells.includes("상품번호") || compact.includes("상품번호")) &&
      (cells.includes("상품명") || compact.includes("상품명"))
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 헤더(≥20열)+출고 전 주문행이 나타날 때까지 windowMs 동안 폴링. 표 로딩 지연 대비.
  async function pollGrid(windowMs) {
    let headers = [];
    let rows = [];
    let diag = { candidateRows: 0, orderRows: 0, doneExcluded: 0 };
    const end = Date.now() + windowMs;
    while (Date.now() < end) {
      headers = findHeaderCells();
      if (headers.length >= 20) {
        const found = findDataRows(headers);
        rows = found.rows;
        diag = { candidateRows: found.candidateRows, orderRows: found.orderRows, doneExcluded: found.doneExcluded };
      } else {
        rows = [];
      }
      if (headers.length >= 20 && rows.length > 0) break;
      await delay(400);
    }
    return { headers, rows, diag };
  }

  const bodyText = document.body?.innerText || "";
  if (!hasDeliveryInquiryText(bodyText)) {
    return { success: false, reason: "not delivery inquiry frame" };
  }

  // 조회 기간 = 최근 30일(오늘 포함 지난 30일). ⚠️today-today 로 좁히지 않는다(새벽엔 전일 주문만 배송대기
  // 라 0건). 대신 주문내역상태로 "출고 전" 주문만 수집(findDataRows). 배송조회 기본화면은 비어 조회 클릭 필수.
  const p2 = (n) => String(n).padStart(2, "0");
  const fmt = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const endD = date ? new Date(date + "T00:00:00") : new Date();
  const startD = new Date(endD.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) 이미 데이터가 로딩된 탭(재사용)이면 바로 스크랩.
  let result = await pollGrid(4000);

  // 2) 출고 전 주문을 못 얻었으면 30일 범위 설정 + 조회 클릭 후 넉넉히 재폴링. (35s 타임아웃 안 4s + 22s + 여유)
  if (result.rows.length === 0) {
    setDateRange(fmt(startD), fmt(endD));
    clickSearchButton();
    await delay(1500); // 조회 재로딩(AJAX) 시작 → 빈 상태로 바뀌는 구간을 넘긴 뒤 폴링
    const retried = await pollGrid(22000);
    if (retried.rows.length > 0 || retried.headers.length >= 20 || retried.diag.orderRows > 0) result = retried;
  }

  const { headers, rows, diag } = result;

  if (headers.length < 20 || !headers.includes("주문번호") || !headers.includes("배송번호")) {
    return { success: false, reason: "header not found", headerCount: headers.length };
  }
  if (rows.length === 0) {
    return {
      success: false,
      reason: "data rows not found",
      headerCount: headers.length,
      candidateRows: diag.candidateRows,
      orderRows: diag.orderRows,
      doneExcluded: diag.doneExcluded,
    };
  }

  const masked = rows.some((row) => row.some((cell) => /\*{2,}/.test(cell)));
  return {
    success: true,
    mall: "아이스크림몰",
    date: date || null,
    headers,
    rows,
    rowCount: rows.length,
    masked,
    source: "icecream-mall-delivery-grid",
  };
}

async function findOrCreateSellpiaReprintTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onReprint = tabs.find((t) => (t.url || "").includes("order_delivery_reprint"));
  if (onReprint?.id) return { tab: onReprint, created: false };
  const tab = await chrome.tabs.create({ url: SELLPIA_REPRINT_URL, active: false });
  return { tab, created: true };
}

async function collectSellpiaDeliTracking(options = {}, collection) {
  const { tab, created } = await findOrCreateSellpiaReprintTab();
  if (!tab?.id) return { success: false, error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트 fetch (로그인 세션 쿠키). ISOLATED 는 SameSite 쿠키 미전송 위험.
        func: scrapeSellpiaDeliTracking,
        args: [options.startDate || null, options.endDate || null],
      }),
      60000,
      "셀피아 송장 조회 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "셀피아 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("셀피아"); }
    return mallGenericErrorResult("셀피아", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

async function scrapeSellpiaDeliTracking(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const end = endDate || `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const s0 = new Date(d.getTime() - 30 * 24 * 60 * 60 * 1000); // 기본 최근 30일
    const start = startDate || `${s0.getFullYear()}-${p(s0.getMonth() + 1)}-${p(s0.getDate())}`;
    // 송장번호채번일자 기준으로 조회 — 채번 직후(출력 전) 주문도 잡힌다(기본값 print_datetime은 출력 전 누락).
    const dateType = "delinum_date";
    const body = new URLSearchParams({
      domode: "GET_ORDER_DELIVERY_REPRINT_LIST",
      date_type: dateType, // delinum_date=송장번호채번일자 / print_datetime=송장출력일자 / pack_datetime=피킹일자
      s_date: start,
      e_date: end,
      delinum: "",
      receiver: "",
      onlydeli_sellpia_code: "",
      pick_num: "",
    });
    const res = await fetch("delivery_link.action.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 송장 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 송장 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }
    const list = Array.isArray(data && data.list) ? data.list : [];
    const s2 = (v) => String(v == null ? "" : v).trim();
    // ⭐전 몰 반환(판매처 필터는 프론트가 몰별로). 각 몰 송장 업로드가 이 소스를 공유한다.
    const rows = list
      .map((o) => {
        const si = o.ship_info || {};
        const ordNo = s2(si.ord_no || String(o.group_no || "").split("_").pop() || "");
        return {
          ordNo,
          itemNo: "",
          invNo: s2(o.delinum),
          courier: s2(o.delicom), // 셀피아 택배사코드(예 1136=CJ)
          provider: s2(si.provider_name || o.receiver), // 판매처명 (몰 매핑용)
          receiver: s2(o.receiver).replace(/\([^)]*\)\s*$/, "").trim(), // 수취인 (몰명 괄호 제거)
          post: s2(o.receiver_post),
          addr: [s2(o.receiver_addr1), s2(o.receiver_addr2)].filter(Boolean).join(" "),
        };
      })
      .filter((r) => r.ordNo && r.invNo);
    return { success: true, rows, total: list.length, range: { start, end } };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function findOrCreateSellpiaSaleSummaryTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onSummary = tabs.find((t) => (t.url || "").includes("sale_summary"));
  if (onSummary?.id) return { tab: onSummary, created: false };
  const tab = await chrome.tabs.create({ url: SELLPIA_SALE_SUMMARY_URL, active: false });
  return { tab, created: true };
}

// 셀피아 판매현황(sale_summary) 몰별·일별 매출 수집. 읽기 전용(비파괴).
async function collectSellpiaSaleSummary(options = {}) {
  const { tab, created } = await findOrCreateSellpiaSaleSummaryTab();
  if (!tab?.id) return { success: false, error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트 fetch(로그인 세션 쿠키) + provider_list 전역 접근.
        func: scrapeSellpiaSaleSummary,
        args: [options.startDate || null, options.endDate || null],
      }),
      60000,
      "셀피아 판매현황 조회 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "셀피아 화면에 접근하지 못했습니다." };
  } catch (e) {
    // 로그인 에러 시 대화형(웹 버튼) 호출만 탭을 열어둬 사용자가 로그인하도록 유도한다.
    // 무인 알람(keepTabOnLoginError 미지정)은 탭을 남기면 6시간마다 누적되므로 항상 닫는다.
    if (isMallAccessError(e)) { keepOpen = created && options.keepTabOnLoginError === true; return mallAccessErrorResult("셀피아"); }
    return mallGenericErrorResult("셀피아", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// sale_summary.html 페이지 컨텍스트에서 실행. order_search.ajax.html(mode=selldate,
// 주문일자 s_type=1) 로 판매처(seller)별 일별 매출 JSON 을 받아 seller id→명 매핑 후 반환.
async function scrapeSellpiaSaleSummary(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const toYmdUtc = (date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
    const parseYmd = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(parsed.getTime()) || toYmdUtc(parsed) !== value ? null : parsed;
    };
    const todayKst = toYmdUtc(new Date(Date.now() + 9 * 60 * 60 * 1000));
    const end = endDate || todayKst;
    const endAnchor = parseYmd(end);
    if (!endAnchor) return { success: false, error: "셀피아 판매현황 종료일이 올바르지 않습니다." };
    const defaultStart = toYmdUtc(new Date(endAnchor.getTime() - 92 * 24 * 60 * 60 * 1000));
    const start = startDate || defaultStart; // 기본 최근 93일(양 끝 포함) — 일/주/월 집계용 이력 누적
    const startAnchor = parseYmd(start);
    if (!startAnchor || startAnchor > endAnchor) {
      return { success: false, error: "셀피아 판매현황 수집 기간이 올바르지 않습니다." };
    }
    const body = new URLSearchParams({
      mode: "selldate", // 판매일자별 집계
      s_date: start,
      e_date: end,
      seller: "all",
      o_type: "",
      r_type: "",
      p_str: "",
      s_type: "1", // 주문일자 기준
      fs_type: "",
      nick_type: "",
      nick_str: "",
    });
    const res = await fetch("order_search.ajax.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 판매현황 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 판매현황 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }

    // 이 API의 정상 seller=all 응답은 `{ sellerId: { YYYY-MM-DD: metrics } }`
    // 형태다. 배열/null/error envelope를 빈 매출로 오인하면 백엔드의 권위 범위
    // 교체가 기존 데이터를 지우므로, plain object 이외에는 한 행도 수락하지 않는다.
    const isPlainObject = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    };
    if (!isPlainObject(data)) {
      return { success: false, error: "셀피아 판매현황 응답 형식이 예상과 다릅니다." };
    }
    const sellerIds = Object.keys(data);
    if (sellerIds.length === 0) {
      return {
        success: true,
        payload: {
          range: { from: start, to: end },
          sellers: [],
          provenance: {
            source: "sellpia_sale_summary",
            mode: "selldate",
            sellerScope: "all",
            responseShape: "empty_object",
            explicitEmpty: true,
          },
        },
        sellerCount: 0,
        range: { start, end },
      };
    }

    // seller id→판매처명 매핑 소스(provider_list.js.html?mode=more)가 대용량이라 로딩 대기.
    for (let i = 0; i < 30 && typeof provider_list_all === "undefined"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const nameOf = (id) => {
      try {
        if (
          typeof provider_list_all !== "undefined" &&
          Object.prototype.hasOwnProperty.call(provider_list_all, id) &&
          provider_list_all[id]
        ) return String(provider_list_all[id]);
        if (
          typeof provider_list_s !== "undefined" &&
          Object.prototype.hasOwnProperty.call(provider_list_s, id) &&
          provider_list_s[id]
        ) return String(provider_list_s[id]);
      } catch { /* 전역 미로딩 */ }
      return "";
    };
    const parseMetric = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized)) return null;
      const parsed = Number(normalized.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const sellers = [];
    for (const sellerId of sellerIds) {
      const sellerName = nameOf(sellerId).trim();
      const dayMap = data[sellerId];
      if (!sellerId.trim() || sellerId.length > 64 || !sellerName || !isPlainObject(dayMap)) {
        return { success: false, error: "셀피아 판매현황에 알 수 없는 판매처 응답이 포함되어 있습니다." };
      }
      const dateKeys = Object.keys(dayMap);
      if (dateKeys.length === 0) {
        return { success: false, error: "셀피아 판매현황에 일자 데이터가 없는 판매처가 포함되어 있습니다." };
      }
      const days = [];
      for (const date of dateKeys) {
        const parsedDate = parseYmd(date);
        const v = dayMap[date];
        if (!parsedDate || parsedDate < startAnchor || parsedDate > endAnchor || !isPlainObject(v)) {
          return { success: false, error: "셀피아 판매현황에 유효하지 않은 일자 응답이 포함되어 있습니다." };
        }
        if (!("price" in v) || !("amount" in v) || !("buy_price" in v)) {
          return { success: false, error: "셀피아 판매현황 일자 응답에 필수 매출 항목이 없습니다." };
        }
        const price = parseMetric(v.price);
        const amount = parseMetric(v.amount);
        const buyPrice = parseMetric(v.buy_price);
        if (price === null || amount === null || buyPrice === null) {
          return { success: false, error: "셀피아 판매현황 일자 응답의 매출 값이 올바르지 않습니다." };
        }
        days.push({
          date,
          price,
          amount,
          buyPrice,
        });
      }
      sellers.push({
        sellerId: String(sellerId),
        sellerName,
        days,
      });
    }
    return {
      success: true,
      payload: { range: { from: start, to: end }, sellers },
      sellerCount: sellers.length,
      range: { start, end },
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function findOrCreateSellpiaProductProfitTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onPage = tabs.find((t) => (t.url || "").includes("stat_prd_profit"));
  if (onPage?.id) return { tab: onPage, created: false };
  const tab = await chrome.tabs.create({ url: SELLPIA_PRODUCT_PROFIT_URL, active: false });
  return { tab, created: true };
}

// 셀피아 상품별 이익현황(stat_prd_profit) 월별 소진 수집. 읽기 전용(비파괴).
async function collectSellpiaProductProfit() {
  const { tab, created } = await findOrCreateSellpiaProductProfitTab();
  if (!tab?.id) return { success: false, error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트 fetch(로그인 세션 쿠키).
        func: scrapeSellpiaProductProfit,
        args: [null, null],
      }),
      90000,
      "셀피아 상품별 이익현황 조회 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "셀피아 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("셀피아"); }
    return mallGenericErrorResult("셀피아", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// stat_prd_profit.html 페이지 컨텍스트에서 실행. stat_action.ajax.html(mode=stat_prd_profit)로
// 상품별 이익현황을 받아 graph(월별 매입액,판매액,판매수량)를 상품×월별로 파싱해 반환.
async function scrapeSellpiaProductProfit(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const toYmd = (date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
    // 브라우저/운영체제 시간대와 무관하게 KST 달력을 기준으로 어제까지의 연속
    // 400일 증거창을 만든다. 끝점에서 400일을 빼므로 양 끝 포함 401일이다.
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const defaultEnd = new Date(Date.UTC(
      nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - 1,
    ));
    const defaultStart = new Date(Date.UTC(
      defaultEnd.getUTCFullYear(), defaultEnd.getUTCMonth(), defaultEnd.getUTCDate() - 400,
    ));
    const end = endDate || toYmd(defaultEnd);
    const start = startDate || toYmd(defaultStart);
    const dateKey = /^\d{4}-\d{2}-\d{2}$/;
    const toValidDate = (value) => {
      if (typeof value !== "string" || !dateKey.test(value)) return null;
      const timestamp = Date.parse(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(timestamp)) return null;
      const parsed = new Date(timestamp);
      return parsed.toISOString().slice(0, 10) === value ? parsed : null;
    };
    const startValue = toValidDate(start);
    const endValue = toValidDate(end);
    if (!startValue || !endValue || startValue > endValue) {
      return { success: false, error: "셀피아 상품별 이익현황 조회 기간이 올바르지 않습니다." };
    }
    const rangeMonths = new Set();
    for (
      let monthIndex = startValue.getUTCFullYear() * 12 + startValue.getUTCMonth();
      monthIndex <= endValue.getUTCFullYear() * 12 + endValue.getUTCMonth();
      monthIndex += 1
    ) {
      const year = Math.floor(monthIndex / 12);
      rangeMonths.add(`${year}-${String(monthIndex % 12 + 1).padStart(2, "0")}`);
    }
    const body = new URLSearchParams({
      mode: "stat_prd_profit",
      s_date: start,
      e_date: end,
      in_s_date: start,
      in_e_date: end,
      buy_point: "R",
      provider: "",
      vat_tp: "1",
      p_str: "",
      period_free: "false",
      prd_cate: "",
      prd_type: "",
    });
    const res = await fetch("stat_action.ajax.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 상품별 이익현황 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 상품별 이익현황 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }
    if (!Array.isArray(data)) {
      return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
    }
    if (data.length > 20000) {
      return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
    }
    const normYm = (k) => {
      const m = String(k).match(/^(\d{4})-(\d{1,2})$/);
      if (!m) return null;
      const month = Number(m[2]);
      if (month < 1 || month > 12) return null;
      return m[1] + "-" + String(month).padStart(2, "0");
    };
    const int = (value) => {
      if (typeof value === "string" && !/^\d+$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2147483647
        ? parsed
        : null;
    };
    const signedInt = (value) => {
      if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed)
        && parsed >= -2147483648
        && parsed <= 2147483647
        ? parsed
        : null;
    };
    const boundedString = (value, max, allowEmpty = false) => {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).trim();
      if ((!allowEmpty && !normalized) || normalized.length > max) return null;
      return normalized;
    };
    const products = [];
    const identities = new Set();
    let skippedAdjustmentCount = 0;
    for (const p2 of data) {
      if (!p2 || typeof p2 !== "object" || Array.isArray(p2)) {
        return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
      }
      const productCode = boundedString(p2.product_code, 64);
      const optionCode = boundedString(p2.option_code ?? "", 64, true);
      const productName = boundedString(p2.product_name, 400);
      const salePrice = p2.sale_price == null || p2.sale_price === "" ? 0 : int(p2.sale_price);
      const buyPrice = p2.buy_price == null || p2.buy_price === "" ? 0 : int(p2.buy_price);
      const barcode = p2.dp_code == null || p2.dp_code === "" ? undefined : boundedString(p2.dp_code, 64);
      if (!productCode || optionCode === null || !productName || salePrice === null || buyPrice === null || barcode === null) {
        return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
      }
      const identity = `${productCode}\u0000${optionCode}`;
      if (identities.has(identity)) {
        return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
      }
      identities.add(identity);
      const graph = p2.graph;
      if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
        return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
      }
      const rawMonthValues = [];
      for (const key of Object.keys(graph)) {
        const ym = normYm(key);
        if (!ym || !rangeMonths.has(ym) || typeof graph[key] !== "string") {
          return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
        }
        const parts = graph[key].split(",");
        if (parts.length !== 3) {
          return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
        }
        const inAmount = signedInt(parts[0]);
        const orderAmount = signedInt(parts[1]);
        const orderQty = signedInt(parts[2]);
        if (inAmount === null || orderAmount === null || orderQty === null) {
          return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
        }
        rawMonthValues.push({ yearMonth: ym, inAmount, orderAmount, orderQty });
      }
      // Sellpia includes financial-only rows such as `할인` in the product
      // report. They have no unit price, barcode, or inbound value and carry
      // negative revenue only. They are not inventory products and cannot be
      // mapped to a MasterProduct, so exclude only this narrow adjustment
      // shape. Negative revenue on an inventory-bearing product remains a
      // contract failure instead of being silently erased.
      const pureFinancialAdjustment = salePrice === 0
        && buyPrice === 0
        && barcode === undefined
        && rawMonthValues.some((month) => month.orderAmount < 0)
        && rawMonthValues.every((month) =>
          month.inAmount === 0
          && month.orderAmount <= 0
          && month.orderQty >= 0,
        );
      if (pureFinancialAdjustment) {
        skippedAdjustmentCount += 1;
        continue;
      }
      const monthValues = new Map();
      for (const month of rawMonthValues) {
        const inAmount = int(month.inAmount);
        const orderAmount = int(month.orderAmount);
        const orderQty = int(month.orderQty);
        if (
          inAmount === null
          || orderAmount === null
          || orderQty === null
          || monthValues.has(month.yearMonth)
        ) {
          return { success: false, error: "셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다." };
        }
        monthValues.set(month.yearMonth, { inAmount, orderAmount, orderQty });
      }
      // 응답에 없는 월을 0으로 꾸며 내지 않는다. 서버는 이 실제 월 버킷과
      // payload-level request range의 교집합을 저장해, 누락을 정상 0으로 오인하지 않는다.
      const months = [...monthValues.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([yearMonth, values]) => ({
          yearMonth,
          ...values,
          inQty: 0, // graph 에는 매입수량이 없어 0 (총계는 total_in_qty)
        }));
      products.push({
        productCode,
        optionCode,
        productName,
        optionName: p2.option_name ? String(p2.option_name) : undefined,
        providerName: p2.provider_name ? String(p2.provider_name) : undefined,
        salePrice,
        buyPrice,
        barcode,
        months,
      });
    }
    return {
      success: true,
      payload: {
        range: { from: start, to: end },
        provenance: {
          source: "sellpia_stat_prd_profit",
          costBasis: "ORDER_TIME_SUPPLY_COST",
          vatIncluded: true,
        },
        products,
      },
      productCount: products.length,
      skippedAdjustmentCount,
      range: { start, end },
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function findOrCreateKakaoTab() {
  const tabs = await chrome.tabs.query({ url: KAKAO_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 기존 카카오 탭 재사용 (포커스 안 뺏음)
  const tab = await chrome.tabs.create({ url: KAKAO_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKakaoOrders(dateFilter, collection) {
  const { tab, created } = await findOrCreateKakaoTab();
  if (!tab?.id) return { success: false, error: "카카오쇼핑 판매자센터(shopping-seller.kakao.com) 탭을 열 수 없습니다." };
  await attachOrderCollectionTab(collection, tab, created);
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKakaoOrders,
        args: [dateFilter || ""],
      }),
      120000,
      "카카오 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "카카오 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("카카오"); }
    return mallGenericErrorResult("카카오", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

async function scrapeKakaoOrders(dateFilter) {
  try {
    const pad = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const now = new Date();
    let from, to;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter || "")) {
      const s = dateFilter.replace(/-/g, "");
      from = s + "000000";
      to = s + "235959";
    } else {
      // 배송준비중은 미출고분이라 최근분 — 넉넉히 90일 결제분 조회.
      to = ymd(now) + "235959";
      from = ymd(new Date(now.getTime() - 90 * 86400000)) + "000000";
    }
    const orders = [];
    for (let page = 0; page < 50; page++) {
      const res = await fetch("/api/oms/v2/orders/_search/SELLER_ORDER/101", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        // ⭐배송준비중 = enum 이름 "ShippingWaiting" (숫자 301 을 보내면 500). 응답의 statusCode 는 301.
        body: JSON.stringify({
          size: "200",
          statuses: ["ShippingWaiting"],
          orderPaidAt: { from, to },
          page: String(page),
        }),
      });
      const text = await res.text();
      // 로그인 리다이렉트(HTML)면 로그인 안내, API 오류(JSON errorMessage)면 실제 메시지 전달 — 500 을 "로그인"으로 오표시하지 않는다.
      if (text.trim().charAt(0) === "<") {
        if (page === 0)
          return {
            success: false,
            pendingLogin: true,
            error: "카카오쇼핑 판매자센터 로그인이 필요합니다. shopping-seller.kakao.com 에 로그인한 뒤 다시 시도하세요.",
          };
        break;
      }
      if (!res.ok) {
        let msg = `카카오 주문 조회 실패 (HTTP ${res.status})`;
        try {
          const j = JSON.parse(text);
          if (j && j.errorMessage) msg = `카카오: ${j.errorMessage}`;
        } catch (e) {
          /* 파싱 실패 — 기본 메시지 */
        }
        if (page === 0) return { success: false, error: msg };
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (page === 0) return { success: false, error: "카카오 주문 응답을 해석하지 못했습니다 (로그인/세션 확인)." };
        break;
      }
      const contents = (j && j.contents) || [];
      for (const o of contents) {
        if (Number(o.statusCode) === 301) orders.push(o); // 배송준비중만 (방어적 재확인)
      }
      if (j.last || contents.length < 200) break;
    }
    return { success: true, orders, count: orders.length };
  } catch (e) {
    return { success: false, error: (e && e.message) || "카카오 주문 수집 실패" };
  }
}

async function uploadOnchTracking(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  if (rows.length === 0) return { success: false, error: "온채널 송장이 없습니다." };
  const { tab, created } = await findOrCreateOnchannelTab();
  if (!tab?.id) return { success: false, error: "온채널(onch3.co.kr) 탭을 열 수 없습니다." };
  await interactiveTabs.focusTab(tab.id, INTERACTIVE_TAB_REASONS.TRACKING_MUTATION);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 로그인 세션 same-origin POST
        func: scrapeOnchUpload,
        args: [rows],
      }),
      120000,
      "온채널 송장 업로드 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "온채널 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("온채널"); }
    return mallGenericErrorResult("온채널", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

async function scrapeOnchUpload(rows) {
  try {
    if (/login/i.test(location.href) || document.querySelector('input[type="password"]')) {
      return { success: false, error: "온채널 로그인이 필요합니다. onch3.co.kr 에 로그인 후 다시 시도하세요." };
    }
    // 택배사 정식명(CJ 대한통운) — #deliveryObjs 에서 확정, 없으면 기본값.
    let cjName = "CJ 대한통운";
    try {
      const objs = JSON.parse(document.getElementById("deliveryObjs").value || "[]");
      const cj = objs.find((o) => /대한통운/.test(o.delivery_name || ""));
      if (cj && cj.delivery_name) cjName = cj.delivery_name;
    } catch { /* 기본값 사용 */ }

    // 목록: 주문코드(상세모달) → { member(memberOrderNum), isFirst }. 송장입력 버튼과 같은 행의 주문코드를 페어링.
    const map = {};
    const sjBtns = [...document.querySelectorAll('[onclick*="supplierDeliveryNumberModal"]')];
    for (const b of sjBtns) {
      const oc = b.getAttribute("onclick") || "";
      const m = oc.match(/supplierDeliveryNumberModal\('([^']*)','([^']*)','([^']*)'/);
      if (!m) continue;
      let el = b;
      let code = null;
      for (let i = 0; i < 12 && el; i += 1) {
        el = el.parentElement;
        const d = el && el.querySelector('[onclick*="supplierOrderDetailModal"]');
        if (d) { code = ((d.getAttribute("onclick") || "").match(/'([^']+)'/) || [])[1]; break; }
      }
      if (code && !map[code]) map[code] = { member: m[1], isFirst: m[3] };
    }

    const results = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const r of rows) {
      const ordNo = String(r.ordNo || "").trim();
      const invNo = String(r.invNo || "").trim();
      if (!ordNo || !invNo) { results.push({ ordNo, ok: false, reason: "송장/주문번호 없음" }); continue; }
      const hit = map[ordNo];
      if (!hit) { results.push({ ordNo, ok: false, reason: "온채널 목록에 없음(이미 발송 또는 기간 밖)" }); continue; }
      if (hit.isFirst !== "true") { results.push({ ordNo, ok: false, reason: "이미 송장 등록됨" }); continue; }
      const body = new URLSearchParams({ trans_nm: cjName, trans_num: invNo, hidden_trans_num: hit.member });
      try {
        const res = await fetch("/access/order_access.php?ubr=trans_ok", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: body.toString(),
        });
        const txt = await res.text();
        let code = null;
        try { code = JSON.parse(txt).code; } catch { /* not json */ }
        const ok = String(code) === "200";
        results.push({ ordNo, ok, code, reason: ok ? "" : "응답 " + (code ?? txt.slice(0, 40)) });
        await sleep(250); // 연속 POST 간격
      } catch (e) {
        results.push({ ordNo, ok: false, reason: String((e && e.message) || e) });
      }
    }
    const okCount = results.filter((x) => x.ok).length;
    return { success: true, total: rows.length, okCount, listSize: Object.keys(map).length, results: results.slice(0, 60) };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 키드키즈(kidkids) 송장 등록(발송처리) ──
// 수집의 역방향. 셀피아 채번 송장(주문번호↔송장)을 출고관리 목록에 주입해 출고완료 처리한다.
// 조작자 흐름: 주문번호로 행을 찾아 CJ대한통운 아래 입력칸(deliveryTxt_{od})에 송장 주입 → 출고선택
// (CheckBox) 체크 → 하단 "출고 완료 등록"(go_reg). go_reg 재현: POST /sales/sales_process.htm
// mode=aan, mul_id=|ods, delivery_no=|송장. ⚠️출고완료는 되돌리기 어려운 파괴적 동작이므로 웹에서
// 명시적 확인(confirm) 후에만 이 액션이 호출되어야 한다.
async function uploadKidkidsTracking(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  if (rows.length === 0) return { success: false, error: "키드키즈 송장이 없습니다." };
  const { tab, created } = await findOrCreateKidkidsTab();
  if (!tab?.id) return { success: false, error: "키드키즈(partner.kidkids.net) 탭을 열 수 없습니다." };
  // 파괴적(출고완료 확정) → 사용자 화면을 앞으로.
  await interactiveTabs.focusTab(tab.id, INTERACTIVE_TAB_REASONS.TRACKING_MUTATION);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKidkidsTrackingUpload,
        args: [rows],
      }),
      120000,
      "키드키즈 송장 업로드 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "키드키즈 화면에 접근하지 못했습니다." };
    if (result && result.loginRequired) { keepOpen = created; return mallAccessErrorResult("키드키즈"); }
    if (!result.success) keepOpen = true; // 실패 시 사용자가 확인하도록 탭 유지
    return result;
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("키드키즈"); }
    return mallGenericErrorResult("키드키즈", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// partner.kidkids.net 페이지 컨텍스트: 목록에서 주문번호→출고선택 CheckBox(od) 매핑 → 송장 주입/체크
// → go_reg 재현(POST /sales/sales_process.htm mode=aan). rows=[{orderNo, invNo, courier?}].
async function scrapeKidkidsTrackingUpload(rows) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  try {
    if (/login|partnerlogin|partner_login/i.test(location.href) || document.querySelector('input[type="password"]')) {
      return { success: false, loginRequired: true };
    }
    // 출고선택(CheckBox)이 있는 목록 테이블 + 주문번호 컬럼 인덱스.
    const firstCb = document.querySelector('input[name="CheckBox"]');
    if (!firstCb) return { success: false, error: "출고관리 목록을 찾지 못했습니다. (로그인/화면 확인)" };
    let table = firstCb;
    while (table && table.tagName !== "TABLE") table = table.parentElement;
    if (!table) return { success: false, error: "출고관리 목록 테이블을 찾지 못했습니다." };
    const trs = [...table.rows];
    const hdr = trs.find((r) => [...r.cells].some((c) => /주문번호/.test(c.textContent)));
    const orderNoCol = hdr ? [...hdr.cells].findIndex((c) => norm(c.textContent).includes("주문번호")) : -1;

    // 주문번호 → { cb(출고선택), od } 매핑.
    const byOrderNo = {};
    for (const cb of table.querySelectorAll('input[name="CheckBox"]')) {
      let tr = cb;
      while (tr && tr.tagName !== "TR") tr = tr.parentElement;
      if (!tr) continue;
      const ono = orderNoCol >= 0 ? norm(tr.cells[orderNoCol]?.textContent) : "";
      if (ono && !byOrderNo[ono]) byOrderNo[ono] = { cb, od: cb.value, tr };
    }

    // 택배사(CJ대한통운) select 옵션값 확정 — 하드코딩 대신 옵션 텍스트에서 찾는다.
    const resolveCourierValue = (tr, courierText) => {
      const sel = tr && tr.querySelector('select[name="logis_company_id"]');
      if (!sel) return { sel: null, value: "" };
      const want = String(courierText || "CJ대한통운").replace(/\s+/g, "");
      const opt = [...sel.options].find((o) => norm(o.textContent).replace(/\s+/g, "").includes(want));
      return { sel, value: opt ? opt.value : "" };
    };

    const targets = [];
    const results = [];
    for (const r of rows) {
      const ono = String(r.orderNo || r.ordNo || "").trim();
      const inv = String(r.invNo || r.trackingNo || "").trim();
      if (!ono || !inv) { results.push({ orderNo: ono, ok: false, reason: "주문번호/송장 없음" }); continue; }
      const hit = byOrderNo[ono];
      if (!hit) { results.push({ orderNo: ono, ok: false, reason: "목록에 없음(이미 발송/기간 밖)" }); continue; }
      // CJ대한통운 아래 송장 입력칸(deliveryTxt_{od})에 주입.
      const input = document.querySelector(`[name="deliveryTxt_${hit.od}"], #deli_no_${hit.od}`);
      if (!input) { results.push({ orderNo: ono, ok: false, reason: "송장 입력칸 없음" }); continue; }
      input.value = inv;
      // 택배사 select = CJ대한통운.
      const { sel, value } = resolveCourierValue(hit.tr, r.courier);
      if (sel && value) sel.value = value;
      // 출고선택 체크.
      hit.cb.checked = true;
      targets.push({ od: hit.od, inv, courierValue: value });
      results.push({ orderNo: ono, ok: true, reason: "" });
    }

    if (!targets.length) {
      return {
        success: false,
        submitted: false,
        total: rows.length,
        okCount: 0,
        listSize: Object.keys(byOrderNo).length,
        results: results.slice(0, 60),
        error: "주입 가능한 주문이 없습니다.",
      };
    }

    // go_reg 재현: 출고완료(발송처리) 확정 POST. 서버는 |파이프 조인 mul_id/delivery_no 를 읽는다.
    const body = new URLSearchParams();
    body.set("from_logis_index", "Y");
    body.set("mode", "aan");
    body.set("mul_id", "|" + targets.map((t) => t.od).join("|"));
    body.set("delivery_no", "|" + targets.map((t) => t.inv).join("|"));
    const courierValue = targets.find((t) => t.courierValue)?.courierValue;
    if (courierValue) body.set("logis_company_id", String(courierValue));
    const res = await fetch("/sales/sales_process.htm", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    // hiddenFrame 제출과 달리 직접 POST 는 응답을 받는다. 다만 키드키즈는 성공 시 목록 HTML 을 반환할
    // 뿐 명확한 성공 코드가 없어, HTTP ok 를 "제출됨"으로만 보고한다(실제 반영은 목록 재조회로 확인 권장).
    return {
      success: res.ok,
      submitted: res.ok,
      total: rows.length,
      okCount: res.ok ? targets.length : 0,
      listSize: Object.keys(byOrderNo).length,
      results: results.slice(0, 60),
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function uploadDomeggookTracking(options = {}) {
  const fileBase64 = typeof options.fileBase64 === "string" ? options.fileBase64 : "";
  const fileName = typeof options.fileName === "string" ? options.fileName : "도매꾹_송장.xls";
  const tar = Array.isArray(options.orderNos) ? options.orderNos.join(",") : "";
  if (!fileBase64) return { success: false, error: "도매꾹 송장 파일이 없습니다." };
  const { tab, created } = await findOrCreateDomeggookTab(DOMEGGOOK_INPROCESS_URL);
  if (!tab?.id) return { success: false, error: "도매꾹(domeggook.com) 탭을 열 수 없습니다." };
  await interactiveTabs.focusTab(tab.id, INTERACTIVE_TAB_REASONS.TRACKING_MUTATION);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 로그인 세션 쿠키로 same-origin POST
        func: scrapeDomeggookShipUpload,
        args: [fileBase64, fileName, tar],
      }),
      60000,
      "도매꾹 송장 업로드 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "도매꾹 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("도매꾹"); }
    return mallGenericErrorResult("도매꾹", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

async function scrapeDomeggookShipUpload(fileBase64, fileName, tar) {
  try {
    const bin = atob(fileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], fileName, { type: "application/vnd.ms-excel" });
    const fd = new FormData();
    fd.append("deliXls", file); // 폼 file input 이름
    fd.append("tar", tar || ""); // 대상 주문번호 목록(콤마조인)
    const res = await fetch("/sc/order/shipXls", { method: "POST", credentials: "include", body: fd });
    const text = await res.text();
    if (!res.ok) {
      return { success: false, error: "도매꾹 송장 업로드 실패 (HTTP " + res.status + "). 로그인을 확인하세요.", snippet: text.slice(0, 300) };
    }
    // 응답(HTML/JSON)에서 성공 여부 추정. 확정 못 하면 원문 스니펫을 프론트로 넘겨 사용자가 확인.
    let uploaded = /완료|성공|반영|success/i.test(text) && !/실패|오류|불가/.test(text);
    try {
      const j = JSON.parse(text);
      if (j && (j.res === true || j.result === true || j.success === true)) uploaded = true;
      if (j && (j.res === false || j.result === false)) uploaded = false;
    } catch { /* not json */ }
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    return { success: true, uploaded, httpStatus: res.status, snippet };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 판매현황(몰별 매출) 매일 자동수집 ─────────────────────────────────────────
// chrome.alarms 로 주기적으로(브라우저가 켜져 있을 때) 셀피아 판매현황을 스크랩해
// chrome.storage.local 에 캐시한다. 확장은 백엔드로 직접 POST 하지 않으므로(웹앱이
// 인증/전송 소유), 캐시는 KidItem 웹앱이 열릴 때 getSellpiaSalesCache 로 flush 된다.
function ensureSellpiaSalesAlarm() {
  try {
    for (const environmentId of ordersEnvironmentContext.environmentIds) {
      chrome.alarms.create(
        ordersEnvironmentContext.alarmName(SELLPIA_SALES_ALARM, environmentId),
        { delayInMinutes: 1, periodInMinutes: 360 },
      );
    }
  } catch { /* alarms 권한/생성 실패 무시 */ }
}
chrome.runtime.onInstalled.addListener(ensureSellpiaSalesAlarm);
chrome.runtime.onStartup.addListener(ensureSellpiaSalesAlarm);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const environmentId = ordersEnvironmentContext.parseAlarmName(
    SELLPIA_SALES_ALARM,
    alarm?.name,
  );
  if (!environmentId) return;
  try {
    const organizationKey = sellpiaSalesKey(
      SELLPIA_SALES_ORGANIZATION_KEY,
      environmentId,
    );
    const cacheKey = sellpiaSalesKey(SELLPIA_SALES_CACHE_KEY, environmentId);
    const binding = await chrome.storage.local.get(organizationKey);
    const organizationId = normalizeSellpiaSalesOrganizationId(
      binding?.[organizationKey],
    );
    if (!organizationId) return;
    const result = await collectSellpiaSaleSummary({});
    const sellers = result?.payload?.sellers;
    const explicitEmpty =
      Array.isArray(sellers) &&
      sellers.length === 0 &&
      result.payload?.provenance?.source === "sellpia_sale_summary" &&
      result.payload?.provenance?.mode === "selldate" &&
      result.payload?.provenance?.sellerScope === "all" &&
      result.payload?.provenance?.responseShape === "empty_object" &&
      result.payload?.provenance?.explicitEmpty === true;
    if (result?.success && Array.isArray(sellers) && (sellers.length > 0 || explicitEmpty)) {
      await chrome.storage.local.set({
        [cacheKey]: {
          organizationId,
          payload: result.payload,
          capturedAt: Date.now(),
        },
      });
    }
  } catch { /* 셀피아 미로그인 등 실패 시 캐시 미갱신 */ }
});

function normalizeSellpiaSalesOrganizationId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 128 ? normalized : null;
}

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["orders", "inventory"],
  externalPorts: {
    [SELLPIA_MANUAL_MATCH_PORT_NAME]: (port, senderEnvironment) =>
      handleSellpiaManualMatchPort(port, senderEnvironment),
  },
  operations: {
    "inventory.refresh_sellpia_snapshot": runSellpiaInventoryOperation,
    "inventory.collect_coupang_shipment_summary": runCoupangShipmentSummaryOperation,
    "orders.collect_all_marketplace_orders": runMarketplaceOrderCollectionOperation,
    "channels.collect_coupang_rocket_purchase_orders": runCoupangRocketPurchaseOrderOperation,
  },
  capabilities: {
    orderCollectionIcecreamMall: true,
    coupangShipmentDownloads: true,
    collectCoupangShipmentFiles: true,
    collectCoupangShipmentDateSummaryValidatedV1: true,
    coupangShipmentSummaryCollectionSessionV1: true,
    clearCoupangCookies: true,
    art09Orders: true,
    boriboriOrders: true,
    collectRocketPoRows: true,
    collectRocketPoRowsEvidenceV1: true,
    collectRocketPoRowsConfirmationV1: true,
    coupangRocketPoCollectionSessionV1: true,
    listRocketPos: true,
    collectKakaoOrders: true,
    collectSellpiaDeliTracking: true,
    collectSellpiaSaleSummary: true,
    collectSellpiaSaleSummaryAuthoritativeV1: true,
    collectSellpiaProductProfit: true,
    collectSellpiaProductProfitEvidenceV1: true,
    collectSellpiaInventoryJsonV1: true,
    collectSellpiaManualMatchV1: true,
    collectSellpiaManualMatchPortV1: true,
    browserCollectionSessions: true,
    orderCollectionFailureEvidenceV1: true,
    kiditemEnvironmentProfilesV1: true,
    sellpiaOrderFileUploadEvidenceV1: true,
    sellpiaScopedAutoInvoiceV1: true,
    uploadDomeggookTracking: true,
    uploadOnchTracking: true,
    uploadKidkidsTracking: true,
    collectHaebeopOrders: true,
    sellpiaPostTransfer: true,
    sellpiaAutoInvoice: true,
  },
  cancelCollectionSession: (runId, environmentId) =>
    cancelOrdersCollectionSession(runId, environmentId),
  // 주문수집은 확장이 재시작을 대행하지 않는다. 세션을 그대로 돌려주면 웹앱이
  // 기존과 동일하게 수동 재시도 안내를 띄운다.
  restartCollectionSession: (runId, environmentId) =>
    collectionSessions.getOwned(runId, environmentId),
  finalizeCollectionSession: (runId, status, message, environmentId) =>
    finalizeOrdersCollectionSession(runId, status, message, environmentId),
});
