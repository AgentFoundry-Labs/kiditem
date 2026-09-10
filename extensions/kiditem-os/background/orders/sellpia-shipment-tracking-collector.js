(function installSellpiaShipmentTrackingCollector(root) {
  "use strict";

  const SELLPIA_REPRINT_URL =
    "https://kiditem.sellpia.com/order_delivery_reprint.html";

  function requireDependencies(options) {
    if (
      !options?.chrome?.scripting?.executeScript ||
      typeof options.waitForTabReady !== "function" ||
      typeof options.withTimeout !== "function"
    ) {
      throw new Error("Sellpia shipment-tracking collector dependencies are required.");
    }
    return options;
  }

  async function assertCollectionActive(collection) {
    if (typeof collection?.assertActive !== "function") return;
    const active = await collection.assertActive();
    if (active === false) {
      const error = new Error("Sellpia shipment tracking collection is no longer active.");
      error.code = "COLLECTION_CANCELLED";
      throw error;
    }
  }

  function cancellationResult(error) {
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: String(error?.message || "Sellpia shipment tracking collection was cancelled."),
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
        url: SELLPIA_REPRINT_URL,
        active: false,
      });
      return tab;
    }

    async function collect(input = {}) {
      const {
        startDate = null,
        endDate = null,
        collection = null,
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
            return cancellationResult(new Error("Sellpia shipment tracking collection was cancelled before tab attachment."));
          }
          attached = true;
        }
        await waitForTabReady(tab.id);
        await assertCollectionActive(collection);
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeSellpiaDeliTracking,
            args: [startDate, endDate],
          }),
          60000,
          "셀피아 송장 조회 시간이 초과되었습니다.",
        );
        const result = injected[0]?.result ?? {
          success: false,
          error: "셀피아 화면에 접근하지 못했습니다.",
        };
        if (result?.pendingLogin) keepOpen = true;
        return result;
      } catch (error) {
        if (isCancellation(error)) return cancellationResult(error);
        if (accessError(error)) {
          keepOpen = true;
          return accessResult("셀피아");
        }
        return genericResult("셀피아", error);
      } finally {
        await cleanupTab();
      }
    }

    return Object.freeze({ collect });
  }

async function scrapeSellpiaDeliTracking(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const end = endDate || `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const s0 = new Date(d.getTime() - 30 * 24 * 60 * 60 * 1000); // 기본 최근 30일
    const start = startDate || `${s0.getFullYear()}-${p(s0.getMonth() + 1)}-${p(s0.getDate())}`;
    // 송장번호채번일자 기준으로 조회 — 채번 직후(출력 전) 주문도 잡힌다(기본값 print_datetime은 출력 전 누락).
    const dateType = "delinum_date";
    const body = new URLSearchParams({
      domode: "GET_ORDER_DELIVERY_REPRINT_LIST",
      date_type: dateType, // delinum_date=송장번호채번일자 / print_datetime=송장출력일자 / pack_datetime=피킹일자
      s_date: start,
      e_date: end,
      delinum: "",
      receiver: "",
      onlydeli_sellpia_code: "",
      pick_num: "",
    });
    const res = await fetch("delivery_link.action.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 송장 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 송장 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.list)) {
      return { success: false, error: "셀피아 송장 응답 형식이 예상과 다릅니다." };
    }
    const list = data.list;
    const s2 = (v) => String(v == null ? "" : v).trim();
    // ⭐전 몰 반환(판매처 필터는 프론트가 몰별로). 각 몰 송장 업로드가 이 소스를 공유한다.
    const rows = list
      .map((o) => {
        const si = o.ship_info || {};
        const ordNo = s2(si.ord_no || String(o.group_no || "").split("_").pop() || "");
        return {
          ordNo,
          itemNo: "",
          invNo: s2(o.delinum),
          courier: s2(o.delicom), // 셀피아 택배사코드(예 1136=CJ)
          provider: s2(si.provider_name || o.receiver), // 판매처명 (몰 매핑용)
          receiver: s2(o.receiver).replace(/\([^)]*\)\s*$/, "").trim(), // 수취인 (몰명 괄호 제거)
          post: s2(o.receiver_post),
          addr: [s2(o.receiver_addr1), s2(o.receiver_addr2)].filter(Boolean).join(" "),
        };
      })
      .filter((r) => r.ordNo && r.invNo);
    return { success: true, rows, total: list.length, range: { start, end } };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}


  root.KidItemSellpiaShipmentTrackingCollector = Object.freeze({ create });
})(globalThis);
