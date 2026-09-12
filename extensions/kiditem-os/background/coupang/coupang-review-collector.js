// 쿠팡 Wing 상품평 수집기.
//
// 쿠팡은 판매자 상품평을 Open API 로 주지 않는다. Wing 상품평 화면
// (`/tenants/cs/product/review`)이 쓰는 내부 엔드포인트를 백그라운드 Wing 탭
// 안에서 그대로 호출해(=세션 쿠키 크롤링) Orders 리뷰 source owner의
// attempt-fenced chunk endpoint로 넘긴다.
//
// 라이브에서 확인한 Wing 제약:
// - `startTime`~`endTime` 은 **1개월 이내**여야 한다. 넘기면
//   `"검색 기간은 1개월 이내로 지정해주세요."` 로 거절된다. → 월 단위로 쪼갠다.
// - `pageSize` 상한은 50 이다. 100 은 `"오류가 발생했습니다"` 로 거절된다.
// - `salesStatus: ""` 가 전체(판매중 + 판매중지)다. 화면 기본값 `"true"`(판매중)만
//   쓰면 판매중지 상품 리뷰가 통째로 빠진다.
// - XSRF 헤더는 필요 없다(쿠키만으로 200).
(function initializeCoupangReviewCollector(root) {
  "use strict";

  const STATE_KEY = "kiditem_coupang_review_collection";
  const PRODUCER = "orders.coupang_reviews";
  const REVIEW_PAGE_URL = "https://wing.coupang.com/tenants/cs/product/review";
  const SEARCH_ENDPOINT =
    "https://wing.coupang.com/tenants/cs/product/review/search";

  const PAGE_SIZE = 50;
  const MAX_PAGES_PER_MONTH = 40;
  const INGEST_CHUNK = 200;
  const REQUEST_DELAY_MS = 350;

  // A service worker can receive a cancel message while storage is slow (or
  // while a tab is still being created). Keep the stop fence in memory first,
  // then use the persisted checkpoint for recovery after a worker restart.
  const activeRuns = new Map();
  const stateMutationQueues = new Map();
  const CANCELLATION_REQUESTED = "COUPANG_REVIEW_CANCELLATION_REQUESTED";

  /**
   * @param {{ attemptId?: string, attemptToken?: string, plan?: object }} message
   * @param {{ authedFetch: Function, stateKey?: string, createTab: Function,
   *           waitForTabComplete: Function, removeTab: Function }} dependencies
   */
  async function start(message, dependencies) {
    const control = parseControl(message);
    const stateKey = dependencies.stateKey || STATE_KEY;

    const inMemory = activeRuns.get(stateKey);
    if (inMemory?.runId === control.attemptId && !inMemory.terminal) {
      return {
        success: true,
        started: false,
        ...publicStatus(inMemory.state || {
          producer: PRODUCER,
          runId: control.attemptId,
          status: "running",
          months: control.plan.months,
          total: control.plan.windows.length,
          completed: 0,
          collected: 0,
          created: 0,
          updated: 0,
          linked: 0,
          unlinked: 0,
          current: null,
          failures: [],
          error: null,
          cancelRequested: !!inMemory.stopRequested,
          startedAt: inMemory.startedAt,
          endedAt: null,
        }),
      };
    }
    if (inMemory && !inMemory.terminal && inMemory.runId !== control.attemptId) {
      return {
        success: false,
        started: false,
        error: "이미 쿠팡 리뷰 수집이 진행 중입니다",
        runId: inMemory.runId,
        status: "running",
      };
    }

    // Reserve this state key before the first storage await. Two duplicate
    // start messages arriving while chrome.storage is slow therefore share a
    // single generation and cannot each launch a provider tab.
    const reservation = {
      runId: control.attemptId,
      stateKey,
      initializing: true,
      stopRequested: false,
      terminal: false,
      ownerCancellationAcknowledged: false,
      cancellationPromise: null,
      creationPending: true,
      tabIds: new Set(),
      startedAt: Date.now(),
      state: null,
    };
    activeRuns.set(stateKey, reservation);

    let current;
    try {
      current = await getState(stateKey);
    } catch (error) {
      if (activeRuns.get(stateKey) === reservation) activeRuns.delete(stateKey);
      throw error;
    }
    if (current?.runId === control.attemptId && current.status && current.status !== "running") {
      // Idempotent replays of terminal owner attempts are reads. Never open a
      // new provider tab for a COMPLETE/FAILED/CANCELLED generation.
      if (activeRuns.get(stateKey) === reservation) activeRuns.delete(stateKey);
      return { success: true, started: false, ...publicStatus(current) };
    }
    if (hasPendingOwnedTabs(current)) {
      // A terminal owner state can still own a provider tab while the local
      // close/ledger acknowledgement is pending. Keep this state key fenced;
      // replacing it would lose the only durable tab id available to retry.
      if (activeRuns.get(stateKey) === reservation) activeRuns.delete(stateKey);
      if (current.runId === control.attemptId) {
        return { success: true, started: false, ...publicStatus(current) };
      }
      return {
        success: false,
        started: false,
        error: "이미 쿠팡 리뷰 수집 탭 정리가 진행 중입니다",
        runId: current.runId,
        status: current.status,
      };
    }
    if (current?.status === "running" && !isStale(current)) {
      if (current.runId === control.attemptId) {
        // A lost dispatch may be retried by the web owner. Re-acknowledge the
        // same attempt without starting a second crawler; chunk receipts are
        // owned and fenced by the server attempt.
        if (activeRuns.get(stateKey) === reservation) activeRuns.delete(stateKey);
        return {
          success: true,
          started: false,
          ...publicStatus(current),
        };
      }
      if (activeRuns.get(stateKey) === reservation) activeRuns.delete(stateKey);
      return {
        success: false,
        started: false,
        error: "이미 쿠팡 리뷰 수집이 진행 중입니다",
        ...publicStatus(current),
      };
    }

    const windows = control.plan.windows;
    const runId = control.attemptId;
    const months = control.plan.months;
    const state = {
      producer: PRODUCER,
      runId,
      status: "running",
      months,
      total: windows.length,
      completed: 0,
      collected: 0,
      created: 0,
      updated: 0,
      linked: 0,
      unlinked: 0,
      current: null,
      failures: [],
      error: null,
      cancelRequested: false,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
      endedAt: null,
      // Recovery may outlive this service-worker instance. Keep only the tab
      // ids needed to close resources after the owner acknowledges cancel;
      // the server-issued attempt token never enters extension storage.
      ownedTabIds: [],
    };

    // Publish the new generation through the same queue used by every old
    // generation. Old delayed cancellation writes therefore cannot win a
    // last-write race over this checkpoint.
    const runRecord = reservation;
    Object.assign(runRecord, {
      initializing: false,
      startedAt: state.startedAt,
      state,
    });
    activeRuns.set(stateKey, runRecord);
    try {
      await replaceState(stateKey, state);
    } catch (error) {
      if (activeRuns.get(stateKey) === runRecord) activeRuns.delete(stateKey);
      throw error;
    }

    // A cancel can arrive while the initial storage write is pending. The
    // record above is the synchronous local fence that makes that safe.
    if (runRecord.stopRequested) {
      runRecord.creationPending = false;
      const requested = { ...state, cancelRequested: true, heartbeatAt: Date.now() };
      await updateStateForRun(stateKey, runId, () => requested);
      await requestCancellation(runRecord, dependencies, requested, stateKey);
      return { success: true, started: true, ...publicStatus(state) };
    }

    // 대기하지 않는다. 웹은 runId 를 받고 status 폴링으로 진행률을 본다.
    run(windows, state, stateKey, dependencies, control, runRecord).catch(async (error) => {
      await failOwner(
        control,
        "REVIEW_COLLECTION_FAILED",
        error?.message || "쿠팡 리뷰 수집 실패",
        dependencies,
      ).catch(() => {});
      try {
        await updateStateForRun(stateKey, runId, (latest) => {
          if (latest.cancelRequested || latest.status !== "running") return latest;
          return {
            ...latest,
            status: "error",
            error: error?.message || "쿠팡 리뷰 수집 실패",
            endedAt: Date.now(),
            ownedTabIds: latest.ownedTabIds || [],
          };
        });
      } catch {
        // The tab-finally path still owns cleanup; a failed checkpoint write
        // must not surface as an unhandled service-worker rejection.
      }
      // A failed run may still own a provider tab if the final close (or its
      // checkpoint ledger write) failed. Keep the record live until both ACK.
      await acknowledgeRunCleanup(stateKey, runId, runRecord);
    });

    return { success: true, started: true, ...publicStatus(state) };
  }

  async function getStatus(runId, stateKey) {
    const state = await getState(stateKey || STATE_KEY);
    if (!state || (runId && state.runId !== runId)) {
      return { runId: runId || null, status: "idle" };
    }
    return publicStatus(state);
  }

  async function cancel(runId, stateKey, dependencies) {
    const key = stateKey || STATE_KEY;
    const record = activeRuns.get(key);

    // This assignment intentionally precedes every storage read. It is the
    // provider fence used by an in-flight crawl when chrome.storage is slow.
    if (record && (!runId || record.runId === runId)) {
      record.stopRequested = true;
    } else if (record && runId && record.runId !== runId) {
      // A delayed cancel for an old generation must not touch the new one.
      return { success: true, cancelled: false, runId };
    }

    let state;
    try {
      state = await getState(key);
    } catch {
      return { success: true, cancelled: false, pending: true, runId: runId || null };
    }
    if (!state || (runId && state.runId !== runId)) {
      return { success: true, cancelled: false, runId: runId || null };
    }
    if (state.status !== "running") {
      return { success: true, cancelled: false, runId: state.runId };
    }
    const requested = { ...state, cancelRequested: true, heartbeatAt: Date.now() };
    try {
      await updateStateForRun(key, state.runId, () => requested);
    } catch {
      // The memory fence is already active. Keep the owner cancellation path
      // running, but report a pending result if the durable intent cannot be
      // written.
      if (!dependencies || typeof dependencies.authedFetch !== "function") {
        return { success: true, cancelled: false, pending: true, runId: state.runId };
      }
    }
    const settled = await requestCancellation(
      record && record.runId === state.runId ? record : null,
      dependencies,
      requested,
      key,
    );
    return {
      success: true,
      cancelled: settled,
      pending: !settled,
      runId: state.runId,
    };
  }

  /**
   * Cancel only an already-running review attempt. This is intentionally not
   * a recovery/resume path: after a worker restart we read a fresh owner
   * control, fence the owner, and close the persisted owned tab only after the
   * owner accepts the cancellation.
   */
  async function cancelAdditionalCollections(dependencies) {
    const key = dependencies.stateKey || STATE_KEY;
    const record = activeRuns.get(key);
    if (record && !record.terminal) record.stopRequested = true;
    const state = await getState(key);
    if (!state || state.status !== "running") return record?.terminal !== false;
    if (record && record.runId !== state.runId) return true;
    const requested = state.cancelRequested
      ? state
      : { ...state, cancelRequested: true, heartbeatAt: Date.now() };
    if (requested !== state) {
      try {
        await updateStateForRun(key, state.runId, () => requested);
      } catch {
        return false;
      }
    }
    return requestCancellation(
      record && record.runId === state.runId ? record : null,
      dependencies,
      requested,
      key,
    );
  }

  /** Retry a persisted stop request after the verified auth handoff seam. */
  async function retryAdditionalCollections(dependencies) {
    const key = dependencies.stateKey || STATE_KEY;
    const state = await getState(key);
    const record = activeRuns.get(key);
    if (!state) return true;
    if (state.status === "running") {
      if (!state.cancelRequested) {
        // A healthy running collection is not a pending cleanup. In
        // particular, reopening the web app must never close its provider tab.
        return record?.runId === state.runId && record.stopRequested ? false : true;
      }
      if (record && record.runId !== state.runId) return true;
      return requestCancellation(
        record && record.runId === state.runId ? record : null,
        dependencies,
        state,
        key,
      );
    }
    // Terminal owner states can still have a tab whose close was not
    // acknowledged. Retry only that cleanup; never reopen provider work.
    if (Array.isArray(state.ownedTabIds) && state.ownedTabIds.length > 0) {
      const ownedRecord = record && record.runId === state.runId ? record : null;
      const remaining = await closeOwnedTabs(state.ownedTabIds, dependencies, ownedRecord);
      try {
        await updateStateForRun(key, state.runId, (latest) => ({
          ...latest,
          ownedTabIds: remaining,
          heartbeatAt: Date.now(),
        }));
      } catch {
        return false;
      }
      if (ownedRecord && remaining.length === 0) {
        await acknowledgeRunCleanup(key, state.runId, ownedRecord);
      }
      return remaining.length === 0;
    }
    return true;
  }

  function requestCancellation(record, dependencies, state, stateKey) {
    if (record?.cancellationPromise) return record.cancellationPromise;
    const operation = settleCancellation(record, state, stateKey, dependencies);
    if (record) {
      const tracked = operation.finally(() => {
        if (record.cancellationPromise === tracked) record.cancellationPromise = null;
      });
      record.cancellationPromise = tracked;
      return tracked;
    }
    return operation;
  }

  async function settleCancellation(record, state, stateKey, dependencies) {
    if (!dependencies || typeof dependencies.authedFetch !== "function") return false;
    const runId = state.runId;
    const ownedTabIds = record
      ? [...record.tabIds]
      : (Array.isArray(state.ownedTabIds) ? [...state.ownedTabIds] : []);
    try {
      // The control response is held only in this call stack. It is never
      // copied into the durable review state.
      let ownerResult = {
        acknowledged: !!(record?.ownerCancellationAcknowledged || state.ownerCancelAcknowledged),
        state: null,
      };
      if (!ownerResult.acknowledged) {
        const control = await readAttemptControl(runId, dependencies);
        ownerResult = await cancelOwner(control, dependencies);
      }
      if (!ownerResult.acknowledged) {
        if (!ownerResult.terminal) {
          await updateStateForRun(stateKey, runId, (latest) => ({
            ...latest,
            status: "running",
            cancelRequested: true,
            ownerCancelAcknowledged: false,
            ownedTabIds: mergeOwnedTabIds(
              latest.ownedTabIds,
              record ? [...record.tabIds] : ownedTabIds,
            ),
            heartbeatAt: Date.now(),
          }));
          return false;
        }
        if (record?.creationPending && record.tabIds.size === 0) {
          // The owner is already terminal, but createTab has not acknowledged
          // yet. Keep the local generation pending so a late tab cannot be
          // orphaned while the terminal truth is reconciled below.
          await updateStateForRun(stateKey, runId, (latest) => ({
            ...latest,
            status: "running",
            cancelRequested: true,
            ownerCancelAcknowledged: false,
            ownedTabIds: mergeOwnedTabIds(latest.ownedTabIds, ownedTabIds),
            heartbeatAt: Date.now(),
          }));
          return false;
        }
        // A terminal owner (notably COMPLETE) is not a local cancellation.
        // Preserve terminal truth and never manufacture `cancelled`.
        const terminalStatus = ownerResult.state === "FAILED" ? "error" : "done";
        const remainingTabIds = await closeOwnedTabs(
          record ? [...record.tabIds] : ownedTabIds,
          dependencies,
          record,
        );
        const currentAfterOwner = await getState(stateKey);
        if (!currentAfterOwner || currentAfterOwner.runId !== runId) return false;
        await updateStateForRun(stateKey, runId, (latest) => ({
          ...latest,
          status: terminalStatus,
          cancelRequested: false,
          ownedTabIds: remainingTabIds,
          ownerCancelAcknowledged: false,
          endedAt: latest.endedAt || Date.now(),
          heartbeatAt: Date.now(),
        }));
        if (record) {
          record.ownerCancellationAcknowledged = false;
          record.terminal = remainingTabIds.length === 0;
          if (record.terminal && activeRuns.get(stateKey) === record) activeRuns.delete(stateKey);
        }
        return remainingTabIds.length === 0;
      }
      if (record) record.ownerCancellationAcknowledged = true;
      if (record?.creationPending && record.tabIds.size === 0) {
        // The owner is fenced, but createTab has not acknowledged yet. Keep
        // the old generation pending so its late tab can be closed before the
        // cancellation becomes terminal and a new generation is admitted.
        await updateStateForRun(stateKey, runId, (latest) => ({
          ...latest,
          status: "running",
          cancelRequested: true,
          ownerCancelAcknowledged: true,
          ownedTabIds: [],
          heartbeatAt: Date.now(),
        }));
        return false;
      }
      await updateStateForRun(stateKey, runId, (latest) => ({
        ...latest,
        ownerCancelAcknowledged: true,
        cancelRequested: true,
        heartbeatAt: Date.now(),
      }));

      const remainingTabIds = await closeOwnedTabs(
        record ? [...record.tabIds] : ownedTabIds,
        dependencies,
        record,
      );
      const hasPendingTab = remainingTabIds.length > 0;
      const currentAfterOwner = await getState(stateKey);
      if (!currentAfterOwner || currentAfterOwner.runId !== runId) return false;
      if (hasPendingTab) {
        await updateStateForRun(stateKey, runId, (latest) => ({
          ...latest,
          status: "running",
          cancelRequested: true,
          ownerCancelAcknowledged: true,
          ownedTabIds: remainingTabIds,
          heartbeatAt: Date.now(),
        }));
        return false;
      }

      // The exact run-id check happens inside the queued mutation. If a new
      // run replaced this state while owner HTTP was in flight, this is a
      // no-op and cannot cancel or clear the new generation.
      await updateStateForRun(stateKey, runId, (latest) => ({
        ...latest,
        status: "cancelled",
        cancelRequested: false,
        ownerCancelAcknowledged: false,
        ownedTabIds: [],
        endedAt: Date.now(),
        heartbeatAt: Date.now(),
      }));
      if (record) {
        record.terminal = true;
        record.creationPending = false;
        if (activeRuns.get(stateKey) === record) activeRuns.delete(stateKey);
      }
      return true;
    } catch {
      // Keep the local fence and token-free cancellation intent. The common
      // web-app lifetime adapter retries only this persisted pending request
      // after a verified auth handoff or app reopen.
      try {
        await updateStateForRun(stateKey, runId, (latest) => ({
          ...latest,
          status: "running",
          cancelRequested: true,
          ownedTabIds: mergeOwnedTabIds(
            latest.ownedTabIds,
            record ? [...record.tabIds] : ownedTabIds,
          ),
          heartbeatAt: Date.now(),
        }));
      } catch {
        // Preserve the in-memory stop fence and owned ids for this worker;
        // callers must keep the cancellation pending when persistence fails.
      }
      return false;
    }
  }

  async function readAttemptControl(runId, dependencies) {
    const response = await dependencies.authedFetch(
      `/api/reviews/attempts/${encodeURIComponent(runId)}/control`,
    );
    if (!response?.ok) {
      throw new Error(`리뷰 수집 허가 조회 실패 (${response?.status ?? 0})`);
    }
    const control = await response.json().catch(() => null);
    if (
      !control ||
      control.attemptId !== runId ||
      typeof control.attemptToken !== "string" ||
      !control.attemptToken
    ) {
      throw new Error("리뷰 수집 허가 응답이 유효하지 않습니다");
    }
    return control;
  }

  async function closeOwnedTabs(tabIds, dependencies, record) {
    const ids = Array.isArray(tabIds) ? tabIds : [];
    const remaining = [];
    for (const tabId of ids) {
      if (!Number.isInteger(tabId)) continue;
      try {
        await removeOwnedTab(tabId, dependencies);
        if (record) record.tabIds.delete(tabId);
      } catch {
        // A failed close is not an acknowledgement. Keep the id persisted so
        // the retry seam can close it later; never clear it optimistically.
        remaining.push(tabId);
      }
    }
    return remaining;
  }

  async function removeOwnedTab(tabId, dependencies) {
    const result = await dependencies.removeTab(tabId);
    if (result === false || result?.success === false) {
      throw new Error(`쿠팡 리뷰 탭 닫기 확인 실패 (${tabId})`);
    }
    return result;
  }

  async function run(windows, initialState, stateKey, dependencies, control, record) {
    let state = initialState;
    let tabId = null;
    try {
      if (record.stopRequested && record.creationPending && record.tabIds.size === 0) {
        // The cancel arrived after admission but before createTab started.
        // There is no late creation to await in this branch.
        record.creationPending = false;
      }
      await throwIfStopped(record, stateKey);
      tabId = await openReviewTab(dependencies, record, stateKey);
      record.creationPending = false;
      if (record.tabLedgerError) {
        if (record.stopRequested || await isStopped(record, stateKey)) {
          await requestCancellation(record, dependencies, {
            ...(await getState(stateKey) || state),
            runId: control.attemptId,
            cancelRequested: true,
          }, stateKey);
          return;
        }
        throw record.tabLedgerError;
      }
      if (Number.isInteger(tabId)) {
        if (!record.tabIds.has(tabId)) record.tabIds.add(tabId);
        await updateStateForRun(stateKey, control.attemptId, (latest) => ({
          ...latest,
          ownedTabIds: [...record.tabIds],
          heartbeatAt: Date.now(),
        }));
      }
      if (await isStopped(record, stateKey)) {
        await requestCancellation(record, dependencies, {
          ...(await getState(stateKey) || state),
          runId: control.attemptId,
          cancelRequested: true,
        }, stateKey);
        return;
      }
      for (const window of windows) {
        await throwIfStopped(record, stateKey);
        const latest = await getState(stateKey);
        if (!latest || latest.runId !== control.attemptId || latest.status !== "running" || latest.cancelRequested) {
          await requestCancellation(record, dependencies, {
            ...(latest || state),
            runId: control.attemptId,
            cancelRequested: true,
          }, stateKey);
          return;
        }
        state = { ...(latest || state), current: window.label };
        await updateStateForRun(stateKey, control.attemptId, (currentState) => ({
          ...currentState,
          current: state.current,
          heartbeatAt: Date.now(),
        }));

        try {
          const capture = await collectMonth(
            tabId,
            window,
            dependencies,
            control.plan.maxPagesPerWindow,
            () => isStopped(record, stateKey),
          );
          await throwIfStopped(record, stateKey);
          const result = await postReviews(
            capture.rows,
            window.index,
            capture.pageCount,
            capture.pageLimitReached,
            control,
            dependencies,
            () => isStopped(record, stateKey),
          );
          await throwIfStopped(record, stateKey);
          state = {
            ...state,
            collected: result.collected ?? state.collected + capture.rows.length,
            created: result.created ?? state.created,
            updated: result.updated ?? state.updated,
            linked: result.linked ?? state.linked,
            unlinked: result.unlinked ?? state.unlinked,
          };
        } catch (error) {
          if (error?.code === CANCELLATION_REQUESTED || await isStopped(record, stateKey)) {
            await requestCancellation(record, dependencies, {
              ...(await getState(stateKey) || state),
              runId: control.attemptId,
              cancelRequested: true,
            }, stateKey);
            return;
          }
          const message = error?.message || String(error);
          await failOwner(control, "REVIEW_COLLECTION_WINDOW_FAILED", `${window.label}: ${message}`, dependencies).catch(() => {});
          state = { ...state, status: "error", error: message, endedAt: Date.now() };
          await updateStateForRun(stateKey, control.attemptId, (currentState) => {
            if (currentState.cancelRequested || currentState.status !== "running") return currentState;
            return { ...currentState, ...state, heartbeatAt: Date.now() };
          });
          return;
        }
        await throwIfStopped(record, stateKey);
        state = { ...state, completed: state.completed + 1 };
        await updateStateForRun(stateKey, control.attemptId, (currentState) =>
          currentState.cancelRequested
            ? currentState
            : {
              ...currentState,
              ...state,
              ownedTabIds: [...record.tabIds],
              heartbeatAt: Date.now(),
            },
        );
      }
      await throwIfStopped(record, stateKey);
      const terminal = await completeOwner(control, dependencies);
      await throwIfStopped(record, stateKey);
      const completedState = await updateStateForRun(stateKey, control.attemptId, (currentState) => {
        if (currentState.cancelRequested || currentState.status !== "running") return currentState;
        const nextState = {
          ...currentState,
          ...state,
          status: "done",
          current: null,
          collected: terminal.collected ?? state.collected,
          created: terminal.created ?? state.created,
          updated: terminal.updated ?? state.updated,
          linked: terminal.linked ?? state.linked,
          unlinked: terminal.unlinked ?? state.unlinked,
          endedAt: Date.now(),
          // The owner is terminal, but the provider tab is not released until
          // the physical close and this checkpoint's ledger update both ACK.
          ownedTabIds: [...record.tabIds],
        };
        record.state = nextState;
        return nextState;
      });
      if (completedState?.runId === control.attemptId) record.state = completedState;
    } catch (error) {
      if (error?.code === CANCELLATION_REQUESTED || await isStopped(record, stateKey)) {
        if (record.creationPending && record.tabIds.size === 0) record.creationPending = false;
        await requestCancellation(record, dependencies, {
          ...(await getState(stateKey) || state),
          runId: control.attemptId,
          cancelRequested: true,
        }, stateKey);
        return;
      }
      throw error;
    } finally {
      // A pending cancellation deliberately keeps failed tab ids in storage.
      // A tab created after the cancel fence is still owned by this record and
      // is closed here; it can never resume provider work.
      if (tabId != null && record.tabIds.has(tabId)) {
        try {
          await removeOwnedTab(tabId, dependencies);
          record.tabIds.delete(tabId);
          try {
            await updateStateForRun(stateKey, control.attemptId, (latest) => ({
              ...latest,
              ownedTabIds: (latest.ownedTabIds || []).filter((id) => id !== tabId),
              heartbeatAt: Date.now(),
            }));
          } catch {
            // The close was acknowledged; a later lifecycle retry may repair
            // the ledger if this write failed.
          }
        } catch {
          try {
            await updateStateForRun(stateKey, control.attemptId, (latest) => ({
              ...latest,
              ownedTabIds: Array.from(new Set([...(latest.ownedTabIds || []), tabId])),
              heartbeatAt: Date.now(),
            }));
          } catch {
            // Keep the in-memory owned id until this worker exits.
          }
        }
      }
      await acknowledgeRunCleanup(stateKey, control.attemptId, record);
    }
  }

  async function acknowledgeRunCleanup(stateKey, runId, record) {
    if (activeRuns.get(stateKey) !== record || record.tabIds.size > 0) return false;
    const latest = await getState(stateKey).catch(() => null);
    if (!latest || latest.runId !== runId || hasPendingOwnedTabs(latest)) return false;
    if (latest.status === "running") return false;
    record.terminal = true;
    record.creationPending = false;
    activeRuns.delete(stateKey);
    return true;
  }

  async function throwIfStopped(record, stateKey) {
    if (await isStopped(record, stateKey)) {
      const error = new Error(CANCELLATION_REQUESTED);
      error.code = CANCELLATION_REQUESTED;
      throw error;
    }
  }

  async function isStopped(record, stateKey) {
    // Check memory before the storage await. This is the critical lifetime
    // fence when a cancel arrives during a delayed storage operation.
    if (!record || record.stopRequested) return true;
    const latest = await getState(stateKey);
    // Re-check memory after the await as well: a cancel can arrive while the
    // storage read is in flight and the returned snapshot may be stale.
    return record.stopRequested || !latest || latest.runId !== record.runId ||
      latest.status !== "running" || !!latest.cancelRequested;
  }

  async function openReviewTab(dependencies, record, stateKey) {
    await throwIfStopped(record, stateKey);
    const tab = await dependencies.createTab({
      url: REVIEW_PAGE_URL,
      active: false,
    });
    if (Number.isInteger(tab?.id)) {
      record.creationPending = false;
      record.tabIds.add(tab.id);
      try {
        await updateStateForRun(stateKey, record.runId, (latest) => ({
          ...latest,
          ownedTabIds: [...new Set([...(latest.ownedTabIds || []), tab.id])],
          heartbeatAt: Date.now(),
        }));
      } catch (error) {
        // Return the tab id to the caller even when the ledger write fails so
        // run/finally can close this exact tab. Provider work must not start
        // from an unledgered tab.
        record.tabLedgerError = error;
      }
      // Close-before-creation ACK race: cancellation may have completed while
      // createTab was pending. Register and close this old run's tab only.
      if (record.stopRequested || record.ownerCancellationAcknowledged || record.terminal) {
        if (record.tabIds.has(tab.id)) {
          try {
            await removeOwnedTab(tab.id, dependencies);
            record.tabIds.delete(tab.id);
          } catch {
            // The late tab is still owned by this old run. Keep it in the
            // checkpoint so a retry can close it; never resume after the fence.
            record.terminal = false;
            await updateStateForRun(stateKey, record.runId, (latest) => ({
              ...latest,
              status: "running",
              cancelRequested: true,
              ownerCancelAcknowledged: !!record.ownerCancellationAcknowledged,
              ownedTabIds: Array.from(new Set([...(latest.ownedTabIds || []), tab.id])),
              heartbeatAt: Date.now(),
            }));
          }
        }
        return null;
      }
    }
    if (await isStopped(record, stateKey)) return tab?.id ?? null;
    await dependencies
      .waitForTabComplete(tab.id, {
        expectedUrl: REVIEW_PAGE_URL,
        timeoutMs: 45000,
      })
      .catch(() => false);
    // Return the acknowledged tab id even if the fence arrived during the
    // wait. The caller/finally path now owns the id and can retry a failed
    // close instead of losing it to a rejected await.
    return tab.id;
  }

  /** 한 달치 상품평 전 페이지 수집. Wing 이 1개월/50건 상한이라 월 단위로만 돈다. */
  async function collectMonth(tabId, window, dependencies, maxPages, isCancelled) {
    const rows = [];
    let totalPages = 0;
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_MONTH; pageIndex += 1) {
      if (await isCancelled()) throw cancellationError();
      const response = await executeReviewSearch(tabId, {
        startTime: window.start,
        endTime: window.end,
        rating: "",
        // "" = 판매중 + 판매중지 전체. 화면 기본값("true")은 판매중지 상품을 빠뜨린다.
        salesStatus: "",
        advancedType: "productName",
        advancedInput: "",
        pageIndex,
        pageSize: PAGE_SIZE,
        productName: "",
      });
      if (await isCancelled()) throw cancellationError();
      if (!response?.ok) {
        throw new Error(
          response?.error ||
            `${window.label} 상품평 조회 실패 (${response?.status ?? 0})`,
        );
      }
      const body = response.body;
      if (body?.code !== "OK") {
        throw new Error(`${window.label} 상품평 조회 거절: ${body?.message || "unknown"}`);
      }
      const content = Array.isArray(body?.data?.content) ? body.data.content : [];
      for (const raw of content) {
        const item = normalizeReview(raw);
        if (item) rows.push(item);
      }
      totalPages = Number(body?.data?.pagination?.totalPages) || 0;
      if (pageIndex + 1 >= totalPages) break;
      if (pageIndex + 1 >= maxPages) {
        return { rows, pageCount: pageIndex + 1, pageLimitReached: true };
      }
      await delay(REQUEST_DELAY_MS);
      if (await isCancelled()) throw cancellationError();
    }
    return { rows, pageCount: totalPages, pageLimitReached: totalPages > maxPages };
  }

  function normalizeReview(raw) {
    if (!raw || raw.reviewId == null) return null;
    const rating = Number(raw.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
    const reviewedAt = Number(raw.reviewAt || raw.createdAt || 0);
    if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) return null;
    const attachment = parseAttachment(raw.attachment);
    return {
      externalReviewId: String(raw.reviewId),
      externalOptionId: raw.vendorItemId == null ? null : String(raw.vendorItemId),
      externalProductId: raw.productId == null ? null : String(raw.productId),
      itemName: nullableText(raw.itemName),
      rating: Math.round(rating),
      title: nullableText(raw.reviewTitle),
      content: nullableText(raw.reviewContent),
      reviewerName: nullableText(raw.memberName),
      reviewedAt,
      imageCount: attachment.images,
      videoCount: attachment.videos,
      isDeleted: raw.deleted === true,
      isBlinded: raw.blinded === true,
    };
  }

  async function postReviews(
    rows,
    windowIndex,
    pageCount,
    pageLimitReached,
    control,
    dependencies,
    isCancelled,
  ) {
    let terminal = null;
    let sequence = 0;
    for (let offset = 0; offset < rows.length; offset += INGEST_CHUNK) {
      const chunk = rows.slice(offset, offset + INGEST_CHUNK);
      if (chunk.length === 0) continue;
      if (await isCancelled()) throw cancellationError();
      const response = await dependencies.authedFetch(
        `/api/reviews/attempts/${control.attemptId}/chunks`,
        {
        method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source-Attempt-Token": control.attemptToken,
          },
          body: JSON.stringify({ windowIndex, sequence, items: chunk }),
        },
      );
      if (await isCancelled()) throw cancellationError();
      if (!response.ok) {
        throw new Error(`리뷰 chunk 적재 실패 (${response.status})`);
      }
      terminal = await response.json().catch(() => null);
      sequence += 1;
    }
    if (await isCancelled()) throw cancellationError();
    const completeResponse = await dependencies.authedFetch(
      `/api/reviews/attempts/${control.attemptId}/windows/${windowIndex}/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Source-Attempt-Token": control.attemptToken,
        },
        body: JSON.stringify({
          itemCount: rows.length,
          pageCount,
          pageLimitReached,
        }),
      },
    );
    if (await isCancelled()) throw cancellationError();
    if (!completeResponse.ok) {
      throw new Error(`리뷰 월 완료 처리 실패 (${completeResponse.status})`);
    }
    terminal = await completeResponse.json().catch(() => terminal || {});
    return terminal || {};
  }

  function cancellationError() {
    const error = new Error(CANCELLATION_REQUESTED);
    error.code = CANCELLATION_REQUESTED;
    return error;
  }

  async function completeOwner(control, dependencies) {
    const response = await dependencies.authedFetch(
      `/api/reviews/attempts/${control.attemptId}/complete`,
      {
        method: "POST",
        headers: { "X-Source-Attempt-Token": control.attemptToken },
      },
    );
    if (!response.ok) throw new Error(`리뷰 수집 완료 처리 실패 (${response.status})`);
    return (await response.json().catch(() => null)) || {};
  }

  async function failOwner(control, errorCode, errorMessage, dependencies) {
    const response = await dependencies.authedFetch(
      `/api/reviews/attempts/${control.attemptId}/fail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Source-Attempt-Token": control.attemptToken,
        },
        body: JSON.stringify({ errorCode, errorMessage }),
      },
    );
    if (!response.ok && response.status !== 409) {
      throw new Error(`리뷰 수집 실패 기록 실패 (${response.status})`);
    }
  }

  async function cancelOwner(control, dependencies) {
    const response = await dependencies.authedFetch(
      `/api/reviews/attempts/${control.attemptId}/cancel`,
      {
        method: "POST",
        headers: { "X-Source-Attempt-Token": control.attemptToken },
      },
    );
    if (response?.ok) return { acknowledged: true, state: null };
    if (response?.status === 409) {
      // A replay conflict may mean a terminal owner, but the conflict body is
      // not authoritative on its own. Read and validate the owner snapshot;
      // an unknown state remains pending rather than inventing COMPLETE.
      const body = await readOwnerAttempt(control.attemptId, dependencies);
      return {
        acknowledged: false,
        terminal: body?.attemptId === control.attemptId &&
          (body.state === "FAILED" || body.state === "COMPLETE"),
        state: body?.attemptId === control.attemptId ? body.state : null,
      };
    }
    throw new Error(`리뷰 수집 중단 기록 실패 (${response?.status ?? 0})`);
  }

  async function readOwnerAttempt(runId, dependencies) {
    const response = await dependencies.authedFetch(
      `/api/reviews/attempts/${encodeURIComponent(runId)}`,
    );
    if (!response?.ok || typeof response.json !== "function") return null;
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object") return null;
    return body;
  }

  function parseControl(message) {
    const attemptId = typeof message?.attemptId === "string" ? message.attemptId : null;
    const attemptToken = typeof message?.attemptToken === "string" ? message.attemptToken : null;
    const plan = message?.plan;
    if (!attemptId || !attemptToken || !plan || !Array.isArray(plan.windows) ||
      !Number.isSafeInteger(plan.months) || plan.months < 1 ||
      plan.sourceType !== "coupang_reviews" || plan.parserVersion !== "coupang-review-v1" ||
      plan.pageSize !== PAGE_SIZE || plan.maxPagesPerWindow !== MAX_PAGES_PER_MONTH ||
      plan.windows.length !== plan.months || plan.windows.some((window, index) =>
        !window || window.index !== index || typeof window.label !== "string" ||
        !/^\d{4}-\d{2}$/.test(window.label) || !/^\d{4}-\d{2}-\d{2}$/.test(window.start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(window.end))) {
      throw new Error("쿠팡 리뷰 수집 허가가 유효하지 않습니다");
    }
    return { attemptId, attemptToken, plan };
  }

  // executeScript 로 Wing 탭 안에서 실행된다. 클로저를 잡을 수 없으니 인자로만 받는다.
  async function executeReviewSearchInPage(endpoint, payload) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return {
        ok: res.ok,
        status: res.status,
        body,
        textPreview: body ? null : text.slice(0, 200),
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: null,
        error: error?.message || String(error),
      };
    }
  }

  async function executeReviewSearch(tabId, payload) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: executeReviewSearchInPage,
      args: [SEARCH_ENDPOINT, payload],
    });
    return result?.result || null;
  }

  function parseAttachment(value) {
    if (typeof value !== "string" || !value) return { images: 0, videos: 0 };
    try {
      const parsed = JSON.parse(value);
      return {
        images: Array.isArray(parsed?.imageAttachments)
          ? parsed.imageAttachments.length
          : 0,
        videos: Array.isArray(parsed?.videoAttachments)
          ? parsed.videoAttachments.length
          : 0,
      };
    } catch {
      return { images: 0, videos: 0 };
    }
  }

  function nullableText(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function publicStatus(state) {
    return {
      producer: state.producer || PRODUCER,
      runId: state.runId,
      status: state.status,
      months: state.months,
      total: state.total,
      completed: state.completed,
      collected: state.collected,
      created: state.created,
      updated: state.updated,
      linked: state.linked,
      unlinked: state.unlinked,
      current: state.current,
      failures: state.failures,
      error: state.error,
      cancelRequested: !!state.cancelRequested,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
    };
  }

  function hasPendingOwnedTabs(state) {
    return Array.isArray(state?.ownedTabIds) && state.ownedTabIds.length > 0;
  }

  function mergeOwnedTabIds(...sources) {
    return Array.from(new Set(sources.flatMap((source) =>
      Array.isArray(source) ? source.filter((id) => Number.isInteger(id)) : [])));
  }

  // 서비스워커가 수집 도중 죽으면 running 상태가 남는다. 5분 이상 heartbeat 가
  // 없으면 새 실행을 막지 않는다.
  function isStale(state) {
    const last = state.heartbeatAt || state.startedAt || 0;
    return Date.now() - last > 5 * 60 * 1000;
  }

  function getState(stateKey) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(stateKey, (data) => {
        const runtimeError = root.chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "리뷰 수집 상태 조회 실패"));
          return;
        }
        resolve(data?.[stateKey] || null);
      });
    });
  }

  function setState(stateKey, state) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [stateKey]: state }, () => {
        const runtimeError = root.chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "리뷰 수집 상태 저장 실패"));
          return;
        }
        resolve();
      });
    });
  }

  function replaceState(stateKey, state) {
    return enqueueStateMutation(stateKey, async () => {
      await setState(stateKey, state);
      return state;
    });
  }

  function updateStateForRun(stateKey, runId, updater) {
    return enqueueStateMutation(stateKey, async (current) => {
      // This exact generation check is the stale-write guard. Every old run
      // update is serialized with new-run creation and is a no-op once the
      // persisted checkpoint belongs to another attempt.
      if (!current || current.runId !== runId) return current;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (!next) return current;
      await setState(stateKey, next);
      return next;
    });
  }

  function enqueueStateMutation(stateKey, mutation) {
    const previous = stateMutationQueues.get(stateKey) || Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => mutation(await getState(stateKey)));
    stateMutationQueues.set(stateKey, operation);
    operation.finally(() => {
      if (stateMutationQueues.get(stateKey) === operation) {
        stateMutationQueues.delete(stateKey);
      }
    }).catch(() => undefined);
    return operation;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemCoupangReviewCollector = {
    cancelAdditionalCollections,
    stateKey: STATE_KEY,
    cancel,
    getStatus,
    normalizeReview,
    retryAdditionalCollections,
    start,
  };
})(globalThis);
