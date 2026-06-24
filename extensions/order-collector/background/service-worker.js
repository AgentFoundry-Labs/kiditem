const ICECREAM_MALL_URL = "https://po.i-screammall.co.kr/main.do";
const ICECREAM_MALL_TAB_MATCH = "https://po.i-screammall.co.kr/*";
const ICECREAM_DELIVERY_HEADERS = [
  "No",
  "주문번호",
  "배송번호",
  "사이트",
  "주문완료일시",
  "주문구분",
  "주문내역구분",
  "주문내역상태",
  "배송유형",
  "배송종류",
  "배송처리유형",
  "택배사",
  "송장번호",
  "배송조회",
  "주문판매유형",
  "거래명세서동봉여부",
  "합배송여부",
  "직배변경 사유",
  "상품번호",
  "상품명",
  "단품명",
  "출고수량",
  "추가입력옵션",
  "증정품",
  "정상가",
  "판매가",
  "판매가(합계)",
  "공급가",
  "공급가(합계)",
  "배송비",
  "Y주문번호",
  "입점사",
  "회원ID",
  "주문자",
  "수취인",
  "수취인휴대폰번호",
  "우편번호",
  "배송지",
  "배송요청사항",
  "배송지시일시",
  "출고지시일시",
  "출고완료일시",
];

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        orderCollectionIcecreamMall: true,
      },
    });
    return false;
  }

  if (msg?.action === "collectIcecreamMallOrders") {
    collectIcecreamMallOrders(typeof msg.date === "string" ? msg.date : null)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "아이스크림몰 주문 수집 실패",
        });
      });
    return true;
  }

  return false;
});

async function collectIcecreamMallOrders(date) {
  const tab = await findOrCreateIcecreamMallTab();
  if (!tab.id) {
    return { success: false, error: "아이스크림몰 탭을 열 수 없습니다." };
  }

  await waitForTabReady(tab.id);
  const deliveryInquiry = await withTimeout(
    openIcecreamMallDeliveryInquiry(tab.id),
    15000,
    "아이스크림몰 배송조회 화면 이동 시간이 초과되었습니다.",
  );
  if (!deliveryInquiry.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: deliveryInquiry.pendingLogin,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: deliveryInquiry.error,
    };
  }

  const deliveryFrameId = await findIcecreamMallDeliveryFrameId(tab.id);
  const target =
    deliveryFrameId == null ? { tabId: tab.id, allFrames: true } : { tabId: tab.id, frameIds: [deliveryFrameId] };
  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target,
      func: scrapeIcecreamMallDeliveryGrid,
      args: [date, ICECREAM_DELIVERY_HEADERS],
    }),
    28000,
    "아이스크림몰 배송목록 수집 시간이 초과되었습니다.",
  );

  const results = injected.map((item) => item.result).filter(Boolean);
  const candidates = results.filter((item) => item?.success && Array.isArray(item.rows));
  candidates.sort((a, b) => b.rows.length - a.rows.length);
  const best = candidates[0];

  if (!best) {
    const failure = summarizeScrapeFailures(results);
    return {
      success: false,
      pendingLogin: false,
      url: tab.url || ICECREAM_MALL_URL,
      error: failure || "아이스크림몰 배송조회 화면은 열었지만 배송목록 표를 찾지 못했습니다.",
    };
  }

  return {
    success: true,
    tabId: tab.id,
    url: tab.url || ICECREAM_MALL_URL,
    ...best,
  };
}

async function findIcecreamMallDeliveryFrameId(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallDeliveryFrame,
  });
  const candidates = injected
    .filter((item) => item.result?.candidate)
    .sort((a, b) => (b.result.score || 0) - (a.result.score || 0));
  return candidates[0]?.frameId ?? null;
}

function detectIcecreamMallDeliveryFrame() {
  const text = document.body?.innerText || "";
  const compact = text.replace(/\s+/g, "");
  const href = location.href || "";
  let score = 0;
  if (href.includes("deliveryInquiry.deliveryInquiryListView")) score += 10;
  if (compact.includes("배송조회")) score += 5;
  if (compact.includes("배송목록")) score += 5;
  if (compact.includes("주문번호") && compact.includes("배송번호")) score += 5;
  if (compact.includes("상품번호") || compact.includes("상품명")) score += 2;
  return {
    candidate: score > 0,
    score,
    href,
  };
}

function summarizeScrapeFailures(results) {
  const reasons = results.map((item) => item?.reason).filter(Boolean);
  if (reasons.includes("data rows not found")) {
    return "배송목록 표는 찾았지만 주문 행을 찾지 못했습니다. 조회일 또는 배송목록 결과를 확인해주세요.";
  }
  if (reasons.includes("header not found")) {
    return "배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다. 표가 로딩된 뒤 다시 시도해주세요.";
  }
  if (reasons.includes("not delivery inquiry frame")) {
    return "배송조회 화면은 열었지만 수집 가능한 배송조회 프레임을 찾지 못했습니다.";
  }
  return "";
}

