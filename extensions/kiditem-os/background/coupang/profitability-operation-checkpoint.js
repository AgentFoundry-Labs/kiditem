// KIDITEM OS — 수익성 광고 보고서 슬라이스 재개 체크포인트
//
// MV3 서비스워커는 보고서 생성 대기 중에도 중단될 수 있다. 같은 server
// operation attempt가 다시 시작되면 이 체크포인트의 collection run ID를
// 재사용해 content script의 in-flight Promise와 기존 보고서를 이어받는다.

(function installProfitabilityOperationCheckpoint(root) {
  "use strict";

  const STORAGE_KEY = "kiditem_profitability_ad_operation_checkpoints_v1";
  let mutationQueue = Promise.resolve();

  function validText(value, maximum = 200) {
    return typeof value === "string" && value.length > 0 && value.length <= maximum;
  }

  function validInput(input) {
    return input && typeof input === "object" &&
      validText(input.environmentId, 40) &&
      validText(input.operationRunId) &&
      validText(input.attemptToken) &&
      validText(input.sliceId) &&
      typeof input.createRunId === "function";
  }

  function sameCheckpoint(checkpoint, input) {
    return checkpoint && typeof checkpoint === "object" &&
      checkpoint.environmentId === input.environmentId &&
      checkpoint.operationRunId === input.operationRunId &&
      checkpoint.attemptToken === input.attemptToken &&
      checkpoint.sliceId === input.sliceId &&
      validText(checkpoint.collectionRunId);
  }

  function enqueueMutation(operation) {
    const result = mutationQueue.catch(() => undefined).then(operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function create(options = {}) {
    const chromeApi = options.chrome;
    const now = options.now || Date.now;
    if (!chromeApi?.storage?.local) {
      throw new Error("Profitability checkpoint storage is required");
    }

    async function read() {
      const stored = await chromeApi.storage.local.get(STORAGE_KEY);
      const checkpoints = stored?.[STORAGE_KEY];
      return checkpoints && typeof checkpoints === "object" && !Array.isArray(checkpoints)
        ? checkpoints
        : {};
    }

    async function getOrCreate(input) {
      if (!validInput(input)) {
        throw new Error("Profitability checkpoint input is required");
      }
      return enqueueMutation(async () => {
        const checkpoints = await read();
        const current = checkpoints[input.operationRunId];
        if (sameCheckpoint(current, input)) return current.collectionRunId;

        const collectionRunId = input.createRunId();
        if (!validText(collectionRunId)) {
          throw new Error("Profitability checkpoint collection run ID is required");
        }
        checkpoints[input.operationRunId] = {
          environmentId: input.environmentId,
          operationRunId: input.operationRunId,
          attemptToken: input.attemptToken,
          sliceId: input.sliceId,
          collectionRunId,
          updatedAt: Number(now()),
        };
        await chromeApi.storage.local.set({ [STORAGE_KEY]: checkpoints });
        return collectionRunId;
      });
    }

    async function clear(input) {
      if (!input || typeof input !== "object") return false;
      return enqueueMutation(async () => {
        const checkpoints = await read();
        const current = checkpoints[input.operationRunId];
        if (!sameCheckpoint(current, input)) return false;
        delete checkpoints[input.operationRunId];
        await chromeApi.storage.local.set({ [STORAGE_KEY]: checkpoints });
        return true;
      });
    }

    return Object.freeze({ clear, getOrCreate });
  }

  root.KidItemProfitabilityOperationCheckpoint = Object.freeze({ create });
})(globalThis);
