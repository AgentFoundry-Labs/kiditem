(function initializeCoupangCatalogImport(root) {
  "use strict";

  const ALARM_NAME = "kiditem-coupang-catalog-import-step";
  const STATE_KEY = "kiditem_coupang_catalog_import";
  const LEGACY_TAB_KEY = "kiditem_coupang_catalog_tab_id";
  const LEGACY_WINDOW_KEY = "kiditem_coupang_catalog_window_id";
  const MAX_PRODUCTS_PER_CHUNK = 20;
  const DETAIL_FETCH_TIMEOUT_MS = 45_000;
  const DETAIL_HTML_MAX_BYTES = 2_000_000;
  const DETAIL_JSON_MAX_BYTES = 2_000_000;
  const MIN_DETAIL_INTERVAL_MS = 2_000;
  const WING_LIST_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=500&page=1";
  const WING_DETAIL_URL =
    "https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product";
  const LEGACY_WING_LIST_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1";
  const LEGACY_WING_DETAIL_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify";

  const activeSteps = new Map();
  const stateWrites = new Map();
  const stoppedChains = new Set();
  // One import per browser environment: the import reads Wing through the
  // browser's single Wing login. A start claims the environment's turn before
  // it awaits anything; once its import is stored as running, the stored
  // import holds the turn.
  const admissions = new Map();
  // A restarted worker continues only the imports it admitted, recovered or
  // stopped in this worker life (KID-147).
  const continuing = new Set();

  function rootAttemptId(state) {
    return state?.rootAttemptId || state?.attemptId || null;
  }

  function sessionAttemptId(state) {
    return rootAttemptId(state);
  }

  function chainCurrentStage(state) {
    return state?.currentStage || state?.stage || state?.permit?.plan?.stage || "full";
  }

  function chainIsStopped(state) {
    return Boolean(state?.chainStopRequested || stoppedChains.has(rootAttemptId(state)));
  }

  async function start(message, dependencies) {
    const permit = validatePermit(message?.permit);
    const channelAccountId = permit.plan.channelAccountId;
    const incomingStage = permit.plan.stage || "full";
    const existingSession = await dependencies.collectionSessions.getOwned(
      permit.attemptId,
      dependencies.environmentId,
    ).catch(() => null);
    if (existingSession && typeof dependencies.collectionSessions.isActive === "function" &&
        !(await dependencies.collectionSessions.isActive(
        permit.attemptId,
        dependencies.environmentId,
        "channels.coupang_catalog",
      ))) {
      throw new Error("중단된 쿠팡 상품 수집은 재개할 수 없습니다");
    }
    const stored = await getState(dependencies);
    const permitRoot = incomingStage === "details" && permit.plan.rootAttemptId
      ? permit.plan.rootAttemptId
      : permit.attemptId;
    // Keep the previous owner visible for the replacement fence and for
    // local progress/rate-limit recovery. The incoming permit is always the
    // owner being read and admitted; a details permit may intentionally move
    // the owner from the basics attempt to its child attempt.
    const current = hasOwnerPermit(stored) ? stored : null;
    const ownerPermit = permit;
    const ownerAttemptId = permit.attemptId;
    const server = await getServerStatus(dependencies, channelAccountId, ownerAttemptId, ownerPermit);
    if (server.state === "FAILED") {
      throw new Error(server.error?.message || "실패한 수집은 새 시도로 다시 시작해주세요");
    }
    const ownerRateLimit = rateLimitFromOwner(server);

    if (server.state === "RUNNING" && Date.now() >= Date.parse(ownerPermit.expiresAt)) {
      throw new Error("만료된 수집은 새 시도로 다시 시작해주세요");
    }
    let terminalAttemptId;
    if (
      current?.status === "running" &&
      rootAttemptId(current) !== permitRoot
    ) {
      const previous = await getServerStatus(dependencies, current.channelAccountId, current.attemptId, current.permit);
      if (previous.state === "RUNNING") throw new Error("다른 쿠팡 상품 수집이 이미 진행 중입니다");
      terminalAttemptId = rootAttemptId(current);
    }

    const localRateLimit = !ownerRateLimit && current?.nextAllowedAt &&
      Number.isFinite(Date.parse(current.nextAllowedAt)) &&
      Date.parse(current.nextAllowedAt) > Date.now()
      ? current.nextAllowedAt
      : null;
    const nextAllowedAt = ownerRateLimit?.nextAllowedAt || localRateLimit;
    const rootNeedsDetails = ownerPermit.plan.stage === "basics" &&
      typeof ownerPermit.plan.detailsIdempotencyKey === "string" &&
      server.state === "COMPLETE";
    const state = current?.attemptId === ownerAttemptId
      ? {
          ...current,
          permit: ownerPermit,
          stage: ownerPermit.plan.stage || current.stage || "full",
          currentAttemptId: ownerAttemptId,
          currentStage: ownerPermit.plan.stage || current.currentStage || current.stage || "full",
          status: server.state === "COMPLETE" && !rootNeedsDetails ? "done" : "running",
          error: null,
          nextAllowedAt,
          updatedAt: Date.now(),
        }
      : {
          attemptId: ownerAttemptId,
          rootAttemptId: permitRoot,
          channelAccountId,
          permit: ownerPermit,
          stage: ownerPermit.plan.stage || "full",
          currentAttemptId: ownerAttemptId,
          currentStage: ownerPermit.plan.stage || "full",
          status: server.state === "COMPLETE" && !rootNeedsDetails ? "done" : "running",
          phase: "discovery",
          currentPage: 0,
          totalPages: server.manifest?.expectedPages || 0,
          discoveredProducts: 0,
          hydratedProducts: server.progress?.hydratedProducts || 0,
          uploadedChunks: server.progress?.storedChunks || 0,
          manifest: server.manifest || null,
          discoveryItems: [],
          startedAt: Date.now(),
          updatedAt: Date.now(),
          error: null,
          nextAllowedAt,
          lastDetailRequestAt: 0,
    };
    // Do not publish a replacement owner while the previous managed window is
    // still uncertain. Keeping the old state in storage makes a failed close
    // retryable; publishing first would hide the old root from the next start
    // and permanently lose its cleanup path.
    if (current && rootAttemptId(current) !== permitRoot) {
      if (!(await closeManagedWindow(dependencies, rootAttemptId(current)))) {
        throw new Error("기존 쿠팡 상품 수집 창을 닫지 못했습니다");
      }
    }
    await mutateState(dependencies, (latest) => {
      if (hasOwnerPermit(latest) && latest.status === "running" && rootAttemptId(latest) !== permitRoot &&
        rootAttemptId(latest) !== terminalAttemptId) {
        throw new Error("다른 쿠팡 상품 수집이 이미 진행 중입니다");
      }
      if (hasOwnerPermit(latest) && rootAttemptId(latest) === permitRoot && latest.pendingTerminal) {
        state.pendingTerminal = latest.pendingTerminal;
      }
      return state;
    });
    if (current && rootAttemptId(current) !== permitRoot) {
      await dependencies.collectionSessions.remove(rootAttemptId(current));
    }
    if (state.status === "done") {
      await clearAlarm(dependencies);
      if (!(await closeManagedWindow(dependencies, rootAttemptId(state)))) {
        throw new Error("쿠팡 상품 수집 창을 닫지 못했습니다");
      }
      await dependencies.collectionSessions.cancel(rootAttemptId(state));
    }
    if (state.status === "running") {
      await dependencies.collectionSessions.start({
        attemptId: rootAttemptId(state), environmentId: dependencies.environmentId, producer: "channels.coupang_catalog",
      });
      if (!state.pendingTerminal && !hasPendingRateLimit(state)) await dependencies.collectionSessions.progress(rootAttemptId(state), {
        current: state.discoveredProducts || 0,
        total: state.manifest?.totalItems || state.discoveredProducts || 0,
        completed: state.discoveredProducts || 0,
        failed: 0,
        label: "Wing 상품 목록 확인",
      });
    }
    if (state.status === "running" && !hasPendingRateLimit(state)) {
      await scheduleNextStep(dependencies);
      runSoon(dependencies);
    } else if (state.status === "running") {
      await clearAlarm(dependencies);
    }
    return { success: true, started: state.status === "running" && !hasPendingRateLimit(state), ...await publicStatus(state, dependencies) };
  }

  // The collection start for one store account (`@kiditem/shared/collection-start`).
  // A browser environment imports one account at a time because the import
  // reads Wing through the browser's single Wing login. The start is answered
  // once it is decided: `started` after the basics attempt opens or a paused
  // attempt resumes, `running` for the account that is already importing, or
  // `held` with the other account's import that holds the browser. Nothing
  // opens unless the browser is free.
  async function admit(request, dependencies) {
    const channelAccountId = requiredUuid(request?.scope?.channelAccountId, "channelAccountId");
    const idempotencyKey = requiredUuid(request?.idempotencyKey, "idempotencyKey");
    const key = stateKey(dependencies);
    // The claim is taken before anything is awaited, so a start that arrives
    // while this one is being admitted already finds the browser held.
    const pending = admissions.get(key);
    if (pending) return occupiedBy(pending, channelAccountId);
    const claim = { channelAccountId, attemptId: null };
    admissions.set(key, claim);
    let run = null;
    try {
      const holder = await storedHolder(dependencies);
      if (holder && holder.channelAccountId !== channelAccountId) return occupiedBy(holder, channelAccountId);
      if (holder) {
        claim.attemptId = holder.attemptId;
        // A provider rate limit waits for an explicit start of the same attempt.
        const permit = holder.paused ? await replayPausedBegin(holder, dependencies) : null;
        if (!permit) return { outcome: "running", attemptId: holder.attemptId };
        continuing.add(key);
        run = start({ permit }, dependencies);
        return { outcome: "started", attemptId: holder.attemptId };
      }
      const opened = await beginBasics(channelAccountId, idempotencyKey, dependencies);
      if (opened.inProgress) return { outcome: "running", attemptId: opened.attemptId };
      claim.attemptId = opened.permit.plan.rootAttemptId || opened.permit.attemptId;
      continuing.add(key);
      run = start({ permit: opened.permit }, dependencies);
      return { outcome: "started", attemptId: claim.attemptId };
    } finally {
      const release = () => {
        if (admissions.get(key) === claim) admissions.delete(key);
      };
      if (run) {
        // The claim keeps the turn until the import is stored as the holder.
        dependencies.keepAlive(run).then(release, release);
        run.catch((error) => console.error("[KIDITEM] 쿠팡 상품 수집 시작 실패:", error?.message || error));
      } else {
        release();
      }
    }
  }

  function occupiedBy(holder, channelAccountId) {
    return holder.channelAccountId === channelAccountId
      ? { outcome: "running", attemptId: holder.attemptId ?? null }
      : {
          outcome: "held",
          holder: { channelAccountId: holder.channelAccountId, attemptId: holder.attemptId ?? null },
        };
  }

  // A restarted worker continues its import only through the web-app lifetime,
  // which recovers an environment after it confirms a connected KidItem tab.
  // Recovery takes the turn exactly like a start and continues only the same
  // attempt whose lease has not passed and whose chain the owner still runs.
  async function recover(dependencies) {
    const key = stateKey(dependencies);
    const observed = await getState(dependencies);
    if (!hasOwnerPermit(observed) || observed.status !== "running" || admissions.has(key)) return;
    const claim = { channelAccountId: observed.channelAccountId, attemptId: rootAttemptId(observed) };
    admissions.set(key, claim);
    try {
      const state = await getState(dependencies);
      if (!hasOwnerPermit(state) || state.status !== "running" ||
        rootAttemptId(state) !== claim.attemptId || Date.now() >= Date.parse(state.permit.expiresAt)) {
        return;
      }
      if ((await readChain(state, dependencies)).state !== "RUNNING") return;
      continuing.add(key);
      await scheduleNextStep(dependencies);
      runSoon(dependencies);
    } finally {
      if (admissions.get(key) === claim) admissions.delete(key);
    }
  }

  // Whether this worker life may run the stored import's steps: it admitted,
  // recovered or stopped that import. An alarm left from an earlier worker
  // life runs nothing until then.
  function isContinuing(dependencies) {
    return continuing.has(stateKey(dependencies));
  }

  // The stored import holds the browser while the owner may still run its
  // chain; an owner that cannot be read keeps it held. An import the owner
  // already ended, such as one an operator stopped on the server, is a
  // leftover: it is settled, and its window and session are released before
  // another import opens.
  async function storedHolder(dependencies) {
    const state = await getState(dependencies);
    if (!hasOwnerPermit(state)) return null;
    const rootId = rootAttemptId(state);
    if (state.status === "running") {
      const chain = await readChain(state, dependencies);
      if (chain.state !== "ENDED") {
        return {
          channelAccountId: state.channelAccountId,
          attemptId: rootId,
          paused: hasPendingRateLimit(state),
          state,
          root: chain.root,
        };
      }
      await settleEndedImport(state, chain.root, dependencies);
    }
    if (!(await closeManagedWindow(dependencies, rootId))) {
      throw Object.assign(
        new Error("이전 쿠팡 상품 수집 창을 닫지 못했습니다. 창을 닫은 뒤 다시 시작해 주세요."),
        { code: "CATALOG_WINDOW_CLEANUP_FAILED" },
      );
    }
    await dependencies.collectionSessions.remove(rootId).catch(() => undefined);
    return null;
  }

  // The root attempt carries the whole import's state: a completed basics root
  // stays RUNNING while its details child runs. A root the owner no longer
  // knows has ended.
  async function readChain(state, dependencies) {
    const rootId = rootAttemptId(state);
    try {
      const root = await apiJson(
        dependencies,
        `${attemptsPath(state.channelAccountId)}/${encodeURIComponent(rootId)}`,
      );
      if (root?.attemptId !== rootId || root?.channelAccountId !== state.channelAccountId) {
        return { state: "UNKNOWN", root: null };
      }
      return { state: (root.overallState || root.state) === "RUNNING" ? "RUNNING" : "ENDED", root };
    } catch (error) {
      return { state: error?.status === 404 ? "ENDED" : "UNKNOWN", root: null };
    }
  }

  async function settleEndedImport(state, root, dependencies) {
    const rootId = rootAttemptId(state);
    const completed = (root?.overallState || root?.state) === "COMPLETE";
    await mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== rootId || current.status !== "running") return null;
      return {
        ...current,
        status: completed ? "done" : "error",
        phase: "finished",
        chainPhase: "ended",
        pendingTerminal: null,
        error: completed ? null : current.error || "이미 끝난 쿠팡 상품 수집입니다",
        endedAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    await clearAlarm(dependencies);
    stoppedChains.delete(rootId);
    continuing.delete(stateKey(dependencies));
  }

  async function beginBasics(channelAccountId, idempotencyKey, dependencies) {
    const response = await dependencies.authedFetch(attemptsPath(channelAccountId), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ collectorVersion: "wing-inventory-v1", stage: "basics" }),
    });
    const body = await response.json().catch(() => null);
    // The account already has a live catalog attempt, such as a workbook import
    // or an import in another browser: the same source does not open twice.
    if (response.status === 409 && body?.code === "ATTEMPT_IN_PROGRESS" && isUuid(body.attemptId)) {
      return { inProgress: true, attemptId: body.attemptId };
    }
    if (!response.ok) throw ownerRequestError(body, response.status);
    const permit = validatePermit(body);
    if (permit.plan.channelAccountId !== channelAccountId || permit.plan.stage !== "basics") {
      throw new Error("쿠팡 상품 수집 시도 응답이 일치하지 않습니다");
    }
    return { permit };
  }

  // Resuming a rate-limit pause replays the attempt's own begin: the owner
  // lifts the pause only for that same key, and only after its not-before time.
  async function replayPausedBegin(holder, dependencies) {
    const { state, root } = holder;
    if (Date.parse(state.nextAllowedAt) > Date.now()) return null;
    const stage = catalogStage(state);
    const idempotencyKey = stage === "details" ? state.detailsIdempotencyKey : root?.idempotencyKey;
    if (!isUuid(idempotencyKey)) return null;
    const response = await dependencies.authedFetch(attemptsPath(state.channelAccountId), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        collectorVersion: state.permit.plan.collectorVersion,
        ...(stage !== "full" ? { stage } : {}),
        ...(stage === "details" ? { expectedBasicAttemptId: rootAttemptId(state) } : {}),
      }),
    });
    const body = await response.json().catch(() => null);
    // ATTEMPT_PAUSED: the owner's not-before time has not passed yet.
    if (response.status === 409) return null;
    if (!response.ok) throw ownerRequestError(body, response.status);
    const permit = validatePermit(body);
    if (permit.attemptId !== state.attemptId || permit.plan.channelAccountId !== state.channelAccountId) {
      throw new Error("쿠팡 상품 수집 시도 응답이 일치하지 않습니다");
    }
    return permit;
  }

  function ownerRequestError(body, status) {
    const message = typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : `쿠팡 상품 수집을 시작하지 못했습니다 (HTTP ${status})`;
    return Object.assign(new Error(message), { code: "SOURCE_OWNER_REQUEST_FAILED", status });
  }

  function attemptsPath(channelAccountId) {
    return `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-wing/attempts`;
  }

  function isUuid(value) {
    return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function validatePermit(permit) {
    requiredUuid(permit?.attemptId, "attemptId");
    requiredUuid(permit?.attemptToken, "attemptToken");
    requiredUuid(permit?.plan?.channelAccountId, "channelAccountId");
    if (!Number.isFinite(Date.parse(permit?.expiresAt)) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(permit?.state) ||
      permit.plan?.collectorVersion !== "wing-inventory-v1" ||
      !validPlanUrls(permit.plan) ||
      typeof permit.plan?.vendorId !== "string" || !permit.plan.vendorId.trim() ||
      !/^\d+$/.test(permit.plan?.publicationRevision || "")) {
      throw new Error("유효한 서버 수집 허가가 필요합니다");
    }
    if (permit.plan.rootAttemptId !== undefined) {
      requiredUuid(permit.plan.rootAttemptId, "rootAttemptId");
    }
    if (permit.plan.detailsIdempotencyKey !== undefined) {
      requiredUuid(permit.plan.detailsIdempotencyKey, "detailsIdempotencyKey");
    }
    if ((permit.plan.stage || "full") === "basics" && permit.plan.rootAttemptId &&
      permit.plan.rootAttemptId !== permit.attemptId) {
      throw new Error("기본 수집 계획의 rootAttemptId가 일치하지 않습니다");
    }
    return permit;
  }

  function validPlanUrls(plan) {
    const stage = plan?.stage || "full";
    if (!["full", "basics", "details"].includes(stage)) return false;
    if (stage === "basics" || stage === "details") {
      return plan?.listUrl === WING_LIST_URL && plan?.detailUrl === WING_DETAIL_URL;
    }
    // Existing full attempts remain readable while new staged attempts use
    // the verified JSON routes.  Do not mix route generations inside a plan.
    return (plan?.listUrl === LEGACY_WING_LIST_URL && plan?.detailUrl === LEGACY_WING_DETAIL_URL) ||
      (plan?.listUrl === WING_LIST_URL && plan?.detailUrl === WING_DETAIL_URL);
  }

  function hasPendingRateLimit(state) {
    return typeof state?.nextAllowedAt === "string" && state.nextAllowedAt.trim().length > 0;
  }

  function rateLimitFromOwner(server) {
    if (server?.state !== "RUNNING" || server.error?.code !== "WING_PROVIDER_RATE_LIMITED") {
      return null;
    }
    return {
      nextAllowedAt: validNotBefore(server.error.notBefore),
      message: String(server.error.message ||
        "쿠팡 Wing 요청 한도에 도달했습니다. 대기 후 같은 수집을 다시 시작해주세요."),
      ownerReported: true,
    };
  }

  function catalogStage(state) {
    return state?.stage || state?.permit?.plan?.stage || "full";
  }

  function hasOwnerPermit(state) {
    try {
      const permit = validatePermit(state?.permit);
      return state.attemptId === permit.attemptId && state.channelAccountId === permit.plan.channelAccountId;
    } catch { return false; }
  }

  async function getStatus(attemptId, dependencies) {
    requiredUuid(attemptId, "attemptId");
    const state = await getState(dependencies);
    if (!state || (attemptId && rootAttemptId(state) !== attemptId && state.attemptId !== attemptId)) {
      return { attemptId: attemptId || null, active: false, attention: null };
    }
    if (state.status === "running") {
      if (Date.now() >= Date.parse(state.permit?.expiresAt)) {
        await clearAlarm(dependencies);
        const server = await getServerStatus(dependencies, state.channelAccountId, state.attemptId, state.permit);
        if (server.state !== "RUNNING") await finish(state, dependencies, server);
        return publicStatus(await getState(dependencies), dependencies);
      }
      if (typeof dependencies.collectionSessions.isActive === "function" &&
        !(await dependencies.collectionSessions.isActive(
          sessionAttemptId(state),
          dependencies.environmentId,
          "channels.coupang_catalog",
        ))) {
        await clearAlarm(dependencies);
        return publicStatus(state, dependencies);
      }
      if (!hasPendingRateLimit(state)) {
        await scheduleNextStep(dependencies);
        runSoon(dependencies);
      } else {
        await clearAlarm(dependencies);
      }
    }
    return publicStatus(state, dependencies);
  }

  async function cancel(attemptId, dependencies) {
    requiredUuid(attemptId, "attemptId");
    const state = await getState(dependencies);
    if (!state || (state.attemptId !== attemptId && rootAttemptId(state) !== attemptId)) {
      return { success: true, cancelled: false, attemptId };
    }
    const rootId = rootAttemptId(state);
    stoppedChains.add(rootId);
    // A stop only settles the import, so its steps may run in this worker life.
    continuing.add(stateKey(dependencies));
    await mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== rootId) return current;
      return { ...current, chainStopRequested: true, updatedAt: Date.now() };
    });
    const currentState = await getState(dependencies);
    if (currentState) Object.assign(state, currentState);
    if (state.status !== "running") {
      const server = await getServerStatus(dependencies, state.channelAccountId, state.attemptId, state.permit);
      if (server.state === "RUNNING") throw new Error("수집 종료가 아직 확인되지 않았습니다");
      if (!(await closeManagedWindow(dependencies, rootId))) {
        throw new Error("쿠팡 상품 수집 창을 닫지 못했습니다");
      }
      await dependencies.collectionSessions.remove(rootId);
    } else {
      const pending = await storeTerminal(state, dependencies, {
        kind: "fail", body: { code: "USER_CANCELLED", message: "사용자가 쿠팡 상품 수집을 중단했습니다",
          phase: statusPhase(state.phase) },
      });
      if (pending) await submitTerminal(pending, dependencies);
    }
    const current = await getState(dependencies);
    if (!current || (current.attemptId !== attemptId && rootAttemptId(current) !== attemptId)) {
      return { success: true, cancelled: true, attemptId, active: false, attention: null };
    }
    return { success: true, cancelled: current.status !== "running",
      ...await publicStatus(current, dependencies) };
  }

  function handleAlarm(alarm, dependencies) {
    if (alarm?.name !== alarmName(dependencies)) return;
    return runSoon(dependencies);
  }

  function runSoon(dependencies) {
    const key = stateKey(dependencies);
    const activeStep = activeSteps.get(key);
    if (activeStep) return activeStep;
    let stepAttemptId;
    const deferredStep = getState(dependencies).then(async (state) => {
      stepAttemptId = state?.attemptId;
      try { await runOneStep(dependencies, state); }
      catch (error) { await handleStepError(error, dependencies, state); }
    })
      .finally(async () => {
        activeSteps.delete(key);
        const current = await getState(dependencies);
        if (current?.status === "running" && current.attemptId !== stepAttemptId) await scheduleNextStep(dependencies);
      });
    const nextStep = dependencies.keepAlive(deferredStep);
    activeSteps.set(key, nextStep);
    return nextStep;
  }

  async function runOneStep(dependencies, state) {
    if (!state || state.status !== "running") return;
    if (state.pendingChildCancellation) {
      const childPermit = await restorePendingChildCancellationPermit(state, dependencies);
      if (!childPermit) return;
      const cancelled = await cancelChildPermit(childPermit, dependencies, state);
      if (!cancelled) {
        await scheduleNextStep(dependencies);
        return;
      }
      const settled = await getState(dependencies);
      return settleStoppedChain(settled || state, dependencies);
    }
    if (chainIsStopped(state) && state.chainPhase === "admitting_details" &&
      state.permit?.plan?.detailsIdempotencyKey) {
      await replayStoppedDetailsAdmission(state, dependencies);
      return;
    }
    if (chainIsStopped(state) && !state.pendingTerminal) {
      await clearAlarm(dependencies);
      return;
    }
    if (chainIsStopped(state) && state.pendingTerminal) {
      await submitTerminal(state, dependencies);
      return;
    }
    if (typeof dependencies.collectionSessions.isActive === "function" &&
      !(await dependencies.collectionSessions.isActive(
        sessionAttemptId(state),
        dependencies.environmentId,
        "channels.coupang_catalog",
      ))) {
      await clearAlarm(dependencies);
      return;
    }
    if (!hasOwnerPermit(state) || Date.now() >= Date.parse(state.permit.expiresAt)) {
      await clearAlarm(dependencies);
      return;
    }
    // A provider 429 is an explicit operator-resume boundary.  Never let an
    // already scheduled alarm resume provider IO after the not-before time;
    // only start() for the same owner attempt clears this marker.
    if (hasPendingRateLimit(state)) {
      await clearAlarm(dependencies);
      return;
    }
    if (state.pendingTerminal) {
      await submitTerminal(state, dependencies);
      return;
    }

    const server = await getServerStatus(
      dependencies,
      state.channelAccountId,
      state.attemptId,
      state.permit,
    );
    if (server.state !== "RUNNING") {
      await finish(state, dependencies, server);
      return;
    }
    const ownerRateLimit = rateLimitFromOwner(server);
    if (ownerRateLimit) {
      await pauseForRateLimit(state, dependencies, ownerRateLimit);
      return;
    }

    if (
      state.phase === "discovery" &&
      (!state.manifest || state.currentPage < state.manifest.expectedPages)
    ) {
      await collectDiscoveryPage(state, server, dependencies);
      return;
    }

    if (state.phase === "discovery") {
      await confirmManifest(state, dependencies);
      return;
    }

    await assertActive(state, dependencies);
    const refreshed = await getServerStatus(
      dependencies,
      state.channelAccountId,
      state.attemptId,
      state.permit,
    );
    if (refreshed.state !== "RUNNING") return finish(state, dependencies, refreshed);
    const missingIds = new Set(refreshed.missing?.productIds || []);
    if (missingIds.size > 0) {
      await collectProductChunk(state, refreshed, missingIds, dependencies);
      return;
    }

    if (refreshed.phase !== "ready_to_finalize" || !refreshed.snapshotHash) {
      throw new Error("서버가 완성된 쿠팡 상품 스냅샷 해시를 반환하지 않았습니다");
    }
    const pending = await storeTerminal(state, dependencies, {
      kind: "finalize", body: { snapshotHash: refreshed.snapshotHash },
    });
    if (pending) await submitTerminal(pending, dependencies);
  }

  async function collectDiscoveryPage(state, server, dependencies) {
    const page = state.manifest ? state.currentPage + 1 : 1;
    let tab = await getOrCreateManagedTab(state, dependencies);
    const ready = await ensureDiscoveryTabReady(state, dependencies, tab, {
      forceNavigation: page === 1,
    });
    tab = ready.tab;
    if (ready.pendingLogin) {
      await pauseForAttention(
        state,
        dependencies,
        tab,
        "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
      );
      return;
    }
    if (ready.settled) {
      await delay(500);
    }
    await assertActive(state, dependencies);
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
      page,
      expectedVendorId: state.permit.plan.vendorId,
    });
    await assertActive(state, dependencies);
    if (!response?.success) {
      if (response?.rateLimited) {
        await pauseForRateLimit(state, dependencies, response);
        return;
      }
      if (response?.pendingLogin) {
        await pauseForAttention(
          state,
          dependencies,
          tab,
          response?.error ||
            "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
        return;
      }
      throw new Error(response?.error || `Wing 등록상품 ${page}페이지 수집 실패`);
    }

    const pageSize = state.manifest?.pageSize || response.pageSize;
    assertDiscoveryPageResponse(response, page, pageSize, state.manifest?.totalItems);
    const items = root.KidItemCoupangCatalog.buildDiscoveryItems(
      response.records,
      page,
      pageSize,
    );
    const stage = catalogStage(state);
    if (stage === "basics" &&
      (!Array.isArray(response.basicProducts) || response.basicProducts.length !== items.length)) {
      throw new Error("Wing 기본 상품 목록 데이터가 누락되었습니다");
    }
    let manifest = state.manifest;
    if (!manifest) {
      manifest = await root.KidItemCoupangCatalog.buildManifest({
        totalItems: response.totalItems,
        pageSize,
        firstPageItems: items,
      });
      if (
        server.manifest &&
        root.KidItemCoupangCatalog.stableStringify(server.manifest) !==
          root.KidItemCoupangCatalog.stableStringify(manifest)
      ) {
        throw new Error("재개 중인 수집과 현재 Wing 상품 목록이 달라졌습니다");
      }
    }
    assertDiscoveryPageComplete(page, manifest, items);
    const discoveryItems = mergeDiscoveryItems(state.discoveryItems, items);

    const payload = {
      version: 1,
      kind: "discovery_page",
      page,
      manifest,
      items,
    };
    let latestServer = await putChunk(
      dependencies,
      state,
      "discovery_page",
      page,
      payload,
      items.length,
    );
    if (stage === "basics") {
      const basicProducts = response.basicProducts.map((product, index) => {
        if (product.externalProductId !== items[index].externalProductId) {
          throw new Error(`Wing 기본 상품 ID가 목록 순서와 다릅니다: ${items[index].externalProductId}`);
        }
        return { ordinal: items[index].ordinal, product };
      });
      const chunks = root.KidItemCoupangCatalog.chunkCatalogProducts(basicProducts, {
        kind: "listing_basics",
        version: 1,
      });
      for (const chunk of chunks) {
        latestServer = await putChunk(
          dependencies,
          state,
          "listing_basics",
          chunk.startOrdinal + 1,
          chunk,
          chunk.products.length,
        );
        await assertActive(state, dependencies);
      }
    }
    await assertActive(state, dependencies);
    await setState({
      ...state,
      manifest,
      currentPage: page,
      totalPages: manifest.expectedPages,
      discoveredProducts: discoveryItems.length,
      discoveryItems,
      hydratedProducts: latestServer.progress?.hydratedProducts ?? state.hydratedProducts,
      uploadedChunks: latestServer.progress?.storedChunks ??
        state.uploadedChunks + 1 + (stage === "basics"
          ? Math.ceil(items.length / MAX_PRODUCTS_PER_CHUNK)
          : 0),
      updatedAt: Date.now(),
    }, dependencies);
    await dependencies.collectionSessions.progress(sessionAttemptId(state), {
      current: discoveryItems.length,
      total: manifest.totalItems,
      completed: discoveryItems.length,
      failed: 0,
      label: `Wing 상품 목록 ${page}페이지`,
    });
    await scheduleNextStep(dependencies);
  }

  async function confirmManifest(state, dependencies) {
    let tab = await getOrCreateManagedTab(state, dependencies);
    const ready = await ensureDiscoveryTabReady(state, dependencies, tab);
    tab = ready.tab;
    if (ready.pendingLogin) {
      await pauseForAttention(
        state,
        dependencies,
        tab,
        "쿠팡 Wing 로그인이 만료되었습니다. 알림에서 확인 탭을 열어주세요.",
      );
      return;
    }
    if (ready.settled) await delay(500);
    await assertActive(state, dependencies);
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
      page: 1,
      expectedVendorId: state.permit.plan.vendorId,
    });
    await assertActive(state, dependencies);
    if (!response?.success) {
      if (response?.rateLimited) {
        await pauseForRateLimit(state, dependencies, response);
        return;
      }
      if (response?.pendingLogin) {
        await pauseForAttention(
          state,
          dependencies,
          tab,
          response?.error || "쿠팡 Wing 로그인이 필요합니다. 알림에서 확인 탭을 열어주세요.",
        );
        return;
      }
      throw new Error(response?.error || "Wing 목록 재확인 실패");
    }
    assertDiscoveryPageResponse(
      response,
      1,
      state.manifest.pageSize,
      state.manifest.totalItems,
    );
    const items = root.KidItemCoupangCatalog.buildDiscoveryItems(
      response.records,
      1,
      state.manifest.pageSize,
    );
    const currentManifest = await root.KidItemCoupangCatalog.buildManifest({
      totalItems: response.totalItems,
      pageSize: response.pageSize,
      firstPageItems: items,
    });
    if (
      root.KidItemCoupangCatalog.stableStringify(currentManifest) !==
      root.KidItemCoupangCatalog.stableStringify(state.manifest)
    ) {
      throw new Error("수집 도중 Wing 전체 상품 목록이 변경되었습니다");
    }

    const payload = {
      version: 1,
      kind: catalogStage(state) === "details"
        ? "detail_manifest_confirmation"
        : "manifest_confirmation",
      manifest: state.manifest,
      ...(catalogStage(state) === "details"
        ? {
            basicAttemptId: state.permit.plan.basicAttemptId,
            basicManifestHash: state.permit.plan.basicManifestHash,
          }
        : {}),
    };
    if (catalogStage(state) === "details" &&
      (!payload.basicAttemptId || !payload.basicManifestHash)) {
      throw new Error("상세 수집 계획에 기본 카탈로그 기준이 없습니다");
    }
    const confirmationKind = payload.kind;
    const server = await putChunk(
      dependencies,
      state,
      confirmationKind,
      1,
      payload,
      1,
    );
    await assertActive(state, dependencies);
    await setState({
      ...state,
      phase: "hydration",
      hydratedProducts: server.progress?.hydratedProducts || 0,
      uploadedChunks: state.uploadedChunks + 1,
      updatedAt: Date.now(),
    }, dependencies);
    await scheduleNextStep(dependencies);
  }

  async function collectProductChunk(state, server, missingIds, dependencies) {
    const discoveryItems = Array.isArray(state.discoveryItems)
      ? state.discoveryItems
      : [];
    if (discoveryItems.length !== state.manifest.totalItems) {
      await setState({
        ...state,
        phase: "discovery",
        currentPage: 0,
        discoveryItems: [],
        discoveredProducts: 0,
        updatedAt: Date.now(),
      }, dependencies);
      await scheduleNextStep(dependencies);
      return;
    }

    const target = discoveryItems.find((item) => missingIds.has(item.externalProductId));
    if (!target) throw new Error("서버 누락 상품을 Wing 목록에서 찾을 수 없습니다");
    const startOrdinal = Math.floor(target.ordinal / MAX_PRODUCTS_PER_CHUNK) *
      MAX_PRODUCTS_PER_CHUNK;
    const stage = catalogStage(state);
    const group = stage === "details"
      ? discoveryItems.filter((item) => missingIds.has(item.externalProductId))
        .slice(0, MAX_PRODUCTS_PER_CHUNK)
      : discoveryItems.slice(
        startOrdinal,
        startOrdinal + MAX_PRODUCTS_PER_CHUNK,
      );
    let tab = await getOrCreateManagedTab(state, dependencies);
    const ready = await ensureDiscoveryTabReady(state, dependencies, tab);
    tab = ready.tab;
    if (ready.pendingLogin) {
      await pauseForAttention(
        state,
        dependencies,
        tab,
        "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
      );
      return;
    }
    if (ready.settled) await delay(500);
    // Staged details are accepted one product at a time.  This keeps an
    // already successful product durable if a later provider request fails,
    // and lets the owner publish the accepted products independently.
    if (stage === "details") {
      let updated = server;
      for (const item of group) {
        await assertActive(state, dependencies);
        await paceDetailRequest(state, dependencies);
        const detail = await collectSellerProduct(
          tab.id,
          state,
          dependencies,
          item.externalProductId,
        );
        await assertActive(state, dependencies);
        if (detail?.pendingLogin) {
          await pauseForAttention(
            state,
            dependencies,
            tab,
            "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
          );
          return;
        }
        const product = root.KidItemCoupangCatalog.buildCatalogDetailProduct(detail.product);
        await assertActive(state, dependencies);
        if (product.externalProductId !== item.externalProductId) {
          throw new Error(
            `Wing 상세 상품 ID 불일치: ${item.externalProductId} / ${product.externalProductId}`,
          );
        }
        const [payload] = root.KidItemCoupangCatalog.chunkCatalogProducts(
          [{ ordinal: item.ordinal, product }],
          { kind: "full_details", version: 1 },
        );
        updated = await putChunk(
          dependencies,
          state,
          "full_details",
          payload.startOrdinal + 1,
          payload,
          payload.products.length,
        );
        await assertActive(state, dependencies);
        const hydratedProducts = updated.progress?.hydratedProducts ??
          Math.max(Number(state.hydratedProducts) || 0, Number(server.progress?.hydratedProducts) || 0) + 1;
        const uploadedChunks = updated.progress?.storedChunks ??
          Math.max(Number(state.uploadedChunks) || 0, Number(server.progress?.storedChunks) || 0) + 1;
        Object.assign(state, { hydratedProducts, uploadedChunks, updatedAt: Date.now() });
        await setState({ ...state }, dependencies);
        await dependencies.collectionSessions.progress(sessionAttemptId(state), {
          current: item.ordinal + 1,
          total: state.manifest.totalItems,
          completed: hydratedProducts,
          failed: 0,
          label: "Wing 상품 상세 수집",
        });
      }
      await assertActive(state, dependencies);
      await scheduleNextStep(dependencies);
      return;
    }

    const products = [];
    for (const item of group) {
      await assertActive(state, dependencies);
      const detail = await collectSellerProduct(
        tab.id,
        state,
        dependencies,
        item.externalProductId,
      );
      await assertActive(state, dependencies);
      if (detail?.pendingLogin) {
        await pauseForAttention(
          state,
          dependencies,
          tab,
          "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
        return;
      }
      const product = root.KidItemCoupangCatalog.buildCatalogProduct(detail.product);
      await assertActive(state, dependencies);
      if (product.externalProductId !== item.externalProductId) {
        throw new Error(
          `Wing 상세 상품 ID 불일치: ${item.externalProductId} / ${product.externalProductId}`,
        );
      }
      products.push({ ordinal: item.ordinal, product });
    }
    const kind = "product_details";
    const chunks = root.KidItemCoupangCatalog.chunkCatalogProducts(products, {
      kind,
      version: 1,
    });
    let updated = server;
    for (const payload of chunks) {
      updated = await putChunk(
        dependencies,
        state,
        kind,
        payload.startOrdinal + 1,
        payload,
        payload.products.length,
      );
      await assertActive(state, dependencies);
    }
    await assertActive(state, dependencies);
    await setState({
      ...state,
      hydratedProducts: updated.progress?.hydratedProducts ??
        (server.progress?.hydratedProducts || 0) + products.length,
      uploadedChunks: updated.progress?.storedChunks ?? state.uploadedChunks + chunks.length,
      updatedAt: Date.now(),
    }, dependencies);
    await dependencies.collectionSessions.progress(sessionAttemptId(state), {
      current: startOrdinal + products.length,
      total: state.manifest.totalItems,
      completed:
        updated.progress?.hydratedProducts ??
        (server.progress?.hydratedProducts || 0) + products.length,
      failed: 0,
      label: "Wing 상품 상세 수집",
    });
    await scheduleNextStep(dependencies);
  }

  async function pauseForAttention(state, dependencies, tab, message) {
    await assertActive(state, dependencies);
    await dependencies.collectionSessions.attachTab(sessionAttemptId(state), {
      tabId: tab.id,
      windowId: tab.windowId,
    });
    await dependencies.collectionSessions.requireAttention(sessionAttemptId(state), {
      reason: "marketplace_login",
      message,
    });
    const pending = await storeTerminal(state, dependencies, {
      kind: "fail", body: { code: "MARKETPLACE_LOGIN_REQUIRED", message: message.slice(0, 1000),
        phase: statusPhase(state.phase) },
    });
    await clearAlarm(dependencies);
    if (pending) await submitTerminal(pending, dependencies);
  }

  async function pauseForRateLimit(state, dependencies, source = {}) {
    const nextAllowedAt = validNotBefore(source.nextAllowedAt);
    const message = String(source.error || source.message ||
      "쿠팡 Wing 요청 한도에 도달했습니다. 대기 후 같은 수집을 다시 시작해주세요").slice(0, 1_000);
    let owner = null;
    if (!source.ownerReported) {
      try {
        owner = await apiJson(
          dependencies,
          `${runApiPath(state)}/pause`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-source-attempt-token": state.permit.attemptToken,
            },
            body: JSON.stringify({
              code: "WING_PROVIDER_RATE_LIMITED",
              message,
              phase: "hydration",
              recoverable: true,
              notBefore: nextAllowedAt,
            }),
          },
          { shouldContinue: () => continueWhileActive(state, dependencies) },
        );
        assertOwnedServerStatus(owner, state.channelAccountId, state.attemptId, state.permit);
        if (owner.state !== "RUNNING") {
          await finish(state, dependencies, owner);
          return;
        }
      } catch {
        // The provider boundary remains locally durable even when the pause
        // acknowledgement is lost. A later explicit same-attempt start
        // reconciles the owner and is the only path allowed to resume IO.
      }
    }
    await setState({
      ...state,
      nextAllowedAt: rateLimitFromOwner(owner)?.nextAllowedAt || nextAllowedAt,
      updatedAt: Date.now(),
    }, dependencies);
    await dependencies.collectionSessions.requireAttention(sessionAttemptId(state), {
      reason: "rate_limited",
      message,
    });
    await clearAlarm(dependencies);
  }

  function validNotBefore(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date(Date.now() + 60_000).toISOString();
  }

  async function paceDetailRequest(state, dependencies) {
    const last = Number(state.lastDetailRequestAt) || 0;
    const waitMs = Math.max(0, last + MIN_DETAIL_INTERVAL_MS - Date.now());
    if (waitMs > 0) await delay(waitMs);
    await assertActive(state, dependencies);
    const next = {
      ...state,
      lastDetailRequestAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setState(next, dependencies);
    Object.assign(state, next);
  }

  async function collectSellerProduct(tabId, state, dependencies, externalProductId) {
    await assertActive(state, dependencies);
    const stage = catalogStage(state);
    const detailFormat = stage === "details" ? "JSON" : "HTML";
    const detailUrl = buildDetailUrl(state.permit.plan, externalProductId);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: stage === "details" ? fetchWingDetailJsonProduct : fetchWingDetailProduct,
      args: [{
        detailUrl,
        externalProductId,
        timeoutMs: DETAIL_FETCH_TIMEOUT_MS,
        ...(stage === "details"
          ? { maxJsonBytes: DETAIL_JSON_MAX_BYTES }
          : { maxHtmlBytes: DETAIL_HTML_MAX_BYTES }),
      }],
    });
    await assertActive(state, dependencies);
    const result = results?.[0]?.result;
    if (result?.kind === "ok" && result.product) return result;
    if (result?.kind === "login") return { pendingLogin: true };
    if (result?.kind === "rate_limited") {
      throw Object.assign(new Error(
        result.message || "쿠팡 Wing 상품 상세 API가 요청 한도를 초과했습니다",
      ), {
        code: "WING_PROVIDER_RATE_LIMITED",
        nextAllowedAt: result.nextAllowedAt,
      });
    }
    if (result?.kind === "timeout") {
      throw Object.assign(new Error(`Wing 상품 상세 ${detailFormat} 요청 시간이 초과되었습니다`), {
        code: "WING_DETAIL_FETCH_TIMEOUT",
      });
    }
    if (result?.kind === "too_large") {
      throw Object.assign(new Error(`Wing 상품 상세 ${detailFormat}이 허용 크기를 초과했습니다`), {
        code: detailFormat === "JSON" ? "WING_DETAIL_JSON_TOO_LARGE" : "WING_DETAIL_HTML_TOO_LARGE",
      });
    }
    if (result?.kind === "http") {
      throw new Error(`Wing 상품 상세 ${detailFormat} 요청 실패 (${result.status || "unknown"})`);
    }
    if (result?.kind === "missing_model") {
      const why = [result.reason, result.sample].filter(Boolean).join(" · ");
      throw new Error(stage === "details"
        ? `Wing 상품 상세 JSON 데이터를 읽을 수 없습니다 (상품 ${externalProductId}${why ? ` · ${why}` : ""})`
        : `Wing 상품 상세 oSellerProduct 데이터를 읽을 수 없습니다 (상품 ${externalProductId})`);
    }
    throw new Error(result?.message || `Wing 상품 상세 ${detailFormat} 수집에 실패했습니다`);
  }

  // This function is serialized into the managed Wing tab. Keep it completely
  // self-contained: it fetches one bounded HTML document and returns only the
  // embedded model, so the background worker never receives the full document.
  async function fetchWingDetailProduct({ detailUrl, externalProductId, timeoutMs, maxHtmlBytes }) {
    function balancedEnd(source, start) {
      let depth = 0;
      let quote = null;
      let escaped = false;
      for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === "{") depth += 1;
        else if (character === "}") {
          depth -= 1;
          if (depth === 0) return index + 1;
        }
      }
      return -1;
    }

    function extractModel(source) {
      let keyIndex = source.indexOf('"oSellerProduct"');
      while (keyIndex >= 0) {
        const colon = source.indexOf(":", keyIndex + 16);
        const start = colon >= 0 ? source.indexOf("{", colon + 1) : -1;
        const end = start >= 0 ? balancedEnd(source, start) : -1;
        if (end > start) {
          try {
            const product = JSON.parse(source.slice(start, end));
            if (String(product?.sellerProductId || "") === String(externalProductId)) {
              return product;
            }
          } catch {
            // Keep searching another embedded data object.
          }
        }
        keyIndex = source.indexOf('"oSellerProduct"', keyIndex + 16);
      }
      return null;
    }

    function isLoginUrl(value) {
      try {
        const url = new URL(String(value || ""));
        return url.hostname === "xauth.coupang.com" ||
          (url.hostname === "wing.coupang.com" && /(?:login|signin|auth)/i.test(url.pathname));
      } catch {
        return false;
      }
    }

    function canonicalDetailUrl(value) {
      try {
        const url = new URL(String(value || ""));
        const ids = url.searchParams.getAll("vendorInventoryId");
        if (
          url.protocol !== "https:" ||
          url.hostname !== "wing.coupang.com" ||
          url.username ||
          url.password ||
          url.port ||
          url.pathname !== "/tenants/seller-web/vendor-inventory/modify" ||
          url.hash ||
          url.searchParams.size !== 1 ||
          ids.length !== 1 ||
          ids[0] !== String(externalProductId)
        ) return null;
        return url.href;
      } catch {
        return null;
      }
    }

    const canonicalUrl = canonicalDetailUrl(detailUrl);
    if (!canonicalUrl) {
      return { kind: "error", message: "Wing 상품 상세 URL이 올바르지 않습니다" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let reader = null;
    const cancelReaderOnAbort = () => {
      if (!reader || typeof reader.cancel !== "function") return;
      Promise.resolve(reader.cancel()).catch(() => undefined);
    };
    controller.signal.addEventListener("abort", cancelReaderOnAbort, { once: true });
    try {
      const response = await fetch(canonicalUrl, {
        credentials: "include",
        redirect: "follow",
        signal: controller.signal,
      });
      const finalUrl = response.url || canonicalUrl;
      if (isLoginUrl(finalUrl)) return { kind: "login" };
      if (!canonicalDetailUrl(finalUrl)) {
        return { kind: "error", message: "Wing 상품 상세 URL로 이동하지 않았습니다" };
      }
      if (!response.ok) return { kind: "http", status: response.status };
      const contentLength = Number(response.headers?.get?.("content-length") || 0);
      if (contentLength > maxHtmlBytes) return { kind: "too_large" };

      let html = "";
      let bytes = 0;
      if (response.body?.getReader) {
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value?.byteLength || 0;
          if (bytes > maxHtmlBytes) {
            await reader.cancel();
            return { kind: "too_large" };
          }
          html += decoder.decode(part.value, { stream: true });
        }
        html += decoder.decode();
      } else {
        html = await response.text();
        bytes = new TextEncoder().encode(html).byteLength;
        if (bytes > maxHtmlBytes) return { kind: "too_large" };
      }
      const product = extractModel(html);
      return product ? { kind: "ok", product } : { kind: "missing_model" };
    } catch (error) {
      if (error?.name === "AbortError") return { kind: "timeout" };
      return { kind: "error", message: String(error?.message || error || "Wing fetch failed") };
    } finally {
      controller.signal.removeEventListener("abort", cancelReaderOnAbort);
      clearTimeout(timeout);
    }
  }

  // Verified staged-detail endpoint.  This is intentionally separate from
  // the legacy HTML collector above so old full attempts remain readable
  // without silently changing their payload contract.
  async function fetchWingDetailJsonProduct({ detailUrl, externalProductId, timeoutMs, maxJsonBytes }) {
    function retryAfterDate(response) {
      const value = String(response?.headers?.get?.("retry-after") || "").trim();
      if (/^\d+(?:\.\d+)?$/.test(value)) {
        return new Date(Date.now() + Math.ceil(Number(value) * 1000)).toISOString();
      }
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
      return new Date(Date.now() + 60_000).toISOString();
    }

    function isLoginUrl(value) {
      try {
        const url = new URL(String(value || ""));
        return url.hostname === "xauth.coupang.com" ||
          (url.hostname === "wing.coupang.com" && /(?:login|signin|auth)/i.test(url.pathname));
      } catch {
        return false;
      }
    }

    function canonicalDetailUrl(value) {
      try {
        const url = new URL(String(value || ""));
        const prefix = "/tenants/seller-web/v2/vendor-inventory/seller-product/";
        if (
          url.protocol !== "https:" ||
          url.hostname !== "wing.coupang.com" ||
          url.username ||
          url.password ||
          url.port ||
          !url.pathname.startsWith(prefix) ||
          url.pathname.slice(prefix.length).length < 1 ||
          !/^\d+$/.test(url.pathname.slice(prefix.length)) ||
          url.hash ||
          url.search
        ) return null;
        return url.href;
      } catch {
        return null;
      }
    }

    const canonicalUrl = canonicalDetailUrl(detailUrl);
    if (!canonicalUrl) {
      return { kind: "error", message: "Wing 상품 상세 JSON URL이 올바르지 않습니다" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let reader = null;
    const cancelReaderOnAbort = () => {
      if (!reader || typeof reader.cancel !== "function") return;
      Promise.resolve(reader.cancel()).catch(() => undefined);
    };
    controller.signal.addEventListener("abort", cancelReaderOnAbort, { once: true });
    try {
      const response = await fetch(canonicalUrl, {
        method: "GET",
        credentials: "include",
        redirect: "manual",
        signal: controller.signal,
      });
      const status = Number(response?.status);
      if (status === 429) {
        return {
          kind: "rate_limited",
          status,
          nextAllowedAt: retryAfterDate(response),
          message: "쿠팡 Wing 상품 상세 API가 요청 한도를 초과했습니다",
        };
      }
      const finalUrl = response.url || canonicalUrl;
      if (response?.type === "opaqueredirect" || status === 0 ||
        status === 401 || status === 403 || (status >= 300 && status < 400) ||
        isLoginUrl(finalUrl)) return { kind: "login" };
      if (canonicalDetailUrl(finalUrl) !== canonicalUrl) {
        return { kind: "error", message: "Wing 상품 상세 JSON URL로 이동하지 않았습니다" };
      }
      if (!response.ok) return { kind: "http", status };
      const contentLength = Number(response.headers?.get?.("content-length") || 0);
      if (contentLength > maxJsonBytes) return { kind: "too_large" };

      let body = "";
      let bytes = 0;
      if (response.body?.getReader) {
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value?.byteLength || 0;
          if (bytes > maxJsonBytes) {
            await reader.cancel();
            return { kind: "too_large" };
          }
          body += decoder.decode(part.value, { stream: true });
        }
        body += decoder.decode();
      } else {
        body = await response.text();
        bytes = new TextEncoder().encode(body).byteLength;
        if (bytes > maxJsonBytes) return { kind: "too_large" };
      }
      let product;
      try {
        product = JSON.parse(body);
      } catch {
        // 읽지 못한 이유를 남긴다. 어느 상품에서 왜 막혔는지 모르면 같은 자리에서 계속 멈춘다.
        return { kind: "missing_model", reason: "not_json", sample: body.slice(0, 120) };
      }
      if (!product || typeof product !== "object" || Array.isArray(product)) {
        return { kind: "missing_model", reason: "not_object" };
      }
      if (String(product.sellerProductId || "") !== String(externalProductId)) {
        return {
          kind: "missing_model",
          reason: "identity",
          sample: `sellerProductId=${String(product.sellerProductId ?? "")} keys=${Object.keys(product).slice(0, 8).join(",")}`,
        };
      }
      return { kind: "ok", product };
    } catch (error) {
      if (error?.name === "AbortError") return { kind: "timeout" };
      return { kind: "error", message: String(error?.message || error || "Wing fetch failed") };
    } finally {
      controller.signal.removeEventListener("abort", cancelReaderOnAbort);
      clearTimeout(timeout);
    }
  }

  async function putChunk(dependencies, state, kind, sequence, payload, itemCount) {
    await assertActive(state, dependencies);
    const checksum = await root.KidItemCoupangCatalog.sha256Hex(payload);
    await assertActive(state, dependencies);
    const server = await apiJson(
      dependencies,
      `${runApiPath(state)}/chunks/${kind}/${sequence}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-source-attempt-token": state.permit.attemptToken },
        body: JSON.stringify({ kind, sequence, checksum, itemCount, payload }),
      },
      { shouldContinue: () => continueWhileActive(state, dependencies) },
    );
    assertOwnedServerStatus(server, state.channelAccountId, state.attemptId, state.permit);
    if (server.state !== "RUNNING") {
      await finish(state, dependencies, server);
      throw new Error("쿠팡 상품 수집이 종료되었습니다");
    }
    return server;
  }

  async function getServerStatus(dependencies, channelAccountId, attemptId, permit) {
    const server = await apiJson(
      dependencies,
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        `/catalog-imports/coupang-wing/attempts/${encodeURIComponent(attemptId)}`,
    );
    assertOwnedServerStatus(server, channelAccountId, attemptId, permit);
    return server;
  }

  function assertOwnedServerStatus(server, channelAccountId, attemptId, permit) {
    if (server?.attemptId !== attemptId || server?.channelAccountId !== channelAccountId) {
      throw new Error("쿠팡 상품 수집 응답의 실행·계정이 일치하지 않습니다");
    }
    if (!["RUNNING", "COMPLETE", "FAILED"].includes(server.state)) {
      throw new Error("종료된 쿠팡 상품 수집입니다. 새 수집을 시작해주세요");
    }
    for (const field of [
      "collectorVersion",
      "listUrl",
      "detailUrl",
      "channelAccountId",
      "vendorId",
      "publicationRevision",
      "stage",
      "basicAttemptId",
      "basicManifestHash",
      "basicPublicationSequence",
      "rootAttemptId",
      "detailsIdempotencyKey",
    ]) {
      const serverValue = field === "stage" ? (server.plan?.stage || "full") : server.plan?.[field];
      const permitValue = field === "stage" ? (permit.plan.stage || "full") : permit.plan[field];
      if (serverValue !== permitValue) throw new Error("수집 허가와 서버 계획이 일치하지 않습니다");
    }
    if (stableJson(server.plan?.basicProductIds) !== stableJson(permit.plan.basicProductIds)) {
      throw new Error("수집 허가와 서버 계획이 일치하지 않습니다");
    }
    if (server.expiresAt !== permit.expiresAt) throw new Error("수집 허가 만료 시간이 일치하지 않습니다");
    if (server.state === "COMPLETE" && server.publication?.sourceImportRunId !== attemptId) {
      throw new Error("쿠팡 상품 반영 영수증이 시도와 일치하지 않습니다");
    }
  }

  function stableJson(value) {
    return root.KidItemCoupangCatalog.stableStringify(value);
  }

  function wire(dependencies, state) {
    return root.KidItemSourcingAttemptWire.create({
      chrome, sourcePath: state ? runApiPath(state).slice(0, runApiPath(state).lastIndexOf("/")) : "",
      requestFailureMessage: "KidItem API 오류",
    });
  }

  function wireConfig(dependencies) {
    return { apiBase: "", request: dependencies.authedFetch,
      headers: { "Content-Type": "application/json" } };
  }

  async function apiJson(dependencies, path, init, options = {}) {
    try {
      return await wire(dependencies).requestJsonWithRetry(
        wireConfig(dependencies), path, init, undefined, options,
      );
    } catch (error) {
      // HTTP conflicts and validation responses are durable owner decisions,
      // not transport loss. In particular, a details admission 409 can mean
      // that the pinned basics basis no longer matches; retrying that request
      // forever leaves the completed basics owner looking RUNNING while no
      // child exists. Only an absent status or a server-side failure is
      // ambiguous enough to replay.
      if (!Number.isInteger(error?.status) || error.status >= 500) {
        error.catalogTransport = true;
      }
      throw error;
    }
  }

  async function storeTerminal(state, dependencies, terminal, replaceRejected = false) {
    return mutateState(dependencies, (current) => {
      if (current?.attemptId !== state.attemptId || current.status !== "running") return null;
      return { ...current, pendingTerminal: current.pendingTerminal && !replaceRejected
        ? current.pendingTerminal : terminal, updatedAt: Date.now() };
    });
  }

  async function submitTerminal(state, dependencies) {
    const terminal = state.pendingTerminal;
    try {
      const server = await getServerStatus(dependencies, state.channelAccountId, state.attemptId, state.permit);
      if (server.state !== "RUNNING") return finish(state, dependencies, server);
      if (Date.now() >= Date.parse(state.permit.expiresAt)) return clearAlarm(dependencies);
      const response = await wire(dependencies, state).terminal(
        wireConfig(dependencies), state.permit,
        { method: "POST", suffix: "/" + terminal.kind, body: terminal.body },
        (value) => { assertOwnedServerStatus(value, state.channelAccountId, state.attemptId, state.permit); return value; },
        terminal.body?.code === "USER_CANCELLED"
          ? {}
          : { shouldContinue: () => continueWhileActive(state, dependencies, terminal) },
      );
      await finish(state, dependencies, response);
    } catch (error) {
      let server;
      try { server = await getServerStatus(dependencies, state.channelAccountId, state.attemptId, state.permit); }
      catch { /* Keep the exact terminal intent while the owner is unavailable. */ }
      if (server && server.state !== "RUNNING") return finish(state, dependencies, server);
      if (terminal.kind === "finalize" && [400, 422].includes(error?.status) && server?.state === "RUNNING") {
        const failed = await storeTerminal(state, dependencies, {
          kind: "fail", body: failureBody(error, state),
        }, true);
        if (failed) return submitTerminal(failed, dependencies);
      }
      await scheduleNextStep(dependencies);
    }
  }

  function failureBody(error, state) {
    return { code: error?.code || "browser_collection_failed",
      message: String(error?.message || error).slice(0, 1000),
      phase: statusPhase(state.phase) };
  }

  async function handleStepError(error, dependencies, original) {
    const state = await getState(dependencies);
    if (!state || state.attemptId !== original?.attemptId ||
      rootAttemptId(state) !== rootAttemptId(original) || state.status !== "running") return;
    if (typeof dependencies.collectionSessions.isActive === "function" &&
      !(await dependencies.collectionSessions.isActive(
        sessionAttemptId(state),
        dependencies.environmentId,
        "channels.coupang_catalog",
      ))) {
      await clearAlarm(dependencies);
      return;
    }
    if (error?.code === "WING_PROVIDER_RATE_LIMITED") {
      await pauseForRateLimit(state, dependencies, {
        nextAllowedAt: error.nextAllowedAt,
        message: error.message,
      });
      return;
    }
    if (state.pendingTerminal || error?.catalogTransport) { await scheduleNextStep(dependencies); return; }
    const pending = await storeTerminal(state, dependencies, { kind: "fail", body: failureBody(error, state) });
    if (pending) await submitTerminal(pending, dependencies);
  }

  async function finish(state, dependencies, server) {
    assertOwnedServerStatus(server, state.channelAccountId, state.attemptId, state.permit);
    if (server.state === "RUNNING") throw new Error("쿠팡 상품 전체 반영이 아직 확인되지 않았습니다");
    if (server.state === "COMPLETE" && catalogStage(state) === "basics" &&
      state.permit.plan.detailsIdempotencyKey && !chainIsStopped(state)) {
      return handoffToDetails(state, dependencies);
    }
    if (chainIsStopped(state) &&
      (state.chainPhase === "admitting_details" || state.pendingChildCancellation) &&
      state.permit?.plan?.detailsIdempotencyKey) {
      const held = await mutateState(dependencies, (current) => {
        if (!current || rootAttemptId(current) !== rootAttemptId(state) || current.status !== "running") return null;
        return {
          ...current,
          status: "running",
          phase: "handoff",
          pendingTerminal: null,
          updatedAt: Date.now(),
        };
      });
      if (held) await scheduleNextStep(dependencies);
      return;
    }
    const done = await mutateState(dependencies, (current) => {
      if (current?.attemptId !== state.attemptId || current.status !== "running") return null;
      const stopped = chainIsStopped(current);
      return { ...current, status: server.state === "COMPLETE" ? "done" : "error",
        phase: "finished", pendingTerminal: null,
        chainPhase: stopped ? "stopped" : "finished",
        currentAttemptId: current.attemptId,
        currentStage: catalogStage(current),
        hydratedProducts: server.progress?.hydratedProducts ?? current.hydratedProducts,
        discoveredProducts: server.progress?.discoveredProducts ?? current.discoveredProducts,
        error: server.state === "FAILED" ? server.error?.message || "쿠팡 상품 수집 실패" : null,
        endedAt: Date.now(), updatedAt: Date.now() };
    });
    if (!done) return;
    await clearAlarm(dependencies);
    const ownerId = sessionAttemptId(state);
    const session = await dependencies.collectionSessions.getOwned(ownerId, dependencies.environmentId);
    if (!(server.state === "FAILED" && session?.attention && state.pendingTerminal?.body?.code !== "USER_CANCELLED")) {
      if (!(await closeManagedWindow(dependencies, ownerId))) {
        // Keep the owner session as a durable cleanup hold. A later explicit
        // reconciliation can retry the managed-window close before deleting
        // the session and its cancellation fence.
        return;
      }
      await dependencies.collectionSessions.remove(ownerId);
    }
    stoppedChains.delete(ownerId);
    dependencies.notifyDashboard();
  }

  async function isChainSessionActive(state, dependencies) {
    if (chainIsStopped(state)) return false;
    if (typeof dependencies.collectionSessions.isActive !== "function") return true;
    return dependencies.collectionSessions.isActive(
      sessionAttemptId(state),
      dependencies.environmentId,
      "channels.coupang_catalog",
    );
  }

  async function settleStoppedChain(state, dependencies) {
    const ownerId = sessionAttemptId(state);
    let current = await getState(dependencies);
    if (current?.pendingTerminal) {
      await submitTerminal(current, dependencies);
      current = await getState(dependencies);
      if (current?.pendingTerminal) {
        await scheduleNextStep(dependencies);
        return current;
      }
    }
    if (current?.permit && current.attemptId === ownerId) {
      try {
        const server = await getServerStatus(
          dependencies,
          current.channelAccountId,
          current.attemptId,
          current.permit,
        );
        if (server.state === "RUNNING") {
          await scheduleNextStep(dependencies);
          return current;
        }
      } catch {
        await scheduleNextStep(dependencies);
        return current;
      }
    }
    await mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== ownerId) return current;
      return {
        ...current,
        status: "done",
        phase: "finished",
        chainPhase: "stopped",
        pendingTerminal: null,
        endedAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    await clearAlarm(dependencies);
    if (!(await closeManagedWindow(dependencies, ownerId))) {
      // The owner is terminal, but its local resource is not proven closed.
      // Retain the session so a later cancellation/reconciliation can retry
      // cleanup without losing the owner fence.
      dependencies.notifyDashboard();
      return current;
    }
    await dependencies.collectionSessions.remove(ownerId).catch(() => undefined);
    dependencies.notifyDashboard();
  }

  async function settleRejectedDetailsHandoff(state, dependencies) {
    const ownerId = sessionAttemptId(state);
    const rejected = await mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== ownerId || current.status !== "running") return null;
      return {
        ...current,
        status: "done",
        phase: "finished",
        chainPhase: "handoff_rejected",
        // The server's completed basics owner still carries its pending
        // whole-flow projection until expiry; only local activity settles here.
        pendingTerminal: null,
        pendingChildAdmission: null,
        error: String(state.error || "상세 수집 기준이 더 이상 유효하지 않습니다"),
        endedAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    if (!rejected) return;
    await clearAlarm(dependencies);
    if (await closeManagedWindow(dependencies, ownerId)) {
      await dependencies.collectionSessions.remove(ownerId).catch(() => undefined);
    }
    stoppedChains.delete(ownerId);
    dependencies.notifyDashboard();
  }

  async function rememberPendingChildCancellation(state, dependencies, childPermit) {
    const rootId = rootAttemptId(state);
    const idempotencyKey = state.pendingChildAdmission?.idempotencyKey ||
      state.detailsIdempotencyKey || state.permit?.plan?.detailsIdempotencyKey;
    if (!idempotencyKey || !rootId) {
      throw new Error("상세 수집 취소 기준이 없습니다");
    }
    return mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== rootAttemptId(state)) return current;
      return {
        ...current,
        status: "running",
        chainStopRequested: true,
        chainPhase: "cancelling_details",
        pendingChildCancellation: {
          attemptId: childPermit.attemptId,
          rootAttemptId: rootId,
          idempotencyKey,
          expectedBasicAttemptId: rootId,
        },
        updatedAt: Date.now(),
      };
    });
  }

  async function clearPendingChildCancellation(state, dependencies, childPermit) {
    return mutateState(dependencies, (current) => {
      if (!current || rootAttemptId(current) !== rootAttemptId(state)) return current;
      const pending = current.pendingChildCancellation;
      if (pending?.attemptId !== childPermit.attemptId) return current;
      const next = { ...current, updatedAt: Date.now() };
      delete next.pendingChildCancellation;
      return next;
    });
  }

  async function cancelChildPermit(childPermit, dependencies, state) {
    await rememberPendingChildCancellation(state, dependencies, childPermit);
    try {
      const response = await wire(dependencies, state).terminal(
        wireConfig(dependencies), childPermit,
        {
          method: "POST",
          suffix: "/fail",
          body: {
            code: "USER_CANCELLED",
            message: "기본 목록에서 상세 수집으로 넘기는 중 수집이 중단되었습니다",
            phase: "discovery",
          },
        },
      );
      assertOwnedServerStatus(
        response,
        childPermit.plan.channelAccountId,
        childPermit.attemptId,
        childPermit,
      );
      if (response.state !== "FAILED") {
        throw new Error("상세 수집 중단 영수증이 시도와 일치하지 않습니다");
      }
      await clearPendingChildCancellation(state, dependencies, childPermit);
      return true;
    } catch {
      // A terminal child may reject a late cancellation with HTTP 409, and a
      // lost/malformed ACK may have committed the same terminal state. Read
      // the exact child owner before deciding that cancellation still needs a
      // retry; terminal COMPLETE is not a valid cancellation receipt, but it
      // is enough to prove that no child remains RUNNING/orphaned.
      let terminal;
      try {
        terminal = await getServerStatus(
          dependencies,
          childPermit.plan.channelAccountId,
          childPermit.attemptId,
          childPermit,
        );
      } catch {
        terminal = null;
      }
      if (terminal?.state === "FAILED" || terminal?.state === "COMPLETE") {
        await clearPendingChildCancellation(state, dependencies, childPermit);
        return true;
      }
      // Keep the child permit durable and retryable. Settling the root before
      // this ACK would leave a committed child owner with no cancellation
      // path after a worker restart or a lost response.
      await rememberPendingChildCancellation(state, dependencies, childPermit);
      await scheduleNextStep(dependencies);
      return false;
    }
  }

  async function restorePendingChildCancellationPermit(state, dependencies) {
    const pending = state.pendingChildCancellation;
    const rootId = rootAttemptId(state);
    if (!pending?.attemptId || !pending.idempotencyKey ||
      pending.rootAttemptId !== rootId || pending.expectedBasicAttemptId !== rootId) {
      await scheduleNextStep(dependencies);
      return null;
    }
    try {
      const childPermit = await admitDetailsPermit(
        state,
        dependencies,
        pending.idempotencyKey,
        () => true,
      );
      if (childPermit.attemptId !== pending.attemptId ||
        childPermit.plan.rootAttemptId !== pending.rootAttemptId ||
        childPermit.plan.basicAttemptId !== pending.expectedBasicAttemptId) {
        await scheduleNextStep(dependencies);
        return null;
      }
      return childPermit;
    } catch (error) {
      if (error?.catalogTransport || error?.childAdmissionAck) {
        await scheduleNextStep(dependencies);
        return null;
      }
      if (error?.childAdmissionRejected) {
        // The child was already admitted before this linkage was persisted.
        // A later 4xx while replaying the idempotent admission does not prove
        // that the known child is terminal, so retain its cancellation fence
        // and wait for a successful re-admission or a canonical child read.
        await scheduleNextStep(dependencies);
        return null;
      }
      throw error;
    }
  }

  async function admitDetailsPermit(state, dependencies, childKey, shouldContinue) {
    const rootId = sessionAttemptId(state);
    let rawPermit;
    try {
      rawPermit = await apiJson(
        dependencies,
        `/api/channels/accounts/${encodeURIComponent(state.channelAccountId)}` +
          "/catalog-imports/coupang-wing/attempts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": childKey,
          },
          body: JSON.stringify({
            collectorVersion: state.permit.plan.collectorVersion,
            stage: "details",
            expectedBasicAttemptId: rootId,
          }),
        },
        { shouldContinue },
      );
    } catch (error) {
      // A definitive admission rejection proves that no usable child permit
      // was issued. Settle the local chain and leave the completed basics
      // publication intact so the next explicit 상품 받기 gets a fresh root.
      // A network/5xx failure remains catalogTransport and keeps the original
      // child key durable for replay.
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
        const rejection = error instanceof Error
          ? error
          : new Error("상세 수집 허가가 거부되었습니다");
        rejection.childAdmissionRejected = true;
        throw rejection;
      }
      throw error;
    }
    try {
      const permit = validatePermit(rawPermit);
      if (permit.plan.stage !== "details" ||
        permit.plan.basicAttemptId !== rootId ||
        permit.plan.rootAttemptId !== rootId) {
        throw new Error("상세 수집 기준이 기본 목록 시도와 일치하지 않습니다");
      }
      return permit;
    } catch (error) {
      // A 2xx response is not proof that the child admission receipt is
      // usable. The request is idempotent and may already have committed the
      // child, so retain the pending key and replay it instead of deleting the
      // root session and orphaning that owner.
      const ackError = error instanceof Error
        ? error
        : new Error("상세 수집 허가 응답이 올바르지 않습니다");
      ackError.childAdmissionAck = true;
      throw ackError;
    }
  }

  async function replayStoppedDetailsAdmission(state, dependencies) {
    const childKey = state.pendingChildAdmission?.idempotencyKey ||
      state.permit.plan.detailsIdempotencyKey;
    if (!childKey) return settleStoppedChain(state, dependencies);
    try {
      const childPermit = await admitDetailsPermit(
        state,
        dependencies,
        childKey,
        () => true,
      );
      if (!(await cancelChildPermit(childPermit, dependencies, state))) return;
      const settled = await getState(dependencies);
      return settleStoppedChain(settled || state, dependencies);
    } catch (error) {
      if (error?.catalogTransport) {
        await scheduleNextStep(dependencies);
        return;
      }
      if (error?.childAdmissionAck) {
        await scheduleNextStep(dependencies);
        return;
      }
      return settleStoppedChain(state, dependencies);
    }
  }

  async function handoffToDetails(state, dependencies) {
    const rootId = sessionAttemptId(state);
    const childKey = state.permit.plan.detailsIdempotencyKey;
    if (!childKey) return settleStoppedChain(state, dependencies);
    const marked = await mutateState(dependencies, (current) => {
      if (!current || current.attemptId !== state.attemptId || current.status !== "running" ||
        chainIsStopped(current)) return null;
      return {
        ...current,
        chainPhase: "admitting_details",
        pendingChildAdmission: {
          idempotencyKey: childKey,
          expectedBasicAttemptId: rootId,
        },
        currentAttemptId: current.attemptId,
        currentStage: "basics",
        updatedAt: Date.now(),
      };
    });
    if (!marked) return;
    const handoffState = marked;
    if (!(await isChainSessionActive(handoffState, dependencies))) {
      return settleStoppedChain(handoffState, dependencies);
    }

    try {
      const childPermit = await admitDetailsPermit(
        handoffState,
        dependencies,
        childKey,
        () => isChainSessionActive(handoffState, dependencies),
      );
      if (!(await isChainSessionActive(handoffState, dependencies))) {
        if (await cancelChildPermit(childPermit, dependencies, handoffState)) {
          return settleStoppedChain(handoffState, dependencies);
        }
        return;
      }
      const childServer = await getServerStatus(
        dependencies,
        state.channelAccountId,
        childPermit.attemptId,
        childPermit,
      );
      if (!(await isChainSessionActive(handoffState, dependencies))) {
        if (await cancelChildPermit(childPermit, dependencies, handoffState)) {
          return settleStoppedChain(handoffState, dependencies);
        }
        return;
      }
      const childState = {
        ...handoffState,
        attemptId: childPermit.attemptId,
        permit: childPermit,
        stage: "details",
        detailsIdempotencyKey: childKey,
        currentAttemptId: childPermit.attemptId,
        currentStage: "details",
        chainPhase: "details",
        phase: childServer.phase || "discovery",
        currentPage: childServer.manifest?.expectedPages ? 0 : handoffState.currentPage,
        totalPages: childServer.manifest?.expectedPages || 0,
        discoveredProducts: childServer.progress?.discoveredProducts || 0,
        hydratedProducts: childServer.progress?.hydratedProducts || 0,
        uploadedChunks: childServer.progress?.storedChunks || 0,
        manifest: childServer.manifest || null,
        discoveryItems: [],
        pendingTerminal: null,
        error: null,
        chainStopRequested: false,
        updatedAt: Date.now(),
      };
      delete childState.pendingChildAdmission;
      const accepted = await mutateState(dependencies, (current) => {
        if (!current || current.attemptId !== state.attemptId || current.status !== "running" ||
          chainIsStopped(current)) return null;
        return childState;
      });
      if (!accepted) {
        if (await cancelChildPermit(childPermit, dependencies, handoffState)) {
          return settleStoppedChain(handoffState, dependencies);
        }
        return;
      }
      if (childServer.state === "COMPLETE" || childServer.state === "FAILED") {
        return finish(childState, dependencies, childServer);
      }
      await dependencies.collectionSessions.progress(rootId, {
        current: childServer.progress?.hydratedProducts || 0,
        total: childServer.manifest?.totalItems || 0,
        completed: childServer.progress?.hydratedProducts || 0,
        failed: 0,
        label: "Wing 전체 상세 수집",
      });
      await scheduleNextStep(dependencies);
      dependencies.notifyDashboard();
    } catch (error) {
      if (chainIsStopped(handoffState) || error?.code === "COLLECTION_CANCELLED") {
        return replayStoppedDetailsAdmission(handoffState, dependencies);
      }
      if (error?.childAdmissionRejected) {
        handoffState.error = error?.message || "상세 수집 기준이 더 이상 유효하지 않습니다";
        await settleRejectedDetailsHandoff(handoffState, dependencies);
        return;
      }
      if (error?.childAdmissionAck) {
        await scheduleNextStep(dependencies);
        return;
      }
      if (error?.catalogTransport) {
        await scheduleNextStep(dependencies);
        return;
      }
      await mutateState(dependencies, (current) => {
        if (!current || rootAttemptId(current) !== rootId) return current;
        return {
          ...current,
          status: "error",
          phase: "finished",
          chainPhase: "handoff_failed",
          error: String(error?.message || error || "상세 수집을 시작하지 못했습니다"),
          endedAt: Date.now(),
          updatedAt: Date.now(),
        };
      });
      await clearAlarm(dependencies);
      if (await closeManagedWindow(dependencies, rootId)) {
        await dependencies.collectionSessions.remove(rootId).catch(() => undefined);
      }
      dependencies.notifyDashboard();
    }
  }

  async function publicStatus(state, dependencies) {
    const ownerId = sessionAttemptId(state);
    const session = state && await dependencies.collectionSessions.getOwned(ownerId, dependencies.environmentId);
    if (!state) return { attemptId: null, active: false, attention: null };
    const sessionActive = !session || typeof dependencies.collectionSessions.isActive !== "function"
      ? Boolean(session)
      : await dependencies.collectionSessions.isActive(
        ownerId,
        dependencies.environmentId,
        "channels.coupang_catalog",
      );
    const currentStage = chainCurrentStage(state);
    return {
      // The bridge is queried with the stable root ID even while the owner
      // token has moved to the details child.
      attemptId: ownerId,
      active: state.status === "running" && sessionActive && !hasPendingRateLimit(state) &&
        hasOwnerPermit(state) && Date.now() < Date.parse(state.permit.expiresAt),
      attention: session?.attention || null,
      phase: state.phase,
      currentPage: state.currentPage || 0,
      totalPages: state.totalPages || 0,
      hydratedProducts: state.hydratedProducts || 0,
      discoveredProducts: state.discoveredProducts || 0,
      uploadedChunks: state.uploadedChunks || 0,
      rootAttemptId: ownerId,
      currentAttemptId: state.attemptId,
      currentStage,
      ...(state.error ? { error: state.error } : {}),
    };
  }

  function runApiPath(state) {
    return `/api/channels/accounts/${encodeURIComponent(state.channelAccountId)}` +
      `/catalog-imports/coupang-wing/attempts/${encodeURIComponent(state.attemptId)}`;
  }

  function buildListUrl(listUrl, page) {
    const url = new URL(listUrl);
    url.searchParams.set("page", String(page));
    return url.toString();
  }

  function buildDetailUrl(plan, externalProductId) {
    if (plan?.detailUrl === WING_DETAIL_URL) {
      return `${WING_DETAIL_URL}/${encodeURIComponent(String(externalProductId))}`;
    }
    const url = new URL(plan?.detailUrl || LEGACY_WING_DETAIL_URL);
    url.searchParams.set("vendorInventoryId", externalProductId);
    return url.toString();
  }

  function isWingListUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname === "wing.coupang.com" &&
        url.pathname.includes("vendor-inventory/list");
    } catch {
      return false;
    }
  }

  function isWingLoginUrl(value) {
    try {
      const url = new URL(value);
      if (url.hostname === "xauth.coupang.com") return true;
      return url.hostname === "wing.coupang.com" &&
        /(?:login|signin|auth)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function assertDiscoveryPageComplete(page, manifest, items) {
    const offset = (page - 1) * manifest.pageSize;
    const expected = Math.min(manifest.pageSize, manifest.totalItems - offset);
    if (items.length !== expected) {
      throw new Error(
        `Wing ${page}페이지 상품 수가 불완전합니다 (${items.length}/${expected})`,
      );
    }
  }

  function assertDiscoveryPageResponse(response, page, pageSize, expectedTotalItems = null) {
    if (!response || response.success !== true || response.page !== page ||
      response.pageSize !== pageSize || !Array.isArray(response.records) ||
      !Number.isSafeInteger(response.totalItems) || response.totalItems < 0 ||
      !Number.isSafeInteger(response.totalPages) || response.totalPages < 0) {
      throw new Error(`Wing ${page}페이지 API 응답이 올바르지 않습니다`);
    }
    if (expectedTotalItems !== null && response.totalItems !== expectedTotalItems) {
      throw new Error("수집 도중 Wing 전체 상품 수가 변경되었습니다");
    }
    const expectedPages = response.totalItems === 0
      ? 0
      : Math.ceil(response.totalItems / response.pageSize);
    if (response.totalPages !== expectedPages) {
      throw new Error("Wing 상품 목록 API 페이지 수가 전체 상품 수와 다릅니다");
    }
    const expected = response.totalItems === 0
      ? 0
      : Math.min(
        response.pageSize,
        response.totalItems - ((page - 1) * response.pageSize),
      );
    if (page < 1 || (response.totalItems > 0 && page > response.totalPages) ||
      response.records.length !== expected) {
      throw new Error(
        `Wing ${page}페이지 상품 수가 불완전합니다 (${response.records.length}/${expected})`,
      );
    }
  }

  function mergeDiscoveryItems(existing, pageItems) {
    const productOrdinals = new Map();
    for (const item of [...(Array.isArray(existing) ? existing : []), ...pageItems]) {
      const previousOrdinal = productOrdinals.get(item.externalProductId);
      if (previousOrdinal !== undefined && previousOrdinal !== item.ordinal) {
        throw new Error(
          `Wing 상품 ID가 여러 목록 위치에서 발견되었습니다: ${item.externalProductId}`,
        );
      }
      productOrdinals.set(item.externalProductId, item.ordinal);
    }
    const byOrdinal = new Map(
      (Array.isArray(existing) ? existing : []).map((item) => [item.ordinal, item]),
    );
    for (const item of pageItems) byOrdinal.set(item.ordinal, item);
    return [...byOrdinal.values()].sort((left, right) => left.ordinal - right.ordinal);
  }

  function statusPhase(phase) {
    if (phase === "hydration") return "hydration";
    if (phase === "ready_to_finalize") return "ready_to_finalize";
    return "discovery";
  }

  function requiredUuid(value, name) {
    const text = typeof value === "string" ? value : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
      throw new Error(`${name} 값이 올바르지 않습니다`);
    }
    return text;
  }

  function stateKey(dependencies) {
    return dependencies?.stateKey || STATE_KEY;
  }

  function alarmName(dependencies) {
    return dependencies?.alarmName || ALARM_NAME;
  }

  async function scheduleNextStep(dependencies) {
    const state = await getState(dependencies);
    if (state?.status !== "running" || hasPendingRateLimit(state) ||
      !hasOwnerPermit(state) || Date.now() >= Date.parse(state.permit.expiresAt)) {
      await clearAlarm(dependencies);
      return;
    }
    chrome.alarms.create(alarmName(dependencies), { when: Date.now() + 1_000 });
  }

  function clearAlarm(dependencies) {
    return new Promise((resolve) => chrome.alarms.clear(alarmName(dependencies), resolve));
  }

  function getState(dependencies) {
    const key = stateKey(dependencies);
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (data) => resolve(data?.[key] || null));
    });
  }

  async function assertActive(state, dependencies, { allowPendingTerminal = null } = {}) {
    const current = await getState(dependencies);
    const pendingTerminal = current?.pendingTerminal;
    const pendingTerminalAllowed = allowPendingTerminal && pendingTerminal &&
      stableJson(pendingTerminal) === stableJson(allowPendingTerminal);
    if (current?.attemptId !== state.attemptId || rootAttemptId(current) !== rootAttemptId(state) ||
      current.status !== "running" || chainIsStopped(current) ||
      (pendingTerminal && !pendingTerminalAllowed)) throw new Error("쿠팡 상품 수집이 중단되었습니다");
    if (Date.now() >= Date.parse(state.permit.expiresAt)) {
      throw Object.assign(new Error("쿠팡 상품 수집 허가가 만료되었습니다"), { code: "SOURCE_ATTEMPT_EXPIRED" });
    }
    if (hasPendingRateLimit(current)) {
      throw Object.assign(new Error("쿠팡 Wing 요청 한도 대기 중입니다"), {
        code: "WING_PROVIDER_RATE_LIMITED",
        nextAllowedAt: current.nextAllowedAt,
      });
    }
    const session = await dependencies.collectionSessions.getOwned(sessionAttemptId(state), dependencies.environmentId);
    if (session?.producer !== "channels.coupang_catalog") throw new Error("쿠팡 수집 세션 소유권이 없습니다");
    if (typeof dependencies.collectionSessions.isActive === "function" &&
      !(await dependencies.collectionSessions.isActive(
        sessionAttemptId(state),
        dependencies.environmentId,
        "channels.coupang_catalog",
      ))) throw new Error("쿠팡 상품 수집이 중단되었습니다");
  }

  async function continueWhileActive(state, dependencies, pendingTerminal = null) {
    try {
      await assertActive(state, dependencies, { allowPendingTerminal: pendingTerminal });
      return true;
    } catch {
      return false;
    }
  }

  function mutateState(dependencies, update) {
    const key = stateKey(dependencies);
    const previous = stateWrites.get(key) || Promise.resolve();
    const result = previous.catch(() => {}).then(async () => {
      const next = update(await getState(dependencies));
      if (next) await chrome.storage.local.set({ [key]: next });
      return next;
    });
    const tail = result.catch(() => {});
    stateWrites.set(key, tail);
    return result.finally(() => { if (stateWrites.get(key) === tail) stateWrites.delete(key); });
  }

  function setState(state, dependencies) {
    return mutateState(dependencies, (current) => {
      if (current && (current.attemptId !== state.attemptId || current.pendingTerminal ||
        current.status !== "running")) throw new Error("쿠팡 상품 수집이 중단되었습니다");
      return state;
    });
  }

  async function getOrCreateManagedTab(state, dependencies) {
    await assertActive(state, dependencies);
    await chrome.storage.local.remove([LEGACY_TAB_KEY, LEGACY_WINDOW_KEY]);
    const owned = await dependencies.collectionWindow.getOrCreate(
      sessionAttemptId(state),
      WING_LIST_URL,
    );
    try {
      await assertActive(state, dependencies);
      const attached = await dependencies.collectionSessions.attachTab(sessionAttemptId(state), {
        tabId: owned.tabId,
        windowId: owned.windowId,
      });
      if (!attached) throw new Error("쿠팡 수집 세션이 더 이상 활성 상태가 아닙니다");
      await assertActive(state, dependencies);
      return { id: owned.tabId, windowId: owned.windowId };
    } catch (error) {
      await closeManagedWindow(dependencies, sessionAttemptId(state)).catch(() => undefined);
      throw error;
    }
  }

  async function ensureDiscoveryTabReady(
    state,
    dependencies,
    tab,
    { forceNavigation = false } = {},
  ) {
    let candidate = tab;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await getManagedTab(dependencies, candidate.id).catch(() => null);
      if (!current) {
        if (attempt === 1) throw new Error("Wing 수집 탭을 확인할 수 없습니다");
        candidate = await getOrCreateManagedTab(state, dependencies);
        continue;
      }

      if (isWingLoginUrl(current.url || "")) {
        return { tab: candidate, pendingLogin: true, settled: false };
      }

      if (forceNavigation || !isWingListUrl(current.url || "")) {
        const loaded = await navigateManagedTab(
          state,
          dependencies,
          candidate,
          buildListUrl(state.permit.plan.listUrl, 1),
        );
        const loadedUrl = typeof loaded === "object" ? loaded?.url : "";
        return {
          tab: candidate,
          pendingLogin: !isWingListUrl(loadedUrl || ""),
          settled: true,
        };
      }

      if (current.status !== "complete") {
        const loaded = await dependencies.waitForTabComplete(candidate.id, {
          expectedUrl: current.url,
          timeoutMs: 45_000,
        });
        if (loaded === false || loaded === null) {
          throw new Error("Wing 수집 탭 준비가 완료되지 않았습니다");
        }
        const loadedUrl = typeof loaded === "object" ? loaded?.url : current.url;
        return {
          tab: candidate,
          pendingLogin: !isWingListUrl(loadedUrl || ""),
          settled: true,
        };
      }

      return { tab: candidate, pendingLogin: false, settled: false };
    }
    throw new Error("Wing 수집 탭 준비에 실패했습니다");
  }

  function getManagedTab(dependencies, tabId) {
    if (typeof dependencies.getTab === "function") return dependencies.getTab(tabId);
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime?.lastError || !tab?.id) {
          reject(new Error(chrome.runtime?.lastError?.message || "Wing 탭 조회 실패"));
          return;
        }
        resolve(tab);
      });
    });
  }

  async function navigateManagedTab(state, dependencies, tab, url) {
    await assertActive(state, dependencies);
    const owned = await dependencies.collectionWindow.navigate(sessionAttemptId(state), url);
    if (owned.tabId !== tab.id || owned.windowId !== tab.windowId) {
      throw new Error("Wing 수집 창 소유권이 변경되었습니다");
    }
    const loaded = await dependencies.waitForTabComplete(tab.id, {
      expectedUrl: url,
      timeoutMs: 45_000,
    });
    await assertActive(state, dependencies);
    return loaded;
  }

  async function closeManagedWindow(dependencies, attemptId) {
    await chrome.storage.local.remove([LEGACY_TAB_KEY, LEGACY_WINDOW_KEY]);
    try {
      return (await dependencies.collectionWindow.close(attemptId)) === true;
    } catch {
      return false;
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemCoupangCatalogImport = {
    admit,
    alarmName: ALARM_NAME,
    cancel,
    getStatus,
    handleAlarm,
    isContinuing,
    recover,
    start,
  };
})(globalThis);
