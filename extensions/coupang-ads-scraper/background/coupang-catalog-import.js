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

  let activeStep = null;

  async function start(message, dependencies) {
    const channelAccountId = requiredUuid(message?.channelAccountId, "channelAccountId");
    const runId = requiredUuid(message?.runId, "runId");
    const server = await getServerStatus(dependencies, channelAccountId, runId);
    if (server.channelAccountId !== channelAccountId) {
      throw new Error("수집 실행과 쿠팡 채널 계정이 일치하지 않습니다");
    }

    const current = await getState();
    if (
      current?.status === "running" &&
      current.runId !== runId
    ) {
      throw new Error("다른 쿠팡 상품 수집이 이미 진행 중입니다");
    }

    const state = current?.runId === runId
      ? {
          ...current,
          status: server.status === "completed" ? "done" : "running",
          error: null,
          updatedAt: Date.now(),
        }
      : {
          runId,
          channelAccountId,
          status: server.status === "completed" ? "done" : "running",
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
    await setState(state);
    if (state.status === "done") {
      await clearAlarm();
      await closeManagedWindow(dependencies, state.runId);
      await dependencies.collectionSessions.succeed(runId);
    }
    if (state.status === "running") {
      await dependencies.collectionSessions.progress(runId, {
        current: 0,
        total: state.totalPages || 0,
        completed: state.discoveredProducts || 0,
        failed: 0,
        label: "Wing 상품 목록 확인",
      });
    }
    if (state.status === "running") {
      scheduleNextStep();
      runSoon(dependencies);
    }
    return { success: true, started: state.status === "running", ...publicStatus(state) };
  }

  async function getStatus(runId, dependencies) {
    const state = await getState();
    if (!state || (runId && state.runId !== runId)) {
      return { runId: runId || null, status: "idle" };
    }
    if (state.status === "running") {
      scheduleNextStep();
      runSoon(dependencies);
    }
    return publicStatus(state);
  }

  async function cancel(runId, dependencies) {
    const state = await getState();
    if (!state || (runId && state.runId !== runId)) {
      return { success: true, cancelled: false, runId };
    }
    const cancelled = {
      ...state,
      status: "cancelled",
      error: null,
      endedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setState(cancelled);
    await clearAlarm();
    await closeManagedWindow(dependencies, cancelled.runId);
    if (dependencies?.collectionSessions) {
      await dependencies.collectionSessions.cancel(cancelled.runId);
    }
    return { success: true, cancelled: true, ...publicStatus(cancelled) };
  }

  async function restart(runId, dependencies) {
    const state = await getState();
    if (!state || state.runId !== runId) {
      throw new Error("쿠팡 상품 수집 재시작 원본을 찾을 수 없습니다");
    }
    const server = await getServerStatus(
      dependencies,
      state.channelAccountId,
      runId,
    );
    const restarted = {
      ...state,
      status: server.status === "completed" ? "done" : "running",
      phase: "discovery",
      currentPage: 0,
      totalPages: 0,
      discoveredProducts: 0,
      hydratedProducts: server.progress?.hydratedProducts || 0,
      uploadedChunks: server.progress?.storedChunks || 0,
      manifest: null,
      discoveryItems: [],
      error: null,
      endedAt: null,
      updatedAt: Date.now(),
    };
    await closeManagedWindow(dependencies, restarted.runId);
    await setState(restarted);
    if (restarted.status === "done") {
      await clearAlarm();
      await dependencies.collectionSessions.succeed(restarted.runId);
    }
    if (restarted.status === "running") {
      scheduleNextStep();
      runSoon(dependencies);
    }
    return { success: true, started: restarted.status === "running", ...publicStatus(restarted) };
  }

  function handleAlarm(alarm, dependencies) {
    if (alarm?.name !== ALARM_NAME) return;
    runSoon(dependencies);
  }

  function runSoon(dependencies) {
    if (activeStep) return activeStep;
    activeStep = runOneStep(dependencies)
      .catch((error) => handleStepError(error, dependencies))
      .finally(() => {
        activeStep = null;
      });
    return activeStep;
  }

  async function runOneStep(dependencies) {
    let state = await getState();
    if (!state || state.status !== "running") return;

    const server = await getServerStatus(
      dependencies,
      state.channelAccountId,
      state.runId,
    );
    if (server.status === "completed") {
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

    state = await getState();
    const refreshed = await getServerStatus(
      dependencies,
      state.channelAccountId,
      state.runId,
    );
    const missingIds = new Set(refreshed.missing?.productIds || []);
    if (missingIds.size > 0) {
      await collectProductChunk(state, refreshed, missingIds, dependencies);
      return;
    }

    if (refreshed.phase !== "ready_to_finalize" || !refreshed.snapshotHash) {
      throw new Error("서버가 완성된 쿠팡 상품 스냅샷 해시를 반환하지 않았습니다");
    }
    const finalized = await apiJson(
      dependencies,
      `${runApiPath(state)}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotHash: refreshed.snapshotHash }),
      },
    );
    await finish(state, dependencies, finalized);
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
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
    });
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
    });
    await dependencies.collectionSessions.progress(state.runId, {
      current: page,
      total: manifest.expectedPages,
      completed: discoveryItems.length,
      failed: 0,
      label: `Wing 상품 목록 ${page}페이지`,
    });
    scheduleNextStep();
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
    const response = await dependencies.sendTabMessage(tab.id, {
      action: "collectCoupangCatalogDiscoveryPage",
    });
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
    await setState({
      ...state,
      phase: "hydration",
      hydratedProducts: server.progress?.hydratedProducts || 0,
      uploadedChunks: state.uploadedChunks + 1,
      updatedAt: Date.now(),
    });
    scheduleNextStep();
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
      });
      scheduleNextStep();
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
      const sellerProduct = await collectSellerProduct(tab.id);
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
    await setState({
      ...state,
      hydratedProducts: updated.progress?.hydratedProducts ||
        (server.progress?.hydratedProducts || 0) + products.length,
      uploadedChunks: state.uploadedChunks + 1,
      updatedAt: Date.now(),
    });
    await dependencies.collectionSessions.progress(state.runId, {
      current: startOrdinal + products.length,
      total: state.manifest.totalItems,
      completed:
        updated.progress?.hydratedProducts ||
        (server.progress?.hydratedProducts || 0) + products.length,
      failed: 0,
      label: "Wing 상품 상세 수집",
    });
    scheduleNextStep();
  }

  async function pauseForAttention(state, dependencies, tab, message) {
    await dependencies.collectionSessions.attachTab(state.runId, {
      tabId: tab.id,
      windowId: tab.windowId,
    });
    await dependencies.collectionSessions.requireAttention(state.runId, {
      reason: "marketplace_login",
      message,
    });
    await setState({
      ...state,
      status: "attention_required",
      error: null,
      updatedAt: Date.now(),
    });
    await clearAlarm();
  }

  async function collectSellerProduct(tabId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
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
      const product = results?.[0]?.result;
      if (product) return product;
      await delay(500);
    }
    throw new Error("Wing 상품 상세 appData를 읽을 수 없습니다");
  }

  async function putChunk(dependencies, state, kind, sequence, payload, itemCount) {
    const checksum = await root.KidItemCoupangCatalog.sha256Hex(payload);
    return apiJson(
      dependencies,
      `${runApiPath(state)}/chunks/${kind}/${sequence}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sequence, checksum, itemCount, payload }),
      },
    );
  }

  async function getServerStatus(dependencies, channelAccountId, runId) {
    return apiJson(
      dependencies,
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        `/catalog-imports/coupang-wing/runs/${encodeURIComponent(runId)}`,
    );
  }

  async function apiJson(dependencies, path, init) {
    const response = await dependencies.authedFetch(path, init);
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the HTTP status when the backend returns no JSON.
    }
    if (!response.ok) {
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message || body?.error || `KidItem API 오류 (${response.status})`;
      throw new Error(message);
    }
    return body;
  }

  async function handleStepError(error, dependencies) {
    const state = await getState();
    if (!state || state.status !== "running") return;
    const message = error?.message || String(error);
    const failed = {
      ...state,
      status: "error",
      error: message,
      endedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setState(failed);
    await clearAlarm();
    await closeManagedWindow(dependencies, state.runId);
    await dependencies.collectionSessions.fail(state.runId);
    try {
      await apiJson(dependencies, `${runApiPath(state)}/errors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "browser_collection_failed",
          message: message.slice(0, 1000),
          phase: statusPhase(state.phase),
        }),
      });
    } catch {
      // The local error remains visible even if the server is temporarily unavailable.
    }
  }

  async function finish(state, dependencies, server) {
    const done = {
      ...state,
      status: "done",
      phase: "finished",
      hydratedProducts: server.progress?.hydratedProducts || state.hydratedProducts,
      discoveredProducts: server.progress?.discoveredProducts || state.discoveredProducts,
      error: null,
      endedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setState(done);
    await clearAlarm();
    await closeManagedWindow(dependencies, state.runId);
    await dependencies.collectionSessions.succeed(state.runId);
    dependencies.notifyDashboard();
  }

  function publicStatus(state) {
    return {
      runId: state.runId,
      status: state.status,
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
      `/catalog-imports/coupang-wing/runs/${encodeURIComponent(state.runId)}`;
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

  function scheduleNextStep() {
    chrome.alarms.create(ALARM_NAME, { when: Date.now() + 1_000 });
  }

  function clearAlarm() {
    return new Promise((resolve) => chrome.alarms.clear(ALARM_NAME, resolve));
  }

  function getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STATE_KEY, (data) => resolve(data?.[STATE_KEY] || null));
    });
  }

  function setState(state) {
    return chrome.storage.local.set({ [STATE_KEY]: state });
  }

  async function getOrCreateManagedTab(state, dependencies) {
    await chrome.storage.local.remove([LEGACY_TAB_KEY, LEGACY_WINDOW_KEY]);
    const owned = await dependencies.collectionWindow.getOrCreate(
      state.runId,
      WING_LIST_URL,
    );
    await dependencies.collectionSessions.attachTab(state.runId, {
      tabId: owned.tabId,
      windowId: owned.windowId,
    });
    return { id: owned.tabId, windowId: owned.windowId };
  }

  async function navigateManagedTab(state, dependencies, tab, url) {
    const owned = await dependencies.collectionWindow.navigate(state.runId, url);
    if (owned.tabId !== tab.id || owned.windowId !== tab.windowId) {
      throw new Error("Wing 수집 창 소유권이 변경되었습니다");
    }
    return dependencies.waitForTabComplete(tab.id, {
      expectedUrl: url,
      timeoutMs: 45_000,
    });
  }

  async function closeManagedWindow(dependencies, runId) {
    await chrome.storage.local.remove([LEGACY_TAB_KEY, LEGACY_WINDOW_KEY]);
    return dependencies.collectionWindow.close(runId);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemCoupangCatalogImport = {
    alarmName: ALARM_NAME,
    cancel,
    getStatus,
    handleAlarm,
    restart,
    start,
  };
})(globalThis);
