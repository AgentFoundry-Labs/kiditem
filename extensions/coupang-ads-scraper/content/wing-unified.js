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

  // ===== 광고 성과 요약 파싱 (dt/dd 직접 파싱 + fallback) =====
  function parseAdSummary() {
    // 1차: dt/dd 패턴 직접 파싱 (wing 현행 구조: <dt>광고 매출</dt><dd>256.6만원</dd>)
    const dls = document.querySelectorAll("dl");
    let adGmvRaw = null, adSpendRaw = null, roasRaw = null;
    for (const dl of dls) {
      const dts = dl.querySelectorAll("dt");
      const dds = dl.querySelectorAll("dd");
      dts.forEach((dt, i) => {
        const label = dt.textContent.trim();
        const val = dds[i] ? dds[i].textContent.trim() : "";
        if (!adGmvRaw && (label.includes("광고 매출") || label.includes("Ad GMV"))) adGmvRaw = val;
        if (!adSpendRaw && (label.includes("집행 광고비") || label.includes("Ad Spend") || label.includes("광고비"))) adSpendRaw = val;
        if (!roasRaw && (label.includes("광고수익률") || label.includes("ROAS") || label.includes("광고 수익률"))) roasRaw = val;
      });
    }

    if (adGmvRaw || adSpendRaw || roasRaw) {
      const gmvVal = adGmvRaw ? parseKoreanNumber(adGmvRaw) : null;
      const spendVal = adSpendRaw ? parseKoreanNumber(adSpendRaw) : null;
      const roasMatch = roasRaw ? roasRaw.match(/([\d,.]+)/) : null;
      return {
        adGmv: gmvVal !== null ? String(gmvVal) : null,
        adSpend: spendVal !== null ? String(spendVal) : null,
        roas: roasMatch ? roasMatch[1] : null,
      };
    }

    // 2차: 텍스트 패턴 매칭 fallback
    let wrapper = null;
    const divs = document.querySelectorAll("div, section");
    let bestLen = Infinity;
    for (const el of divs) {
      const t = el.textContent || "";
      const hasAdKeyword = (t.includes("Ad GMV") || t.includes("Ad Spend") || t.includes("광고 매출") || t.includes("광고비")) && (t.includes("ROAS") || t.includes("광고 수익률") || t.includes("광고수익률"));
      if (hasAdKeyword && t.length < bestLen && t.length > 20 && t.length < 600) {
        wrapper = el;
        bestLen = t.length;
      }
    }

    if (!wrapper) return null;
    const text = wrapper.textContent || "";
    const numPattern = "([\\d,.]+\\s*(?:만|억|K|M|B)?)";
    const adGmvM = text.match(new RegExp("Ad\\s*GMV[^\\d]*" + numPattern, "i"))
      || text.match(new RegExp("광고\\s*(?:전환\\s*)?매출[^\\d]*" + numPattern));
    const adSpendM = text.match(new RegExp("Ad\\s*Spend[^\\d]*" + numPattern, "i"))
      || text.match(new RegExp("(?:집행\\s*)?광고비[^\\d]*" + numPattern));
    const roasM = text.match(/ROAS[^\d]*([\d,.]+)%/i) || text.match(/광고\s*수익률[^\d]*([\d,.]+)%/);
    const gmvVal = adGmvM ? parseKoreanNumber(adGmvM[1]) : null;
    const spendVal = adSpendM ? parseKoreanNumber(adSpendM[1]) : null;
    return {
      adGmv: gmvVal !== null ? String(gmvVal) : null,
      adSpend: spendVal !== null ? String(spendVal) : null,
      roas: roasM ? roasM[1] : null,
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

      // 상품 ID: <p> 태그에서 "등록상품 ID: ..." 또는 "Inventory ID: ..."
      for (const pEl of productCell.querySelectorAll("p")) {
        const text = pEl.textContent.trim();
        const imKo = text.match(/등록상품\s*ID:\s*(\d+)/);
        const imEn = text.match(/Inventory\s*ID:\s*(\d+)/);
        const im = imKo || imEn;
        if (im) {
          inventoryId = im[1];
          const omKo = text.match(/옵션\s*ID:\s*(\d+)/);
          const omEn = text.match(/Option\s*ID:\s*(\d+)/);
          const om = omKo || omEn;
          if (om) optionId = om[1];
          break;
        }
      }

      // 상품명: <strong> 태그가 있는 span 우선 → 없으면 span 텍스트 폴백
      const SKIP_TEXTS = ["판매자 배송", "로켓배송", "Fulfilled by Seller", "Fulfilled by Coupang", "상품 상태"];
      for (const span of productCell.querySelectorAll("span")) {
        if (span.querySelector("strong")) {
          productName = (span.querySelector("strong")?.textContent || "").trim().substring(0, 100);
          break;
        }
      }
      if (!productName) {
        for (const span of productCell.querySelectorAll("span")) {
          const text = span.textContent.trim();
          if (!text || text.length < 5) continue;
          if (SKIP_TEXTS.includes(text)) continue;
          if (text.startsWith("Category:") || text.startsWith("카테고리:")) continue;
          if (text.includes("광고")) { if (text.includes("운영")) adStatus = "running"; else if (text.includes("중지")) adStatus = "paused"; continue; }
          if (/^외 \d/.test(text)) continue;
          productName = text.substring(0, 100);
          break;
        }
      }

      // 광고 상태: 상품 셀 전체 텍스트에서 추출
      if (!adStatus) {
        const cellText = productCell.textContent || "";
        if (cellText.includes("광고 운영")) adStatus = "running";
        else if (cellText.includes("광고 중지")) adStatus = "paused";
      }

      // vendorItemId: 상품 셀(offset+1) 내 anchor href 또는 anchor 셀(offset+9) 에서 추출
      let vendorItemId = optionId;
      const productHref = productCell.querySelector("a")?.getAttribute("href") || "";
      const productVid = productHref.match(/vendorItemId=(\d+)/);
      if (productVid) {
        vendorItemId = productVid[1];
      } else {
        const anchorCell = children[offset + 9];
        if (anchorCell) {
          const link = anchorCell.querySelector("a");
          if (link) {
            const href = link.getAttribute("href") || "";
            const vidMatch = href.match(/vendorItemId=(\d+)/);
            if (vidMatch) vendorItemId = vidMatch[1];
          }
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

  // ===== 페이지네이션 전체 상품 파싱 =====

  function getTotalPages() {
    let max = 1;
    document.querySelectorAll('[data-wuic-attrs]').forEach(el => {
      const m = el.getAttribute('data-wuic-attrs').match(/^page:(\d+)/);
      if (m) {
        const n = parseInt(m[1]);
        if (n > max) max = n;
      }
    });
    return max;
  }

  function getCurrentPage() {
    const active = document.querySelector('[data-wuic-attrs*=" active"]');
    if (!active) return 1;
    const m = active.getAttribute('data-wuic-attrs').match(/page:(\d+)/);
    return m ? parseInt(m[1]) : 1;
  }

  // 특정 페이지 번호로 이동 (링크가 없으면 next 버튼 사용)
  function clickPage(n) {
    // data-wuic-attrs="page:N" 로 직접 클릭
    const span = document.querySelector(`[data-wuic-attrs^="page:${n}"]`);
    if (span) {
      const a = span.querySelector('a');
      if (a) { a.click(); return true; }
    }
    // 링크가 없으면 next 버튼 클릭
    const nextBtn = document.querySelector('[data-wuic-partial="next"] a');
    if (nextBtn) { nextBtn.click(); return true; }
    return false;
  }

  // 페이지 전환 대기: active 페이지 번호가 expected로 바뀔 때까지
  function waitForPage(expectedPage, timeoutMs) {
    return new Promise(resolve => {
      const deadline = Date.now() + (timeoutMs || 10000);
      const check = () => {
        if (getCurrentPage() === expectedPage) { setTimeout(resolve, 800); return; }
        if (Date.now() > deadline) { resolve(); return; }
        setTimeout(check, 400);
      };
      setTimeout(check, 400);
    });
  }

  // 페이지당 표시 개수를 최대로 변경
  async function setMaxPageSize() {
    // Wing의 페이지 크기 선택 버튼: 보통 [20] [50] [100] 형태
    // 가장 큰 숫자 버튼 클릭
    const sizeButtons = [...document.querySelectorAll('[data-wuic-attrs^="pageSize:"]')];
    if (sizeButtons.length === 0) return;

    let maxBtn = null;
    let maxSize = 0;
    for (const btn of sizeButtons) {
      const m = btn.getAttribute('data-wuic-attrs').match(/pageSize:(\d+)/);
      if (m) {
        const size = parseInt(m[1]);
        if (size > maxSize) { maxSize = size; maxBtn = btn; }
      }
    }

    if (maxBtn) {
      const currentActive = maxBtn.classList.contains('active') ||
                            maxBtn.getAttribute('data-wuic-attrs')?.includes('active');
      if (!currentActive) {
        const a = maxBtn.querySelector('a') || maxBtn;
        a.click();
        console.log('[KIDITEM] 페이지 크기 변경:', maxSize, '개');
        // 데이터 리로드 대기
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // 전체 페이지 순회하며 상품 수집
  async function parseAllProductsWithPagination() {
    await setMaxPageSize();
    const allProducts = parseProductGrid();
    const totalPages = getTotalPages();
    console.log("[KIDITEM] 총 페이지:", totalPages, "/ 1페이지 상품:", allProducts.length);

    for (let page = 2; page <= totalPages; page++) {
      const clicked = clickPage(page);
      if (!clicked) {
        console.log("[KIDITEM] 페이지", page, "이동 실패 — 중단");
        break;
      }
      await waitForPage(page, 12000);
      const pageProducts = parseProductGrid();
      console.log("[KIDITEM] 페이지", page, "상품:", pageProducts.length);
      for (const p of pageProducts) allProducts.push(p);
    }

    console.log("[KIDITEM] 전체 상품 수집 완료:", allProducts.length);
    return allProducts;
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
        // vendorItemId 가 자연 key — 서버 handleTraffic 가 이게 없으면 skip 함.
        // parseProductGrid 에서 vendorItemId 추출 못한 경우 optionId 또는 inventoryId 폴백.
        vendorItemId: p.vendorItemId || p.optionId || p.inventoryId,
        productId: p.inventoryId || p.vendorItemId,
        productName: p.productName,
        visitors: p.visitors,
        views: p.views,
        cartAdds: p.cartAdds,
        orders: p.orders,
        salesQty: p.salesQty,
        revenue: p.revenue,
        conversionRate: p.conversionRate,
        adStatus: p.adStatus || null,
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

  // showBadge is loaded from utils/dom.js via manifest

  // ===== 메인 동기화 =====
  // paginate: true면 전체 페이지 순회, false면 현재 페이지만 (sales-analysis)
  async function doSync({ paginate = false } = {}) {
    const pageType = detectPageType();
    console.log("[KIDITEM] 페이지 타입:", pageType, "URL:", location.href, "paginate:", paginate);

    if (pageType === "sales-analysis") {
      // KPI + 광고 요약은 1페이지에서 한 번만 파싱
      const kpis = parseKpiCards();
      const adSummary = parseAdSummary();
      console.log("[KIDITEM] 광고 요약:", JSON.stringify(adSummary));

      // 팝업에서 수동 트리거 시만 전체 페이지 순회, 자동은 현재 페이지만
      const products = paginate
        ? await parseAllProductsWithPagination()
        : parseProductGrid();

      console.log("[KIDITEM] 파싱 결과:", products.length, "상품, KPI:", Object.keys(kpis).length);

      const hasSummarySignal = Object.keys(kpis).length > 0 || adSummary !== null;

      if (products.length > 0 || hasSummarySignal) {
        const { startDate, endDate } = getDateRangeFromUrl();
        const periodInfo = startDate && endDate ? `${startDate} ~ ${endDate}` : "";
        showBadge(`📊 매출분석 ${products.length}개 상품 + 요약 감지 — 동기화 중... ${periodInfo}`, "#60a5fa");

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

  // URL 해시에 #kiditemBatch=1 이 있으면 batch 모드 — paginate:true + 완료 후 탭 자가 종료.
  // ReadinessModal "지금 받기" 가 누락 일자별 URL 에 이 마커 부여.
  const isBatchMode = /#kiditemBatch=1/.test(window.location.hash || "");

  async function syncSalesAnalysisWithRetry(options) {
    const syncOptions = options || { paginate: true };
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await doSync(syncOptions);
      if (result?.success) break;
      if (detectPageType() !== "sales-analysis") break;
      console.log(`[KIDITEM] 매출분석 재시도 ${attempt}/3 (3초 후)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    return result;
  }

  async function batchSyncWithRetry() {
    const result = await syncSalesAnalysisWithRetry({ paginate: true });
    try {
      chrome.runtime.sendMessage({
        action: "reportBatchScrapeDone",
        success: !!result?.success,
        url: window.location.href,
      });
    } catch {}
  }

  setTimeout(() => {
    if (isBatchMode) {
      batchSyncWithRetry();
    } else {
      waitAndSync(1);
    }
  }, 4000);

  // 수동 동기화 — 서버 응답까지 대기 후 결과 반환 (sales-analysis는 전체 페이지 순회)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      syncSalesAnalysisWithRetry({ paginate: true }).then((result) => sendResponse(result));
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
