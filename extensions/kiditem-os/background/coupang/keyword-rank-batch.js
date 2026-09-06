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
    async function read(environmentId, idempotencyKey) {
      const response = await request(environmentId, `/api/ads/keyword-rank/${kind}/batch-attempts`, {
        method: "GET", headers: { "Idempotency-Key": idempotencyKey },
      });
      if (!response.ok) throw new Error(`순위 수집 대상 조회 실패 (${response.status})`);
      const batch = await response.json();
      if (!Array.isArray(batch?.attempts)) throw new Error("Invalid keyword rank batch response");
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
      const dispatch = dispatches.get(`${environmentId}:${idempotencyKey}`);
      if (dispatch) {
        dispatch.cancelled = true;
        if (dispatch.cancelActive) await dispatch.cancelActive();
      }
      const batch = await read(environmentId, idempotencyKey);
      for (const attempt of batch.attempts) {
        if (attempt.state !== "RUNNING") continue;
        await sourceOwner.fail({ environmentId, attemptId: attempt.attemptId,
          code: "COLLECTION_CANCELLED", message: "키워드 순위 수집이 취소되었습니다." });
      }
      return { success: true };
    }
    return Object.freeze({ start, cancel });
  }
  root.KidItemKeywordRankBatch = Object.freeze({ create, parseStart });
})(globalThis);
