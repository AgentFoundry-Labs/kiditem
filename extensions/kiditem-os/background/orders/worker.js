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
const orderCollectionLifecycle = KidItemOrderCollectionLifecycle.create({
  sessions: collectionSessions,
  producer: "orders.mall",
  requireAttemptId: true,
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
const orderCollectionSourceOwner = KidItemOrderCollectionSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  lifecycle: orderCollectionLifecycle,
  request: (environmentId, path, init) =>
    sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init),
});
const orderCollectionServerConverter = KidItemOrderCollectionServerConverter.create({
  request: (environmentId, path, init) =>
    sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init),
});
function runOwnedOrderCollection(message, mallKey, collect) {
  return orderCollectionSourceOwner.run({
    environmentId: message.environmentId,
    message,
    mallKey,
    collect,
    ...(message.serverOwned === true ? {
      submit: (capture, plan, attempt) => orderCollectionServerConverter.convert({
        environmentId: message.environmentId,
        attempt,
        mallKey,
        capture,
        plan,
        input: message,
      }),
    } : {}),
  });
}

// Legacy worker calls may still carry a page date, but a server-owned
// attempt must use only the date admitted in its owner plan. This keeps an
// old `plan.legacy` marker from widening the server-owned boundary.
function providerCollectionDate(message, plan) {
  return plan?.legacy && message.serverOwned !== true
    ? message.date
    : plan?.collectionDate;
}

const sellpiaPostProcessing = KidItemSellpiaPostProcessing;
const sellpiaInvoiceTargets = sellpiaPostProcessing.createTargetStore({
  chrome,
  storageKeyForEnvironment: (base, environmentId) =>
    ordersEnvironmentContext.storageKey(base, environmentId),
});
const mallAdminListings = KidItemMallAdminListings.create({ chrome });
const mallAdminListingsSourceOwner = KidItemMallAdminListingsSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init),
  collect: mallAdminListings.collect,
  mallName: mallAdminListings.mallName,
});

async function lifecycleForAttempt(attemptId, environmentId) {
  const session = await collectionSessions.getOwned(attemptId, environmentId);
  if (session?.producer === "orders.mall") return orderCollectionLifecycle;
  return null;
}

async function cancelOrdersCollectionSession(attemptId, environmentId) {
  // Fence local work and close only owned managed tabs before any owner HTTP.
  // The owner remains canonical for terminal truth; its cancel path below
  // still performs the existing ACK/reconciliation contract.
  let fencedSession = null;
  if (typeof collectionSessions.requestCancellation === "function") {
    fencedSession = await collectionSessions.requestCancellation(attemptId, environmentId);
  }
  const session = fencedSession?.producer
    ? fencedSession
    : fencedSession?.session?.producer
      ? fencedSession.session
      : await collectionSessions.getOwned(attemptId, environmentId);
  if (session?.producer === "orders.mall_admin_listings") {
    return mallAdminListingsSourceOwner.cancel({ attemptId, environmentId });
  }
  if (session?.producer === "orders.mall") {
    return orderCollectionSourceOwner.cancel({ attemptId, environmentId });
  }
  const lifecycle = await lifecycleForAttempt(attemptId, environmentId);
  return lifecycle ? lifecycle.cancel(attemptId) : null;
}

// The common service-worker boot path invokes this hook after it has restored
// shared environment state. Each Sellpia owner reconciles only its own
// producer and environment, so the recoveries can run concurrently without
// touching other Orders or Inventory sessions.
async function recoverOrdersCollections(environmentId) {
  const owners = [
  ];
  const results = await Promise.allSettled(
    owners
      .filter((owner) => typeof owner?.recover === "function")
      .map((owner) => owner.recover(environmentId)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        "[KIDITEM] Orders collection owner recovery failed:",
        result.reason?.message || result.reason,
      );
    }
  }
  return results;
}

const ICECREAM_MALL_TAB_MATCHES = [
  "https://*.i-screammall.co.kr/*",
  "https://*.i-screammedia.com/*",
  "https://*.i-screammedia.co.kr/*",
];
const SELLPIA_ORDER_UPLOAD_URL = "https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE";
const SELLPIA_TAB_MATCHES = ["https://*.sellpia.com/*"];
// 셀피아 전송 이후 후처리: 재고매칭 화면(조회/자동합포/자동재고매칭) + 송장채번 화면.
const SELLPIA_STOCKMATCH_URL = "https://kiditem.sellpia.com/order_stockmatch.html";
const SELLPIA_INVOICE_URL = "https://kiditem.sellpia.com/order_delivery_link.html";
const COUPANG_SHIPMENT_URL = "https://supplier.coupang.com/ibs/asn/active";
const COUPANG_SUPPLIER_TAB_MATCHES = ["https://supplier.coupang.com/*"];

// Read-only one-shot actions do not have server attempts. Keep their local
// lifetime explicit instead of inventing a second canonical session: each
// invocation owns only the fresh background tab it created, and cancellation
// closes those tabs without touching operator-owned marketplace tabs.
const ordersAdditionalCollections = new Map();
const ORDERS_ADDITIONAL_RESOURCES_KEY =
  "kiditem_orders_additional_collection_resources_v1";
let ordersAdditionalResourcesQueue = Promise.resolve();

function requireOrdersCollectionEnvironment(environmentId) {
  if (environmentId !== "local" && environmentId !== "office") {
    throw new Error("Collection environment is required");
  }
  return environmentId;
}

function hasOrdersSessionStorage() {
  return Boolean(
    chrome.storage?.session &&
    typeof chrome.storage.session.get === "function" &&
    typeof chrome.storage.session.set === "function",
  );
}

function normalizeOrdersAdditionalResources(value) {
  const normalized = {};
  for (const environmentId of ["local", "office"]) {
    const tabIds = Array.isArray(value?.[environmentId])
      ? value[environmentId].filter((tabId) => Number.isInteger(tabId) && tabId >= 0)
      : [];
    const unique = [...new Set(tabIds)];
    if (unique.length > 0) normalized[environmentId] = unique;
  }
  return normalized;
}

function mutateOrdersAdditionalResources(operation) {
  const next = ordersAdditionalResourcesQueue
    .catch(() => undefined)
    .then(async () => {
      if (!hasOrdersSessionStorage()) return operation({});
      const stored = await chrome.storage.session.get(ORDERS_ADDITIONAL_RESOURCES_KEY);
      const current = normalizeOrdersAdditionalResources(
        stored?.[ORDERS_ADDITIONAL_RESOURCES_KEY],
      );
      const updated = normalizeOrdersAdditionalResources(await operation(current));
      await chrome.storage.session.set({
        [ORDERS_ADDITIONAL_RESOURCES_KEY]: updated,
      });
      return updated;
    });
  ordersAdditionalResourcesQueue = next.then(() => undefined, () => undefined);
  return next;
}

function rememberOrdersAdditionalTab(environmentId, tabId) {
  return mutateOrdersAdditionalResources((resources) => ({
    ...resources,
    [environmentId]: [...(resources[environmentId] || []), tabId],
  }));
}

function forgetOrdersAdditionalTab(environmentId, tabId) {
  return mutateOrdersAdditionalResources((resources) => {
    const remaining = (resources[environmentId] || []).filter((id) => id !== tabId);
    const next = { ...resources };
    if (remaining.length > 0) next[environmentId] = remaining;
    else delete next[environmentId];
    return next;
  });
}

async function readOrdersAdditionalTabs(environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  if (!hasOrdersSessionStorage()) return [];
  const stored = await chrome.storage.session.get(ORDERS_ADDITIONAL_RESOURCES_KEY);
  return normalizeOrdersAdditionalResources(
    stored?.[ORDERS_ADDITIONAL_RESOURCES_KEY],
  )[environmentId] || [];
}

async function closeOrdersAdditionalTab(tabId) {
  if (!Number.isInteger(tabId)) return false;
  try {
    await chrome.tabs.remove(tabId);
    return true;
  } catch {
    try {
      const tabs = await chrome.tabs.query({});
      return !tabs.some((tab) => tab.id === tabId);
    } catch {
      return false;
    }
  }
}

function createOrdersAdditionalCollectionContext(environmentId, name) {
  requireOrdersCollectionEnvironment(environmentId);
  const context = {
    environmentId,
    name,
    cancelled: false,
    finished: false,
    ownedTabIds: new Set(),
    closingTabPromises: new Map(),
    isActive() {
      return !this.cancelled;
    },
    closeTab(tab) {
      const tabId = tab?.id;
      if (!Number.isInteger(tabId)) return Promise.resolve(false);
      const existing = this.closingTabPromises.get(tabId);
      if (existing) return existing;
      const closing = (async () => {
        const closed = await closeOrdersAdditionalTab(tabId);
        if (!closed) return false;
        // Keep the per-tab correlation until both Chrome acknowledges the
        // close and the durable ledger acknowledges its removal. If the
        // worker is suspended or storage rejects this write, the in-memory
        // owner and restart ledger must retain the ID for a later retry.
        await forgetOrdersAdditionalTab(environmentId, tabId);
        this.ownedTabIds.delete(tabId);
        return true;
      })().finally(() => {
        if (this.closingTabPromises.get(tabId) === closing) {
          this.closingTabPromises.delete(tabId);
        }
      });
      this.closingTabPromises.set(tabId, closing);
      return closing;
    },
    async ownTab(tab) {
      if (!Number.isInteger(tab?.id)) return false;
      const tabId = tab.id;
      this.ownedTabIds.add(tabId);
      try {
        await rememberOrdersAdditionalTab(environmentId, tabId);
      } catch {
        // A storage failure must not orphan the exact tab just created. Keep
        // ownership until close/ledger reconciliation has had a chance to
        // complete, but stop the caller from entering page-world extraction.
        try {
          await this.closeTab({ id: tabId });
        } catch {
          // finish() retains the ID for a later best-effort retry.
        }
        return false;
      }
      // Cancellation can race the persistence write. Re-check after the
      // write so a tab admitted after the fence is closed and not left in the
      // restart recovery ledger.
      if (this.cancelled) {
        await this.closeTab(tab);
        return false;
      }
      return true;
    },
    async retainTab(tab) {
      if (!Number.isInteger(tab?.id)) return false;
      if (this.cancelled) {
        await this.closeTab(tab);
        return false;
      }
      try {
        await forgetOrdersAdditionalTab(environmentId, tab.id);
        if (this.cancelled) {
          // Cancellation may have fenced this context while ledger removal
          // was awaiting storage. Never hand a stopped tab to page-world
          // work; close it while retaining ownership for reconciliation.
          try {
            await rememberOrdersAdditionalTab(environmentId, tab.id);
          } catch {
            // The in-memory ownership remains until a later retry can close
            // the exact tab even if durable re-correlation is unavailable.
          }
          await this.closeTab(tab);
          return false;
        }
        this.ownedTabIds.delete(tab.id);
        return true;
      } catch {
        // Keep the in-memory ownership until correlation removal succeeds;
        // finish() will close and reconcile it if the ledger cannot be edited.
        return false;
      }
    },
    async cancel() {
      this.cancelled = true;
      const tabIds = [...this.ownedTabIds];
      await Promise.all(tabIds.map((tabId) => this.closeTab({ id: tabId })));
    },
    async finish() {
      const tabIds = [...this.ownedTabIds];
      await Promise.all(tabIds.map(async (tabId) => {
        try {
          await this.closeTab({ id: tabId });
        } catch {
          // A failed close/ledger write remains correlated for retry, but
          // cleanup must not replace the collection result itself.
        }
      }));
    },
  };
  const contexts = ordersAdditionalCollections.get(environmentId) || new Set();
  contexts.add(context);
  ordersAdditionalCollections.set(environmentId, contexts);
  return context;
}

