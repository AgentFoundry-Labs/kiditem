(function initializeExternalDispatch(root) {
  "use strict";

  // 공통 세션 명령은 이 배선에서만 처리한다. 세션은 owner attempt의
  // 진행/attention과 탭 재개 정보만 보관하므로, 별도 lifecycle 명령은 없다.
  const SESSION_ACTIONS = new Set([
    "listCollectionSessions",
    "getCollectionSession",
    "cancelCollectionSession",
    "openCollectionAttentionTab",
  ]);

  function create(options) {
    const chromeApi = options.chrome;
    const environmentContext = options.environmentContext;
    const sessions = options.sessions;
    const domains = options.domains;

    async function domainForAttempt(attemptId, environmentId) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (!session) throw new Error("Collection session not found");
      const domain = domains.forProducer(session.producer);
      if (!domain) throw new Error("Unsupported collection producer");
      return { session, domain };
    }

    async function delegate(operationName, attemptId, environmentId) {
      const { domain } = await domainForAttempt(attemptId, environmentId);
      const operation = domain[operationName];
      if (typeof operation !== "function") {
        throw new Error("Unsupported collection producer");
      }
      return operation(attemptId, environmentId);
    }

    async function handleSessionAction(msg, environmentId) {
      if (msg.action === "listCollectionSessions") {
        return sessions.list(environmentId);
      }
      if (msg.action === "getCollectionSession") {
        return sessions.getOwned(msg.attemptId, environmentId);
      }
      if (msg.action === "openCollectionAttentionTab") {
        const session = await sessions.getOwned(msg.attemptId, environmentId);
        if (!session) throw new Error("Collection session not found");
        return sessions.openAttentionTab(msg.attemptId);
      }
      if (msg.action === "cancelCollectionSession") {
        return delegate("cancelCollectionSession", msg.attemptId, environmentId);
      }
      throw new Error("Unsupported collection session action");
    }

    // 웹앱 메시지는 새 런타임 dispatch 하나가 받는다(KID-366, `extensions/src/core/dispatch.ts`). 세션 액션은 카카오 attempt
    // 경로(KID-379)에 남은 것이라, 옛 표에 등록해 새 dispatch가 과도기 위임으로 여기로 넘기게 한다(wave9에서 삭제).
    function sessionActions() {
      return Object.fromEntries([...SESSION_ACTIONS].map((action) => [action, {
        validate: (msg) => msg,
        handle: (msg, environmentId) => handleSessionAction(msg, environmentId),
      }]));
    }

    function handlePort(port) {
      const senderEnvironment = environmentContext.resolveSender(port?.sender);
      const handler = domains.forExternalPort(port?.name);
      if (!senderEnvironment || !handler) {
        port?.disconnect();
        return;
      }
      try {
        handler(port, senderEnvironment);
      } catch {
        port.disconnect();
      }
    }

    function install() {
      domains.register({ externalActions: sessionActions() });
      chromeApi.runtime.onConnectExternal?.addListener(handlePort);
    }

    return Object.freeze({ handleSessionAction, handlePort, install });
  }

  root.KidItemExternalDispatch = Object.freeze({ create, SESSION_ACTIONS });
})(globalThis);
