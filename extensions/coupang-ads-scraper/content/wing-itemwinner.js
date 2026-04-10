// KIDITEM OS — Wing 아이템위너 페이지 파싱
// URL: wing.coupang.com 가격관리 / 아이템위너 페이지

(function () {
  "use strict";

  const SERVER = "http://localhost:4000";

  function parseItemWinners() {
    const data = [];

    const rows = document.querySelectorAll("table tbody tr");

    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) return;

      const rowText = row.textContent || "";

      // 노출상품ID — "판매자배송 | 9399861609" 또는 긴 숫자
      let productId = "";
      const idPatterns = [
        /(?:판매자배송|로켓배송|로켓그로스)\s*[|｜]\s*(\d{5,})/,
        /(\d{8,15})/,
      ];
      for (const pat of idPatterns) {
        const m = rowText.match(pat);
        if (m) { productId = m[1]; break; }
      }
      if (!productId) return;

      // 상품명
      let productName = "";
      const firstCell = cells[0];
      if (firstCell) {
        const lines = firstCell.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        productName = (lines[0] || "").substring(0, 80);
      }

      // 판매량 — "190개" 패턴
      let salesQty = 0;
      const qtyMatch = rowText.match(/(\d+)\s*개/);
      if (qtyMatch) salesQty = parseInt(qtyMatch[1]);

      // 아이템위너 여부
      let isWinner = rowText.includes("아이템위너");

      // 가격 — "8,450원" 패턴
      const priceMatches = rowText.match(/[\d,]+원/g) || [];
      const prices = priceMatches.map(p => parseInt(p.replace(/[^\d]/g, ""))).filter(p => p > 100);
      const myPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
      const winnerPrice = prices.length >= 2 ? prices[0] : null;

      data.push({ productId, productName, isWinner, myPrice, winnerPrice, salesQty });
    });

    return data;
  }

  function syncToServer(data) {
    if (data.length === 0) return;
    fetch(`${SERVER}/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "itemwinner", data, timestamp: new Date().toISOString() }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          chrome.storage.local.set({ kiditem_last_sync_itemwinner: { time: Date.now(), count: data.length } });
          showBadge(`✅ 아이템위너 ${json.upserted}개 동기화`);
        } else {
          showBadge(`❌ ${json.error}`);
        }
      })
      .catch(() => showBadge("❌ 서버 연결 실패"));
  }

  function showBadge(text) {
    let el = document.getElementById("kiditem-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "kiditem-badge";
      el.style.cssText = "position:fixed;top:12px;right:12px;background:#0f172a;color:#22c55e;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,sans-serif;transition:opacity 0.5s;";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }, 4000);
  }

  // 3초 후 자동 파싱 + 동기화
  setTimeout(() => {
    const data = parseItemWinners();
    if (data.length > 0) {
      showBadge(`🏆 아이템위너 ${data.length}개 감지 — 동기화 중...`);
      syncToServer(data);
    }
  }, 3000);

  // 수동 동기화
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const data = parseItemWinners();
      if (data.length > 0) {
        syncToServer(data);
        sendResponse({ success: true, type: "itemwinner", count: data.length });
      } else {
        sendResponse({ success: false, error: "파싱 데이터 없음" });
      }
    }
  });

  // SPA 네비게이션 감지 — debounce + subtree 제거
  let lastUrl = location.href;
  let urlTimer = null;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (urlTimer) clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const data = parseItemWinners();
        if (data.length > 0) syncToServer(data);
      }, 3000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.disconnect();
      if (urlTimer) clearTimeout(urlTimer);
    } else {
      lastUrl = location.href;
      observer.observe(document.body, { childList: true, subtree: false });
    }
  });
})();
