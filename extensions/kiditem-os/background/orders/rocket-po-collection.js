/* global chrome */
(() => {
  "use strict";

  function create({
    chrome: chromeApi,
    coupangPoSession,
    withTimeout,
  }) {
    async function collect(
      { from, to, status = "RP", dateType = "WAREHOUSING_PLAN_DATE" },
      collection,
    ) {
      return coupangPoSession.run(collection, async (tab) => {
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeRocketPoRows,
            args: [from, to, status, dateType, collection.runId],
          }),
          180000,
          "로켓 발주 수집 시간이 초과되었습니다.",
        );

        return injected[0]?.result ?? {
          success: false,
          error: "supplier 화면에 접근하지 못했습니다.",
        };
      });
    }

    async function list({ from, to, status = "" }, collection) {
      return coupangPoSession.run(collection, async (tab) => {
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeRocketPoList,
            args: [from, to, status],
          }),
          60000,
          "로켓 발주 목록 조회 시간이 초과되었습니다.",
        );

        return injected[0]?.result ?? {
          success: false,
          error: "supplier 화면에 접근하지 못했습니다.",
        };
      });
    }

    return { collect, list };
  }

  // Runs in the prepared supplier.coupang.com PO page through executeScript.
  async function scrapeRocketPoList(from, to, statusCode) {
    try {
      const listPageLimit = 20;
      const poSessionError = () => ({
        success: false,
        pendingLogin: true,
        errorCode: "coupang_po_session_required",
        error:
          "쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
      });
      const clean = (value, max) => String(value || "")
        .replace(new RegExp("[\\u0000-\\u001F]", "g"), " ")
        .trim()
        .slice(0, max || 60);
      const kstDate = (iso) => {
        if (!iso) return "";
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return String(iso).slice(0, 10);
        parsed.setUTCHours(parsed.getUTCHours() + 9);
        return parsed.toISOString().slice(0, 10);
      };
      const listUrl = (page) =>
        "/po-web/app/purchase-order/list?page=" + page
        + "&searchDateType=WAREHOUSING_PLAN_DATE&searchStartDate=" + (from || "")
        + "&searchEndDate=" + (to || "")
        + "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq="
        + "&purchaseOrderStatus=" + (statusCode || "")
        + "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";
      const pos = [];

      for (let page = 1; page <= listPageLimit; page += 1) {
        const response = await fetch(listUrl(page), {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const text = await response.text();
        if (!response.ok || text.trim().charAt(0) === "<") {
          if (page === 1) return poSessionError();
          break;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          if (page === 1) return poSessionError();
          break;
        }
        const body = parsed.body || {};
        const rows = Array.isArray(body.body) ? body.body : [];
        for (const order of rows) {
          pos.push({
            poSeq: order.purchaseOrderSeq,
            orderedAt: kstDate(order.createdAt),
            eta: kstDate(order.expectedDeliveryDate),
            status: order.purchaseOrderStatusDescription || "",
            vendorName: order.vendorName || "",
            centerName: order.centerName || "",
            inboundType: order.transportTypeDescription || "",
            firstSkuName: clean(order.firstSkuName, 60),
            skuCount: order.skuCount || 0,
            orderQty: order.sumOfOrderQty || 0,
            orderAmount: order.sumOfOrderAmount || 0,
          });
        }
        if (page >= (Number(body.lastPageNumber) || 1)) break;
      }
      return { success: true, pos };
    } catch (error) {
      if (String(error?.message || error) === "Failed to fetch") {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "coupang_po_session_required",
          error:
            "쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
        };
      }
      return {
        success: false,
        error: String(error?.message || error || "로켓 발주 목록 조회 실패"),
      };
    }
  }

  // Runs in supplier.coupang.com through chrome.scripting.executeScript.
  async function scrapeRocketPoRows(from, to, statusCode, dateType, collectionRunId) {
    try {
      const poSessionError = () => ({
        success: false,
        pendingLogin: true,
        errorCode: "coupang_po_session_required",
        error:
          "쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
      });
      const ctrl = new RegExp("[\\u0000-\\u001F]", "g");
      const clean = (value, max) => String(value || "")
        .replace(ctrl, " ")
        .replace(/^\d{8,}\s*/, "")
        .trim()
        .slice(0, max || 80);
      const num = (value) => Number(String(value == null ? "" : value)
        .replace(/[^0-9.-]/g, "")) || 0;
      const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const kstDate = (iso) => {
        if (!iso) return "";
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return String(iso).slice(0, 10);
        parsed.setUTCHours(parsed.getUTCHours() + 9);
        return parsed.toISOString().slice(0, 10);
      };
      const normalizedStatus = ["RP", "PA", "RI", "CI", ""].includes(statusCode)
        ? statusCode
        : "RP";
      const normalizedDateType = dateType === "PURCHASE_ORDER_DATE"
        ? "PURCHASE_ORDER_DATE"
        : "WAREHOUSING_PLAN_DATE";
      const businessDateBasis = normalizedDateType === "PURCHASE_ORDER_DATE"
        ? "ordered_at"
        : "expected_inbound";
      const listUrl = (page) =>
        "/po-web/app/purchase-order/list?page=" + page
        + "&searchDateType=" + normalizedDateType
        + "&searchStartDate=" + (from || "")
        + "&searchEndDate=" + (to || "")
        + "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq="
        + "&purchaseOrderStatus=" + normalizedStatus
        + "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";

      const purchaseOrders = [];
      let listPagesRead = 0;
      let totalListPages = 0;
      let truncated = false;
      for (let page = 1; ; page += 1) {
        const response = await fetch(listUrl(page), {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const text = await response.text();
        if (!response.ok || text.trim().charAt(0) === "<") {
          if (page === 1) return poSessionError();
          truncated = true;
          break;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          if (page === 1) return poSessionError();
          truncated = true;
          break;
        }
        const body = parsed.body || {};
        const rows = Array.isArray(body.body) ? body.body : [];
        listPagesRead = page;
        totalListPages = Math.max(totalListPages, Number(body.lastPageNumber) || 1);
        purchaseOrders.push(...rows);
        if (page >= totalListPages) break;
      }

      const vendorIds = purchaseOrders.map((po) => String(po.vendorId || "").trim());
      const distinctVendorIds = new Set(vendorIds.filter(Boolean));
      const vendorId = vendorIds.length === 0
        ? ""
        : vendorIds.some((identity) => !identity) || distinctVendorIds.size !== 1
          ? ""
          : vendorIds[0];

      const rows = [];
      const failedPoNumbers = [];
      let detailPoCount = 0;
      const detailTargets = purchaseOrders;

      const parseDetail = async (purchaseOrder) => {
        const poNumber = String(purchaseOrder.purchaseOrderSeq || "").trim();
        try {
          const response = await fetch(
            "/scm/purchase/order/get/" + encodeURIComponent(poNumber),
            { credentials: "include" },
          );
          const html = await response.text();
          if (!response.ok || /^\s*</.test(html) === false) {
            throw new Error("Rocket PO detail request failed");
          }
          const document_ = new DOMParser().parseFromString(html, "text/html");
          const tables = Array.from(document_.querySelectorAll("table"));
          const returnTable = tables.find((table) =>
            /회송\s*담당자/.test(table.textContent) && /회송지/.test(table.textContent));
          const returnRow = returnTable && returnTable.rows[1]
            ? Array.from(returnTable.rows[1].cells).map((cell) => norm(cell.textContent))
            : ["", "", ""];
          const skuTable = tables.find((table) =>
            /상품\s*번호/.test(table.textContent) && /발주금액/.test(table.textContent));
          const skuRows = skuTable
            ? Array.from(skuTable.rows)
              .map((row) => Array.from(row.cells).map((cell) => norm(cell.textContent)))
              .filter((row) => /^\d+$/.test(row[0]) && row.length > 9)
            : [];
          if (skuRows.length === 0) throw new Error("Rocket PO detail has no SKU rows");

          skuRows.forEach((row, index) => {
            const productNo = row[1] || "";
            const barcode = (String(row[2]).match(/^\d{8,}/) || [""])[0];
            rows.push({
              poLineId: [poNumber, productNo, barcode, index + 1].join(":"),
              poNumber,
              vendorId: String(purchaseOrder.vendorId || "").trim(),
              productNo,
              barcode,
              productName: clean(row[2], 240),
              orderQty: num(row[4]),
              plannedDeliveryDate: kstDate(purchaseOrder.expectedDeliveryDate),
              poStatusCode: String(
                purchaseOrder.purchaseOrderStatus
                || purchaseOrder.purchaseOrderStatusCode
                || normalizedStatus,
              ).toUpperCase(),
              businessDateBasis,
              confirmation: {
                center: clean(purchaseOrder.centerName, 120),
                inboundType: clean(purchaseOrder.transportTypeDescription, 80),
                poStatus: clean(purchaseOrder.purchaseOrderStatusDescription, 80),
                returnManager: clean(returnRow[0], 120),
                returnContact: clean(returnRow[1], 80),
                returnAddress: clean(returnRow[2], 300),
                purchasePrice: num(row[6]),
                supplyPrice: num(row[7]),
                vat: num(row[8]),
                totalPurchase: num(row[9]),
                poRegisteredAt: String(purchaseOrder.createdAt || "")
                  .replace("T", " ")
                  .slice(0, 19),
                xdock: "N",
              },
            });
          });
          detailPoCount += 1;
        } catch {
          failedPoNumbers.push(poNumber);
        }
      };

      for (let offset = 0; offset < detailTargets.length; offset += 5) {
        await Promise.all(detailTargets.slice(offset, offset + 5).map(parseDetail));
      }

      return {
        success: true,
        rows,
        poCount: purchaseOrders.length,
        evidence: {
          collectionRunId,
          vendorId,
          listPagesRead,
          totalListPages,
          truncated,
          detailPoCount,
          failedPoNumbers: failedPoNumbers.sort(),
        },
      };
    } catch (error) {
      if (String(error?.message || error) === "Failed to fetch") {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "coupang_po_session_required",
          error:
            "쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인한 뒤 다시 시도하세요.",
        };
      }
      return { success: false, error: String(error?.message || error) };
    }
  }

  globalThis.KidItemRocketPoCollection = Object.freeze({
    create,
    scrapeRocketPoList,
    scrapeRocketPoRows,
  });
})();
