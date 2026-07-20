(function initializeOrderCollectionLifecycle(root) {
  "use strict";

  const RUN_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validRunId(value) {
    return typeof value === "string" && RUN_ID_PATTERN.test(value);
  }

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

  function sameIdentity(left, right) {
    const leftEntries = Object.entries(left || {}).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey));
    const rightEntries = Object.entries(right || {}).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey));
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value], index) =>
        rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value);
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function cancelledResult(runId, collectionSession) {
    return {
      success: false,
      cancelled: true,
      error: "Order collection was cancelled",
      runId,
      collectionSession,
    };
  }

  function create(options) {
    const sessions = options.sessions;
    const producer = options.producer;
    const classification = options.classification || "background_preferred";
    const restartStrategy = options.restartStrategy || "web";
    const requireRunId = options.requireRunId === true;
    const forceDeferredTerminal = options.forceDeferredTerminal === true;
    const createRunId = options.createRunId || (() => root.crypto.randomUUID());
    const classifyFailure = options.classifyFailure || (() => null);
    const deferredLabel = options.deferredLabel || "브라우저 수집 완료 · 파일 생성 중";
    const failedLabel = options.failedLabel || "주문 파일 생성 실패";
    const succeededLabel = options.succeededLabel || "주문 파일 생성 완료";
    if (typeof producer !== "string" || producer.length < 1) {
      throw new Error("Collection producer is required");
    }

    function attentionReason(value) {
      const classified = classifyFailure(value);
      if (typeof classified === "string" && classified.length > 0) {
        return classified;
      }
      return null;
    }

    async function begin(message, inputIdentity) {
      if (requireRunId && !validRunId(message?.runId)) {
        throw new Error("Collection run ID is required");
      }
      const runId = validRunId(message?.runId) ? message.runId : createRunId();
      const current = await sessions.get(runId);
      if (current) {
        if (
          current.producer !== producer ||
          !sameIdentity(current.inputIdentity, inputIdentity)
        ) {
          throw new Error("Collection run does not belong to this producer input");
        }
        await sessions.restart(runId, { closeManagedTab: true });
      } else {
        await sessions.start({
          runId,
          producer,
          classification,
          restartStrategy,
          inputIdentity,
        });
      }
      return runId;
    }

    async function run(message, inputIdentity, operation) {
      let runId;
      try {
        runId = await begin(message, inputIdentity);
      } catch (error) {
        return { success: false, error: errorMessage(error), runId: message?.runId };
      }

      const collection = Object.freeze({
        runId,
        async attachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.attachTab(runId, {
            tabId: tab.id,
            windowId: tab.windowId,
            closeOnRestart: attachment.owned !== false,
          });
        },
        async detachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.detachTab(runId, {
            tabId: tab.id,
            closeManagedTab: attachment.owned !== false,
          });
        },
        progress(nextProgress) {
          return sessions.progress(runId, nextProgress);
        },
      });

      try {
        const result = (await operation(collection)) || {};
        const current = await sessions.get(runId);
        if (current?.status === "cancelled") {
          return cancelledResult(runId, current);
        }
        const resultAttention = attentionReason(result);
        if (resultAttention) {
          const collectionSession = await sessions.requireAttention(runId, {
            reason: resultAttention,
            message: result.error || "마켓 로그인이 필요합니다.",
          });
          return { ...result, runId, collectionSession };
        }
        if (
          (forceDeferredTerminal || message?.deferTerminal === true)
          && result.success !== false
        ) {
          const collectionSession = await sessions.progress(runId, {
            current: 1,
            total: 2,
            completed: 1,
            failed: 0,
            label: deferredLabel,
          });
          return { ...result, runId, collectionSession };
        }
        const collectionSession = result.success === false
          ? await sessions.fail(runId)
          : await sessions.succeed(runId);
        return { ...result, runId, collectionSession };
      } catch (error) {
        const current = await sessions.get(runId);
        if (current?.status === "cancelled") {
          return cancelledResult(runId, current);
        }
        const errorAttention = attentionReason(error);
        if (errorAttention) {
          const message = errorMessage(error);
          const collectionSession = await sessions.requireAttention(runId, {
            reason: errorAttention,
            message,
          });
          return {
            success: false,
            pendingLogin: true,
            error: message,
            runId,
            collectionSession,
          };
        }
        const collectionSession = await sessions.fail(runId);
        return {
          success: false,
          error: errorMessage(error),
          runId,
          collectionSession,
        };
      }
    }

    async function cancel(runId) {
      const current = await sessions.get(runId);
      if (!current || current.producer !== producer) return null;
      return sessions.cancel(runId, { closeManagedTab: true });
    }

    async function finalize(runId, status, message) {
      const current = await sessions.get(runId);
      if (!current || current.producer !== producer) return null;
      if (current.status === "cancelled") return current;
      if (current.status !== "running") return current;
      const label = typeof message === "string" ? message.trim().slice(0, 300) : "";
      const progress = status === "failed"
        ? { current: 2, total: 2, completed: 1, failed: 1, label: label || failedLabel }
        : { current: 2, total: 2, completed: 2, failed: 0, label: label || succeededLabel };
      await sessions.progress(runId, progress);
      return status === "failed" ? sessions.fail(runId) : sessions.succeed(runId);
    }

    return Object.freeze({ run, cancel, finalize });
  }

  root.KidItemOrderCollectionLifecycle = Object.freeze({
    create,
    createIdentity,
    validRunId,
  });
})(globalThis);
