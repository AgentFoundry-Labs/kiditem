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
// KID-379: 옛 몰 소유자 경로(`orders.mall`)는 카카오만 쓴다. 카카오는 셀피아 변환 규격이 없어 서버에 변환을 보내지
// 않고, 걷은 원본을 그대로 실패 증거(`UNSUPPORTED_CONVERSION`)로 소유자에게 넘긴다 — 소유자가 그 원본과 함께 시도를
// 실패로 닫는다. 옛 서버 변환기(`order-collection-server-converter.js`)는 다른 몰이 모두 실행 kind로 옮겨 지웠다(KID-380).
function refuseUnsupportedConversion(capture) {
  const error = new Error("카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.");
  error.code = "UNSUPPORTED_CONVERSION";
  // 이름 붙은 수집기의 캡처를 그대로 남긴다 — `orders`로 줄이면 몰이 준 부가 정보가 사라진다.
  error.sourcePayload = capture;
  // 요청을 보내기 전에 거절했다 — 결과가 불확실한 전송 실패가 아니다.
  error.conversionLocal = true;
  throw error;
}
function runOwnedOrderCollection(message, mallKey, collect) {
  return orderCollectionSourceOwner.run({
    environmentId: message.environmentId,
    message,
    mallKey,
    collect,
    ...(message.serverOwned === true ? {
      submit: (capture) => refuseUnsupportedConversion(capture),
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

const KAKAO_ORDER_URL = "https://shopping-seller.kakao.com/order/seller/store-order/integrate/list";
const KAKAO_TAB_MATCHES = ["https://shopping-seller.kakao.com/*"];
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
 * 몰 세션 모듈의 드라이버 — 탭 열기 · 프레임에 스크립트 넣기 · 알림 창 삼키기. 어느 몰에 어떻게
 * 로그인할지는 `mall-session.js` 가 알고, 여기서는 Chrome 경계를 연결한다. 수집 시도의 탭 소유권은
 * Orders가 확인한다. 로그인 확인·테스트는 새 런타임(`extensions/src/sites/mall-session`, KID-366)이다 —
 * 여기 남은 로그인은 카카오 attempt 경로와 셀피아·송장 업로드(wave8b·wave9에서 삭제)가 쓴다.
 */
function createMallSessionDriver() {
  return {
    now: () => Date.now(),
    delay: (ms) => delay(ms),
    withTimeout: (promise, timeoutMs, message) => withTimeout(promise, timeoutMs, message),
    waitReady: (tabId) => waitForTabReady(tabId),
    ensureActive: (collection) => assertOrderCollectionActive(collection),
    cancelledResult: (error) => orderCollectionCancelledResult(error),

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
  };
}

// 웹앱 메시지는 새 런타임 dispatch가 받고(KID-366, 유일한 onMessageExternal 리스너), 이 워커가 아직 가진 액션만 과도기
// 위임으로 넘어온다 — 환경은 dispatch가 보내는 창 origin으로 정해 넘기고, 응답할 때까지 서비스워커도 dispatch가 붙든다.
// 셀피아·배송 목록·송장 업로드는 Orders 작업 kind 6종이다(KID-366 wave8b). 남은 액션은 wave9(카카오 KID-379)에서 사라진다.
function handleOrdersExternalMessage(msg, environmentId, sendResponse) {
  msg = { ...msg, environmentId };
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

  // 수집 세션 공통 액션(list/get/cancel/openAttentionTab)과 ping 은 통합
  // 서비스워커가 처리한다. 도메인 워커가 각자 응답하면 세 리스너가 같은
  // 메시지에 경쟁 응답하게 된다. 이 도메인의 cancellation 구현과
  // capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  // 수집이 끝난 몰의 탭을 닫는다. 우리가 연 탭만 닫고, 사람이 열어 둔 탭은 건드리지 않는다.
  if (msg?.action === "closeOrderCollectionTabs") {
    const attemptIds = Array.isArray(msg.attemptIds)
      ? msg.attemptIds.filter((id) => typeof id === "string")
      : [];
    return respond(closeOrderCollectionTabs(attemptIds));
  }

  if (msg?.action === "ensureMallLoggedIn") {
    return respond(ensureMallLoginWithLifecycle(msg));
  }

  // KID-379: 옛 몰 소유자 경로에 남은 유일한 수집기.
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
/**
 * 몰 로그인 상태 — 로그인됨 · 인증 필요 · 로그인 필요 중 하나. 조용히 읽는 확인이 확실하면
 * 그 답을 쓰고, 아니면 화면을 열어 본다. 로그인은 하지 않는다.
 */
// 수집 전 자동 로그인 보장: 몰 주문/홈 URL 을 백그라운드로 열어(미로그인 시 로그인 페이지로 리다이렉트)
// 저장된 계정으로 로그인 후 닫는다. 이후 수집 탭은 같은 세션 쿠키라 로그인 상태. credentials 없으면 스킵.
// KID-379: 시도를 싣고 오는 로그인은 옛 몰 소유자 경로(카카오)뿐이다 — 그 시도 안에서 로그인한다.
function ensureMallLoginWithLifecycle(message) {
  // 옛 몰 소유자의 시도 없이 온 로그인은 로그인만 한다 — 쿠팡직배송(orders.coupang_directship)과 실행 kind
  // `orders.mall_orders`로 옮긴 몰(KID-359)은 몰 소유자 시도가 없다. 감싸면 몰 쪽에 없는 시도를 찾다가
  // 로그인 문턱에서 수집이 끝났다(2026-09-21 라이브). 시도 id는 `attemptId`만 본다(옛 `runId` 이름은 lifecycle이 받지 않는다).
  if (message?.mallKey === "coupang-direct" || !message?.attemptId) {
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

// KID-379: 옛 몰 소유자 경로에 남은 카카오 수집기(변환 규격이 없어 원본은 실패 증거로 남는다).
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

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
const ORDERS_EXTERNAL_ACTIONS = [
  "closeOrderCollectionTabs",
  "ensureMallLoggedIn",
  "collectKakaoOrders",
];
KidItemDomains.register({
  producerPrefixes: ["orders"],
  // 몰 관리자 목록 가져오기는 실행 kind `channels.mall_admin_listings`다(KID-363·381) — 옛 `collectMallAdminListings`는 없다.
  externalActions: Object.fromEntries(ORDERS_EXTERNAL_ACTIONS.map((action) => [action, {
    validate: (msg) => msg,
    handle: (msg, environmentId) => new Promise((resolve) => {
      if (handleOrdersExternalMessage(msg, environmentId, resolve) === false) {
        resolve({ success: false, error: "Unsupported orders action" });
      }
    }),
  }])),
  capabilities: {
    collectKakaoOrders: true,
    browserCollectionSessions: true,
    orderCollectionFailureEvidenceV1: true,
    orderCollectionConfirmedCoverageV1: true,
    orderCollectionSourceOwnerV1: true,
    // 몰 상품등록·품절·재개·가격은 런타임 실행 kind(KID-256), 몰 로그인 테스트·확인·사진 호스팅·분류·쿠팡 쉽먼트 화면·PDF·
    // 쿠키 정리는 새 런타임 entry 액션(KID-366)이다 — 입구 `ping`이 그 capability를 알린다.
    // 수집이 끝나면 우리가 연 몰 탭을 닫는다.
    orderCollectionTabCloseV1: true,
  },
  cancelCollectionSession: (attemptId, environmentId) =>
    cancelOrdersCollectionSession(attemptId, environmentId),
  recoverCollections: (environmentId) => recoverOrdersCollections(environmentId),
});