async function runOrdersAdditionalCollection(environmentId, name, operation) {
  requireOrdersCollectionEnvironment(environmentId);
  const context = createOrdersAdditionalCollectionContext(environmentId, name);
  try {
    return await operation(context);
  } finally {
    context.finished = true;
    await context.finish();
    const contexts = ordersAdditionalCollections.get(environmentId);
    if (context.ownedTabIds.size === 0) contexts?.delete(context);
    if (contexts?.size === 0) ordersAdditionalCollections.delete(environmentId);
  }
}

async function cancelAdditionalCollections(environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  const contexts = ordersAdditionalCollections.get(environmentId);
  const current = contexts ? [...contexts] : [];
  // Set every in-memory fence synchronously, before touching the session
  // ledger. A delayed read must not leave page-world extraction running.
  for (const context of current) context.cancelled = true;

  let persistedTabIds = [];
  let settled = true;
  try {
    persistedTabIds = await readOrdersAdditionalTabs(environmentId);
  } catch (error) {
    // Current contexts can still be stopped and cleaned up. Keep the durable
    // ledger untouched when it cannot be read; startup/retry will reconcile it.
    console.warn(
      "[KIDITEM] additional collection ledger read failed:",
      error?.message || error,
    );
    settled = false;
  }

  const allTabIds = new Set();
  for (const context of current) {
    for (const tabId of context.ownedTabIds) allTabIds.add(tabId);
  }
  for (const tabId of persistedTabIds) allTabIds.add(tabId);
  if (allTabIds.size === 0) {
    if (!settled) return false;
    return current.length > 0 ? { cancelled: current.length } : null;
  }

  const contextByTabId = new Map();
  for (const context of current) {
    for (const tabId of context.ownedTabIds) {
      if (!contextByTabId.has(tabId)) contextByTabId.set(tabId, context);
    }
  }
  await Promise.all([...allTabIds].map(async (tabId) => {
    const context = contextByTabId.get(tabId);
    if (context) {
      try {
        if (!(await context.closeTab({ id: tabId }))) settled = false;
      } catch {
        settled = false;
      }
      return;
    }
    const closed = await closeOrdersAdditionalTab(tabId);
    if (!closed) {
      settled = false;
      return;
    }
    try {
      await forgetOrdersAdditionalTab(environmentId, tabId);
    } catch {
      settled = false;
    }
  }));
  if (!settled) return false;
  return {
    cancelled: current.length || (persistedTabIds.length > 0 ? 1 : 0),
  };
}

// Retry only durable outstanding tab IDs left by an interrupted read or
// service-worker restart. This hook is deliberately independent from
// cancelAdditionalCollections: app reopen/retry must never mark a newly
// started additional read as cancelled.
async function retryAdditionalCollections(environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  let persistedTabIds;
  try {
    persistedTabIds = await readOrdersAdditionalTabs(environmentId);
  } catch (error) {
    console.warn(
      "[KIDITEM] additional collection ledger retry read failed:",
      error?.message || error,
    );
    return false;
  }
  const contexts = ordersAdditionalCollections.get(environmentId);
  const contextByTabId = new Map();
  for (const context of contexts || []) {
    // Healthy active contexts remain exempt. A canceled or completed context
    // with unresolved ownership is safe to reconcile after a restart/retry.
    if (!context.cancelled && !context.finished) continue;
    for (const tabId of context.ownedTabIds) {
      if (!contextByTabId.has(tabId)) contextByTabId.set(tabId, context);
    }
  }
  const allTabIds = new Set(persistedTabIds);
  for (const tabId of contextByTabId.keys()) allTabIds.add(tabId);
  let remaining = false;
  for (const tabId of allTabIds) {
    // A new run may have started after the retry began. Never close a tab that
    // is currently owned by a live, non-cancelled context.
    const context = contextByTabId.get(tabId);
    if (!context && [...(contexts || [])].some((candidate) =>
      !candidate.cancelled && !candidate.finished && candidate.ownedTabIds.has(tabId),
    )) continue;
    const closed = context
      ? await context.closeTab({ id: tabId }).catch(() => false)
      : await closeOrdersAdditionalTab(tabId);
    if (closed) {
      if (!context) {
        try {
          await forgetOrdersAdditionalTab(environmentId, tabId);
        } catch {
          remaining = true;
        }
      }
    } else {
      remaining = true;
    }
  }
  for (const context of contexts || []) {
    if (context.finished && context.ownedTabIds.size === 0) contexts.delete(context);
  }
  if (contexts?.size === 0) ordersAdditionalCollections.delete(environmentId);
  return !remaining;
}

function additionalCollectionCancelled(context, message) {
  return {
    success: false,
    errorCode: "COLLECTION_CANCELLED",
    error: message || `${context?.name || "Read-only collection"} was cancelled.`,
  };
}
const KIDSNOTE_ORDER_URL = "https://shop.kidsnote.com/_manage/?body=3010";
const KIDSNOTE_TAB_MATCHES = ["https://shop.kidsnote.com/*"];
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
const LOTTEON_LOGIN_URL = "https://store.lotteon.com/cm/main/login_SO.wsp";
const LOTTEON_TAB_MATCHES = ["https://store.lotteon.com/*"];
const GSSHOP_ORDER_URL = "https://partners.gsshop.com/logistics/partner-logistics-mng";
const GSSHOP_TAB_MATCHES = ["https://partners.gsshop.com/*"];
const ALWAYZ_ORDER_URL = "https://alwayzseller.ilevit.com/shippings";
const ALWAYZ_TAB_MATCHES = ["https://alwayzseller.ilevit.com/*"];
const ELEVENST_ORDER_URL = "https://msoffice.11st.co.kr/cx/delivery";
const KAKAO_ORDER_URL = "https://shopping-seller.kakao.com/order/seller/store-order/integrate/list";
const KAKAO_TAB_MATCHES = ["https://shopping-seller.kakao.com/*"];
// 해법몰(제니마켓 mallseller) 입점업체 관리자 — 주문건수목록.
// ⭐엑셀 다운로드(basket_excel.php)는 암호 ZIP 이라 자동화가 어렵지만, 주문 상세 팝업
// (pop_order_info.php)이 수취인·주소·연락처·상품·금액을 모두 주므로 다운로드 없이 수집한다.
const HAEBEOP_ORDER_URL = "https://mallseller.genimarket.co.kr/mall/order/basket_list.php";
const HAEBEOP_TAB_MATCHES = ["https://mallseller.genimarket.co.kr/*"];
// 목록 검색의 "협력사" 기본값(우리 공급사명). 고객사(search_shop_name)와 혼동 주의.
const HAEBEOP_DEFAULT_VENDOR = "거영아이앤디";

// 몰 상품등록. 주문수집이 이미 키즈노트 세션·탭을 소유하므로 그 옆에 둔다.
// 폼만 채우고 제출은 사람이 한다.
//
// 첫 호출에서 만든다. 워커 로드 시점에 만들면 이 액션을 쓰지 않는 경로(테스트 하니스
// 포함)까지 모듈 전역을 요구하게 된다.
let kidsnoteProductRegisterInstance = null;
function kidsnoteProductRegister() {
  if (!kidsnoteProductRegisterInstance) {
    kidsnoteProductRegisterInstance = KidItemKidsnoteProductRegister.create({
      chrome,
      fetch: (...args) => fetch(...args),
      interactiveTabs,
      tabReason: INTERACTIVE_TAB_REASONS.MALL_PRODUCT_REGISTER,
    });
  }
  return kidsnoteProductRegisterInstance;
}

// 도매꾹·온채널 상품등록 폼 자동 채움. 키즈노트와 같은 자리지만 두 몰은 계단식 분류도
// 자체 호스팅 업로더도 없어서 한 구현을 공유한다.
let mallFormRegisterInstance = null;
function mallFormRegister() {
  if (!mallFormRegisterInstance) {
    mallFormRegisterInstance = KidItemMallFormRegister.create({
      chrome,
      fetch: (...args) => fetch(...args),
      interactiveTabs,
      tabReason: INTERACTIVE_TAB_REASONS.MALL_PRODUCT_REGISTER,
      // 로그인이 풀려 폼이 없을 때만 쓴다. 주문수집이 쓰는 것과 같은 폼 채움 로그인이고,
      // 상품등록이 이미 열어 둔 탭 위에서 동작하므로 별도 탭·수집 lifecycle 을 만들지 않는다.
      ensureLogin: (tabId, credentials, mallKey) =>
        mallSession().ensureLoggedIn(mallKey, credentials, { tab: { id: tabId } }),
    });
  }
  return mallFormRegisterInstance;
}

