// KIDITEM — Wing 페이지 데이터 수집
// DOM 구조 기반 정확한 파싱

(function () {
  "use strict";

  const SERVER = "http://localhost:4000";

  // Wing 아이템위너 테이블 파싱 (실제 DOM 구조 기반)
  function parseWingTable() {
    const data = [];

    const rows = document.querySelectorAll("table.w-ui-table tbody tr, .data-table-container table tbody tr, .data-body tr");

    rows.forEach((row) => {
      let vendorItemId = row.getAttribute("data-vendor-item-id") || "";
      if (!vendorItemId) {
        const rowKey = row.getAttribute("row-key") || row.className || "";
        const keyMatch = rowKey.match(/(\d{8,})/);
        if (keyMatch) vendorItemId = keyMatch[1];
      }

      let productName = "";
      const nameEl = row.querySelector(".product-name-container, [class*='product-name'], [class*='item-name']");
      if (nameEl) {
        productName = nameEl.innerText.trim().split("\n")[0].substring(0, 80);
      }
      if (!productName) {
        const firstTd = row.querySelector("td");
        if (firstTd) {
          const lines = firstTd.innerText.trim().split("\n").filter(s => s.trim().length > 3);
          for (const line of lines) {
            if (!line.match(/^\d+$/) && !line.includes("판매자배송") && !line.includes("로켓")) {
              productName = line.trim().substring(0, 80);
              break;
            }
          }
        }
      }

      if (!productName && !vendorItemId) return;

      let salesQty = 0;
      const salesEl = row.querySelector(".cp-sales, [class*='sales']");
      if (salesEl) {
        salesQty = parseInt(salesEl.innerText.replace(/[^\d]/g, "")) || 0;
      } else {
        const qtyMatch = row.innerText.match(/(\d+)\s*개/);
        if (qtyMatch) salesQty = parseInt(qtyMatch[1]);
      }

      const rowText = row.innerText;
      const isWinner = rowText.includes("아이템위너");

      const priceMatches = rowText.match(/[\d,]+\s*원/g) || [];
      const prices = priceMatches.map(p => parseInt(p.replace(/[^\d]/g, ""))).filter(p => p > 100);
      const myPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
      const winnerPrice = prices.length >= 2 ? prices[0] : null;

      data.push({
        vendorItemId,
        productName,
        isWinner,
        myPrice,
        winnerPrice,
        salesQty,
      });
    });

    return data;
  }

  // 대시보드 카드 수집
  function parseDashboardCards() {
    const cards = {};
    document.querySelectorAll(".dashboard-card, [class*='dashboard-card']").forEach((card) => {
      const titleEl = card.querySelector(".title, [class*='title']");
      const countEl = card.querySelector(".count, [class*='count']");
      if (titleEl && countEl) {
        cards[titleEl.innerText.trim()] = countEl.innerText.trim();
      }
    });
    return cards;
  }

  function syncToServer(tableData, cards) {
    return fetch(`${SERVER}/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "raw_scrape",
        source: "wing",
        data: tableData,
        kpis: cards,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      }),
    })
      .then(r => r.json())
      .catch(e => ({ success: false, error: e.message }));
  }

  function showBadge(text, color) {
    let el = document.getElementById("kiditem-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "kiditem-badge";
      el.style.cssText = "position:fixed;top:12px;right:12px;background:#0f172a;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,sans-serif;transition:opacity 0.5s;";
      document.body.appendChild(el);
    }
    el.style.color = color || "#22c55e";
    el.textContent = text;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }, 5000);
  }

  function doSync() {
    const tableData = parseWingTable();
    const cards = parseDashboardCards();
    const total = tableData.length + Object.keys(cards).length;

    if (total > 0) {
      showBadge(`Wing ${tableData.length}행 + ${Object.keys(cards).length}카드 감지 — 동기화 중...`, "#60a5fa");
      syncToServer(tableData, cards).then(json => {
        if (json?.success) {
          chrome.storage.local.set({ kiditem_last_sync_itemwinner: { time: Date.now(), count: tableData.length } });
          showBadge(`${json.upserted || tableData.length}개 동기화 완료`, "#22c55e");
        } else {
          showBadge(`${json?.error || "실패"}`, "#ef4444");
        }
      });
      return { success: true, type: "wing", count: total };
    }
    return { success: false, error: "데이터 없음" };
  }

  setTimeout(doSync, 3000);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const result = doSync();
      sendResponse(result);
      return true;
    }
  });

  // SPA 감지
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(doSync, 3000);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
