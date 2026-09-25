/* global chrome, DOMParser */
// supplier.coupang.com 탭에 필요할 때만 주입되는 읽기 다리(KID-359, 확장 `sites/coupang-supplier`).
// 같은 출처의 주소를 이 탭의 세션으로 읽어 본문과(원하면) 표를 칸 단위로 돌려준다. 업무 판단은 없다 —
// 무엇을 읽고 어떻게 해석할지는 서비스워커의 사이트·수집기가 정한다. 서비스워커에는 DOMParser가 없어 HTML 표는 여기서 편다.
(function () {
  "use strict";
  if (globalThis.__kiditemCoupangSupplierPage) return;
  globalThis.__kiditemCoupangSupplierPage = true;

  const FETCH = "KIDITEM_COUPANG_SUPPLIER_FETCH";
  const BODY_TEXT = "KIDITEM_COUPANG_SUPPLIER_BODY_TEXT";

  function tablesOf(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("table")).map((table) => ({
      id: table.id || null,
      text: String(table.textContent || ""),
      rows: Array.from(table.rows).map((row) => ({
        section: String(row.parentElement?.tagName || "").toLowerCase(),
        cells: Array.from(row.cells).map((cell) => ({
          text: String(cell.textContent || ""),
          rowSpan: Number(cell.rowSpan || 1),
          header: cell.tagName === "TH",
        })),
      })),
    }));
  }

  async function read(message) {
    const url = new URL(String(message.url || ""), location.origin);
    if (url.origin !== location.origin) return { ok: false, error: "cross_origin" };
    const headers = message.headers && typeof message.headers === "object" ? message.headers : {};
    const response = await fetch(url.href, { credentials: "include", headers });
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      redirected: response.redirected === true,
      url: String(response.url || url.href),
      text,
      tables: message.tables === true ? tablesOf(text) : null,
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id || !message || typeof message !== "object") return false;
    if (message.type === BODY_TEXT) {
      sendResponse({ ok: true, text: String(document.body?.innerText || "").slice(0, 400) });
      return false;
    }
    if (message.type !== FETCH) return false;
    read(message).then(sendResponse, (error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  globalThis.KidItemCoupangSupplierPage = Object.freeze({ tablesOf });
})();
