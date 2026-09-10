(function (root) {
  "use strict";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message, expectedAction) {
    if (message?.action !== expectedAction || typeof message.idempotencyKey !== "string"
      || !UUID.test(message.idempotencyKey)
      || Object.keys(message).some((key) => key !== "action" && key !== "idempotencyKey")) {
      throw new Error("Invalid keyword rank batch request");
    }
    return { idempotencyKey: message.idempotencyKey };
  }

  function create({ kind, request, sourceOwner, sleep, randomDelayMs, keepAlive, afterBatch }) {
    if (kind !== "wing" && kind !== "serp") throw new Error("Unknown keyword rank batch source");
    const dispatches = new Map();
    const cancellations = new Map();
    async function read(environmentId, idempotencyKey) {
      const response = await request(environmentId, `/api/ads/keyword-rank/${kind}/batch-attempts`, {
        method: "GET", headers: { "Idempotency-Key": idempotencyKey },
      });
      if (!response.ok) throw new Error(`순위 수집 대상 조회 실패 (${response.status})`);
      const batch = await response.json();
      if (!Array.isArray(batch?.attempts)) throw new Error("Invalid keyword rank batch response");
      return validateBatch(batch);
    }
    function validateBatch(batch) {
      const ids = new Set();
      for (const attempt of batch.attempts) {
        if (typeof attempt?.attemptId !== "string" || !UUID.test(attempt.attemptId)
          || ids.has(attempt.attemptId) || !["RUNNING", "COMPLETE", "FAILED"].includes(attempt.state)) {
          throw new Error("Invalid keyword rank batch member");
        }
        ids.add(attempt.attemptId);
      }
      return batch;
    }
    async function cancelRequest(environmentId, idempotencyKey) {
      const response = await request(environmentId, `/api/ads/keyword-rank/${kind}/batch-attempts/cancel`, {
        method: "POST", headers: { "Idempotency-Key": idempotencyKey },
      });
      if (!response.ok) throw new Error(`순위 수집 취소 실패 (${response.status})`);
      return validateBatch(await response.json());
    }
    function start({ environmentId, idempotencyKey }) {
      const key = `${environmentId}:${idempotencyKey}`;
      if (dispatches.has(key)) return dispatches.get(key).started;
      const dispatch = { cancelled: false, started: null, cancelActive: null };
      dispatches.set(key, dispatch);
      dispatch.started = read(environmentId, idempotencyKey).then((batch) => {
        const pending = batch.attempts.filter((attempt) => attempt.state === "RUNNING");
        const priorInterruption = kind === "serp" && batch.attempts.some((attempt) =>
          attempt.state === "FAILED" && ["SERP_PROVIDER_WALL", "COLLECTION_CANCELLED"].includes(attempt.errorCode));
        const enrich = kind === "serp" && batch.attempts.length > 0 && !priorInterruption && afterBatch;
        if (!pending.length && !enrich) {
          dispatches.delete(key);
          return { success: true, started: false };
        }
        keepAlive((async () => {
          let next = 0;
          let interrupted = priorInterruption;
          try {
            while (next < pending.length && !dispatch.cancelled && !interrupted) {
              const attemptId = pending[next++].attemptId;
              const outcome = await sourceOwner.run({ environmentId, attemptId });
              if (!["COMPLETE", "FAILED"].includes(outcome?.terminalState)
                || ["SOURCE_RESULT_UNCONFIRMED", "WING_RANK_PROVIDER_WALL", "SERP_PROVIDER_WALL", "COLLECTION_CANCELLED"].includes(outcome.errorCode)) {
                interrupted = true;
                break;
              }
              if (next < pending.length) await sleep(kind === "wing"
                ? randomDelayMs(1200, 2500) : randomDelayMs(4000, 8000));
            }
            if (enrich && !interrupted && !dispatch.cancelled) await afterBatch({
              environmentId, idempotencyKey, isCancelled: () => dispatch.cancelled,
              setCancelActive: (cancel) => { dispatch.cancelActive = cancel; },
            });
          } finally {
            if (!dispatch.cancelled) for (const attempt of pending.slice(next)) {
              await sourceOwner.fail({ environmentId, attemptId: attempt.attemptId,
                code: "COLLECTION_INTERRUPTED", message: "앞선 키워드 수집이 중단되어 실행하지 못했습니다." });
            }
          }
        })()).catch((error) => console.error("[KIDITEM] Rank batch transport:", error?.message))
          .finally(() => dispatches.delete(key));
        return { success: true, started: true };
      }).catch((error) => { dispatches.delete(key); throw error; });
      return dispatch.started;
    }
    async function cancel({ environmentId, idempotencyKey }) {
      const key = `${environmentId}:${idempotencyKey}`;
      const existing = cancellations.get(key);
      if (existing) return existing;

      const dispatch = dispatches.get(key);
      if (dispatch) dispatch.cancelled = true;
      const clearCancellation = () => {
        if (cancellations.get(key) === cancellation) cancellations.delete(key);
      };
      const cleanupLocal = async (batch) => sourceOwner.cancelLocal({
        environmentId,
        attemptIds: batch.attempts
          .filter((attempt) => attempt.state !== "RUNNING")
          .map((attempt) => attempt.attemptId),
      });
      const continueCancellation = async (batch, pending) => {
        // The first server response is the acceptance fence. Only after it
        // confirms terminal members may local owned tabs be closed.
        await cleanupLocal(batch);
        if (dispatch?.cancelActive) await dispatch.cancelActive();
        while (pending > 0) {
          batch = await cancelRequest(environmentId, idempotencyKey);
          await cleanupLocal(batch);
          const nextPending = batch.attempts.filter(
            (attempt) => attempt.state === "RUNNING",
          ).length;
          if (nextPending >= pending) {
            throw new Error("순위 수집 취소 요청이 진행되지 않았습니다.");
          }
          pending = nextPending;
        }
      };
      const cancellation = (async () => {
        try {
          const batch = await cancelRequest(environmentId, idempotencyKey);
          const pending = batch.attempts.filter(
            (attempt) => attempt.state === "RUNNING",
          ).length;
          keepAlive(continueCancellation(batch, pending))
            .catch((error) => {
              console.error("[KIDITEM] Rank batch cancellation:", error?.message || error);
            })
            .finally(clearCancellation);
          // This acknowledges server-accepted cancellation only. The owner
          // batch remains the source of truth until polling sees all terminal.
          return { success: true };
        } catch (error) {
          clearCancellation();
          throw error;
        }
      })();
      cancellations.set(key, cancellation);
      return cancellation;
    }
    return Object.freeze({ start, cancel });
  }
  root.KidItemKeywordRankBatch = Object.freeze({ create, parseStart });
})(globalThis);
