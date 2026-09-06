(function initializeCoupangCatalogImport(root) {
  "use strict";

  const ALARM_NAME = "kiditem-coupang-catalog-import-step";
  const STATE_KEY = "kiditem_coupang_catalog_import";
  const LEGACY_TAB_KEY = "kiditem_coupang_catalog_tab_id";
  const LEGACY_WINDOW_KEY = "kiditem_coupang_catalog_window_id";
  const MAX_PRODUCTS_PER_CHUNK = 20;
  const WING_LIST_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1";
  const WING_DETAIL_URL =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify";

  const activeSteps = new Map();
  const stateWrites = new Map();

  async function start(message, dependencies) {
    const permit = validatePermit(message?.permit);
    const channelAccountId = permit.plan.channelAccountId;
    const attemptId = permit.attemptId;
    const server = await getServerStatus(dependencies, channelAccountId, attemptId, permit);
    if (server.state === "FAILED") {
      throw new Error(server.error?.message || "실패한 수집은 새 시도로 다시 시작해주세요");
    }

    if (server.state === "RUNNING" && Date.now() >= Date.parse(permit.expiresAt)) {
      throw new Error("만료된 수집은 새 시도로 다시 시작해주세요");
    }
    const stored = await getState(dependencies);
    const current = hasOwnerPermit(stored) ? stored : null;
    let terminalAttemptId;
    if (
      current?.status === "running" &&
      current.attemptId !== attemptId
    ) {
      const previous = await getServerStatus(dependencies, current.channelAccountId, current.attemptId, current.permit);
      if (previous.state === "RUNNING") throw new Error("다른 쿠팡 상품 수집이 이미 진행 중입니다");
      terminalAttemptId = current.attemptId;
    }

    const state = current?.attemptId === attemptId
      ? {
          ...current,
          permit,
          status: server.state === "COMPLETE" ? "done" : "running",
          error: null,
          updatedAt: Date.now(),
        }
      : {
          attemptId,
          channelAccountId,
          permit,
          status: server.state === "COMPLETE" ? "done" : "running",
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
    };
    await mutateState(dependencies, (latest) => {
      if (hasOwnerPermit(latest) && latest.status === "running" && latest.attemptId !== attemptId &&
        latest.attemptId !== terminalAttemptId) {
        throw new Error("다른 쿠팡 상품 수집이 이미 진행 중입니다");
      }
      if (hasOwnerPermit(latest) && latest.attemptId === attemptId && latest.pendingTerminal) {
        state.pendingTerminal = latest.pendingTerminal;
      }
      return state;
    });
    if (current && current.attemptId !== attemptId) {
      await closeManagedWindow(dependencies, current.attemptId);
      await dependencies.collectionSessions.remove(current.attemptId);
    }
    if (state.status === "done") {
      await clearAlarm(dependencies);
      await closeManagedWindow(dependencies, state.attemptId);
      await dependencies.collectionSessions.cancel(attemptId);
    }
    if (state.status === "running") {
      await dependencies.collectionSessions.start({
        attemptId, environmentId: dependencies.environmentId, producer: "channels.coupang_catalog",
      });
      if (!state.pendingTerminal) await dependencies.collectionSessions.progress(attemptId, {
        current: state.discoveredProducts || 0,
        total: state.manifest?.totalItems || state.discoveredProducts || 0,
        completed: state.discoveredProducts || 0,
        failed: 0,
        label: "Wing 상품 목록 확인",
      });
    }
    if (state.status === "running") {
      await scheduleNextStep(dependencies);
      runSoon(dependencies);
    }
    return { success: true, started: state.status === "running", ...await publicStatus(state, dependencies) };
  }

  function validatePermit(permit) {
    requiredUuid(permit?.attemptId, "attemptId");
    requiredUuid(permit?.attemptToken, "attemptToken");
    requiredUuid(permit?.plan?.channelAccountId, "channelAccountId");
    if (!Number.isFinite(Date.parse(permit?.expiresAt)) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(permit?.state) ||
      permit.plan?.collectorVersion !== "wing-inventory-v1" ||
      permit.plan?.listUrl !== WING_LIST_URL || permit.plan?.detailUrl !== WING_DETAIL_URL ||
      typeof permit.plan?.vendorId !== "string" || !permit.plan.vendorId.trim() ||
      !/^\d+$/.test(permit.plan?.publicationRevision || "")) {
      throw new Error("유효한 서버 수집 허가가 필요합니다");
    }
    return permit;
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
    if (!state || (attemptId && state.attemptId !== attemptId)) {
      return { attemptId: attemptId || null, active: false, attention: null };
    }
    if (state.status === "running") {
      if (Date.now() >= Date.parse(state.permit?.expiresAt)) {
        await clearAlarm(dependencies);
        const server = await getServerStatus(dependencies, state.channelAccountId, attemptId, state.permit);
        if (server.state !== "RUNNING") await finish(state, dependencies, server);
        return publicStatus(await getState(dependencies), dependencies);
      }
      await scheduleNextStep(dependencies);
      runSoon(dependencies);
    }
    return publicStatus(state, dependencies);
  }

  async function cancel(attemptId, dependencies) {
    requiredUuid(attemptId, "attemptId");
    const state = await getState(dependencies);
    if (!state || state.attemptId !== attemptId) {
      return { success: true, cancelled: false, attemptId };
    }
    if (state.status !== "running") {
      const server = await getServerStatus(dependencies, state.channelAccountId, attemptId, state.permit);
      if (server.state === "RUNNING") throw new Error("수집 종료가 아직 확인되지 않았습니다");
      await closeManagedWindow(dependencies, attemptId);
      await dependencies.collectionSessions.remove(attemptId);
    } else {
      const pending = await storeTerminal(state, dependencies, {
        kind: "fail", body: { code: "USER_CANCELLED", message: "사용자가 쿠팡 상품 수집을 중단했습니다",
          phase: statusPhase(state.phase) },
      });
      if (pending) await submitTerminal(pending, dependencies);
    }
    const current = await getState(dependencies);
    if (current?.attemptId !== attemptId) return { success: true, cancelled: false, attemptId, active: false, attention: null };
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
    const nextStep = getState(dependencies).then(async (state) => {
      stepAttemptId = state?.attemptId;
      try { await runOneStep(dependencies, state); }
      catch (error) { await handleStepError(error, dependencies, state); }
    })
      .finally(async () => {
        activeSteps.delete(key);
        const current = await getState(dependencies);
        if (current?.status === "running" && current.attemptId !== stepAttemptId) await scheduleNextStep(dependencies);
      });
    activeSteps.set(key, nextStep);
    return nextStep;
  }

  async function runOneStep(dependencies, state) {
    if (!state || state.status !== "running") return;
    if (!hasOwnerPermit(state) || Date.now() >= Date.parse(state.permit.expiresAt)) {
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
    const tab = await getOrCreateManagedTab(state, dependencies);
    const pageUrl = buildListUrl(page);
    const loaded = await navigateManagedTab(state, dependencies, tab, pageUrl);
    if (!isWingListUrl(loaded?.url || "")) {
      await pauseForAttention(
        state,
        dependencies,
        tab,
        "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
      );
      return;
    }
    await delay(500);
    await assertActive(state, dependencies);
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
    });
    await assertActive(state, dependencies);
    if (!response?.success) {
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
    const items = root.KidItemCoupangCatalog.buildDiscoveryItems(
      response.records,
      page,
      pageSize,
    );
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

    const payload = {
      version: 1,
      kind: "discovery_page",
      page,
      manifest,
      items,
    };
    await putChunk(dependencies, state, "discovery_page", page, payload, items.length);
    await assertActive(state, dependencies);
    const discoveryItems = mergeDiscoveryItems(state.discoveryItems, items);
    await setState({
      ...state,
      manifest,
      currentPage: page,
      totalPages: manifest.expectedPages,
      discoveredProducts: discoveryItems.length,
      discoveryItems,
      uploadedChunks: state.uploadedChunks + 1,
      updatedAt: Date.now(),
    }, dependencies);
    await dependencies.collectionSessions.progress(state.attemptId, {
      current: discoveryItems.length,
      total: manifest.totalItems,
      completed: discoveryItems.length,
      failed: 0,
      label: `Wing 상품 목록 ${page}페이지`,
    });
    await scheduleNextStep(dependencies);
  }

  async function confirmManifest(state, dependencies) {
    const tab = await getOrCreateManagedTab(state, dependencies);
    const loaded = await navigateManagedTab(
      state,
      dependencies,
      tab,
      buildListUrl(1),
    );
    if (!isWingListUrl(loaded?.url || "")) {
      await pauseForAttention(
        state,
        dependencies,
        tab,
        "쿠팡 Wing 로그인이 만료되었습니다. 알림에서 확인 탭을 열어주세요.",
      );
      return;
    }
    await delay(500);
    await assertActive(state, dependencies);
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
    });
    await assertActive(state, dependencies);
    if (!response?.success) throw new Error(response?.error || "Wing 목록 재확인 실패");
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
      kind: "manifest_confirmation",
      manifest: state.manifest,
    };
    const server = await putChunk(
      dependencies,
      state,
      "manifest_confirmation",
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
    const group = discoveryItems.slice(
      startOrdinal,
      startOrdinal + MAX_PRODUCTS_PER_CHUNK,
    );
    const tab = await getOrCreateManagedTab(state, dependencies);
    const products = [];
    for (const item of group) {
      const loaded = await navigateManagedTab(
        state,
        dependencies,
        tab,
        buildDetailUrl(item.externalProductId),
      );
      if (!isWingDetailUrl(loaded?.url || "")) {
        await pauseForAttention(
          state,
          dependencies,
          tab,
          "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.",
        );
        return;
      }
      const sellerProduct = await collectSellerProduct(tab.id, state, dependencies);
      await assertActive(state, dependencies);
      const product = root.KidItemCoupangCatalog.buildCatalogProduct(sellerProduct);
      if (product.externalProductId !== item.externalProductId) {
        throw new Error(
          `Wing 상세 상품 ID 불일치: ${item.externalProductId} / ${product.externalProductId}`,
        );
      }
      products.push({ ordinal: item.ordinal, product });
    }
    const payload = {
      version: 1,
      kind: "product_details",
      startOrdinal,
      products,
    };
    const updated = await putChunk(
      dependencies,
      state,
      "product_details",
      startOrdinal + 1,
      payload,
      products.length,
    );
    await assertActive(state, dependencies);
    await setState({
      ...state,
      hydratedProducts: updated.progress?.hydratedProducts ||
        (server.progress?.hydratedProducts || 0) + products.length,
      uploadedChunks: state.uploadedChunks + 1,
      updatedAt: Date.now(),
    }, dependencies);
    await dependencies.collectionSessions.progress(state.attemptId, {
      current: startOrdinal + products.length,
      total: state.manifest.totalItems,
      completed:
        updated.progress?.hydratedProducts ||
        (server.progress?.hydratedProducts || 0) + products.length,
      failed: 0,
      label: "Wing 상품 상세 수집",
    });
    await scheduleNextStep(dependencies);
  }

  async function pauseForAttention(state, dependencies, tab, message) {
    await dependencies.collectionSessions.attachTab(state.attemptId, {
      tabId: tab.id,
      windowId: tab.windowId,
    });
    await dependencies.collectionSessions.requireAttention(state.attemptId, {
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

  async function collectSellerProduct(tabId, state, dependencies) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assertActive(state, dependencies);
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
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

          for (const script of document.scripts) {
            const source = script.textContent || "";
            let keyIndex = source.indexOf('"oSellerProduct"');
            while (keyIndex >= 0) {
              const colon = source.indexOf(":", keyIndex + 16);
              const start = colon >= 0 ? source.indexOf("{", colon + 1) : -1;
              const end = start >= 0 ? balancedEnd(source, start) : -1;
              if (end > start) {
                try {
                  return JSON.parse(source.slice(start, end));
                } catch {
                  // Keep searching another data script.
                }
              }
              keyIndex = source.indexOf('"oSellerProduct"', keyIndex + 16);
            }
          }
          return null;
        },
      });
      await assertActive(state, dependencies);
      const product = results?.[0]?.result;
      if (product) return product;
      await delay(500);
    }
    throw new Error("Wing 상품 상세 appData를 읽을 수 없습니다");
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
    for (const field of ["collectorVersion", "listUrl", "detailUrl", "channelAccountId", "vendorId", "publicationRevision"]) {
      if (server.plan?.[field] !== permit.plan[field]) throw new Error("수집 허가와 서버 계획이 일치하지 않습니다");
    }
    if (server.expiresAt !== permit.expiresAt) throw new Error("수집 허가 만료 시간이 일치하지 않습니다");
    if (server.state === "COMPLETE" && server.publication?.sourceImportRunId !== attemptId) {
      throw new Error("쿠팡 상품 반영 영수증이 시도와 일치하지 않습니다");
    }
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

  async function apiJson(dependencies, path, init) {
    try {
      return await wire(dependencies).requestJsonWithRetry(wireConfig(dependencies), path, init);
    } catch (error) {
      if (![400, 422].includes(error?.status)) error.catalogTransport = true;
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
    if (!state || state.attemptId !== original?.attemptId || state.status !== "running") return;
    if (state.pendingTerminal || error?.catalogTransport) { await scheduleNextStep(dependencies); return; }
    const pending = await storeTerminal(state, dependencies, { kind: "fail", body: failureBody(error, state) });
    if (pending) await submitTerminal(pending, dependencies);
  }

  async function finish(state, dependencies, server) {
    assertOwnedServerStatus(server, state.channelAccountId, state.attemptId, state.permit);
    if (server.state === "RUNNING") throw new Error("쿠팡 상품 전체 반영이 아직 확인되지 않았습니다");
    const done = await mutateState(dependencies, (current) => {
      if (current?.attemptId !== state.attemptId || current.status !== "running") return null;
      return { ...current, status: server.state === "COMPLETE" ? "done" : "error",
        phase: "finished", pendingTerminal: null,
        hydratedProducts: server.progress?.hydratedProducts ?? current.hydratedProducts,
        discoveredProducts: server.progress?.discoveredProducts ?? current.discoveredProducts,
        error: server.state === "FAILED" ? server.error?.message || "쿠팡 상품 수집 실패" : null,
        endedAt: Date.now(), updatedAt: Date.now() };
    });
    if (!done) return;
    await clearAlarm(dependencies);
    const session = await dependencies.collectionSessions.getOwned(state.attemptId, dependencies.environmentId);
    if (!(server.state === "FAILED" && session?.attention && state.pendingTerminal?.body?.code !== "USER_CANCELLED")) {
      await closeManagedWindow(dependencies, state.attemptId);
      await dependencies.collectionSessions.remove(state.attemptId);
    }
    dependencies.notifyDashboard();
  }

  async function publicStatus(state, dependencies) {
    const session = state && await dependencies.collectionSessions.getOwned(state.attemptId, dependencies.environmentId);
    if (!state) return { attemptId: null, active: false, attention: null };
    return {
      attemptId: state.attemptId,
      active: state.status === "running" && hasOwnerPermit(state) && Date.now() < Date.parse(state.permit.expiresAt),
      attention: session?.attention || null,
      phase: state.phase,
      currentPage: state.currentPage || 0,
      totalPages: state.totalPages || 0,
      hydratedProducts: state.hydratedProducts || 0,
      discoveredProducts: state.discoveredProducts || 0,
      uploadedChunks: state.uploadedChunks || 0,
      ...(state.error ? { error: state.error } : {}),
    };
  }

  function runApiPath(state) {
    return `/api/channels/accounts/${encodeURIComponent(state.channelAccountId)}` +
      `/catalog-imports/coupang-wing/attempts/${encodeURIComponent(state.attemptId)}`;
  }

  function buildListUrl(page) {
    const url = new URL(WING_LIST_URL);
    url.searchParams.set("page", String(page));
    return url.toString();
  }

  function buildDetailUrl(externalProductId) {
    const url = new URL(WING_DETAIL_URL);
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

  function isWingDetailUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname === "wing.coupang.com" &&
        url.pathname.includes("vendor-inventory/modify");
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
    if (phase === "publishing") return "publishing";
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
    if (state?.status !== "running" || !hasOwnerPermit(state) || Date.now() >= Date.parse(state.permit.expiresAt)) {
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

  async function assertActive(state, dependencies) {
    const current = await getState(dependencies);
    if (current?.attemptId !== state.attemptId || current.status !== "running" ||
      current.pendingTerminal) throw new Error("쿠팡 상품 수집이 중단되었습니다");
    if (Date.now() >= Date.parse(state.permit.expiresAt)) {
      throw Object.assign(new Error("쿠팡 상품 수집 허가가 만료되었습니다"), { code: "SOURCE_ATTEMPT_EXPIRED" });
    }
    const session = await dependencies.collectionSessions.getOwned(state.attemptId, dependencies.environmentId);
    if (session?.producer !== "channels.coupang_catalog") throw new Error("쿠팡 수집 세션 소유권이 없습니다");
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
      state.attemptId,
      WING_LIST_URL,
    );
    await dependencies.collectionSessions.attachTab(state.attemptId, {
      tabId: owned.tabId,
      windowId: owned.windowId,
    });
    return { id: owned.tabId, windowId: owned.windowId };
  }

  async function navigateManagedTab(state, dependencies, tab, url) {
    await assertActive(state, dependencies);
    const owned = await dependencies.collectionWindow.navigate(state.attemptId, url);
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
    return dependencies.collectionWindow.close(attemptId);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemCoupangCatalogImport = {
    alarmName: ALARM_NAME,
    cancel,
    getStatus,
    handleAlarm,
    start,
  };
})(globalThis);
