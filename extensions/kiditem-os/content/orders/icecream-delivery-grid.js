// 아이스크림몰 배송목록 읽기(MAIN world, 배송조회 프레임, KID-359 H3 — 옛 worker.js `scrapeIcecreamMallDeliveryGrid`
// 이식). 사이트가 고른 프레임에 `page-call/runner.js`와 함께 넣고 `icecream.deliveryGrid`를 부른다. 조회(#btn_list)
// 클릭이 몰 프레임워크(WebSquare) 핸들러를 깨워야 그리드가 로딩되므로 MAIN world다(ISOLATED 클릭은 "총 0건"에서 멈춘다).
// 최근 30일을 조회해 출고 전 주문 행만 돌려준다(이미 출고·배송·완료 상태는 뺀다).
(function installIcecreamDeliveryGrid() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  calls["icecream.deliveryGrid"] = async function icecreamDeliveryGrid(args) {
    const date = typeof args?.date === "string" && args.date ? args.date : null;
    const expectedHeaders = Array.isArray(args?.headers) ? args.headers : [];
    const excludedStatuses = Array.isArray(args?.excludedStatuses) ? args.excludedStatuses : [];

    function hasDeliveryInquiryText(text) {
      const compact = String(text || "").replace(/\s+/g, "");
      return (
        compact.includes("배송조회") ||
        (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
      );
    }

    // 조회 기간을 [startYmd, endYmd] 로 설정. startDate/endDate 이름 우선, 없으면 값이 날짜인 input 첫 2개.
    function setDateRange(startYmd, endYmd) {
      const applyVal = (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      let startEl = document.querySelector("input[name='startDate'], input#startDate, input[name='startDt']");
      let endEl = document.querySelector("input[name='endDate'], input#endDate, input[name='endDt']");
      if (!startEl || !endEl) {
        const dateInputs = Array.from(document.querySelectorAll("input")).filter((input) =>
          /^\d{4}-\d{2}-\d{2}$/.test(String(input.value || "")),
        );
        startEl = startEl || dateInputs[0] || null;
        endEl = endEl || dateInputs[1] || null;
      }
      if (startEl) applyVal(startEl, startYmd);
      if (endEl) applyVal(endEl, endYmd);
      return Boolean(startEl && endEl);
    }

    function clickSearchButton() {
      const controls = Array.from(document.querySelectorAll("a,button,input[type='button']"));
      const byText = controls.find((control) => {
        const text = String(control.textContent || control.value || "").replace(/\s+/g, " ").trim();
        return text === "조회";
      });
      const search = document.getElementById("btn_list") || byText; // 배송조회 조회 버튼(#btn_list 우선)
      search?.click();
      return Boolean(search);
    }

    function findHeaderCells() {
      const candidates = collectCandidateRows()
        .map((row) => cellTexts(row))
        .filter((cells) => cells.length > 0);
      const header = candidates
        .map(normalizeHeaderCells)
        .filter((cells) => isDeliveryHeader(cells))
        .sort((a, b) => b.length - a.length)[0];

      const hasOrderRows = candidates.some((cells) =>
        cells.some((cell) => /^\d{8}M\d+/.test(cell || "")),
      );
      if (header && header.length >= 20) return header;
      return hasOrderRows ? expectedHeaders : header ?? [];
    }

    function findDataRows(headers) {
      const columnCount = headers.length;
      const statusIdx = headers.indexOf("주문내역상태");
      // 이미 처리 중/완료된 상태는 제외 = 출고 전 주문만 수집(중복 배송 방지).
      const rows = [];
      const seen = new Set();
      let candidateRows = 0; // 표에서 스캔한 행 수(진단용)
      let orderRows = 0; // 주문번호(YYYYMMDDM…) 형식 행 수(진단용)
      let doneExcluded = 0; // 이미 출고/완료로 제외된 주문 수(진단용)
      for (const row of collectCandidateRows()) {
        const cells = cellTexts(row);
        if (cells.length) candidateRows += 1;
        const orderIndex = cells.findIndex((cell) => /^\d{8}M\d+/.test(cell || ""));
        if (orderIndex < 0) continue;
        orderRows += 1;

        const hasNoColumn = headers[0] === "No";
        const start =
          hasNoColumn && orderIndex > 0 && /^\d+$/.test(cells[orderIndex - 1] || "")
            ? orderIndex - 1
            : orderIndex;
        if (cells.length - start < Math.min(columnCount, 12)) continue;

        const normalized = cells.slice(start, start + columnCount);
        while (normalized.length < columnCount) normalized.push("");

        const key = normalized.join("\u001f");
        if (seen.has(key)) continue;
        seen.add(key);

        // 출고 전 주문만: 배송중/배송완료 등 이미 처리 중이거나 완료된 상태는 제외.
        const status = statusIdx >= 0 ? String(normalized[statusIdx] || "") : "";
        if (excludedStatuses.some((excluded) => status.includes(excluded))) {
          doneExcluded += 1;
          continue;
        }

        rows.push(normalized);
      }
      // 출고 전(미출고) 주문 전부 반환. 조회일 무관 — 기간 내 미출고 주문을 셀피아로 전송(사용자가 미리보기 확인).
      return { rows, candidateRows, orderRows, doneExcluded };
    }

    function collectCandidateRows() {
      const selectors = [
        "table tr",
        "[role='row']",
        ".slick-row",
        ".aui-grid-row",
        ".tui-grid-row",
        ".x-grid-row",
        ".ui-jqgrid-btable tr",
      ];
      return Array.from(document.querySelectorAll(selectors.join(",")));
    }

    function cellTexts(row) {
      const cells = Array.from(
        row.matches("tr")
          ? row.querySelectorAll("th,td")
          : row.querySelectorAll(
              [
                "[role='columnheader']",
                "[role='gridcell']",
                ".slick-cell",
                ".aui-grid-cell",
                ".tui-grid-cell",
                ".x-grid-cell",
                "th",
                "td",
              ].join(","),
            ),
      );
      return cells.map((cell) =>
        String(cell.textContent || "").replace(/\s+/g, " ").trim(),
      );
    }

    function normalizeHeaderCells(cells) {
      return cells.map((cell) => {
        if (cell === "거래명세서통봉여부") return "거래명세서동봉여부";
        return cell;
      });
    }

    function isDeliveryHeader(cells) {
      const compact = cells.join("\u001f");
      return (
        cells.includes("주문번호") &&
        cells.includes("배송번호") &&
        cells.includes("주문완료일시") &&
        (cells.includes("상품번호") || compact.includes("상품번호")) &&
        (cells.includes("상품명") || compact.includes("상품명"))
      );
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // 헤더(≥20열)+출고 전 주문행이 나타날 때까지 windowMs 동안 폴링. 표 로딩 지연 대비.
    async function pollGrid(windowMs) {
      let headers = [];
      let rows = [];
      let diag = { candidateRows: 0, orderRows: 0, doneExcluded: 0 };
      const end = Date.now() + windowMs;
      while (Date.now() < end) {
        headers = findHeaderCells();
        if (headers.length >= 20) {
          const found = findDataRows(headers);
          rows = found.rows;
          diag = { candidateRows: found.candidateRows, orderRows: found.orderRows, doneExcluded: found.doneExcluded };
        } else {
          rows = [];
        }
        if (headers.length >= 20 && rows.length > 0) break;
        await delay(400);
      }
      return { headers, rows, diag };
    }

    const bodyText = document.body?.innerText || "";
    if (!hasDeliveryInquiryText(bodyText)) {
      return { status: "none", reason: "not delivery inquiry frame" };
    }

    // 조회 기간 = 최근 30일(오늘 포함 지난 30일). ⚠️today-today 로 좁히지 않는다(새벽엔 전일 주문만 배송대기
    // 라 0건). 대신 주문내역상태로 "출고 전" 주문만 수집(findDataRows). 배송조회 기본화면은 비어 조회 클릭 필수.
    const p2 = (n) => String(n).padStart(2, "0");
    const fmt = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
    const endD = date ? new Date(date + "T00:00:00") : new Date();
    const startD = new Date(endD.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1) 이미 데이터가 로딩된 탭(재사용)이면 바로 스크랩.
    let result = await pollGrid(4000);

    // 2) 출고 전 주문을 못 얻었으면 30일 범위 설정 + 조회 클릭 후 넉넉히 재폴링. (35s 타임아웃 안 4s + 22s + 여유)
    if (result.rows.length === 0) {
      setDateRange(fmt(startD), fmt(endD));
      clickSearchButton();
      await delay(1500); // 조회 재로딩(AJAX) 시작 → 빈 상태로 바뀌는 구간을 넘긴 뒤 폴링
      const retried = await pollGrid(22000);
      if (retried.rows.length > 0 || retried.headers.length >= 20 || retried.diag.orderRows > 0) result = retried;
    }

    const { headers, rows, diag } = result;

    if (headers.length < 20 || !headers.includes("주문번호") || !headers.includes("배송번호")) {
      return { status: "none", reason: "header not found", headerCount: headers.length };
    }
    if (rows.length === 0) {
      return {
        status: "none",
        reason: "data rows not found",
        headerCount: headers.length,
        candidateRows: diag.candidateRows,
        orderRows: diag.orderRows,
        doneExcluded: diag.doneExcluded,
      };
    }

    const masked = rows.some((row) => row.some((cell) => /\*{2,}/.test(cell)));
    return { status: "ok", headers, rows, masked };
  };
})();