// 몰 품절 송신. 상품등록과 달리 **끝까지 보낸다** — 품절은 같은 화면에서 같은 값으로
// 되돌릴 수 있어서다(매니페스트 supports.resume). 몰의 버튼을 누르는 대신 그 버튼이
// 만들 폼을 그대로 직렬화해 보내므로 confirm 창이 끼어들 자리가 없다.
let mallAvailabilitySendInstance = null;
function mallAvailabilitySend() {
  if (!mallAvailabilitySendInstance) {
    mallAvailabilitySendInstance = KidItemMallAvailabilitySend.create({
      chrome,
      fetch: (...args) => fetch(...args),
      interactiveTabs,
      tabReason: INTERACTIVE_TAB_REASONS.MALL_AVAILABILITY_SEND,
    });
  }
  return mallAvailabilitySendInstance;
}

// 몰 세션 — 로그인 주소·로그인 표시·폼 채움은 하나의 세션 모듈이 소유한다.
let mallSessionDriverInstance = null;
function mallSessionDriver() {
  if (!mallSessionDriverInstance) mallSessionDriverInstance = createMallSessionDriver();
  return mallSessionDriverInstance;
}

let mallSessionInstance = null;
function mallSession() {
  if (!mallSessionInstance) {
    mallSessionInstance = KidItemMallSession.create({ driver: mallSessionDriver() });
  }
  return mallSessionInstance;
}

/**
 * 몰 세션 모듈의 드라이버 — 탭 열기 · 프레임에 스크립트 넣기 · 알림 창 삼키기 · 조용히 한 번
 * 읽기. 어느 몰을 어떻게 볼지는 `mall-session.js` 가 알고, 여기서는 Chrome 경계를 연결한다.
 * 수집 시도의 탭 소유권은 Orders가 확인한다.
 */
function createMallSessionDriver() {
  const passiveProbe = KidItemMallSessionProbe.create({
    fetch: (...args) => fetch(...args),
    specs: KidItemMallSession.SPECS,
    reasons: KidItemMallSession.REASONS,
  });
  return {
    now: () => Date.now(),
    delay: (ms) => delay(ms),
    withTimeout: (promise, timeoutMs, message) => withTimeout(promise, timeoutMs, message),
    waitReady: (tabId) => waitForTabReady(tabId),
    ensureActive: (collection) => assertOrderCollectionActive(collection),
    cancelledResult: (error) => orderCollectionCancelledResult(error),
    hasPermission: (origin) =>
      chrome.permissions.contains({ origins: [`${origin}/*`] }).catch(() => false),

    async openTab(url, collection) {
      if (collection) await assertOrderCollectionActive(collection);
      const tab = await chrome.tabs.create({ url, active: false });
      if (!Number.isInteger(tab?.id)) return {};
      rememberOrderCollectionTab(tab.id, collection?.attemptId);
      if (collection) {
        const attached = await attachOrderCollectionTab(collection, tab, true);
        if (attached === null || attached === false) {
          await closeFreshOrderCollectionTab(tab);
          return { cancelled: true };
        }
      }
      return { tab };
    },

    async closeTab(tab, { collection = null, keepOpen = false } = {}) {
      if (keepOpen) return;
      forgetOrderCollectionTab(tab?.id);
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
    },

    async tabUrl(tabId) {
      try {
        return String((await chrome.tabs.get(tabId))?.url || "");
      } catch {
        return "";
      }
    },

    watchDialogs: (tabId) => recordMallLoginDialogs(tabId),
    takeDialog: (tabId) => takeMallLoginDialog(tabId),
    loginFormRemains: (tabId) => loginFormRemainsAfterSubmit(tabId),

    async fillLoginForm(tabId, credentials) {
      try {
        const injected = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: autoSubmitIcecreamMallLogin,
          args: [credentials],
        });
        return { frames: injected.map((item) => item.result) };
      } catch {
        return { unreachable: true };
      }
    },

    async inspectScreen(tabId) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const href = String(tab?.url || tab?.pendingUrl || "");
      try {
        const injected = await withTimeout(
          chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: inspectMallLoginScreen,
          }),
          5000,
          "login-screen-no-answer",
        );
        return { href, frames: (injected || []).map((item) => item.result).filter(Boolean) };
      } catch {
        return { href, frames: null };
      }
    },

    probe: (mallKey) => passiveProbe.probe(mallKey),
  };
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const rawMessage = msg;
  const senderEnvironment = ordersEnvironmentContext.resolveSender(sender);
  if (!senderEnvironment) {
    sendResponse({ success: false, error: "Untrusted KidItem web origin" });
    return false;
  }
  const environmentId = senderEnvironment.environmentId;
  msg = { ...msg, environmentId };
  ordersEnvironmentContext.connect(environmentId).catch(() => undefined);
  const respond = (operation) => {
    // 응답이 갈 때까지 서비스워커를 살려 둔다. 수집기마다 keepAlive 를 복붙하지
    // 않아도 이 경로를 지나는 모든 액션이 유휴 종료로부터 보호된다.
    KidItemWorkerKeepAlive.during(operation)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "Collection session request failed",
        });
      });
    return true;
  };

  // 수집 세션 공통 액션(list/get/cancel/openAttentionTab)과 ping 은 통합
  // 서비스워커가 처리한다. 도메인 워커가 각자 응답하면 세 리스너가 같은
  // 메시지에 경쟁 응답하게 된다. 이 도메인의 cancellation 구현과
  // capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  // 키즈노트 상품등록 폼 자동 채움. 제출하지 않으므로 몰에 부작용이 없다.
  if (msg?.action === "registerToKidsnoteForm") {
    return respond(kidsnoteProductRegister().register(msg));
  }

  // 도매꾹·온채널 상품등록 폼 자동 채움. 제출하지 않으므로 몰에 부작용이 없다.
  if (msg?.action === "registerToMallForm") {
    // Target-backed callers send the lease as one context object. Keep the
    // older top-level spelling accepted while the context crosses this worker
    // boundary; availability messages below deliberately do not use it.
    const hasTopLevelExecutionContext = ["executionId", "payloadHash", "leaseToken"]
      .some((field) => Object.prototype.hasOwnProperty.call(msg, field));
    const executionContext = msg.executionContext !== undefined
      ? msg.executionContext
      : hasTopLevelExecutionContext
        ? {
          executionId: msg.executionId,
          payloadHash: msg.payloadHash,
          leaseToken: msg.leaseToken,
        }
        : undefined;
    return respond(mallFormRegister().register({
      ...msg,
      ...(executionContext !== undefined ? { executionContext } : {}),
    }));
  }

  // 몰 대량등록 사진 올리기 — 우리 저장소 사진을 우리 상점 첨부 저장소(키즈노트)에 올려 공개 주소를 받는다.
  // 상품을 만들지도 몰에 등록하지도 않는다. 사람이 [사진 올리기]를 누를 때만 온다.
  if (msg?.action === "hostPublicImages") {
    return respond(mallFormRegister().hostPublicImages(msg));
  }

  // 몰 분류 목록 한 단. 읽기만 한다 — 폼을 열지도, 값을 넣지도 않는다.
  if (msg?.action === "listMallCategories") {
    return respond(mallFormRegister().listCategories(msg));
  }

  // 몰 품절 송신. 되돌릴 수 있는 명령이라 끝까지 보낸다(해제는 resume: true).
  if (msg?.action === "sendMallAvailability") {
    return respond(mallAvailabilitySend().send(msg));
  }

  // 몰 지금 재고(쿠팡 윙). 읽기만 한다 — 등록현황 칸의 창이 품절인지 보여 줄 때 쓴다.
  if (msg?.action === "readMallAvailability") {
    return respond(mallAvailabilitySend().read(msg));
  }

  // 몰 가격 보내기(KID-247). 사람이 판매상품 화면에서 누른 가격만 보내고, 몰을 다시 읽어 확인한다.
  if (msg?.action === "sendMallPrice") {
    return respond(mallAvailabilitySend().sendPrice(msg));
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
    collectSellpiaOrderSnapshot(environmentId)
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
  if (msg?.action === "collectCoupangShipmentList") {
    collectCoupangShipmentList({
      date: typeof msg.date === "string" ? msg.date : "",
    }, environmentId)
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
    }, environmentId)
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

  if (msg?.action === "collectKidsnoteOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "kidsnote",
      (collection, plan) => collectKidsnoteOrders(
        plan.legacy
          ? {
            from: typeof msg.from === "string" ? msg.from : null,
            to: typeof msg.to === "string" ? msg.to : null,
            status: typeof msg.status === "string" ? msg.status : "",
            withDetail: msg.withDetail === true,
          }
          : {
            from: plan.collectionDate,
            to: plan.collectionDate,
            status: typeof msg.status === "string" ? msg.status : "",
            withDetail: msg.withDetail === true,
          },
        collection,
      ),
    ));
  }

  if (msg?.action === "collectOnchannelOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "onch",
      (collection, plan) => collectOnchannelOrders(
        providerCollectionDate(msg, plan),
        collection,
      ),
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

  // 수집이 끝난 몰의 탭을 닫는다. 우리가 연 탭만 닫고, 사람이 열어 둔 탭은 건드리지 않는다.
  if (msg?.action === "closeOrderCollectionTabs") {
    const attemptIds = Array.isArray(msg.attemptIds)
      ? msg.attemptIds.filter((id) => typeof id === "string")
      : [];
    return respond(closeOrderCollectionTabs(attemptIds));
  }

  // 로그인 상태를 셋 중 하나로 답한다. 조용히 읽어 모르면 화면을 열어 본다 — 로그인은 하지 않는다.
  // 주소는 고정 목록 · 사장님이 저장한 사이트 주소에서만 나오고, 확장 권한 안의 주소만 연다.
  if (msg?.action === "checkMallLogin") {
    return respond(checkMallLogin(
      typeof msg.mallKey === "string" ? msg.mallKey : "",
      typeof msg.siteUrl === "string" ? msg.siteUrl : "",
    ));
  }

  // 로그인 상태만 본다. 몰 키 하나만 받고, 주소는 모듈의 고정 목록에서만 나온다.
  if (msg?.action === "probeMallSession") {
    return respond(probeMallSessionQuietly(typeof msg.mallKey === "string" ? msg.mallKey : ""));
  }

  if (msg?.action === "ensureMallLoggedIn") {
    return respond(ensureMallLoginWithLifecycle(msg));
  }

  // 쇼핑몰 계정 화면의 로그인 테스트. 수집이 아니어서 수집 시도 없이 돈다 — 백그라운드 탭에서
  // 저장된 계정으로 로그인만 해 보고 닫는다. 서버로는 아무것도 보내지 않는다.
  if (msg?.action === "testMallLogin") {
    const credentials = msg.credentials;
    const validRequest = typeof msg.mallKey === "string"
      && typeof credentials?.loginId === "string"
      && typeof credentials?.password === "string"
      && (credentials.supplierLoginId === undefined || typeof credentials.supplierLoginId === "string")
      && (credentials.siteUrl === undefined || typeof credentials.siteUrl === "string");
    if (!validRequest) {
      sendResponse({ success: false, errorCode: "invalid_request", error: "로그인 테스트 요청이 올바르지 않습니다." });
      return true;
    }
    return respond(mallSession().ensureLoggedIn(
      msg.mallKey,
      {
        loginId: credentials.loginId,
        password: credentials.password,
        ...(credentials.supplierLoginId ? { supplierLoginId: credentials.supplierLoginId } : {}),
        ...(credentials.siteUrl ? { siteUrl: credentials.siteUrl } : {}),
      },
      {},
    ));
  }

  if (msg?.action === "collectHaebeopOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "haebub-mall",
      (collection, plan) => collectHaebeopOrders(
        plan.legacy && msg.serverOwned !== true
          ? { date: msg.date, fromDate: msg.fromDate, toDate: msg.toDate, vendor: msg.vendor }
          : {
            date: providerCollectionDate(msg, plan),
            fromDate: null,
            toDate: null,
            vendor: HAEBEOP_DEFAULT_VENDOR,
          },
        collection,
      ),
    ));
  }

  if (msg?.action === "collectLotteonOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "lotte-on",
      (collection) => collectLotteonOrders(collection),
    ));
  }

  if (msg?.action === "collectGsshopOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "gs-shop",
      (collection) => collectGsshopOrders(collection),
    ));
  }

  if (msg?.action === "collectAlwayzOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "always",
      (collection) => collectAlwayzOrders(collection),
    ));
  }

  if (msg?.action === "collect11stOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "11st",
      (collection, plan) => collect11stOrders(
        providerCollectionDate(msg, plan),
        collection,
      ),
    ));
  }

  if (msg?.action === "collectKakaoOrders") {
    return respond(runOwnedOrderCollection(
      msg,
      "kakao",
      (collection, plan) => collectKakaoOrders(
        providerCollectionDate(msg, plan),
        collection,
      ),
    ));
  }

  return false;
});

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

