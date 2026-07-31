(function initializeExternalDispatch(root) {
  "use strict";

  // 세 확장을 하나로 합치면서 도메인 워커끼리 겹치던 외부 메시지를 여기서만
  // 처리한다. 도메인 고유 액션은 각 워커의 리스너가 그대로 받는다(세 리스너
  // 모두 모르는 액션에는 응답하지 않으므로 서로 간섭하지 않는다).
  const SESSION_ACTIONS = new Set([
    "listCollectionSessions",
    "getCollectionSession",
    "cancelCollectionSession",
    "restartCollectionSession",
    "finalizeCollectionSession",
    "openCollectionAttentionTab",
  ]);

  function create(options) {
    const chromeApi = options.chrome;
    const environmentContext = options.environmentContext;
    const sessions = options.sessions;
    const domains = options.domains;

    async function domainForRun(runId, environmentId) {
      const session = await sessions.getOwned(runId, environmentId);
      if (!session) throw new Error("Collection session not found");
      const domain = domains.forProducer(session.producer);
      if (!domain) throw new Error("Unsupported collection producer");
      return { session, domain };
    }

    async function delegate(operationName, runId, environmentId, extraArgs) {
      const { domain } = await domainForRun(runId, environmentId);
      const operation = domain[operationName];
      if (typeof operation !== "function") {
        throw new Error("Unsupported collection producer");
      }
      return operation(runId, ...(extraArgs || []), environmentId);
    }

    async function handleSessionAction(msg, environmentId) {
      if (msg.action === "listCollectionSessions") {
        return sessions.list(environmentId);
      }
      if (msg.action === "getCollectionSession") {
        return sessions.getOwned(msg.runId, environmentId);
      }
      if (msg.action === "openCollectionAttentionTab") {
        const session = await sessions.getOwned(msg.runId, environmentId);
        if (!session) throw new Error("Collection session not found");
        return sessions.openAttentionTab(msg.runId);
      }
      if (msg.action === "cancelCollectionSession") {
        return delegate("cancelCollectionSession", msg.runId, environmentId);
      }
      if (msg.action === "restartCollectionSession") {
        return delegate("restartCollectionSession", msg.runId, environmentId);
      }
      if (msg.action === "finalizeCollectionSession") {
        const status =
          msg.status === "failed"
            ? "failed"
            : msg.status === "succeeded"
              ? "succeeded"
              : null;
        if (
          !status ||
          typeof msg.message !== "string" ||
          msg.message.length < 1 ||
          msg.message.length > 300
        ) {
          throw new Error("Invalid collection finalization");
        }
        return delegate("finalizeCollectionSession", msg.runId, environmentId, [
          status,
          msg.message,
        ]);
      }
      throw new Error("Unsupported collection session action");
    }

    function handleMessage(msg, sender, sendResponse) {
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
      // 신뢰하지 않는 오리진 거절은 각 도메인 워커도 하므로 여기서는 빠진다.
      const senderEnvironment = environmentContext.resolveSender(sender);
      if (!senderEnvironment) return false;
      const environmentId = senderEnvironment.environmentId;

      if (msg.action === "ping") {
        sendResponse({
          success: true,
          version: chromeApi.runtime.getManifest().version,
          capabilities: domains.capabilities(),
        });
        return false;
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

    function install() {
      chromeApi.runtime.onMessageExternal.addListener(handleMessage);
    }

    return Object.freeze({ handleMessage, install });
  }

  root.KidItemExternalDispatch = Object.freeze({ create, SESSION_ACTIONS });
})(globalThis);