async function findOrCreateIcecreamMallTab() {
  const tabs = await chrome.tabs.query({ url: ICECREAM_MALL_TAB_MATCH });
  const active = tabs.find((tab) => tab.active) || tabs[0];
  if (active) return active;

  return chrome.tabs.create({ url: ICECREAM_MALL_URL, active: true });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const done = () => resolve();
    const timeout = setTimeout(done, 10000);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        clearTimeout(timeout);
        done();
        return;
      }

      const listener = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        done();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function openIcecreamMallDeliveryInquiry(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: ensureIcecreamMallDeliveryInquiry,
  });

  return injected[0]?.result ?? {
    success: false,
    pendingLogin: true,
    error: "아이스크림몰 화면에 접근하지 못했습니다. 로그인 상태를 확인해주세요.",
  };
}

async function ensureIcecreamMallDeliveryInquiry() {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function hasDeliveryInquiryFrame() {
    const bodyText = document.body?.innerText || "";
    if (hasDeliveryInquiryText(bodyText)) {
      return true;
    }

    return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
      const src = String(frame.getAttribute("src") || "");
      if (src.includes("deliveryInquiry.deliveryInquiryListView")) return true;

      try {
        const frameText = frame.contentDocument?.body?.innerText || "";
        return hasDeliveryInquiryText(frameText);
      } catch {
        return false;
      }
    });
  }

  function clickDeliveryInquiryMenu() {
    const candidates = menuCandidates();
    const exact = candidates.find((item) => item.text === "배송 조회" || item.text === "배송조회");
    if (exact) {
      exact.element.click();
      return true;
    }

    const deliverySection = candidates.find((item) => item.text === "배송");
    deliverySection?.element.click();

    const afterSectionClick = menuCandidates().find(
      (item) => item.text === "배송 조회" || item.text === "배송조회",
    );
    if (afterSectionClick) {
      afterSectionClick.element.click();
      return true;
    }

    return false;
  }

  function menuCandidates() {
    return Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .map((element) => ({
        element,
        text: String(
          element.textContent ||
            element.value ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((item) => item.text.includes("배송"));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  if (hasDeliveryInquiryFrame()) {
    return { success: true, opened: false };
  }

  const clicked = clickDeliveryInquiryMenu();
  if (!clicked) {
    const bodyText = document.body?.innerText || "";
    return {
      success: false,
      pendingLogin: !bodyText.includes("배송"),
      error: "아이스크림몰 배송조회 메뉴를 찾지 못했습니다. 로그인 후 다시 시도해주세요.",
    };
  }

  const expiresAt = Date.now() + 12000;
  while (Date.now() < expiresAt) {
    if (hasDeliveryInquiryFrame()) {
      return { success: true, opened: true };
    }
    await delay(400);
  }

  return {
    success: false,
    pendingLogin: false,
    error: "배송조회 메뉴를 눌렀지만 배송목록 화면이 열리지 않았습니다.",
  };
}

async function scrapeIcecreamMallDeliveryGrid(date, expectedHeaders) {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function setDateRange(value) {
    const dateInputs = Array.from(document.querySelectorAll("input"))
      .filter((input) => /^\d{4}-\d{2}-\d{2}$/.test(String(input.value || "")));
    dateInputs.slice(0, 2).forEach((input) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return dateInputs.length >= 2;
  }

  function clickSearchButton() {
    const controls = Array.from(document.querySelectorAll("a,button,input[type='button']"));
    const search = controls.find((control) => {
      const text = String(control.textContent || control.value || "").replace(/\s+/g, " ").trim();
      return text === "조회";
    });
    search?.click();
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
    const rows = [];
    const seen = new Set();
    for (const row of collectCandidateRows()) {
      const cells = cellTexts(row);
      const orderIndex = cells.findIndex((cell) => /^\d{8}M\d+/.test(cell || ""));
      if (orderIndex < 0) continue;

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
      rows.push(normalized);
    }
    return rows;
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

  const bodyText = document.body?.innerText || "";
  if (!hasDeliveryInquiryText(bodyText)) {
    return { success: false, reason: "not delivery inquiry frame" };
  }

  if (date && setDateRange(date)) {
    clickSearchButton();
  }

  let headers = [];
  let rows = [];
  const expiresAt = Date.now() + 10000;
  while (Date.now() < expiresAt) {
    headers = findHeaderCells();
    rows = headers.length >= 20 ? findDataRows(headers) : [];
    if (headers.length >= 20 && rows.length > 0) break;
    await delay(400);
  }

  if (headers.length < 20 || !headers.includes("주문번호") || !headers.includes("배송번호")) {
    return { success: false, reason: "header not found", headerCount: headers.length };
  }
  if (rows.length === 0) return { success: false, reason: "data rows not found", headerCount: headers.length };

  const masked = rows.some((row) => row.some((cell) => /\*{2,}/.test(cell)));
  return {
    success: true,
    mall: "아이스크림몰",
    date: date || null,
    headers,
    rows,
    rowCount: rows.length,
    masked,
    source: "icecream-mall-delivery-grid",
  };
}
