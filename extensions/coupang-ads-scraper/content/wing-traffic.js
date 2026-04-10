// KIDITEM OS — Wing 상품별 통계/트래픽 페이지 파싱

(function () {
  "use strict";

  const SERVER = "http://localhost:3000";

  function parseTrafficTable() {
    const data = [];
    const rows = document.querySelectorAll("table tbody tr");

    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) return;

      const rowText = row.textContent || "";

      // 등록상품ID
      let productId = "";
      const idMatch = rowText.match(/(\d{8,15})/);
      if (idMatch) productId = idMatch[1];
      if (!productId) return;

      // 헤더에서 컬럼 순서 파악
      const headers = [];
      document.querySelectorAll("table thead th").forEach(th => {
        headers.push((th.textContent || "").trim());
      });

      const record = { productId, visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, conversionRate: 0 };

      if (headers.length > 0) {
        headers.forEach((h, i) => {
          if (i >= cells.length) return;
          const v = parseInt((cells[i].textContent || "").replace(/[^\d.-]/g, "")) || 0;
          if (h.includes("방문자")) record.visitors = v;
          else if (h === "조회" || h === "조회수") record.views = v;
          else if (h.includes("장바구니")) record.cartAdds = v;
          else if (h === "주문" || h.includes("주문수")) record.orders = v;
          else if (h.includes("판매량") || h.includes("판매수량")) record.salesQty = v;
          else if (h.includes("매출")) record.revenue = v;
          else if (h.includes("전환율")) record.conversionRate = parseFloat((cells[i].textContent || "").replace(/[^\d.]/g, "")) || 0;
        });
      }

      if (record.visitors > 0 || record.orders > 0 || record.revenue > 0) {
        data.push(record);
      }
    });

    return data;
  }

  function syncToServer(data) {
    if (data.length === 0) return;
    fetch(`${SERVER}/api/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "traffic", data, period: 14, timestamp: new Date().toISOString() }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          chrome.storage.local.set({ kiditem_last_sync_traffic: { time: Date.now(), count: data.length } });
          showBadge(`✅ 트래픽 ${json.upserted}개 동기화`);
        }
      })
      .catch(() => showBadge("❌ 서버 연결 실패"));
  }

  function showBadge(text) {
    let el = document.getElementById("kiditem-badge-traffic");
    if (!el) {
      el = document.createElement("div");
      el.id = "kiditem-badge-traffic";
      el.style.cssText = "position:fixed;top:60px;right:12px;background:#0f172a;color:#60a5fa;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,sans-serif;transition:opacity 0.5s;";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }, 4000);
  }

  // 자동 파싱
  setTimeout(() => {
    const data = parseTrafficTable();
    if (data.length > 0) {
      showBadge(`📊 트래픽 ${data.length}개 감지 — 동기화 중...`);
      syncToServer(data);
    }
  }, 3000);

  // 수동 동기화
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const data = parseTrafficTable();
      if (data.length > 0) {
        syncToServer(data);
        sendResponse({ success: true, type: "traffic", count: data.length });
      }
    }
  });
})();
