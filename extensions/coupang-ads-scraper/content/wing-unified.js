// KIDITEM OS — Wing 페이지 데이터 수집
// 아이템위너 + 매출분석(트래픽) 통합 파서
// 매출분석: CSS Grid 기반 (테이블 아님), 상품당 11개 div

(function () {
  "use strict";

  const HEADER_COUNT = 3;
  const COLS_PER_PRODUCT = 11;

  // ===== 페이지 타입 감지 =====
  function detectPageType() {
    const url = location.href;
    if (url.includes("business-insight/sales-analysis")) return "sales-analysis";
    if (url.includes("business-insight")) return "business-insight";
    if (url.includes("item-winner") || url.includes("price")) return "itemwinner";
    return "generic";
  }

  // ===== URL에서 날짜 범위 추출 =====
  function getDateRangeFromUrl() {
    const params = new URLSearchParams(location.search);
    return {
      startDate: params.get("start_date") || params.get("startDate") || null,
      endDate: params.get("end_date") || params.get("endDate") || null,
    };
  }

  // ===== 한국어 숫자 파서 ("108.9만원" → 1089000, "1.2억" → 120000000) =====
  function parseKoreanNumber(text) {
    if (!text) return 0;
    const str = String(text).trim();

    // "억" 단위 처리: "1.2억" → 120000000
    const eokMatch = str.match(/([\d,.]+)\s*억/);
    if (eokMatch) {
      const base = parseFloat(eokMatch[1].replace(/,/g, "")) || 0;
      // "1억 2000만" 같은 복합 표현
      const manMatch = str.match(/억\s*([\d,.]+)\s*만/);
      const manPart = manMatch ? (parseFloat(manMatch[1].replace(/,/g, "")) || 0) * 10000 : 0;
      return Math.round(base * 100000000 + manPart);
    }

    // "만" 단위 처리: "108.9만" → 1089000
    const manMatch = str.match(/([\d,.]+)\s*만/);
    if (manMatch) {
      const base = parseFloat(manMatch[1].replace(/,/g, "")) || 0;
      return Math.round(base * 10000);
    }

    // K/M/B 영문 단위 처리
    const kmMatch = str.match(/([\d,.]+)\s*([KMB])/i);
    if (kmMatch) {
      const base = parseFloat(kmMatch[1].replace(/,/g, "")) || 0;
      const unit = kmMatch[2].toUpperCase();
      if (unit === "B") return Math.round(base * 1000000000);
      if (unit === "M") return Math.round(base * 1000000);
      if (unit === "K") return Math.round(base * 1000);
    }

    // 일반 숫자: "1,234,567" → 1234567
    const cleaned = str.replace(/[^\d.-]/g, "");
    return parseFloat(cleaned) || 0;
  }

  // ===== stat 셀에서 숫자 추출 (value_ 셀렉터 필수) =====
  function parseStat(cell, isPercent) {
    if (!cell) return { value: 0, change: null };
    const valueEl = cell.querySelector('[class*="value_"]');
    const badgeEl = cell.querySelector('[class*="badge_"]');
    const rawText = valueEl ? valueEl.textContent.trim() : "";

    let value;
    if (isPercent) {
      value = parseFloat(rawText.replace(/[^\d.]/g, "")) || 0;
    } else {
      value = parseKoreanNumber(rawText);
    }

    let change = null;
    if (badgeEl) {
      const changeMatch = badgeEl.textContent.match(/([\d.]+)%/);
      if (changeMatch) change = parseFloat(changeMatch[1]);
    }
    return { value, change };
  }

  // ===== KPI 요약 카드 파싱 (상단) — 전체 합계 =====
  function parseKpiCards() {
    const kpis = {};

    function parseKpiValue(text) {
      return parseKoreanNumber(text);
    }

    // 전환 퍼널 카드 (Visitor → Page view → Add to cart → Order → Conversion)
    const convCard = document.querySelector('[data-testid="conversion-stats-card"]');
    if (convCard) {
      const items = convCard.querySelectorAll('[class*="stat-item"]');
      const labels = ["visitor", "pageView", "addToCart", "order", "conversion"];
      items.forEach((item, i) => {
        const val = item.querySelector('[class*="value_"]');
        const badge = item.querySelector('[class*="badge_"]');
        const label = labels[i] || `kpi_${i}`;
        const rawValue = val ? val.textContent.trim() : "";
        kpis[label] = {
          value: rawValue,
          numValue: parseKpiValue(rawValue),
          change: badge ? badge.textContent.trim() : "",
        };
      });
    }

    // 판매 카드 (Unit Sold → Sales)
    const salesCard = document.querySelector('[data-testid="sales-stats-card"]');
    if (salesCard) {
      const items = salesCard.querySelectorAll('[class*="stat-item"]');
      const labels = ["unitSold", "sales"];
      items.forEach((item, i) => {
        const val = item.querySelector('[class*="value_"]');
        const badge = item.querySelector('[class*="badge_"]');
        const label = labels[i] || `sales_${i}`;
        const rawValue = val ? val.textContent.trim() : "";
        kpis[label] = {
          value: rawValue,
          numValue: parseKpiValue(rawValue),
          change: badge ? badge.textContent.trim() : "",
        };
      });
    }

    return kpis;
  }

  // ===== 광고 성과 요약 파싱 =====
  function parseAdSummary() {
    // 1차: 기존 클래스 셀렉터
    let wrapper = document.querySelector('[class*="wrapper_xtnmd"]');

    // 2차: class에 "wrapper_" 포함 + 광고 키워드 포함하는 요소
    if (!wrapper) {
      const candidates = document.querySelectorAll('[class*="wrapper_"]');
      for (const el of candidates) {
        const t = (el.textContent || "").substring(0, 1000);
        if ((t.includes("Ad GMV") || t.includes("ROAS") || t.includes("광고 수익률") || t.includes("광고매출")) && t.length < 800) {
          wrapper = el;
          break;
        }
      }
    }

    // 3차: data-testid 또는 role로 탐색
    if (!wrapper) {
      const sections = document.querySelectorAll('[data-testid*="ad"], [class*="ad-summary"], [class*="adSummary"], [class*="ad_summary"]');
      for (const el of sections) {
        if (el.textContent && el.textContent.length < 800) {
          wrapper = el;
          break;
        }
      }
    }

    // 4차: 페이지 전체에서 광고 지표 텍스트가 있는 가장 작은 컨테이너 탐색
    if (!wrapper) {
      const divs = document.querySelectorAll("div, section");
      let bestLen = Infinity;
      for (const el of divs) {
        const t = el.textContent || "";
        const hasAdKeyword = (t.includes("Ad GMV") || t.includes("Ad Spend") || t.includes("광고매출") || t.includes("광고비")) && (t.includes("ROAS") || t.includes("광고 수익률") || t.includes("광고수익률"));
        if (hasAdKeyword && t.length < bestLen && t.length > 20 && t.length < 600) {
          wrapper = el;
          bestLen = t.length;
        }
      }
    }

    if (!wrapper) return null;
    const text = wrapper.textContent || "";

    // 영문 + 국문 패턴 모두 시도 (만/억/K/M 단위 포함 캡처)
    const numPattern = "([\\d,.]+\\s*(?:만|억|K|M|B)?)";
    const adGmv = text.match(new RegExp("Ad\\s*GMV[^\\d]*" + numPattern, "i"))
      || text.match(new RegExp("광고\\s*(?:전환\\s*)?매출[^\\d]*" + numPattern));
    const adSpend = text.match(new RegExp("Ad\\s*Spend[^\\d]*" + numPattern, "i"))
      || text.match(new RegExp("(?:집행\\s*)?광고비[^\\d]*" + numPattern));
    const roas = text.match(/ROAS[^\d]*([\d,.]+)%/i)
      || text.match(/광고\s*수익률[^\d]*([\d,.]+)%/);

    // 숫자로 변환해서 저장 (만/억 → 원 단위)
    const gmvVal = adGmv ? parseKoreanNumber(adGmv[1]) : null;
    const spendVal = adSpend ? parseKoreanNumber(adSpend[1]) : null;
    const roasVal = roas ? roas[1] : null;
    return {
      adGmv: gmvVal !== null ? String(gmvVal) : null,
      adSpend: spendVal !== null ? String(spendVal) : null,
      roas: roasVal,
    };
  }

  // ===== 상품별 그리드 파싱 (핵심) =====
  function parseProductGrid() {
    const container = document.querySelector('[class*="container_1pewv"]');
    if (!container) {
      console.log("[KIDITEM] 그리드 컨테이너를 찾을 수 없음");
      return [];
    }

    const children = container.children;
    const totalChildren = children.length;

    if (totalChildren <= HEADER_COUNT) {
      console.log("[KIDITEM] 그리드에 데이터 없음. children:", totalChildren);
      return [];
    }

    const MAX_PRODUCTS = 500;
    const productCount = Math.min(Math.floor((totalChildren - HEADER_COUNT) / COLS_PER_PRODUCT), MAX_PRODUCTS);
    console.log("[KIDITEM] 감지된 상품 수:", productCount, "children:", totalChildren);

    const products = [];

    for (let p = 0; p < productCount; p++) {
      const offset = HEADER_COUNT + p * COLS_PER_PRODUCT;

      // offset+1: product 셀
      const productCell = children[offset + 1];
      if (!productCell) continue;

      // 상품명 추출 — span 중 유의미한 텍스트
      let productName = "";
      let inventoryId = "";
      let optionId = "";
      let adStatus = "";

      const spans = productCell.querySelectorAll("span");
      for (const span of spans) {
        const text = span.textContent.trim();
        if (!text) continue;

        const invMatch = text.match(/Inventory\s*ID:\s*(\d+)/);
        if (invMatch) {
          inventoryId = invMatch[1];
          const optMatch = text.match(/Option\s*ID:\s*(\d+)/);
          if (optMatch) optionId = optMatch[1];
          continue;
        }
        if (text.startsWith("Category:")) continue;
        if (text === "Fulfilled by Seller" || text === "Fulfilled by Coupang" || text === "로켓배송") continue;
        if (text.includes("상품 상태")) continue;
        if (text.includes("광고 운영")) { adStatus = "running"; continue; }
        if (text.includes("광고 중지")) { adStatus = "paused"; continue; }

        // 상품명 후보: 5자 이상이고 위 패턴에 안 걸린 것
        if (!productName && text.length > 5) {
          productName = text.substring(0, 100);
        }
      }

      // offset+9: anchor 셀에서 vendorItemId 추출
      let vendorItemId = optionId;
      const anchorCell = children[offset + 9];
      if (anchorCell) {
        const link = anchorCell.querySelector("a");
        if (link) {
          const href = link.getAttribute("href") || "";
          const vidMatch = href.match(/vendorItemId=(\d+)/);
          if (vidMatch) vendorItemId = vidMatch[1];
        }
      }

      // stat 셀들 파싱 (value_ 셀렉터로 정확하게)
      const visitors = parseStat(children[offset + 2], false);
      const pageViews = parseStat(children[offset + 3], false);
      const cartAdds = parseStat(children[offset + 4], false);
      const orders = parseStat(children[offset + 5], false);
      const unitSold = parseStat(children[offset + 6], false);
      const gmv = parseStat(children[offset + 7], false);
      const conversion = parseStat(children[offset + 8], true);

      // 의미 있는 데이터만
      if (visitors.value > 0 || orders.value > 0 || gmv.value > 0) {
        products.push({
          productName,
          inventoryId,
          optionId,
          vendorItemId: vendorItemId || optionId,
          productId: inventoryId, // coupangId 매칭용
          adStatus,
          visitors: visitors.value,
          views: pageViews.value,
          cartAdds: cartAdds.value,
          orders: orders.value,
          salesQty: unitSold.value,
          revenue: gmv.value,
          conversionRate: conversion.value,
          // 증감률
          changes: {
            visitors: visitors.change,
            views: pageViews.change,
            cartAdds: cartAdds.change,
            orders: orders.change,
            unitSold: unitSold.change,
            revenue: gmv.change,
            conversion: conversion.change,
          },
        });
      }
    }

    return products;
  }

  // ===== 아이템위너 테이블 파싱 (기존) =====
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

      data.push({ vendorItemId, productName, isWinner, myPrice, winnerPrice, salesQty });
    });

    return data;
  }

  // ===== 대시보드 카드 수집 =====
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

  // ===== 서버 전송 (service worker 경유 — CORS 우회) =====
  function sendViaServiceWorker(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "syncToServer", payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: "no response" });
      });
    });
  }

  function syncTrafficToServer(products, kpis, adSummary) {
    if (products.length === 0) return Promise.resolve({ success: false, error: "no data" });

    const { startDate, endDate } = getDateRangeFromUrl();

    let periodDays = 7;
    if (startDate && endDate) {
      const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
      if (diff > 0) periodDays = diff;
    }

    // KPI 카드에서 전체 합계 추출
    const summary = {
      visitors: kpis.visitor?.numValue || 0,
      views: kpis.pageView?.numValue || 0,
      cartAdds: kpis.addToCart?.numValue || 0,
      orders: kpis.order?.numValue || 0,
      conversionRate: kpis.conversion?.numValue || 0,
      salesQty: kpis.unitSold?.numValue || 0,
      revenue: kpis.sales?.numValue || 0,
    };

    return sendViaServiceWorker({
      type: "traffic",
      data: products.map(p => ({
        productId: p.inventoryId || p.vendorItemId,
        visitors: p.visitors,
        views: p.views,
        cartAdds: p.cartAdds,
        orders: p.orders,
        salesQty: p.salesQty,
        revenue: p.revenue,
        conversionRate: p.conversionRate,
      })),
      summary,
      period: periodDays,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      kpis,
      adSummary,
      timestamp: new Date().toISOString(),
      url: location.href,
    });
  }

  function syncItemWinnerToServer(tableData, cards) {
    return sendViaServiceWorker({
      type: "raw_scrape",
      source: "wing",
      data: tableData,
      kpis: cards,
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
    });
  }

  // ===== 배지 표시 =====
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

  // ===== 메인 동기화 =====
  async function doSync() {
    const pageType = detectPageType();
    console.log("[KIDITEM] 페이지 타입:", pageType, "URL:", location.href);

    if (pageType === "sales-analysis") {
      const products = parseProductGrid();
      const kpis = parseKpiCards();
      const adSummary = parseAdSummary();

      console.log("[KIDITEM] 파싱 결과:", products.length, "상품, KPI:", Object.keys(kpis).length);

      if (products.length > 0) {
        const { startDate, endDate } = getDateRangeFromUrl();
        const periodInfo = startDate && endDate ? `${startDate} ~ ${endDate}` : "";
        showBadge(`📊 매출분석 ${products.length}개 상품 감지 — 동기화 중... ${periodInfo}`, "#60a5fa");

        const json = await syncTrafficToServer(products, kpis, adSummary);
        if (json?.success) {
          chrome.storage.local.set({
            kiditem_last_sync_traffic: {
              time: Date.now(),
              count: products.length,
              period: periodInfo,
            },
          });
          showBadge(`✅ 매출분석 ${json.upserted || products.length}개 동기화 완료 (${periodInfo})`, "#22c55e");
          return { success: true, type: "traffic", count: products.length };
        } else {
          showBadge(`❌ ${json?.error || "동기화 실패"}`, "#ef4444");
          return { success: false, error: json?.error || "동기화 실패" };
        }
      }

      console.log("[KIDITEM] 그리드 데이터 없음 — 렌더링 대기 중");
      return { success: false, error: "그리드 데이터 없음" };
    }

    // 기본: 아이템위너/일반 Wing 페이지
    const tableData = parseWingTable();
    const cards = parseDashboardCards();
    const total = tableData.length + Object.keys(cards).length;

    if (total > 0) {
      showBadge(`📊 Wing ${tableData.length}행 + ${Object.keys(cards).length}카드 감지 — 동기화 중...`, "#60a5fa");
      const json = await syncItemWinnerToServer(tableData, cards);
      if (json?.success) {
        chrome.storage.local.set({ kiditem_last_sync_itemwinner: { time: Date.now(), count: tableData.length } });
        showBadge(`✅ ${json.upserted || tableData.length}개 동기화 완료`, "#22c55e");
        return { success: true, type: "wing", count: total };
      } else {
        showBadge(`❌ ${json?.error || "실패"}`, "#ef4444");
        return { success: false, error: json?.error || "실패" };
      }
    }
    return { success: false, error: "데이터 없음" };
  }

  // 렌더링 대기 후 자동 실행 (Vue SPA 렌더링 3~5초)
  async function waitAndSync(attempt) {
    attempt = attempt || 1;
    const result = await doSync();

    if (!result.success && detectPageType() === "sales-analysis" && attempt < 3) {
      console.log(`[KIDITEM] 재시도 ${attempt}/3 (3초 후)...`);
      setTimeout(() => waitAndSync(attempt + 1), 3000);
    }
  }

  setTimeout(() => waitAndSync(1), 4000);

  // 수동 동기화 — 서버 응답까지 대기 후 결과 반환
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      doSync().then((result) => sendResponse(result));
      return true;
    }
  });

  // SPA URL 변경 감지 — debounce + childList only (subtree 제거로 메모리 절약)
  let lastUrl = location.href;
  let urlDebounceTimer = null;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
      urlDebounceTimer = setTimeout(() => {
        console.log("[KIDITEM] URL 변경 감지:", location.href);
        waitAndSync(1);
      }, 4000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });

  // 탭 비활성/종료 시 observer 정리
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.disconnect();
      if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
    } else {
      lastUrl = location.href;
      observer.observe(document.body, { childList: true, subtree: false });
    }
  });
})();