async function assertOrderCollectionActive(collection) {
  if (typeof collection?.assertActive !== "function") return true;
  const active = await collection.assertActive();
  if (active === false || active === null) {
    const error = new Error("Order collection is no longer active.");
    error.code = "COLLECTION_CANCELLED";
    throw error;
  }
  return true;
}

async function attachOrderCollectionTab(collection, tab, owned) {
  if (!collection?.attachTab) return true;
  try {
    return await collection.attachTab(tab, { owned });
  } catch (error) {
    // The tab is always fresh for named read collectors. If attachment itself
    // fails before the session can record ownership, release only that tab.
    if (owned && Number.isInteger(tab?.id)) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Cancellation may already have removed it through CollectionSession.
      }
    }
    throw error;
  }
}

/**
 * 주문 수집을 위해 우리가 연 몰 탭. 수집이 끝나면 화면이 이 목록을 보고 한 번에 닫는다 —
 * 사장님: "수집 끝났으면 창 닫아라". 본인인증 · OTP 처럼 그 화면에서 사람이 끝내야 하는 몰은
 * 화면이 그 시도를 닫기 목록에서 빼는 방식으로 남긴다.
 */
const openedOrderCollectionTabs = new Map();

function rememberOrderCollectionTab(tabId, attemptId) {
  if (!Number.isInteger(tabId)) return;
  openedOrderCollectionTabs.set(tabId, typeof attemptId === "string" ? attemptId : null);
}

function forgetOrderCollectionTab(tabId) {
  openedOrderCollectionTabs.delete(tabId);
}

if (chrome.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => forgetOrderCollectionTab(tabId));
}

/** 이 시도(또는 전부)가 연 탭을 닫는다. 사람이 열어 둔 다른 탭은 건드리지 않는다. */
async function closeOrderCollectionTabs(attemptIds) {
  const wanted = Array.isArray(attemptIds) && attemptIds.length > 0
    ? new Set(attemptIds.filter((id) => typeof id === "string"))
    : null;
  let closed = 0;
  for (const [tabId, attemptId] of [...openedOrderCollectionTabs]) {
    if (wanted && !(attemptId && wanted.has(attemptId))) continue;
    forgetOrderCollectionTab(tabId);
    try {
      await chrome.tabs.remove(tabId);
      closed += 1;
    } catch {
      /* 이미 닫힘 — 무시 */
    }
  }
  return { success: true, closed };
}

async function createFreshOrderCollectionTab(collection, url) {
  // A provider page already open in the operator's profile is not evidence
  // that this owner controls it. Every named read collector gets a fresh,
  // inactive page after the local environment/producer fence has held.
  await assertOrderCollectionActive(collection);
  const tab = await chrome.tabs.create({ url, active: false });
  rememberOrderCollectionTab(tab?.id, collection?.attemptId);
  return { tab, created: true };
}

