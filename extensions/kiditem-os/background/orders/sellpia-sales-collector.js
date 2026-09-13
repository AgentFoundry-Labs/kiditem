(function installSellpiaSalesCollector(root) {
  "use strict";

  const SELLPIA_SALE_SUMMARY_URL =
    "https://kiditem.sellpia.com/sale_summary.html?mode=main_link";

  function requireDependencies(options) {
    if (
      !options?.chrome?.scripting?.executeScript ||
      typeof options.waitForTabReady !== "function" ||
      typeof options.withTimeout !== "function"
    ) {
      throw new Error("Sellpia sales collector dependencies are required.");
    }
    return options;
  }

  async function assertCollectionActive(collection) {
    if (typeof collection?.assertActive !== "function") return;
    const active = await collection.assertActive();
    if (active === false) {
      const error = new Error("Sellpia sales collection is no longer active.");
      error.code = "COLLECTION_CANCELLED";
      throw error;
    }
  }

  function cancellationResult(error) {
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: String(error?.message || "Sellpia sales collection was cancelled."),
    };
  }

  function isCancellation(error) {
    return error?.code === "COLLECTION_CANCELLED";
  }

  function create(options) {
    const {
      chrome: chromeApi,
      waitForTabReady,
      withTimeout,
      isMallAccessError,
      mallAccessErrorResult,
      mallGenericErrorResult,
    } = requireDependencies(options);

    const accessError = typeof isMallAccessError === "function"
      ? isMallAccessError
      : () => false;
    const accessResult = typeof mallAccessErrorResult === "function"
      ? mallAccessErrorResult
      : (mallName) => ({
        success: false,
        pendingLogin: true,
        error: `${mallName} login is required.`,
      });
    const genericResult = typeof mallGenericErrorResult === "function"
      ? mallGenericErrorResult
      : (mallName, error) => ({
        success: false,
        error: `${mallName} collection failed: ${String(error?.message || error)}`,
      });

    async function createTab() {
      const tab = await chromeApi.tabs.create({
        url: SELLPIA_SALE_SUMMARY_URL,
        active: false,
      });
      return tab;
    }

    async function collect(input = {}) {
      const {
        startDate = null,
        endDate = null,
        collection = null,
        keepTabOnLoginError = false,
      } = input;
      let tab = null;
      let attached = false;
      let keepOpen = false;
      let tabClosed = false;
      const closeTab = async () => {
        if (!tab?.id || tabClosed) return;
        try {
          await chromeApi.tabs.remove(tab.id);
          tabClosed = true;
        } catch {
          // Chrome may have closed the task tab during cancellation already.
        }
      };
      const cleanupTab = async () => {
        if (!tab?.id || tabClosed || keepOpen) return;
        if (attached && collection?.detachTab) {
          try {
            const detached = await collection.detachTab(tab, { owned: true });
            if (detached !== null && detached !== false) {
              tabClosed = true;
              return;
            }
          } catch {
            // Fall through to a direct best-effort close of this created tab.
          }
        }
        await closeTab();
      };
      try {
        await assertCollectionActive(collection);
        tab = await createTab();
        if (!tab?.id) {
          return {
            success: false,
            error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다.",
          };
        }
        if (collection?.attachTab) {
          const attachment = await collection.attachTab(tab, { owned: true });
          if (!attachment) {
            await closeTab();
            return cancellationResult(new Error("Sellpia sales collection was cancelled before tab attachment."));
          }
          attached = true;
        }
        await waitForTabReady(tab.id);
        await assertCollectionActive(collection);
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeSellpiaSaleSummary,
            args: [startDate, endDate],
          }),
          60000,
          "셀피아 판매현황 조회 시간이 초과되었습니다.",
        );
        const result = injected[0]?.result ?? {
          success: false,
          error: "셀피아 화면에 접근하지 못했습니다.",
        };
        if (result?.pendingLogin && keepTabOnLoginError) {
          keepOpen = true;
        }
        return result;
      } catch (error) {
        if (isCancellation(error)) return cancellationResult(error);
        if (accessError(error)) {
          keepOpen = keepTabOnLoginError;
          return accessResult("셀피아");
        }
        return genericResult("셀피아", error);
      } finally {
        await cleanupTab();
      }
    }

    return Object.freeze({ collect });
  }

