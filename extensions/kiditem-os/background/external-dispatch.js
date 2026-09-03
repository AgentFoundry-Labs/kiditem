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
    const operationRuntime = options.operationRuntime;

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

    function handleMessage(msg, sender, sendResponse) {
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
      const senderEnvironment = environmentContext.resolveSender(sender);
      if (!senderEnvironment) return false;
      const environmentId = senderEnvironment.environmentId;

      if (msg.action === "wakeOperationRuntime") {
        if (
          Object.keys(msg).length !== 1 ||
          typeof operationRuntime?.wake !== "function"
        ) {
          sendResponse({
            success: false,
            error: "Invalid operation runtime wake request",
          });
          return false;
        }
        sendResponse({ success: true, accepted: true });
        void Promise.resolve()
          .then(() => operationRuntime.wake(environmentId))
          .catch(() => undefined);
        return false;
      }

      if (msg.action === "ping") {
        sendResponse({
          success: true,
          version: chromeApi.runtime.getManifest().version,
          capabilities: domains.capabilities(),
        });
        return false;
      }

      const sourceAction = domains.forExternalAction(msg.action);
      if (sourceAction) {
        let input;
        try {
          input = sourceAction.validate(msg);
        } catch (error) {
          sendResponse({
            success: false,
            error: error?.message || "Invalid source collection request",
          });
          return false;
        }
        Promise.resolve(sourceAction.handle(input, environmentId))
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error?.message || "Source collection request failed",
            }),
          );
        return true;
      }

      if (!SESSION_ACTIONS.has(msg.action)) return false;

      handleSessionAction(msg, environmentId)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: error?.message || "Collection session request failed",
          }),
        );
      return true;
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
      chromeApi.runtime.onMessageExternal.addListener(handleMessage);
      chromeApi.runtime.onConnectExternal?.addListener(handlePort);
    }

    return Object.freeze({ handleMessage, handlePort, install });
  }

  root.KidItemExternalDispatch = Object.freeze({ create, SESSION_ACTIONS });
})(globalThis);
