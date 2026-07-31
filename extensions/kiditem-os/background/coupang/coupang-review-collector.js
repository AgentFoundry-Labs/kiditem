// 쿠팡 Wing 상품평 수집기.
//
// 쿠팡은 판매자 상품평을 Open API 로 주지 않는다. Wing 상품평 화면
// (`/tenants/cs/product/review`)이 쓰는 내부 엔드포인트를 백그라운드 Wing 탭
// 안에서 그대로 호출해(=세션 쿠키 크롤링) 백엔드 `/api/reviews/ingest` 로 넘긴다.
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
  const REVIEW_PAGE_URL = "https://wing.coupang.com/tenants/cs/product/review";
  const SEARCH_ENDPOINT =
    "https://wing.coupang.com/tenants/cs/product/review/search";

  const PAGE_SIZE = 50;
  const MAX_PAGES_PER_MONTH = 40;
  const INGEST_CHUNK = 200;
  const DEFAULT_MONTHS = 3;
  const MAX_MONTHS = 36;
  const REQUEST_DELAY_MS = 350;

  /**
   * @param {{ months?: number, runId?: string|null, todayYmd?: string }} message
   * @param {{ authedFetch: Function, stateKey?: string, createTab: Function,
   *           waitForTabComplete: Function, removeTab: Function }} dependencies
   */
  async function start(message, dependencies) {
    const months = clampMonths(message?.months);
    const stateKey = dependencies.stateKey || STATE_KEY;
    const current = await getState(stateKey);
    if (current?.status === "running" && !isStale(current)) {
      return {
        success: false,
        started: false,
        error: "이미 쿠팡 리뷰 수집이 진행 중입니다",
        ...publicStatus(current),
      };
    }

    const windows = monthWindows(months, message?.todayYmd);
    const runId = message?.runId || `review-${Date.now()}`;
    const state = {
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
    };
    await setState(stateKey, state);

    // 대기하지 않는다. 웹은 runId 를 받고 status 폴링으로 진행률을 본다.
    run(windows, state, stateKey, dependencies).catch(async (error) => {
      const latest = (await getState(stateKey)) || state;
      await setState(stateKey, {
        ...latest,
        status: "error",
        error: error?.message || "쿠팡 리뷰 수집 실패",
        endedAt: Date.now(),
      });
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

  async function cancel(runId, stateKey) {
    const key = stateKey || STATE_KEY;
    const state = await getState(key);
    if (!state || (runId && state.runId !== runId)) {
      return { success: true, cancelled: false, runId: runId || null };
    }
    await setState(key, { ...state, cancelRequested: true });
    return { success: true, cancelled: true, runId: state.runId };
  }

  async function run(windows, initialState, stateKey, dependencies) {
    let state = initialState;
    let tabId = null;
    try {
      tabId = await openReviewTab(dependencies);
      for (const window of windows) {
        const latest = await getState(stateKey);
        if (latest?.cancelRequested) {
          state = { ...latest, status: "cancelled", endedAt: Date.now() };
          await setState(stateKey, state);
          return;
        }
        state = { ...(latest || state), current: window.label };
        await setState(stateKey, { ...state, heartbeatAt: Date.now() });

        try {
          const rows = await collectMonth(tabId, window, dependencies);
          const result = await postReviews(rows, dependencies);
          state = {
            ...state,
            collected: state.collected + rows.length,
            created: state.created + result.created,
            updated: state.updated + result.updated,
            linked: state.linked + result.linked,
            unlinked: state.unlinked + result.unlinked,
          };
        } catch (error) {
          state = {
            ...state,
            failures: [
              ...state.failures,
              { month: window.label, error: error?.message || String(error) },
            ],
          };
        }
        state = { ...state, completed: state.completed + 1 };
        await setState(stateKey, { ...state, heartbeatAt: Date.now() });
      }
      await setState(stateKey, {
        ...state,
        status: "done",
        current: null,
        endedAt: Date.now(),
      });
    } finally {
      if (tabId != null) await dependencies.removeTab(tabId).catch(() => {});
    }
  }

  async function openReviewTab(dependencies) {
    const tab = await dependencies.createTab({
      url: REVIEW_PAGE_URL,
      active: false,
    });
    await dependencies
      .waitForTabComplete(tab.id, { expectedUrl: REVIEW_PAGE_URL, timeoutMs: 45000 })
      .catch(() => false);
    return tab.id;
  }

  /** 한 달치 상품평 전 페이지 수집. Wing 이 1개월/50건 상한이라 월 단위로만 돈다. */
  async function collectMonth(tabId, window, dependencies) {
    const rows = [];
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_MONTH; pageIndex += 1) {
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
      const totalPages = Number(body?.data?.pagination?.totalPages) || 0;
      if (pageIndex + 1 >= totalPages) break;
      await delay(REQUEST_DELAY_MS);
    }
    return rows;
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

  async function postReviews(rows, dependencies) {
    const totals = { created: 0, updated: 0, linked: 0, unlinked: 0 };
    for (let offset = 0; offset < rows.length; offset += INGEST_CHUNK) {
      const chunk = rows.slice(offset, offset + INGEST_CHUNK);
      if (chunk.length === 0) continue;
      const response = await dependencies.authedFetch("/api/reviews/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "coupang", items: chunk }),
      });
      if (!response.ok) {
        throw new Error(`리뷰 적재 실패 (${response.status})`);
      }
      const body = await response.json().catch(() => null);
      totals.created += Number(body?.created) || 0;
      totals.updated += Number(body?.updated) || 0;
      totals.linked += Number(body?.linked) || 0;
      totals.unlinked += Number(body?.unlinked) || 0;
    }
    return totals;
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

  /**
   * 최신 달부터 과거로 `months` 개의 월 구간. Wing 이 1개월 초과 조회를 거절하므로
   * 각 구간은 그 달의 1일~말일(현재 달은 오늘까지)로 잘라 낸다.
   */
  function monthWindows(months, todayYmd) {
    const today = parseYmd(todayYmd) || todayInSeoul();
    const windows = [];
    for (let back = 0; back < months; back += 1) {
      const year = today.year;
      const monthIndex = today.month - 1 - back;
      const cursor = new Date(Date.UTC(year, monthIndex, 1));
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const isCurrentMonth = y === today.year && m === today.month;
      const endDay = isCurrentMonth ? today.day : lastDay;
      windows.push({
        label: `${y}-${pad2(m)}`,
        start: `${y}-${pad2(m)}-01`,
        end: `${y}-${pad2(m)}-${pad2(endDay)}`,
      });
    }
    return windows;
  }

  function todayInSeoul() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parseYmd(parts);
  }

  function parseYmd(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
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

  function clampMonths(value) {
    const months = Number(value);
    if (!Number.isFinite(months) || months < 1) return DEFAULT_MONTHS;
    return Math.min(Math.floor(months), MAX_MONTHS);
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

  // 서비스워커가 수집 도중 죽으면 running 상태가 남는다. 5분 이상 heartbeat 가
  // 없으면 새 실행을 막지 않는다.
  function isStale(state) {
    const last = state.heartbeatAt || state.startedAt || 0;
    return Date.now() - last > 5 * 60 * 1000;
  }

  function getState(stateKey) {
    return new Promise((resolve) => {
      chrome.storage.local.get(stateKey, (data) => resolve(data?.[stateKey] || null));
    });
  }

  function setState(stateKey, state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [stateKey]: state }, () => resolve());
    });
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemCoupangReviewCollector = {
    stateKey: STATE_KEY,
    cancel,
    getStatus,
    monthWindows,
    normalizeReview,
    start,
  };
})(globalThis);