async function scrapeSellpiaSaleSummary(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const toYmdUtc = (date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
    const parseYmd = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(parsed.getTime()) || toYmdUtc(parsed) !== value ? null : parsed;
    };
    const todayKst = toYmdUtc(new Date(Date.now() + 9 * 60 * 60 * 1000));
    const end = endDate || todayKst;
    const endAnchor = parseYmd(end);
    if (!endAnchor) return { success: false, error: "셀피아 판매현황 종료일이 올바르지 않습니다." };
    const defaultStart = toYmdUtc(new Date(endAnchor.getTime() - 92 * 24 * 60 * 60 * 1000));
    const start = startDate || defaultStart; // 기본 최근 93일(양 끝 포함) — 일/주/월 집계용 이력 누적
    const startAnchor = parseYmd(start);
    if (!startAnchor || startAnchor > endAnchor) {
      return { success: false, error: "셀피아 판매현황 수집 기간이 올바르지 않습니다." };
    }
    const body = new URLSearchParams({
      mode: "selldate", // 판매일자별 집계
      s_date: start,
      e_date: end,
      seller: "all",
      o_type: "",
      r_type: "",
      p_str: "",
      s_type: "1", // 주문일자 기준
      fs_type: "",
      nick_type: "",
      nick_str: "",
    });
    const res = await fetch("order_search.ajax.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 판매현황 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 판매현황 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }

    // 이 API의 정상 seller=all 응답은 `{ sellerId: { YYYY-MM-DD: metrics } }`
    // 형태다. 배열/null/error envelope를 빈 매출로 오인하면 백엔드의 권위 범위
    // 교체가 기존 데이터를 지우므로, plain object 이외에는 한 행도 수락하지 않는다.
    const isPlainObject = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    };
    if (!isPlainObject(data)) {
      return { success: false, error: "셀피아 판매현황 응답 형식이 예상과 다릅니다." };
    }
    const sellerIds = Object.keys(data);
    if (sellerIds.length === 0) {
      return {
        success: true,
        payload: {
          range: { from: start, to: end },
          sellers: [],
          provenance: {
            source: "sellpia_sale_summary",
            mode: "selldate",
            sellerScope: "all",
            responseShape: "empty_object",
            explicitEmpty: true,
          },
        },
        sellerCount: 0,
        range: { start, end },
      };
    }

    // seller id→판매처명 매핑 소스(provider_list.js.html?mode=more)가 대용량이라 로딩 대기.
    for (let i = 0; i < 30 && typeof provider_list_all === "undefined"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const nameOf = (id) => {
      try {
        if (
          typeof provider_list_all !== "undefined" &&
          Object.prototype.hasOwnProperty.call(provider_list_all, id) &&
          provider_list_all[id]
        ) return String(provider_list_all[id]);
        if (
          typeof provider_list_s !== "undefined" &&
          Object.prototype.hasOwnProperty.call(provider_list_s, id) &&
          provider_list_s[id]
        ) return String(provider_list_s[id]);
      } catch { /* 전역 미로딩 */ }
      return "";
    };
    const parseMetric = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized)) return null;
      const parsed = Number(normalized.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const sellers = [];
    for (const sellerId of sellerIds) {
      const sellerName = nameOf(sellerId).trim();
      const dayMap = data[sellerId];
      if (!sellerId.trim() || sellerId.length > 64 || !sellerName || !isPlainObject(dayMap)) {
        return { success: false, error: "셀피아 판매현황에 알 수 없는 판매처 응답이 포함되어 있습니다." };
      }
      const dateKeys = Object.keys(dayMap);
      if (dateKeys.length === 0) {
        return { success: false, error: "셀피아 판매현황에 일자 데이터가 없는 판매처가 포함되어 있습니다." };
      }
      const days = [];
      for (const date of dateKeys) {
        const parsedDate = parseYmd(date);
        const v = dayMap[date];
        if (!parsedDate || parsedDate < startAnchor || parsedDate > endAnchor || !isPlainObject(v)) {
          return { success: false, error: "셀피아 판매현황에 유효하지 않은 일자 응답이 포함되어 있습니다." };
        }
        if (!("price" in v) || !("amount" in v) || !("buy_price" in v)) {
          return { success: false, error: "셀피아 판매현황 일자 응답에 필수 매출 항목이 없습니다." };
        }
        const price = parseMetric(v.price);
        const amount = parseMetric(v.amount);
        const buyPrice = parseMetric(v.buy_price);
        if (price === null || amount === null || buyPrice === null) {
          return { success: false, error: "셀피아 판매현황 일자 응답의 매출 값이 올바르지 않습니다." };
        }
        days.push({
          date,
          price,
          amount,
          buyPrice,
        });
      }
      sellers.push({
        sellerId: String(sellerId),
        sellerName,
        days,
      });
    }
    return {
      success: true,
      payload: { range: { from: start, to: end }, sellers },
      sellerCount: sellers.length,
      range: { start, end },
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}


  root.KidItemSellpiaSalesCollector = Object.freeze({ create });
})(globalThis);
