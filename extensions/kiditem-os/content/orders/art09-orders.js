// 아트공구(Cafe24 공급사 zzogzzog1.cafe24.com) 주문 읽기(ISOLATED world, KID-359 H3 — 옛 worker.js `scrapeArt09Orders`
// 이식). 사이트 `extensions/src/sites/art09`가 주문목록(order_list.php) 탭에 `page-call/bridge.js`와 함께 주입하고
// `art09.orders`를 부른다. 보이는 주문목록에서 "배송준비전" 주문(체크한 것이 있으면 그것만)을 고르고 주문마다 배송정보
// 상세(order_shipping_info.php)를 읽어 Cafe24 CSV 행으로 만든다. 행은 옛 변환 본문 `{rows}` 원소 그대로다. 읽기만 한다.
(function installArt09Orders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["art09.orders"] = async function art09Orders(args) {
    const dateFilter = typeof args?.dateFilter === "string" && args.dateFilter ? args.dateFilter : null;
    const ORDER_ID_RE = /\b\d{8}-\d{7}\b/g;
    const ORDER_DATETIME_RE = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
    const compact = (s) => clean(s).replace(/\s|[:：]/g, "").toLowerCase();
    const normalizeOrderItemId = (value, orderId) => {
      const match = clean(value).match(/\b\d{8}-\d{7}-\d{2,}\b/);
      return match && match[0].startsWith(`${orderId}-`) ? match[0] : "";
    };

    try {
      const listOrders = readVisibleOrderList();
      if (listOrders.length === 0) {
        // 미로그인 판정은 "주문목록 페이지를 벗어났는가"(로그인 리다이렉트)로만 한다.
        // 본문 "로그인" 텍스트와 input[type=password] 는 로그인된 Cafe24 admin 화면에도
        // 그대로 존재해서(로그인 기록·보안 입력칸) 둘 다 오탐을 낸다 — 라이브에서 확인됨.
        const path =
          typeof location !== "undefined" ? `${location.pathname}${location.search}` : "";
        const redirectedAwayFromOrders = path !== "" && !/order_list\.php/i.test(path);
        if (redirectedAwayFromOrders) {
          return { status: "login_required" };
        }
        return { status: "ok", rows: [], failures: [] };
      }

      const rows = [];
      const failures = [];
      for (const order of listOrders) {
        try {
          const detail = await fetchOrderDetail(order.orderId);
          const items = detail.items.length > 0 ? detail.items : fallbackItems(order.productText);
          items.forEach((item) => {
            rows.push({
              shopName: "한국어 쇼핑몰",
              shopNo: "1",
              orderId: order.orderId,
              orderItemId: normalizeOrderItemId(item.orderItemId, order.orderId),
              message: detail.message || "",
              totalOrderAmount: "****",
              totalPaymentAmount: "****",
              productNo: item.productNo || "",
              productName: item.name || "",
              productNameWithOption: item.optionName || item.name || "",
              qty: item.qty || "1",
              salePrice: "****",
              receiver: detail.receiver || "",
              receiverPhone: detail.receiverPhone || "",
              receiverZip: detail.receiverZip || "",
              receiverAddress: detail.receiverAddress || "",
              receiverAddressDetail: detail.receiverAddressDetail || "",
              paymentType: detail.paymentType || "T",
              paymentMethod: detail.paymentMethod || "",
              orderedAt: detail.orderedAt || order.orderedAt || "",
              country: "",
            });
          });
        } catch (e) {
          failures.push(`${order.orderId}: ${String((e && e.message) || e)}`);
        }
      }

      if (rows.length === 0 && failures.length > 0) {
        return { status: "failed", error: "아트공구 주문 상세 수집 실패: " + failures.slice(0, 3).join(" / ") };
      }

      return { status: "ok", rows, failures };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    }

    function readVisibleOrderList() {
      const candidates = [];
      let hasCheckedRows = false;
      for (const tr of Array.from(document.querySelectorAll("tr"))) {
        if (!isVisible(tr)) continue;
        const text = clean(tr.innerText || "");
        const ids = Array.from(text.matchAll(ORDER_ID_RE)).map((m) => m[0]);
        if (!ids.length) continue;
        const orderId = ids[0];
        const checkbox = tr.querySelector('input[type="checkbox"]');
        const orderLink = tr.querySelector('a[href*="order_id="], a[onclick*="order_id"]');
        if (!checkbox && !orderLink) continue;
        const checked = Boolean(checkbox && checkbox.checked);
        if (checked) hasCheckedRows = true;
        const cells = Array.from(tr.cells || []).map((cell) => clean(cell.innerText || cell.textContent || ""));
        const headers = tableHeaderCells(tr.closest("table")).map((cell) => compact(cell));
        const stateIndex = findHeaderIndex(headers, ["처리상태", "주문상태", "배송상태"]);
        if (stateIndex < 0 || !compact(cells[stateIndex] || "").includes(compact("배송준비전"))) continue;
        const productIndex = findHeaderIndex(headers, ["상품명", "주문상품명"]);
        const orderCellIndex = cells.findIndex((cell) => cell.includes(orderId));
        const orderedAt = (text.match(ORDER_DATETIME_RE) || [])[0] || "";
        if (dateFilter && (!orderedAt || orderedAt.slice(0, 10) !== dateFilter)) continue;
        const productText =
          productIndex >= 0 ? normalizeProductName(cells[productIndex] || "") : pickListProductText(cells, orderCellIndex);
        candidates.push({ orderId, orderedAt, productText, checked });
      }
      const filtered = hasCheckedRows ? candidates.filter((row) => row.checked) : candidates;
      const seen = new Set();
      const out = [];
      for (const item of filtered) {
        if (seen.has(item.orderId)) continue;
        seen.add(item.orderId);
        out.push(item);
      }
      return out;
    }

    function tableHeaderCells(table) {
      if (!table) return [];
      for (const tr of Array.from(table.querySelectorAll("tr"))) {
        const cells = rowCells(tr);
        const headers = cells.map((cell) => compact(cell));
        if (headers.some((cell) => cell.includes("주문번호")) && headers.some((cell) => cell.includes("상품명"))) {
          return cells;
        }
      }
      return [];
    }

    function pickListProductText(cells, orderCellIndex) {
      const start = Math.max(0, orderCellIndex + 1);
      for (const cell of cells.slice(start)) {
        if (!cell) continue;
        if (/\b\d{8}-\d{7}\b/.test(cell)) continue;
        if (/^\*+$/.test(cell)) continue;
        if (/총\s*상품|금액|주문자|회원/.test(cell)) continue;
        if (cell.length > 8) return normalizeProductName(cell);
      }
      return "";
    }

    async function fetchOrderDetail(orderId) {
      const url = `/supp/php/s/order_shipping_info.php?order_id=${encodeURIComponent(orderId)}&menu_no=74`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`상세 HTTP ${res.status}`);
      const html = await decodeResponse(res);
      if (!/<html|<table|수령|상품|배송|주문/i.test(html)) throw new Error("상세 응답이 비어 있습니다");
      const doc = new DOMParser().parseFromString(html, "text/html");
      const rawAddress = readLabeledValue(doc, ["수령인주소", "수취인주소", "배송지주소", "배송주소", "주소"], ["우편"]);
      const detailAddress = readLabeledValue(doc, ["상세주소", "수령인상세주소", "수취인상세주소"], []);
      const zip = readLabeledValue(doc, ["수령인우편번호", "수취인우편번호", "우편번호"], []);
      const address = splitAddress(zip, rawAddress, detailAddress);
      return {
        receiver: readLabeledValue(doc, ["수령인", "수취인", "받는분", "받으시는분"], ["휴대", "전화", "연락", "우편", "주소"]),
        receiverPhone: readLabeledValue(doc, ["수령인휴대전화", "수취인휴대전화", "휴대전화", "휴대폰", "연락처", "전화번호"], []),
        receiverZip: address.zip,
        receiverAddress: address.address,
        receiverAddressDetail: address.detail,
        message: readLabeledValue(doc, ["배송메시지", "배송메세지", "배송요청사항", "배송요청"], []),
        paymentType: readLabeledValue(doc, ["결제구분"], []) || "T",
        paymentMethod: readLabeledValue(doc, ["결제수단", "결제방법"], []),
        orderedAt: readLabeledValue(doc, ["발주일", "주문일", "결제일", "주문일시"], []) || ((clean(doc.body?.innerText || "").match(ORDER_DATETIME_RE) || [])[0] || ""),
        items: parseItems(doc, orderId),
      };
    }

    async function decodeResponse(res) {
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "";
      const charset = (contentType.match(/charset=([^;]+)/i) || [])[1] || "";
      const encodings = [charset, "euc-kr", "utf-8"].filter(Boolean);
      let best = "";
      let bestScore = -1;
      for (const encoding of encodings) {
        try {
          const text = new TextDecoder(encoding).decode(buf);
          const score = (text.match(/[가-힣]/g) || []).length - (text.match(/\uFFFD/g) || []).length * 20;
          if (score > bestScore) {
            best = text;
            bestScore = score;
          }
        } catch {
          /* unsupported encoding */
        }
      }
      return best || new TextDecoder().decode(buf);
    }

    function parseItems(doc, orderId) {
      const out = [];
      for (const table of Array.from(doc.querySelectorAll("table"))) {
        const trs = Array.from(table.querySelectorAll("tr"));
        const headerInfo = findItemHeader(trs);
        if (!headerInfo) continue;
        const { index, headers } = headerInfo;
        const nameIndex = findHeaderIndex(headers, ["주문상품명", "상품명", "품목명"]);
        const optionIndex = findHeaderIndex(headers, ["옵션포함", "옵션", "옵션명"]);
        const orderItemIdIndex = findHeaderIndex(headers, ["품목별주문번호", "상품주문번호"]);
        const productNoIndex = findHeaderIndex(headers, ["상품번호", "상품코드", "품목코드", "상품품목코드"]);
        const qtyIndex = findHeaderIndex(headers, ["수량", "주문수량", "구매수량"]);
        if (nameIndex < 0 || qtyIndex < 0) continue;
        for (const tr of trs.slice(index + 1)) {
          const cells = rowCells(tr);
          if (cells.length < 2) continue;
          if (tr.querySelector?.('[colspan]')) continue;
          const normalized = cells.map((cell) => compact(cell));
          if (normalized.some((cell) => cell.includes("상품명")) && normalized.some((cell) => cell.includes("수량"))) continue;
          const name = normalizeProductName(cells[nameIndex] || "");
          if (!name || /합계|총계|배송비|결제정보|안내|설명/.test(name)) continue;
          const qty = numericText(cells[qtyIndex]);
          if (!qty || Number(qty) <= 0) continue;
          out.push({
            orderItemId: orderItemIdIndex >= 0
              ? normalizeOrderItemId(cells[orderItemIdIndex], orderId)
              : "",
            productNo: productNoIndex >= 0 ? productNumber(cells[productNoIndex]) : "",
            name,
            optionName: optionIndex >= 0 ? normalizeProductName(cells[optionIndex]) || name : name,
            qty,
          });
        }
        if (out.length > 0) return out;
      }
      return out;
    }

    function findItemHeader(trs) {
      for (let i = 0; i < Math.min(trs.length, 8); i += 1) {
        const headers = rowCells(trs[i]).map((cell) => compact(cell));
        const hasName = headers.some((cell) => cell.includes("상품명") || cell.includes("품목명"));
        const hasQty = headers.some((cell) => cell.includes("수량"));
        const hasProductNo = headers.some((cell) => cell.includes("상품번호") || cell.includes("상품코드"));
        if (hasName && (hasQty || hasProductNo)) return { index: i, headers };
      }
      return null;
    }

    function findHeaderIndex(headers, labels) {
      const normalized = labels.map((label) => compact(label));
      return headers.findIndex((header) => normalized.some((label) => header.includes(label)));
    }

    function rowCells(tr) {
      return Array.from(tr.cells || []).map((cell) => cellText(cell));
    }

    function readLabeledValue(doc, labels, excludes) {
      const normalizedLabels = labels.map((label) => compact(label));
      const normalizedExcludes = excludes.map((label) => compact(label));
      for (const tr of Array.from(doc.querySelectorAll("tr"))) {
        const cells = rowCells(tr);
        for (let i = 0; i < cells.length; i += 1) {
          const key = compact(cells[i]);
          if (!key) continue;
          if (normalizedExcludes.some((label) => key.includes(label))) continue;
          if (!normalizedLabels.some((label) => key.includes(label))) continue;
          const next = cleanMultiline(cells[i + 1] || "");
          if (next) return next;
          const stripped = stripLabels(cells[i], labels);
          if (stripped) return stripped;
        }
      }
      return "";
    }

    function stripLabels(value, labels) {
      let out = cleanMultiline(value);
      for (const label of labels) {
        out = out.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：]?", "gi"), "");
      }
      return cleanMultiline(out);
    }

    function splitAddress(zipValue, addressValue, detailValue) {
      let zip = clean(zipValue).replace(/[^0-9]/g, "").slice(0, 5);
      let addressRaw = cleanMultiline(addressValue);
      const match = addressRaw.match(/\b\d{5}\b/);
      if (!zip && match) zip = match[0];
      if (match) addressRaw = cleanMultiline(addressRaw.replace(match[0], ""));
      addressRaw = addressRaw.replace(/^\[|\]$/g, "").trim();
      const parts = addressRaw.split(/\n+/).map(clean).filter(Boolean);
      return {
        zip,
        address: parts[0] || addressRaw,
        detail: clean(detailValue) || parts.slice(1).join(" "),
      };
    }

    function fallbackItems(productText) {
      const name = normalizeProductName(productText);
      return name ? [{ productNo: "", name, optionName: name, qty: "1" }] : [];
    }

    function productNumber(value) {
      const m = clean(value).match(/\d{3,}/);
      return m ? m[0] : clean(value);
    }

    function numericText(value) {
      const m = clean(value).match(/\d+/);
      return m ? m[0] : "";
    }

    function normalizeProductName(value) {
      const lines = String(value || "")
        .split(/\r?\n| {2,}/)
        .map(clean)
        .filter(Boolean);
      const picked =
        lines.find((line) => !/공급사상품명|옵션|상품번호|품목번호|^\d+$/.test(line)) || lines[0] || "";
      return clean(picked.replace(/\[[^\]]*공급사상품명[^\]]*\]/g, ""));
    }

    function cellText(cell) {
      return cleanMultiline((cell && (cell.innerText || cell.textContent)) || "");
    }

    function cleanMultiline(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .split("\n")
        .map(clean)
        .filter(Boolean)
        .join("\n");
    }

    function clean(value) {
      return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  };
})();