async function closeFreshOrderCollectionTab(tab) {
  if (!Number.isInteger(tab?.id)) return;
  forgetOrderCollectionTab(tab.id);
  if (typeof chrome.tabs.get === "function") {
    try {
      await chrome.tabs.get(tab.id);
    } catch {
      // CollectionSession may already have closed a refused tab.
      return;
    }
  }
  try {
    await chrome.tabs.remove(tab.id);
  } catch {
    // The tab may have been closed by cancellation at the same time.
  }
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

function orderCollectionCancelledResult(error) {
  return {
    success: false,
    errorCode: "COLLECTION_CANCELLED",
    error: String(error?.message || "Order collection is no longer active."),
  };
}

function orderCollectionNeedsAttention(result) {
  return Boolean(
    result?.pendingLogin === true ||
    result?.pendingAuth === true ||
    result?.loginRequired === true ||
    result?.attentionRequired === true,
  );
}

/**
 * 셀피아에 지금 올라와 있는 주문을 판매처(수취인 괄호 이름)+주문번호로 읽어온다.
 * 업로드 직후 주문은 order_collect 대기목록에, 등록된 주문은 재고매칭에 있으므로 둘을 합친다.
 * 웹앱은 이걸 수집 기록과 대조해 "아직 셀피아에 안 올라간 주문"을 계산한다. 조회만 하는 비파괴 액션.
 */
async function collectSellpiaOrderSnapshot(environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  return runOrdersAdditionalCollection(
    environmentId,
    "Sellpia order snapshot",
    async (context) => {
      // 포커스를 뺏지 않도록 백그라운드 탭을 따로 열어 조회하고, 끝나면 닫는다.
      // 사용자가 보고 있는 탭/기존 셀피아 탭은 건드리지 않는다.
      const tab = await chrome.tabs.create({ url: SELLPIA_ORDER_UPLOAD_URL, active: false });
      if (!tab?.id) return { success: false, error: "셀피아 탭을 열 수 없습니다." };
      if (!(await context.ownTab(tab))) return additionalCollectionCancelled(context);
      let keepOpen = false;
      try {
        if (!context.isActive()) return additionalCollectionCancelled(context);
        await waitForTabReady(tab.id);

        const byOrderNo = new Map();
        const pages = [
          { url: SELLPIA_ORDER_UPLOAD_URL, source: "pending" },
          { url: SELLPIA_STOCKMATCH_URL, source: "stockmatch" },
        ];
        let lastError = null;
        let visited = 0;
        for (const { url, source } of pages) {
          if (!context.isActive()) return additionalCollectionCancelled(context);
          try {
            const current = await chrome.tabs.get(tab.id).catch(() => null);
            const path = String(url).split("?")[0];
            if (!current || !String(current.url || "").startsWith(path)) {
              await chrome.tabs.update(tab.id, { url });
              await waitForTabReady(tab.id);
            }
            if (!context.isActive()) return additionalCollectionCancelled(context);
            const result = await runSellpiaStepInTab(tab.id, "orderSnapshot", 120000);
            if (!context.isActive()) return additionalCollectionCancelled(context);
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
        if (!context.isActive()) return additionalCollectionCancelled(context);
        if (visited === 0) {
          // 한 화면도 못 읽었으면 대체로 셀피아 미로그인이다. 로그인할 수 있게 탭을 남긴다.
          keepOpen = true;
          await context.retainTab(tab);
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
          await context.closeTab(tab);
        }
      }
    },
  );
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
async function findOrCreateBackgroundCoupangSupplierTab(attemptId, additionalContext) {
  if (additionalContext) {
    if (!additionalContext.isActive()) return null;
    const owned = await chrome.tabs.create({ url: COUPANG_SHIPMENT_URL, active: false });
    if (!(await additionalContext.ownTab(owned))) return null;
    return owned;
  }
  // Attempt-owned supplier reads use a fresh inactive tab. Reusing an
  // operator tab would leave a multipage in-page fetch loop outside the
  // managed-tab fence after app close, so preserve the operator tab and close
  // only this owned task tab.
  const tab = await chrome.tabs.create({ url: COUPANG_SHIPMENT_URL, active: false });
  if (attemptId && tab?.id) {
    const attached = await collectionSessions.attachTab(attemptId, {
      tabId: tab.id, windowId: tab.windowId, closeOnCancel: true,
    });
    if (attached === null || attached === false) {
      try { await chrome.tabs.remove(tab.id); } catch { /* already closed */ }
      return null;
    }
  }
  return tab;
}

// ── 원클릭 자동 수집: 발송일 기준 쉽먼트 목록 (직접 목록 API HTML 파싱) ──
// clickCoupangShipmentDownloads 는 화면 버튼을 눌러 파일명 없는 PDF 를 Downloads 로 흘리지만,
// 이쪽은 목록/라벨/내역서 엔드포인트를 세션 fetch 로 직접 받아 발송일·센터를 정확히 붙인다.
async function collectCoupangShipmentList(options, environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  return runOrdersAdditionalCollection(
    environmentId,
    "Coupang shipment list",
    async (context) => {
      if (!context.isActive()) return additionalCollectionCancelled(context);
      const tab = await findOrCreateBackgroundCoupangSupplierTab(null, context);
      if (!tab?.id) return additionalCollectionCancelled(context);
      await waitForTabReady(tab.id);
      if (!context.isActive()) return additionalCollectionCancelled(context);

      try {
        const injected = await withTimeout(
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeCoupangShipmentList,
            args: [options?.date || ""],
          }),
          90000,
          "쿠팡 쉽먼트 목록 수집 시간이 초과되었습니다.",
        );
        if (!context.isActive()) return additionalCollectionCancelled(context);
        return injected[0]?.result ?? {
          success: false,
          error: "쿠팡 쉽먼트 화면에 접근하지 못했습니다.",
        };
      } catch (error) {
        if (!context.isActive()) return additionalCollectionCancelled(context);
        throw error;
      }
    },
  );
}

async function fetchCoupangShipmentPdfBatch(options, environmentId) {
  requireOrdersCollectionEnvironment(environmentId);
  const items = (options?.items || [])
    .filter((it) => it && it.seq && (it.kind === "label" || it.kind === "manifest"))
    .map((it) => ({ seq: String(it.seq), kind: it.kind }));
  if (items.length === 0) return { success: false, error: "요청한 PDF 항목이 없습니다." };

  return runOrdersAdditionalCollection(
    environmentId,
    "Coupang shipment PDFs",
    async (context) => {
      if (!context.isActive()) return additionalCollectionCancelled(context);
      const tab = await findOrCreateBackgroundCoupangSupplierTab(null, context);
      if (!tab?.id) return additionalCollectionCancelled(context);
      await waitForTabReady(tab.id);
      if (!context.isActive()) return additionalCollectionCancelled(context);

      try {
        const injected = await withTimeout(
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: fetchCoupangShipmentPdfsInPage,
            args: [items],
          }),
          120000,
          "쿠팡 쉽먼트 PDF 수집 시간이 초과되었습니다.",
        );
        if (!context.isActive()) return additionalCollectionCancelled(context);
        return injected[0]?.result ?? {
          success: false,
          error: "쿠팡 쉽먼트 PDF 화면에 접근하지 못했습니다.",
        };
      } catch (error) {
        if (!context.isActive()) return additionalCollectionCancelled(context);
        throw error;
      }
    },
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

// ── 온채널(onch3) 주문 수집: orders.php 리스트(주문코드+일자) + 주문별 상세모달 fetch ──
async function findOrCreateOnchannelTab(collection) {
  if (!collection) {
    const tabs = await chrome.tabs.query({ url: ONCHANNEL_TAB_MATCHES });
    const orderTab = tabs.find((tab) => (tab.url || "").includes("/supplier/orders"));
    if (orderTab?.id) return { tab: orderTab, created: false };
    if (tabs[0]?.id) {
      await chrome.tabs.update(tabs[0].id, { url: ONCHANNEL_ORDER_URL });
      return { tab: await chrome.tabs.get(tabs[0].id), created: false };
    }
  }
  return createFreshOrderCollectionTab(collection, ONCHANNEL_ORDER_URL);
}

async function collectOnchannelOrders(dateFilter, collection) {
  const { tab, created } = await findOrCreateOnchannelTab(collection);
  if (!tab?.id) return { success: false, error: "온채널(onch3.co.kr) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  // 모달 fetch 가 수십 번 → 작업이 길다. MV3 서비스워커 유휴 종료(=message port closed) 방지 keepalive.
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeOnchannelOrders,
        args: [dateFilter || ""], // "YYYY-MM-DD" 면 그날 주문만
      }),
      120000,
      "온채널 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "온채널 화면에 접근하지 못했습니다." };
    if (orderCollectionNeedsAttention(result)) keepOpen = true;
    return result;
  } catch (e) {
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("온채널"); }
    return mallGenericErrorResult("온채널", e);
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

// ── 키드키즈(kidkids) 탭: 송장 업로드가 쓴다. 주문 수집은 실행 kind `orders.mall_orders`의 sites/kidkids(KID-359 H3). ──
async function findOrCreateKidkidsTab(collection) {
  if (!collection) {
    const tabs = await chrome.tabs.query({ url: KIDKIDS_TAB_MATCHES });
    const mgmtTab = tabs.find((tab) => (tab.url || "").includes("/logis/management.htm"));
    if (mgmtTab?.id) return { tab: mgmtTab, created: false };
    if (tabs[0]?.id) {
      await chrome.tabs.update(tabs[0].id, { url: KIDKIDS_ORDER_URL });
      return { tab: await chrome.tabs.get(tabs[0].id), created: false };
    }
  }
  return createFreshOrderCollectionTab(collection, KIDKIDS_ORDER_URL);
}

// ── 해법몰(genimarket mallseller) 주문 수집: 목록(basket_list) + 주문상세(pop_order_info) 스크랩 ──
// ⭐다운로드 없이 수집한다. 엑셀 다운로드(basket_excel.php)는 암호 ZIP 을 요구해 자동화가 어렵지만,
// 주문 상세 팝업이 수취인·주소·우편번호·연락처·상품·금액을 전부 담고 있어 그걸 읽는다.
// 검색 조건: search_ord_status=OY(결제완료), search_mall_name=협력사(우리 공급사명).
// ⚠️search_shop_name 은 "고객사"라 협력사명을 넣으면 0건이 된다.
// 상세에 없는 값(공급단가·제조사)은 빈칸으로 남고, 백엔드 변환기가 고정값 컬럼을 채운다.
async function findOrCreateHaebeopTab(collection) {
  return createFreshOrderCollectionTab(collection, HAEBEOP_ORDER_URL);
}

async function collectHaebeopOrders(options, collection) {
  const { tab, created } = await findOrCreateHaebeopTab(collection);
  if (!tab?.id) return { success: false, error: "해법몰(mallseller.genimarket.co.kr) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  // 주문마다 상세를 받으므로 길어질 수 있다. MV3 유휴 종료(=port closed) 방지 keepalive.
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
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
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("해법몰"); }
    return mallGenericErrorResult("해법몰", e);
  } finally {
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
    if (!listRows.length) {
      return {
        success: true,
        orders: [],
        count: 0,
        confirmedCoverage: { startDate: from, endDate: to },
      };
    } // 결제완료 신규 없음(정상)

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
    return {
      success: true,
      orders,
      count: orders.length,
      detailCount: detailByOrder.size,
      confirmedCoverage: { startDate: from, endDate: to },
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 롯데ON(store.lotteon.com) 주문 수집: 판매자센터 배송관리 "신규주문" 엑셀을 백그라운드 다운로드 ──
// 롯데ON 판매자센터는 soapi.lotteon.com REST(Authorization: Bearer, 토큰은 sessionStorage.AuthToken).
// 개인정보 다운로드 사유(saveDownloadReason)를 먼저 등록해 encryptKey 를 받고, 그걸 _dnldKey 쿼리로
// downloadDeliveryExcel 에 넘겨 fileId 발급 → fileManage CDN 다운로드. 반환은 xlsx(OpenXML) base64.
async function findOrCreateLotteonTab(collection) {
  return createFreshOrderCollectionTab(collection, LOTTEON_ORDER_URL);
}

async function collectLotteonOrders(collection) {
  const { tab, created } = await findOrCreateLotteonTab(collection);
  if (!tab?.id) return { success: false, error: "롯데ON(store.lotteon.com) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  // 수집 자체는 sessionStorage.AuthToken 을 쓰지만, 로그인 화면은 평범한 ID/비번 폼이라
  // ensureMallLoggedIn 이 먼저 자동 로그인을 시도한다. 그래도 미로그인이면 여기서 로그인 탭을
  // 앞으로 띄워 사용자가 직접 로그인하도록 안내한다.
  let loginNeeded = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
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
          "롯데ON 판매자센터 로그인이 필요합니다. 쇼핑몰 계정의 아이디·비밀번호를 확인하거나 롯데ON 에 직접 로그인한 뒤 다시 수집해 주세요.",
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
    // 판매자센터는 SPA 라서 화면이 뜬 뒤에야 `sessionStorage.AuthToken` 을 채운다. 문서 로드만
    // 보고 읽으면 사장님이 로그인해 두셨어도 토큰이 아직 없어 "로그인 필요"로 읽힌다.
    // 로그인 화면으로 밀려난 것이 아니면 토큰이 설 때까지 기다린다(최대 20초).
    const loginScreen = () => /login/i.test(location.href);
    let tok = sessionStorage.getItem("AuthToken");
    const deadline = Date.now() + 20000;
    while (!tok && !loginScreen() && Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, 500); });
      tok = sessionStorage.getItem("AuthToken");
    }
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

// ── 쿠팡직배송(사입) 발주 수집: 발주확정(PA) 발주 → 품목(/scm 상세) + 센터주소 ──
// 발주현황=발주확정(PA), 운송유형(SHIPMENT=쉽먼트/MILKRUN=밀크런) 그대로 담아 백엔드가 분리 생성.
// ⚠️품목 상세(/scm/purchase/order/get)는 po-web 컨텍스트서 fetch 하면 로그인페이지 → /scm 페이지로
// 이동한 뒤 그 컨텍스트에서 fetch 해야 인증됨. 목록/센터(po-web API)는 같은 origin이라 /scm 서도 됨.
// ── GS샵(partners.gsshop.com) 주문 수집: 협력사 배송관리 화면 UI 구동 + 클라이언트 조립 엑셀 blob 캡처 ──
// GS 는 서버 엑셀 엔드포인트가 없고 다운로드 클릭 시 브라우저가 xlsx 를 조립해 URL.createObjectURL 로 내려준다.
// → MAIN world 에서 createObjectURL 후킹 후 1주일 조회 → 다운로드 → 모달(도로명/전체주소 기본) 확인 → blob 캡처.
async function findOrCreateGsshopTab(collection) {
  return createFreshOrderCollectionTab(collection, GSSHOP_ORDER_URL);
}

async function collectGsshopOrders(collection) {
  const { tab, created } = await findOrCreateGsshopTab(collection);
  if (!tab?.id) return { success: false, error: "GS샵(partners.gsshop.com) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  // 조회+상세 fetch 후 클라이언트 엑셀 조립까지 길다. MV3 서비스워커 유휴 종료(=port closed) 방지 keepalive.
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeGsshopOrders,
      }),
      140000,
      "GS샵 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "GS샵 화면에 접근하지 못했습니다." };
    if (orderCollectionNeedsAttention(result)) keepOpen = true;
    return result;
  } catch (e) {
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("GS샵"); }
    return mallGenericErrorResult("GS샵", e);
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
async function findOrCreateAlwayzTab(collection) {
  return createFreshOrderCollectionTab(collection, ALWAYZ_ORDER_URL);
}

async function collectAlwayzOrders(collection) {
  const { tab, created } = await findOrCreateAlwayzTab(collection);
  if (!tab?.id) return { success: false, error: "올웨이즈(alwayzseller.ilevit.com) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeAlwayzOrders,
      }),
      120000,
      "올웨이즈 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "올웨이즈 화면에 접근하지 못했습니다." };
    if (orderCollectionNeedsAttention(result)) keepOpen = true;
    return result;
  } catch (e) {
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("올웨이즈"); }
    return mallGenericErrorResult("올웨이즈", e);
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

