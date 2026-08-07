// KIDITEM OS — 도메인 워커가 공유하는 전역
//
// 주문수집 / 쿠팡 / 소싱이 별개 확장이던 시절에는 세 워커가 아래 값을 각자
// 똑같이 만들었다. 하나의 서비스워커에서는 최상위 선언이 한 스코프를 공유하므로
// 같은 이름을 세 번 선언하면 로드 자체가 실패한다.
//
// 아래 넷은 세 도메인에서 값이 완전히 동일했으므로 여기서 한 번만 만든다.
// 특히 `collectionSessions` 는 원래도 같은 `kiditem_collection_sessions` 저장소를
//가리키고 있었다. 인스턴스를 하나로 두면 도메인 간 세션 조회가 자연스럽게 맞물린다.
//
// 반면 `environmentContext` 는 도메인마다 `requiresAuth` 가 달라 공유하지 않는다.
// 각 워커가 `adsEnvironmentContext` / `ordersEnvironmentContext` /
// `sourcingEnvironmentContext` 로 따로 만든다.

const KIDITEM_WEB_URL_PATTERNS = [
  "http://localhost:3000/*",
  "http://kiditem-office/*",
  "https://staging.merchon.org/*",
];

// 수집 세션 조회/발행에만 쓰이므로 토큰을 요구하지 않는다. 세션 모듈은 이
// 컨텍스트를 환경 ID 검증과 웹탭 브로드캐스트에만 사용한다.
const sharedEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  requiresAuth: false,
});

// Server-owned browser Operation claim/report calls always require the opaque
// KidItem session. This context shares the same per-environment profile store
// with the domain workers, but is intentionally separate from the unauthenticated
// session-broadcast context above.
const browserOperationRuntimeEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
});

const collectionSessions = KidItemCollectionSession.create({
  chrome,
  storageKey: "kiditem_collection_sessions",
  environmentContext: sharedEnvironmentContext,
});

const interactiveTabs = KidItemInteractiveTabs.create({ chrome });
const INTERACTIVE_TAB_REASONS = KidItemInteractiveTabs.reasons;

// ── MV3 서비스워커 유휴 종료 방지 ─────────────────────────────────────────────
//
// MV3 서비스워커는 30초 무활동이면 종료된다. 수집은 몇 분씩 걸리므로, 응답 전에
// 워커가 죽으면 웹에는
//   "A listener indicated an asynchronous response by returning true,
//    but the message channel closed before a response was received"
// 만 남고 수집 성공 여부를 알 수 없게 된다.
//
// 원래는 몰마다 `setInterval` 을 복붙해 막았는데, 새 수집기에 빠뜨리면 조용히
// 노출됐다. 여기서 참조 카운트로 한 번만 관리하고 각 워커의 `respond` 가 쓴다.
// 동시에 여러 수집이 돌아도 인터벌은 하나이며, 마지막 작업이 끝날 때만 멈춘다.
const KidItemWorkerKeepAlive = (() => {
  const PING_MS = 20000;
  let holders = 0;
  let timer = null;

  const ping = () => {
    try {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    } catch {
      /* 워커 종료 직전 호출은 무시한다. 다음 tick 에서 다시 시도한다. */
    }
  };

  /** 작업 하나를 붙든다. 반환된 release 는 여러 번 불러도 한 번만 센다. */
  const acquire = () => {
    holders += 1;
    if (timer === null) timer = setInterval(ping, PING_MS);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holders -= 1;
      if (holders <= 0) {
        holders = 0;
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      }
    };
  };

  /** 프로미스가 끝날 때까지 워커를 살려 둔다. 성공/실패 모두 해제한다. */
  const during = (operation) => {
    const release = acquire();
    return Promise.resolve(operation).finally(release);
  };

  return { acquire, during, get holders() { return holders; } };
})();
