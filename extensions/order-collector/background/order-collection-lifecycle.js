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
    return left?.mallKey === right.mallKey && left?.date === right.date;
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
    const createRunId = options.createRunId || (() => root.crypto.randomUUID());
    const isAttentionError = options.isAttentionError || (() => false);

    async function begin(message, inputIdentity) {
      const runId = validRunId(message?.runId) ? message.runId : createRunId();
      const current = await sessions.get(runId);
      if (current) {
        if (
          current.producer !== "orders.mall" ||
          !sameIdentity(current.inputIdentity, inputIdentity)
        ) {
          throw new Error("Collection run does not belong to this mall input");
        }
        await sessions.restart(runId, { closeManagedTab: true });
      } else {
        await sessions.start({
          runId,
          producer: "orders.mall",
          classification: "background_preferred",
          restartStrategy: "web",
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
        if (result.pendingLogin) {
          const collectionSession = await sessions.requireAttention(runId, {
            reason: "marketplace_login",
            message: result.error || "마켓 로그인이 필요합니다.",
          });
          return { ...result, runId, collectionSession };
        }
        if (message?.deferTerminal === true && result.success !== false) {
          const collectionSession = await sessions.progress(runId, {
            current: 1,
            total: 2,
            completed: 1,
            failed: 0,
            label: "브라우저 수집 완료 · 파일 생성 중",
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
        if (isAttentionError(error)) {
          const message = errorMessage(error);
          const collectionSession = await sessions.requireAttention(runId, {
            reason: "marketplace_login",
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
      if (!current || current.producer !== "orders.mall") return null;
      return sessions.cancel(runId, { closeManagedTab: true });
    }

    async function finalize(runId, status, message) {
      const current = await sessions.get(runId);
      if (!current || current.producer !== "orders.mall") return null;
      if (current.status === "cancelled") return current;
      if (current.status !== "running") return current;
      const label = typeof message === "string" ? message.trim().slice(0, 300) : "";
      const progress = status === "failed"
        ? { current: 2, total: 2, completed: 1, failed: 1, label: label || "주문 파일 생성 실패" }
        : { current: 2, total: 2, completed: 2, failed: 0, label: label || "주문 파일 생성 완료" };
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