// ── 도매꾹 탭: 송장 업로드가 쓴다. 주문 수집은 실행 kind `orders.mall_orders`의 sites/domeggook(KID-359 H3). ──
const DOMEGGOOK_INPROCESS_URL = "https://domeggook.com/sc/order/lstInprocess";

async function findOrCreateDomeggookTab(navUrl, collection) {
  if (!collection) {
    const tabs = await chrome.tabs.query({ url: "https://domeggook.com/*" });
    const listTab = tabs.find((t) => (t.url || "").includes("/sc/order/lstAll"));
    if (listTab?.id) {
      await chrome.tabs.update(listTab.id, { url: navUrl });
      return { tab: await chrome.tabs.get(listTab.id), created: false };
    }
  }
  return createFreshOrderCollectionTab(collection, navUrl);
}

// ── 키즈노트(WISA) 주문 수집: _manage?body=3010 전체주문조회 테이블 스크래핑 ──
// 백그라운드 수집: 포커스를 뺏지 않고(active 미지정/false) 탭을 연다.
// created=true 면 우리가 새로 연 탭 → 수집 후 자동으로 닫는다(기존 사용자 탭은 건드리지 않음).
async function findOrCreateKidsnoteTab(collection) {
  return createFreshOrderCollectionTab(collection, KIDSNOTE_ORDER_URL);
}

async function collectKidsnoteOrders({ from, to, status, withDetail }, collection) {
  const { tab, created } = await findOrCreateKidsnoteTab(collection);
  if (!tab?.id) return { success: false, error: "키즈노트(shop.kidsnote.com) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
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
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 몰이 로그인 결과를 알림 창(`alert`)으로 말하는 화면이 많다(키즈노트 · 대부분의 WISA 관리자).
 * 백그라운드 탭에 알림 창이 뜨면 그 탭의 스크립트가 멈춰 우리가 확인도 못 하고, 사장님 화면에는
 * 값만 채워진 로그인 화면이 남아 "버튼을 안 눌렀다"처럼 보인다. 그래서 우리 로그인 동안에는
 * 알림 창 대신 문장을 모아 두고, 그 문장을 결과에 실어 사장님께 그대로 보여 준다.
 *
 * 페이지 컨텍스트(MAIN)에서 돌아야 페이지의 `alert` 을 대신할 수 있다.
 */
function installMallLoginDialogRecorder() {
  if (!window.__kiditemLoginDialogs) {
    window.__kiditemLoginDialogs = [];
    const nativeAlert = window.alert;
    window.alert = function (message) {
      window.__kiditemLoginDialogs.push(String(message === undefined ? "" : message));
    };
    window.__kiditemRestoreLoginDialogs = function () {
      window.alert = nativeAlert;
      delete window.__kiditemRestoreLoginDialogs;
      delete window.__kiditemLoginDialogs;
    };
  }
  return true;
}

/** 모아 둔 문장을 돌려주고 원래 `alert` 으로 되돌린다. */
function readMallLoginDialogs() {
  const messages = Array.isArray(window.__kiditemLoginDialogs)
    ? window.__kiditemLoginDialogs.slice()
    : [];
  if (typeof window.__kiditemRestoreLoginDialogs === "function") {
    window.__kiditemRestoreLoginDialogs();
  }
  return messages;
}

async function recordMallLoginDialogs(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: installMallLoginDialogRecorder,
    });
  } catch {
    /* 프레임이 아직 없거나 주입이 막힌 화면 — 알림 문장 없이 진행한다. */
  }
}

/** 로그인 뒤 몰이 알림 창으로 남긴 첫 문장. 없으면 null. */
async function takeMallLoginDialog(tabId) {
  try {
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: "MAIN",
        func: readMallLoginDialogs,
      }),
      5000,
      "login-dialog-read-no-answer",
    );
    const messages = (injected || [])
      .flatMap((item) => (Array.isArray(item?.result) ? item.result : []))
      .map((message) => String(message).replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return messages[0] || null;
  } catch {
    return null;
  }
}

// 로그인 버튼을 누른 뒤 로그인 폼이 남았는가. 값을 넣거나 누르지 않고 폼만 찾는다.
//
// 알림 창이 떠 있으면 페이지 스크립트가 멈춰 확인 스크립트도 답하지 않는다 — 답이 없으면 남은
// 것으로 본다. 화면이 넘어가는 중이라 주입이 실패하면 잠시 뒤 다시 보고, 마지막으로 본 화면에
// 폼이 있을 때만 남았다고 한다.
async function loginFormRemainsAfterSubmit(tabId) {
  const noAnswer = "login-form-check-no-answer";
  let lastSeen = false;
  for (let check = 0; check < 3; check += 1) {
    if (check > 0) await delay(1500);
    let results;
    try {
      const injected = await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: autoSubmitIcecreamMallLogin,
          args: [null, { detectOnly: true }],
        }),
        5000,
        noAnswer,
      );
      results = (injected || []).map((item) => item.result).filter(Boolean);
    } catch (error) {
      if (error?.message === noAnswer) return true;
      continue;
    }
    lastSeen = results.some((result) => result.state === "login-form");
    if (!lastSeen) return false;
  }
  return lastSeen;
}

/**
 * 탭 안에서 본다 — 로그인 폼(보이는 비밀번호 칸 + 아이디 칸)인가, 인증 화면(인증번호 · OTP 칸)인가.
 * 값을 넣거나 누르지 않는다.
 */
function inspectMallLoginScreen() {
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const typeOf = (input) => String(input.type || "text").toLowerCase();
  const inputs = Array.from(document.querySelectorAll("input")).filter((input) => visible(input) && !input.disabled);
  const password = inputs.some((input) => typeOf(input) === "password");
  const idField = inputs.some((input) => ["", "text", "email", "tel"].includes(typeOf(input)));
  const describe = (input) => [input.name, input.id, input.placeholder, input.getAttribute("aria-label")]
    .filter(Boolean)
    .join(" ");
  const codeField = inputs.some((input) =>
    ["", "text", "tel", "number"].includes(typeOf(input)) && /인증|otp|code|auth|번호/i.test(describe(input)));
  const text = String((document.body && document.body.innerText) || "").slice(0, 8000);
  const verificationText = /본인\s*인증|본인\s*확인|인증\s*번호|OTP|SMS\s*인증|2단계\s*인증|추가\s*인증|휴대폰\s*인증/i.test(text);
  return {
    loginForm: password && idField,
    verification: !password && codeField && verificationText,
  };
}

/**
 * 몰 로그인 상태 — 로그인됨 · 인증 필요 · 로그인 필요 중 하나. 조용히 읽는 확인이 확실하면
 * 그 답을 쓰고, 아니면 화면을 열어 본다. 로그인은 하지 않는다.
 */
async function checkMallLogin(mallKey, siteUrl) {
  const found = await mallSession().checkLogin(mallKey, siteUrl);
  const state = found.verdict === "in"
    ? "signed_in"
    : found.verdict === "out" && found.reason === "verification_required"
      ? "verification_required"
      : "signed_out";
  return { success: true, mallKey, state, reason: found.reason };
}

/** 조용히 한 번 읽어만 본 로그인 상태. 화면을 열지 않아 모를 수 있다. */
async function probeMallSessionQuietly(mallKey) {
  const key = typeof mallKey === "string" ? mallKey : "";
  const found = await mallSessionDriver().probe(key);
  const state = found.verdict === "in" ? "signed_in" : found.verdict === "out" ? "signed_out" : "unknown";
  return { success: true, mallKey: key, state, reason: found.reason };
}

