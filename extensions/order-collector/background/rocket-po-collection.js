/* global chrome */
(() => {
  "use strict";

  const LIST_PAGE_LIMIT = 20;
  const DETAIL_PO_LIMIT = 40;

  function create({
    chrome: chromeApi,
    findOrCreateCoupangSupplierTab,
    attachOrderCollectionTab,
    waitForTabReady,
    withTimeout,
  }) {
    async function collect(
      { from, to, status = "RP", dateType = "WAREHOUSING_PLAN_DATE" },
      collection,
    ) {
      const { tab, created } = await findOrCreateCoupangSupplierTab();
      if (!tab.id) {
        return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
      }
      await attachOrderCollectionTab(collection, tab, created);
      await waitForTabReady(tab.id);

      const injected = await withTimeout(
        chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
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
    }

    return { collect };
  }

  // Runs in supplier.coupang.com through chrome.scripting.executeScript.
  async function scrapeRocketPoRows(from, to, statusCode, dateType, collectionRunId) {
    try {
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
      for (let page = 1; page <= LIST_PAGE_LIMIT; page += 1) {
        const response = await fetch(listUrl(page), {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const text = await response.text();
        if (!response.ok || text.trim().charAt(0) === "<") {
          if (page === 1) {
            return {
              success: false,
              error: "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.",
            };
          }
          truncated = true;
          break;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          if (page === 1) {
            return {
              success: false,
              error: "발주리스트 응답을 해석하지 못했습니다 (supplier 로그인/세션 확인).",
            };
          }
          truncated = true;
          break;
        }
        const body = parsed.body || {};
        const rows = Array.isArray(body.body) ? body.body : [];
        listPagesRead = page;
        totalListPages = Math.max(totalListPages, Number(body.lastPageNumber) || 1);
        purchaseOrders.push(...rows);
        if (page >= totalListPages) break;
        if (page === LIST_PAGE_LIMIT) truncated = true;
      }
      if (listPagesRead === LIST_PAGE_LIMIT) truncated = true;
      if (purchaseOrders.length > DETAIL_PO_LIMIT) truncated = true;

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
      const detailTargets = purchaseOrders.slice(0, DETAIL_PO_LIMIT);

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
      return { success: false, error: String(error?.message || error) };
    }
  }

  globalThis.KidItemRocketPoCollection = Object.freeze({
    create,
    scrapeRocketPoRows,
  });
})();
