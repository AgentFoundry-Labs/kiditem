/* global chrome */
(() => {
  "use strict";

  function create({
    chrome: chromeApi,
    coupangPoSession,
    withTimeout,
  }) {
    async function isCollectionActive(collection) {
      if (typeof collection?.isActive !== "function") return true;
      try {
        return (await collection.isActive()) !== false;
      } catch {
        return false;
      }
    }

    async function collect(
      { from, to, status = "RP", dateType = "WAREHOUSING_PLAN_DATE" },
      collection,
    ) {
      return coupangPoSession.run(collection, async (tab) => {
        if (!(await isCollectionActive(collection))) {
          return {
            success: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Rocket PO collection was cancelled.",
          };
        }
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeRocketPoRows,
            args: [from, to, status, dateType, collection.attemptId],
          }),
          180000,
          "로켓 발주 수집 시간이 초과되었습니다.",
        );

        if (!(await isCollectionActive(collection))) {
          return {
            success: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Rocket PO collection was cancelled.",
          };
        }

        return injected[0]?.result ?? {
          success: false,
          error: "supplier 화면에 접근하지 못했습니다.",
        };
      });
    }

    return { collect };
  }

  // Runs in supplier.coupang.com through chrome.scripting.executeScript.
  async function scrapeRocketPoRows(from, to, statusCode, dateType, collectionRunId) {
    const incomplete = (message) => ({
      success: false,
      errorCode: "rocket_po_collection_incomplete",
      error: String(message || "로켓 발주 근거가 완전하지 않습니다.").slice(0, 300),
    });
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
      const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const requiredText = (value, field) => {
        const text = norm(value == null ? "" : value);
        if (!text) throw new Error(`${field} is missing`);
        return text;
      };
      const requiredInteger = (value, field) => {
        if (typeof value === "number") {
          if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${field} is missing or invalid`);
          }
          return value;
        }
        if (typeof value !== "string") {
          throw new Error(`${field} is missing or invalid`);
        }
        const raw = value.trim();
        if (
          !raw
          || (!/^\d+$/.test(raw) && !/^\d{1,3}(?:,\d{3})+$/.test(raw))
        ) {
          throw new Error(`${field} is missing or invalid`);
        }
        const parsed = Number(raw.replace(/,/g, ""));
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          throw new Error(`${field} is outside the supported range`);
        }
        return parsed;
      };
      const isCalendarDate = (year, month, day) => {
        if (month < 1 || month > 12 || day < 1) return false;
        const lastDay = new Date(0);
        lastDay.setUTCHours(0, 0, 0, 0);
        lastDay.setUTCFullYear(year, month, 0);
        return day <= lastDay.getUTCDate();
      };
      const kstDate = (iso) => {
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return "";
        parsed.setUTCHours(parsed.getUTCHours() + 9);
        return parsed.toISOString().slice(0, 10);
      };
      const requiredDate = (value, field) => {
        if (typeof value !== "string") {
          throw new Error(`${field} is invalid`);
        }
        const raw = value.trim();
        const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (dayMatch) {
          const [, year, month, day] = dayMatch.map(Number);
          if (!isCalendarDate(year, month, day)) {
            throw new Error(`${field} is invalid`);
          }
          return raw;
        }
        const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(raw);
        if (!isoMatch) throw new Error(`${field} is invalid`);
        const [year, month, day] = isoMatch.slice(1, 4).map(Number);
        if (!isCalendarDate(year, month, day) || !kstDate(raw)) {
          throw new Error(`${field} is invalid`);
        }
        return kstDate(raw);
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
      let totalListPages = null;
      const seenPoNumbers = new Set();
      for (let page = 1; ; page += 1) {
        const response = await fetch(listUrl(page), {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const text = await response.text();
        if (!response.ok || text.trim().charAt(0) === "<") {
          if (page === 1) return poSessionError();
          throw new Error(`Rocket PO list page ${page} could not be loaded`);
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          if (page === 1) return poSessionError();
          throw new Error(`Rocket PO list page ${page} was not valid JSON`);
        }
        const body = parsed && parsed.body;
        if (!body || !Array.isArray(body.body)) {
          throw new Error(`Rocket PO list page ${page} is missing its row array`);
        }
        const pageCount = requiredInteger(body.lastPageNumber, "Rocket PO list page count");
        if (pageCount < 1 || pageCount > 100000) {
          throw new Error("Rocket PO list page count is invalid");
        }
        if (totalListPages === null) totalListPages = pageCount;
        if (totalListPages !== pageCount) {
          throw new Error("Rocket PO list page count changed during collection");
        }
        listPagesRead = page;
        for (const row of body.body) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error(`Rocket PO list page ${page} contains an invalid row`);
          }
          const poNumber = requiredText(row.purchaseOrderSeq, "Rocket purchase order number");
          if (seenPoNumbers.has(poNumber)) {
            throw new Error(`Rocket purchase order ${poNumber} is duplicated`);
          }
          seenPoNumbers.add(poNumber);
          const vendorId = requiredText(row.vendorId, `Rocket PO ${poNumber} vendor identity`);
          const purchaseOrderStatus = requiredText(
            row.purchaseOrderStatus || row.purchaseOrderStatusCode,
            `Rocket PO ${poNumber} status`,
          ).toUpperCase();
          if (normalizedStatus && purchaseOrderStatus !== normalizedStatus) {
            throw new Error(
              `Rocket PO ${poNumber} returned status ${purchaseOrderStatus} for ${normalizedStatus}`,
            );
          }
          purchaseOrders.push({
            ...row,
            poNumber,
            vendorId,
            purchaseOrderStatus,
            plannedDeliveryDate: requiredDate(
              row.expectedDeliveryDate,
              `Rocket PO ${poNumber} expected delivery date`,
            ),
            listSkuCount: requiredInteger(
              row.skuCount,
              `Rocket PO ${poNumber} SKU count`,
            ),
            listOrderQty: requiredInteger(
              row.sumOfOrderQty,
              `Rocket PO ${poNumber} ordered quantity`,
            ),
            listOrderAmount: requiredInteger(
              row.sumOfOrderAmount,
              `Rocket PO ${poNumber} ordered amount`,
            ),
          });
        }
        if (page > pageCount) throw new Error("Rocket PO list pagination exceeded its page count");
        if (page >= totalListPages) break;
      }

      const vendorIds = purchaseOrders.map((po) => String(po.vendorId || "").trim());
      const distinctVendorIds = new Set(vendorIds.filter(Boolean));
      const vendorId = vendorIds.length === 0
        ? ""
        : vendorIds.some((identity) => !identity) || distinctVendorIds.size !== 1
          ? ""
          : vendorIds[0];
      if (purchaseOrders.length > 0 && !vendorId) {
        throw new Error("Rocket PO vendor identity is missing or mixed");
      }

      const detailTargets = purchaseOrders;

      const detailMismatch = (message) => {
        const error = new Error(message);
        error.rocketDetailMismatch = true;
        return error;
      };

      const parseDetail = async (purchaseOrder) => {
        const poNumber = purchaseOrder.poNumber;
        const response = await fetch(
          "/scm/purchase/order/get/" + encodeURIComponent(poNumber),
          { credentials: "include" },
        );
        const html = await response.text();
        if (!response.ok || /^\s*</.test(html) === false) {
          throw new Error(`Rocket PO ${poNumber} detail request failed`);
        }
        const document_ = new DOMParser().parseFromString(html, "text/html");
        const tables = Array.from(document_.querySelectorAll("table"));
        if (
          tables.length === 0
          && /(?:login|로그인|session\s+expired|세션\s*만료)/i.test(html)
        ) {
          const error = new Error("Rocket PO detail session expired");
          error.errorCode = "coupang_po_session_required";
          throw error;
        }
        const returnTable = tables.find((table) =>
          /회송\s*담당자/.test(table.textContent) && /회송지/.test(table.textContent));
        const returnRow = returnTable && returnTable.rows[1]
          ? Array.from(returnTable.rows[1].cells).map((cell) => norm(cell.textContent))
          : ["", "", ""];
        const skuTable = tables.find((table) =>
          /상품\s*번호/.test(table.textContent) && /발주금액/.test(table.textContent));
        const rawRows = skuTable
          ? Array.from(skuTable.rows)
            .map((row) => {
              const cells = Array.from(row.cells);
              return {
                cells,
                values: cells.map((cell) => norm(cell.textContent)),
              };
            })
          : [];
        const detailRows = [];
        const seenLineNumbers = new Set();
        const seenProductIdentities = new Set();
        let orderQtyTotal = 0;
        let orderAmountTotal = 0;
        let firstColumnRowsRemaining = 0;
        for (const rawRow of rawRows) {
          // The provider omits a cell from continuation rows when the first
          // cell of the SKU anchor has rowspan > 1. Those rows can begin with
          // numeric inbound values, so only the first-column ownership tells
          // us whether a numeric first visible cell is a new SKU anchor.
          if (firstColumnRowsRemaining > 0) {
            firstColumnRowsRemaining -= 1;
            continue;
          }
          const row = rawRow.values;
          const firstCell = rawRow.cells[0];
          const rowSpan = Number(firstCell?.rowSpan ?? 1);
          if (!Number.isInteger(rowSpan) || rowSpan < 1) {
            throw new Error(`Rocket PO ${poNumber} has an invalid first-column rowspan`);
          }
          firstColumnRowsRemaining = rowSpan - 1;
          // Header/summary rows are non-numeric in the first cell. A numeric
          // row is provider data and must be validated before any filtering.
          if (!/^\d+$/.test(row[0] || "")) continue;
          if (row.length <= 9) {
            throw new Error(`Rocket PO ${poNumber} has a short SKU row`);
          }
          const lineNumber = requiredText(row[0], `Rocket PO ${poNumber} line identity`);
          if (seenLineNumbers.has(lineNumber)) {
            throw new Error(`Rocket PO ${poNumber} has a duplicate line identity`);
          }
          seenLineNumbers.add(lineNumber);
          const productNo = requiredText(row[1], `Rocket PO ${poNumber} product number`);
          const productText = requiredText(row[2], `Rocket PO ${poNumber} product`);
          const barcode = (String(productText).match(/^\d{8,}/) || [""])[0];
          const productName = clean(productText, 240);
          if (!productName) {
            throw new Error(`Rocket PO ${poNumber} product name is missing`);
          }
          const productIdentity = [productNo, barcode].join("\u0000");
          if (seenProductIdentities.has(productIdentity)) {
            throw new Error(`Rocket PO ${poNumber} has a duplicate product line`);
          }
          seenProductIdentities.add(productIdentity);
          const orderQty = requiredInteger(row[4], `Rocket PO ${poNumber} ordered quantity`);
          const purchasePrice = requiredInteger(row[6], `Rocket PO ${poNumber} purchase price`);
          const supplyPrice = requiredInteger(row[7], `Rocket PO ${poNumber} supply price`);
          const vat = requiredInteger(row[8], `Rocket PO ${poNumber} VAT`);
          const totalPurchase = requiredInteger(row[9], `Rocket PO ${poNumber} ordered amount`);
          orderQtyTotal += orderQty;
          orderAmountTotal += totalPurchase;
          detailRows.push({
            poLineId: [poNumber, productNo, barcode, lineNumber].join(":"),
            poNumber,
            vendorId: purchaseOrder.vendorId,
            productNo,
            barcode,
            productName,
            orderQty,
            plannedDeliveryDate: purchaseOrder.plannedDeliveryDate,
            poStatusCode: purchaseOrder.purchaseOrderStatus,
            businessDateBasis,
            confirmation: {
              center: clean(purchaseOrder.centerName, 120),
              inboundType: clean(purchaseOrder.transportTypeDescription, 80),
              poStatus: clean(purchaseOrder.purchaseOrderStatusDescription, 80),
              returnManager: clean(returnRow[0], 120),
              returnContact: clean(returnRow[1], 80),
              returnAddress: clean(returnRow[2], 300),
              purchasePrice,
              supplyPrice,
              vat,
              totalPurchase,
              poRegisteredAt: String(purchaseOrder.createdAt || "")
                .replace("T", " ")
                .slice(0, 19),
              xdock: "N",
            },
          });
        }
        if (!skuTable || detailRows.length === 0) {
          throw detailMismatch(`Rocket PO ${poNumber} has no valid SKU rows`);
        }
        if (
          detailRows.length !== purchaseOrder.listSkuCount
          || orderQtyTotal !== purchaseOrder.listOrderQty
          || orderAmountTotal !== purchaseOrder.listOrderAmount
        ) {
          throw detailMismatch(
            `Rocket PO ${poNumber} list/detail totals mismatch `
              + `(SKU ${detailRows.length}/${purchaseOrder.listSkuCount}, `
              + `quantity ${orderQtyTotal}/${purchaseOrder.listOrderQty}, `
              + `amount ${orderAmountTotal}/${purchaseOrder.listOrderAmount})`,
          );
        }
        return detailRows;
      };

      const parseDetailWithRetry = async (purchaseOrder) => {
        try {
          return await parseDetail(purchaseOrder);
        } catch (error) {
          if (!error?.rocketDetailMismatch) throw error;
          return parseDetail(purchaseOrder);
        }
      };

      const detailResults = [];
      for (let offset = 0; offset < detailTargets.length; offset += 5) {
        const batch = await Promise.all(
          detailTargets.slice(offset, offset + 5).map(async (purchaseOrder) => {
            try {
              return { purchaseOrder, rows: await parseDetailWithRetry(purchaseOrder) };
            } catch (error) {
              return { purchaseOrder, error };
            }
          }),
        );
        const sessionFailure = batch.find(
          ({ error }) => error?.errorCode === "coupang_po_session_required"
            || String(error?.message || error) === "Failed to fetch",
        );
        if (sessionFailure) return poSessionError();
        detailResults.push(...batch);
      }
      const failedDetail = detailResults.find(({ error }) => error);
      if (failedDetail) {
        throw new Error(
          `Rocket PO ${failedDetail.purchaseOrder.poNumber} detail is incomplete: `
            + String(failedDetail.error?.message || failedDetail.error),
        );
      }
      const rows = detailResults.flatMap(({ rows: detailRows }) => detailRows);
      const lineIds = new Set();
      for (const row of rows) {
        if (lineIds.has(row.poLineId)) {
          throw new Error(`Rocket PO line ${row.poLineId} is duplicated`);
        }
        lineIds.add(row.poLineId);
      }

      return {
        success: true,
        rows,
        poCount: purchaseOrders.length,
        proof: {
          from,
          to,
          status: normalizedStatus,
          dateType: normalizedDateType,
          validatedList: true,
        },
        evidence: {
          collectionRunId,
          vendorId,
          listPagesRead,
          totalListPages,
          truncated: false,
          detailPoCount: detailResults.length,
          failedPoNumbers: [],
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
      return incomplete(error?.message || error);
    }
  }

  globalThis.KidItemRocketPoCollection = Object.freeze({
    create,
    scrapeRocketPoRows,
  });
})();