// 수집 전 자동 로그인 보장: 몰 주문/홈 URL 을 백그라운드로 열어(미로그인 시 로그인 페이지로 리다이렉트)
// 저장된 계정으로 로그인 후 닫는다. 이후 수집 탭은 같은 세션 쿠키라 로그인 상태. credentials 없으면 스킵.
function ensureMallLoginWithLifecycle(message) {
  // 옛 몰 소유자의 시도 없이 온 로그인은 로그인만 한다 — 쿠팡직배송(orders.coupang_directship)과 실행 kind
  // `orders.mall_orders`로 옮긴 몰(KID-359)은 몰 소유자 시도가 없다. 감싸면 몰 쪽에 없는 시도를 찾다가
  // 로그인 문턱에서 수집이 끝났다(2026-09-21 라이브). 옛 경로의 몰은 지금처럼 몰 소유자 안에서 로그인한다.
  if (message?.mallKey === "coupang-direct" || (!message?.attemptId && !message?.runId)) {
    return ensureMallLoggedIn(message.mallKey, message.credentials, null);
  }
  // Keep the extracted login helper usable in the focused collector tests;
  // the service worker always provides the owner adapter above.
  if (typeof runOwnedOrderCollection !== "function") {
    return orderCollectionLifecycle.run(
      message,
      KidItemOrderCollectionLifecycle.createIdentity(
        message.mallKey,
        message.date,
      ),
      (collection) => mallSession().ensureLoggedIn(
        message.mallKey,
        message.credentials,
        { collection },
      ),
    );
  }
  return runOwnedOrderCollection(
    message,
    message.mallKey,
    (collection) => mallSession().ensureLoggedIn(
      message.mallKey,
      message.credentials,
      { collection },
    ),
  );
}

/**
 * 쇼핑몰 계정에 저장된 사이트 주소. 고정 로그인 주소가 없는 몰은 여기로 들어가 같은 폼
 * 자동 로그인을 돌린다. 주소는 사장님이 적은 것만 쓰고(http · https 만), 그 밖의 값은 없는
 * 것으로 본다 — 확장이 임의의 주소를 열지 않는다.
 */
function savedMallLoginUrl(credentials) {
  return KidItemMallSession.savedSiteUrl(credentials);
}

async function ensureMallLoggedIn(mallKey, credentials, collection = null) {
  return mallSession().ensureLoggedIn(mallKey, credentials, { collection });
}

