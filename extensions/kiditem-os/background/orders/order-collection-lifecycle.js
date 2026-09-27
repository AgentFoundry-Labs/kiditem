(function initializeOrderCollectionLifecycle(root) {
  "use strict";

  // KID-379: 옛 몰 소유자 경로(카카오)의 로컬 수집 세션 수명. 호출자는 worker의 몰 소유자 하나뿐이라, 서버가 준
  // attemptId만 받는다(옛 runId 이름·스스로 만든 id·표시 문구 바꾸기는 지웠다, KID-380).

  const ATTEMPT_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validAttemptId(value) {
    return typeof value === "string" && ATTEMPT_ID_PATTERN.test(value);
  }

  // Existing collectors use this small value object to identify their source
  // input. It is intentionally kept out of the persisted collection session.
  function createIdentity(mallKey, date) {
    return {
      mallKey,
      date: safeDate(date),
    };
  }

  function safeDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? value
      : null;
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function cancelledResult(attemptId, collectionSession) {
    return {
      success: false,
      cancelled: true,
      errorCode: "COLLECTION_CANCELLED",
      error: "Order collection was cancelled",
      attemptId,
      collectionSession,
    };
  }

  function create(options) {
    const sessions = options.sessions;
    const producer = options.producer;
    const classifyFailure = options.classifyFailure || (() => null);
    const normalizeFailure = typeof options.normalizeFailure === "function"
      ? options.normalizeFailure
      : null;
    const deferredLabel = "브라우저 수집 완료 · 파일 생성 중";
    const failedLabel = "주문 파일 생성 실패";
    const succeededLabel = "주문 파일 생성 완료";
    if (typeof producer !== "string" || producer.length < 1) {
      throw new Error("Collection producer is required");
    }

    async function isLocallyActive(attemptId, environmentId) {
      if (typeof sessions.getOwned === "function") {
        let current;
        try {
          current = await sessions.getOwned(attemptId, environmentId);
        } catch {
          return false;
        }
        if (!current || current.producer !== producer) return false;
      } else if (typeof sessions.isActive !== "function") {
        return true;
      }
      if (typeof sessions.isActive !== "function") return true;
      try {
        return (await sessions.isActive(attemptId, environmentId, producer)) !== false;
      } catch {
        return false;
      }
    }

    function attentionReason(value, inputIdentity) {
      const classified = classifyFailure(value);
      if (typeof classified === "string" && classified.length > 0) {
        return classified;
      }
      if (normalizeFailure) {
        const failure = normalizeFailure(inputIdentity?.mallKey || producer, value);
        if (
          failure?.code === "login_required" ||
          failure?.code === "operator_action_required"
        ) {
          return "marketplace_login";
        }
      }
      return null;
    }

    function withFailureEvidence(result, inputIdentity, value = result) {
      if (!normalizeFailure) return result;
      const failure = normalizeFailure(inputIdentity?.mallKey || producer, value);
      return failure ? { ...result, failure } : result;
    }

    function messageAttemptId(message) {
      return validAttemptId(message?.attemptId) ? message.attemptId : null;
    }

    async function begin(message) {
      const environmentId = message?.environmentId;
      if (environmentId !== "local" && environmentId !== "office") {
        throw new Error("Collection environment is required");
      }
      const attemptId = messageAttemptId(message);
      if (!attemptId) throw new Error("Owner attempt ID is required");
      const current = await sessions.get(attemptId);
      if (current) {
        if (
          current.producer !== producer ||
          current.environmentId !== environmentId
        ) {
          throw new Error("Owner attempt does not belong to this producer");
        }
        return attemptId;
      }
      const started = await sessions.start({
        attemptId,
        environmentId,
        producer,
      });
      if (started === null || started === false) {
        const error = new Error("Order collection was cancelled");
        error.code = "COLLECTION_CANCELLED";
        throw error;
      }
      return attemptId;
    }

    async function run(message, inputIdentity, operation) {
      let attemptId;
      try {
        attemptId = await begin(message, inputIdentity);
      } catch (error) {
        if (error?.code === "COLLECTION_CANCELLED") {
          return cancelledResult(messageAttemptId(message), null);
        }
        return withFailureEvidence(
          {
            success: false,
            error: errorMessage(error),
            attemptId: messageAttemptId(message),
          },
          inputIdentity,
          error,
        );
      }

      const collection = Object.freeze({
        attemptId,
        environmentId: message.environmentId,
        async assertActive() {
          return isLocallyActive(attemptId, message.environmentId);
        },
        isActive() {
          return isLocallyActive(attemptId, message.environmentId);
        },
        async attachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.attachTab(attemptId, {
            tabId: tab.id,
            windowId: tab.windowId,
            closeOnCancel: attachment.owned !== false,
          });
        },
        async detachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.detachTab(attemptId, {
            tabId: tab.id,
            closeManagedTab: attachment.owned !== false,
          });
        },
        progress(nextProgress) {
          return sessions.progress(attemptId, nextProgress);
        },
      });

      try {
        if (!(await isLocallyActive(attemptId, message.environmentId))) {
          return cancelledResult(attemptId, null);
        }
        const result = (await operation(collection)) || {};
        const active = await isLocallyActive(attemptId, message.environmentId);
        if (!active) {
          return cancelledResult(attemptId, null);
        }
        const current = await sessions.get(attemptId);
        if (!current) return cancelledResult(attemptId, null);
        const resultAttention = attentionReason(result, inputIdentity);
        if (resultAttention) {
          const collectionSession = await sessions.requireAttention(attemptId, {
            reason: resultAttention,
            message: result.error || "마켓 로그인이 필요합니다.",
          });
          return withFailureEvidence(
            { ...result, attemptId, collectionSession },
            inputIdentity,
            result,
          );
        }
        if (message?.deferTerminal === true && result.success !== false) {
          const collectionSession = await sessions.progress(attemptId, {
            current: 1,
            total: 2,
            completed: 1,
            failed: 0,
            label: deferredLabel,
          });
          return { ...result, attemptId, collectionSession };
        }
        const collectionSession = await sessions.progress(attemptId, result.success === false
          ? { current: 1, total: 1, completed: 0, failed: 1, label: failedLabel }
          : { current: 1, total: 1, completed: 1, failed: 0, label: succeededLabel });
        const response = { ...result, attemptId, collectionSession };
        return result.success === false
          ? withFailureEvidence(response, inputIdentity, result)
          : response;
      } catch (error) {
        const active = await isLocallyActive(attemptId, message.environmentId);
        if (!active) {
          return cancelledResult(attemptId, null);
        }
        const current = await sessions.get(attemptId);
        if (!current) return cancelledResult(attemptId, null);
        const errorAttention = attentionReason(error, inputIdentity);
        if (errorAttention) {
          const message = errorMessage(error);
          const collectionSession = await sessions.requireAttention(attemptId, {
            reason: errorAttention,
            message,
          });
          return withFailureEvidence({
            success: false,
            pendingLogin: true,
            error: message,
            attemptId,
            collectionSession,
          }, inputIdentity, error);
        }
        const collectionSession = await sessions.progress(attemptId, {
          current: 1,
          total: 1,
          completed: 0,
          failed: 1,
          label: failedLabel,
        });
        return withFailureEvidence({
          success: false,
          error: errorMessage(error),
          attemptId,
          collectionSession,
        }, inputIdentity, error);
      }
    }

    async function cancel(attemptId) {
      const current = await sessions.get(attemptId);
      if (!current || current.producer !== producer) return null;
      return sessions.cancel(attemptId, { closeManagedTab: true });
    }

    return Object.freeze({ run, cancel });
  }

  root.KidItemOrderCollectionLifecycle = Object.freeze({
    create,
    createIdentity,
    validAttemptId,
  });
})(globalThis);