function autoSubmitIcecreamMallLogin(credentials, options) {
  const passwordInput = pickPasswordInput();
  if (!passwordInput) {
    // 비밀번호 입력칸이 아직 없음 → 로그인 폼 미표시(이미 로그인했거나 렌더 전). 호출부에서 재시도.
    return { state: "no-login-form" };
  }

  // 제출 뒤 확인(`loginFormRemainsAfterSubmit`) — 값을 넣거나 누르지 않는다. 비밀번호 칸 곁에
  // 아이디 칸까지 보여야 로그인 폼이다.
  if (options && options.detectOnly) {
    return { state: pickLoginIdInput(passwordInput) ? "login-form" : "no-login-form" };
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

  const method = triggerLogin(passwordInput);
  if (method) {
    return { state: "submitted", method };
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

  // 로그인 실행. 앞쪽일수록 확실한 신호라 순서를 지킨다. 이미 동작하던 몰의 경로(1~3)를
  // 건드리지 않고 뒤에 폴백만 덧붙였다. 성공하면 어떤 경로였는지 문자열로 돌려준다
  // (어느 몰이 어느 방법으로 눌리는지 알아야 "안 눌림"을 진단할 수 있다).
  function triggerLogin(anchor) {
    // 1) onclick 에 로그인 핸들러가 든 컨트롤
    const byHandler = Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .filter(isVisibleControl)
      .find((el) => /do_?login|fn_?login|go_?login|login_?proc|loginsubmit/i.test(
        el.getAttribute("onclick") || "",
      ));
    if (byHandler) {
      byHandler.click();
      return "onclick-handler";
    }

    const form = anchor.closest("form");

    // 2) 텍스트가 정확히 "로그인"/"login"
    const byText = findLoginControl(form || document) || (form ? findLoginControl(document) : null);
    if (byText) {
      byText.click();
      return "exact-text";
    }

    // 3) form 안의 submit 컨트롤 / form submit
    if (form) {
      const submitControl = Array.from(
        form.querySelectorAll("input[type='submit'],button[type='submit']"),
      ).filter(isVisibleControl)[0];
      if (submitControl) {
        submitControl.click();
        return "form-submit-control";
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return "form-request-submit";
      }
      if (form.submit) {
        form.submit();
        return "form-submit";
      }
    }

    // 4) 텍스트 느슨한 일치 — "로그인하기", "Sign in" 등. 링크·안내문을 누르지 않도록
    //    부정 목록으로 거른다("로그인 FAQ", "아이디 찾기", "비밀번호 재설정" …).
    const byLooseText = findLoginControlLoose(form || document);
    if (byLooseText) {
      byLooseText.click();
      return "loose-text";
    }

    // 5) id/class/name 에 login 이 든 버튼 (아이콘만 있는 버튼 대응)
    const byAttribute = Array.from(
      document.querySelectorAll(
        "button[id*='login' i],button[class*='login' i],a[id*='login' i],a[class*='login' i]," +
          "input[type='image'][id*='login' i],input[type='button'][id*='login' i]",
      ),
    ).filter(isVisibleControl).filter((el) => !isLoginDecoy(el))[0];
    if (byAttribute) {
      byAttribute.click();
      return "attribute-match";
    }

    // 6) 마지막 수단 — 비밀번호 칸에서 Enter. 폼이 없는 SPA 로그인 화면 다수가
    //    keydown 을 듣는다. 네이티브 폼 제출은 신뢰 이벤트가 아니라 못 하므로
    //    3) 이 실패한 뒤에만 온다.
    for (const type of ["keydown", "keypress", "keyup"]) {
      anchor.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    return "password-enter";
  }

  /** 로그인 버튼이 아닌데 "로그인" 글자가 든 것들. 누르면 엉뚱한 데로 간다. */
  function isLoginDecoy(el) {
    const text = String(el.textContent || el.value || "").replace(/\s+/g, " ").trim();
    return /faq|찾기|재설정|회원가입|가입|안내|문의|고객센터|간편|sns|카카오톡|네이버로|자동\s*로그인/i
      .test(text);
  }

  function findLoginControlLoose(root) {
    return (
      Array.from(
        root.querySelectorAll(
          "a,button,input[type='button'],input[type='submit'],input[type='image'],[role='button'],[onclick]",
        ),
      )
        .filter(isVisibleControl)
        .filter((el) => !isLoginDecoy(el))
        .find((control) => {
          const text = String(
            control.textContent ||
              control.value ||
              control.getAttribute("title") ||
              control.getAttribute("alt") ||
              control.getAttribute("aria-label") ||
              "",
          )
            .replace(/\s+/g, " ")
            .trim();
          if (!text || text.length > 12) return false; // 긴 문장은 버튼이 아니다
          return /로그인|login|sign\s?in|접속하기/i.test(text);
        }) || null
    );
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

async function findOrCreateKakaoTab(collection) {
  return createFreshOrderCollectionTab(collection, KAKAO_ORDER_URL);
}

async function collectKakaoOrders(dateFilter, collection) {
  const { tab, created } = await findOrCreateKakaoTab(collection);
  if (!tab?.id) return { success: false, error: "카카오쇼핑 판매자센터(shopping-seller.kakao.com) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKakaoOrders,
        args: [dateFilter || ""],
      }),
      120000,
      "카카오 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "카카오 화면에 접근하지 못했습니다." };
    if (orderCollectionNeedsAttention(result)) keepOpen = true;
    return result;
  } catch (e) {
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("카카오"); }
    return mallGenericErrorResult("카카오", e);
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

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["orders"],
  externalActions: {
    collectMallAdminListings: {
      validate: KidItemMallAdminListingsSourceOwner.parseStart,
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        mallAdminListingsSourceOwner.run({ attemptId, environmentId }),
      ),
    },
  },
  capabilities: {
    orderCollectionIcecreamMall: true,
    coupangShipmentDownloads: true,
    collectCoupangShipmentFiles: true,
    clearCoupangCookies: true,
    collectKakaoOrders: true,
    // 키드키즈 · 아이스크림몰 관리자 화면에서 등록 상품을 직접 가져온다(KID-246 2단계).
    mallAdminListingsSourceOwnerV1: true,
    // 사방넷으로만 가져오던 몰(도매꾹 · 키즈노트 · 11번가 · 지마켓 · 옥션 · 카카오 · 롯데ON · 스마트스토어 · 티쳐몰)도 직접 읽는다.
    mallAdminListingsMallsV2: true,
    // 롯데ON(우리 거래처로 좁혀 로그인된 탭에서) · 스마트스토어(원상품 목록 검색 폼 그대로) · 티쳐몰(칸 머리로) 읽기기를 고친 판.
    mallAdminListingsMallsV3: true,
    browserCollectionSessions: true,
    orderCollectionFailureEvidenceV1: true,
    orderCollectionConfirmedCoverageV1: true,
    orderCollectionSourceOwnerV1: true,
    kiditemEnvironmentProfilesV1: true,
    sellpiaOrderFileUploadEvidenceV1: true,
    sellpiaScopedAutoInvoiceV1: true,
    uploadDomeggookTracking: true,
    uploadOnchTracking: true,
    uploadKidkidsTracking: true,
    // 키즈노트 상품등록 폼 자동 채움(제출은 사람이 한다).
    kidsnoteFormRegister: true,
    kidsnoteFormRegisterSource: "kidsnote-product-register-fill",
    // 몰 상품등록 폼 자동 채움. [등록]까지 누르는 것은 확인한 몰만(ADR-0015) — 몰마다 `mallFormSubmit:<몰>` 이 켜진다.
    mallFormRegister: true,
    mallFormSubmitV1: true,
    mallFormSubmitMalls: KidItemMallFormRegister.SUBMIT_MALL_KEYS,
    ...Object.fromEntries(KidItemMallFormRegister.SUBMIT_MALL_KEYS.map((key) => [`mallFormSubmit:${key}`, true])),
    mallFormRegisterMalls: Object.keys(KidItemMallFormRegister.SPECS),
    // 몰 품절 송신(끝까지 보낸다. 해제도 같은 액션).
    mallAvailabilitySend: true,
    mallAvailabilitySendMalls: KidItemMallAvailabilitySend.MALL_KEYS,
    // 꼬망세를 줄마다의 [개별수정]으로 보낸다(1.2.16). 옛 확장은 페이지 전체를 다시 저장했고 재개 때 재고 칸에
    // "{stock}" 글자를 넣었다 — 웹은 이 값이 없는 확장으로 꼬망세를 보내지 않는다.
    mallAvailabilityKkomangseDirectV1: true,
    // 아이스크림몰을 판매상태 일괄변경 창의 [적용], 키즈노트를 [상태/노출일괄수정]과 같은 요청으로 보낸다(1.2.18).
    // 옛 확장은 경로가 없다고 거절한다 — 웹은 이 값이 없는 확장으로 두 몰을 보내지 않는다.
    mallAvailabilityIcecreamSaleStateV1: true,
    mallAvailabilityKidsnoteStateV1: true,
    // 지마켓 · 옥션(ESM) · 11번가 · 스마트스토어 판매중지 · 해제(1.2.19). 옛 확장은 이 몰들을 모른다.
    mallAvailabilityMarketsV1: true,
    // 키드키즈를 상품코드 검색 + [일시품절]과 같은 폼(commitType=change_use_flag, EUC-KR)으로 보낸다(1.2.20). 옛 확장은
    // 틀린 값을 목록 1쪽에서만 보냈다 — 웹은 이 값이 없는 확장으로 키드키즈를 보내지 않는다.
    mallAvailabilityKidkidsUseFlagV1: true,
    // 떠리몰(샵바이 파트너 어드민)을 상품 목록 판매설정(판매중지 · 판매가능)과 같은 요청으로 보낸다(1.2.21). 옛 확장은 떠리몰
    // 길이 없다 — 웹은 이 값이 없는 확장으로 떠리몰을 보내지 않는다.
    mallAvailabilityThirtymallV1: true,
    // 몰 가격 보내기(1.2.24, KID-247). 옛 확장은 이 액션을 모른다 — 웹은 이 값이 없는 확장으로 가격을 보내지 않는다.
    mallPriceSendV1: true,
    // 키즈노트 가격(가격 일괄수정 균일가, 1.2.25). 옛 확장은 카카오만 안다.
    mallPriceSendKidsnoteV1: true,
    mallPriceSendMalls: KidItemMallAvailabilitySend.PRICE_MALL_KEYS,
    // 몰 대량등록 사진 올리기(1.2.27) — 우리 저장소 사진을 키즈노트 첨부 저장소에 올려 공개 주소를 받는다.
    publicImageHostV1: true,
    // 몰 지금 재고 읽기(보내지 않는다).
    mallAvailabilityRead: true,
    mallAvailabilityReadMalls: KidItemMallAvailabilitySend.READ_MALL_KEYS,
    // 분류를 몰에서 그때그때 읽어 화면이 계단식으로 보여줄 수 있다.
    mallCategoryLookup: true,
    mallCategoryLookupMalls: ["onch"],
    // 몰 로그인 상태를 조용히 확인한다 — 읽기 전용 주소 한 번, 로그인하지 않는다.
    mallSessionProbeV1: true,
    mallLoginTestV1: true,
    // 로그인됨 · 인증 필요 · 로그인 필요 셋으로 답하는 확인(모르면 화면을 열어 본다).
    mallLoginCheckV2: true,
    // 수집이 끝나면 우리가 연 몰 탭을 닫는다.
    orderCollectionTabCloseV1: true,
    mallSessionProbeMalls: (typeof KidItemMallSession !== "undefined"
      && KidItemMallSession.passiveMalls) || ["domeggook", "onch", "kidsnote", "kidkids", "icecream-mall", "art09", "haebub-mall", "teacher-mall", "boribori", "lotte-on", "gs-shop", "ssg", "thirtymall", "kkomangse"],
    collectHaebeopOrders: true,
    sellpiaPostTransfer: true,
    sellpiaAutoInvoice: true,
  },
  cancelCollectionSession: (attemptId, environmentId) =>
    cancelOrdersCollectionSession(attemptId, environmentId),
  recoverCollections: (environmentId) => recoverOrdersCollections(environmentId),
  cancelAdditionalCollections: (environmentId) => cancelAdditionalCollections(environmentId),
  retryAdditionalCollections: (environmentId) => retryAdditionalCollections(environmentId),
});
// ── 11번가(11st) 주문 수집 ─────────────────────────────────────────────────────
// 데스크톱 셀러오피스(soffice)는 React 껍데기 + ExtJS 레거시 iframe 하이브리드라 스크랩이
// 지저분하다. 대신 모바일 셀러오피스(msoffice)가 같은 세션 쿠키로 도는 **순수 JSON API** 라
// 그쪽을 쓴다. 응답이 EUC-KR 이므로 반드시 arrayBuffer + TextDecoder('euc-kr') 로 읽는다.
//
// 목록(shippingManager2)에는 주소·연락처가 없어 주문마다 상세(getOrderDetail2)를 한 번 더
// 부른다(N+1). 11번가 호출 상한이 비공개라 상세 호출 사이에 간격을 둔다.
async function findOrCreate11stTab(collection) {
  // 이미 열린 11번가 탭은 이 수집이 가진 탭이 아니다 — 다른 수집기처럼 새 비활성 탭을 연다.
  return createFreshOrderCollectionTab(collection, ELEVENST_ORDER_URL);
}

async function collect11stOrders(dateFilter, collection) {
  const { tab, created } = await findOrCreate11stTab(collection);
  if (!tab?.id) return { success: false, error: "11번가 셀러오피스(msoffice.11st.co.kr) 탭을 열 수 없습니다." };
  const attached = await attachOrderCollectionTab(collection, tab, created);
  if (attached === null || attached === false) {
    await closeFreshOrderCollectionTab(tab);
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection is no longer active.",
    };
  }
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await assertOrderCollectionActive(collection);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrape11stOrders,
        args: [dateFilter || ""],
      }),
      180000,
      "11번가 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "11번가 화면에 접근하지 못했습니다." };
    if (orderCollectionNeedsAttention(result)) keepOpen = true;
    return result;
  } catch (e) {
    if (e?.code === "COLLECTION_CANCELLED") return orderCollectionCancelledResult(e);
    if (isMallAccessError(e)) { keepOpen = created; return mallAccessErrorResult("11번가"); }
    return mallGenericErrorResult("11번가", e);
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

/**
 * msoffice 페이지 컨텍스트에서 실행. 세션 쿠키로 JSON API 를 직접 호출한다.
 *
 * 수집 상태는 **결제완료(202)** 다. 보리보리에서 겪은 것처럼 상태코드를 잘못 잡으면
 * 늘 빈 목록이 나오므로 여기서 바꾸지 말 것.
 */
async function scrape11stOrders(dateFilter) {
  const API = "https://msoffice.11st.co.kr/cx/api/11ed";
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // 응답이 EUC-KR 이라 text() 로 읽으면 한글이 깨진다.
  async function postForm(path, params) {
    const body = new URLSearchParams(params).toString();
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    const text = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
    try {
      return { ok: res.ok, status: res.status, json: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, json: null, raw: text.slice(0, 200) };
    }
  }

  const loginResult = {
    success: false,
    pendingLogin: true,
    error:
      "11번가 셀러오피스에 로그인되어 있지 않습니다. 열린 11번가 탭에서 로그인한 뒤 다시 '수집하기'를 눌러주세요.",
  };

  try {
    const now = new Date();
    let from;
    let to;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter || "")) {
      from = to = dateFilter.replace(/-/g, "");
    } else {
      // 기본 최근 7일 — 발송 전 주문이 며칠 누적돼도 놓치지 않게.
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      from = ymd(start);
      to = ymd(now);
    }

    const listParams = {
      shBuyerType: "01",
      shBuyerText: "",
      shBuyerTextInput: "",
      shProductStat: "202", // 결제완료
      statusFilter: "202",
      shDateFrom: from,
      shDateTo: to,
      shDateType: "01",
      start: "0",
      limit: "200",
      isPaging: "Y",
      listType: "orderingLogistics",
      shDelayReport: "",
      shPurchaseConfirm: "",
      shToday: "",
      shDelay: "",
    };

    const list = await postForm("/escrow/shippingManager2", listParams);
    if (!list.json) return { ...loginResult, error: `11번가 주문 목록 응답을 읽지 못했습니다. (HTTP ${list.status})` };
    if (list.json.success === false) {
      if (/로그인/.test(String(list.json.msg || ""))) return loginResult;
      return { success: false, error: `11번가 주문 조회 실패: ${list.json.msg || "알 수 없는 오류"}` };
    }

    const rows = Array.isArray(list.json.data)
      ? list.json.data
      : Array.isArray(list.json.list)
        ? list.json.list
        : Array.isArray(list.json.rows)
          ? list.json.rows
          : [];
    if (rows.length === 0) {
      return { success: true, orders: [], count: 0, dateFrom: from, dateTo: to };
    }

    // 주소·연락처는 목록에 없다. 주문별 상세를 이어붙인다.
    const orders = [];
    for (const row of rows) {
      const ordNo = row.ORD_NO ?? row.ordNo;
      const ordPrdSeq = row.ORD_PRD_SEQ ?? row.ordPrdSeq;
      const dlvNo = row.DLV_NO ?? row.dlvNo;
      let detail = null;
      if (ordNo != null) {
        const res = await postForm("/escrow/getOrderDetail2", {
          ordNo: String(ordNo),
          ordPrdSeq: String(ordPrdSeq ?? ""),
          dlvNo: String(dlvNo ?? ""),
        });
        detail = res.json?.data ?? res.json ?? null;
        await delay(250); // 호출 상한이 비공개라 보수적으로 간격을 둔다
      }
      orders.push({ ...row, __detail: detail });
    }

    return { success: true, orders, count: orders.length, dateFrom: from, dateTo: to };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
