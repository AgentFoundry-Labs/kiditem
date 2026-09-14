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

  function observedWingVendorId(expectedVendorId) {
    const identity = globalThis.KidItemWingAccountIdentity;
    if (!identity || typeof identity.verifyExpectedVendorId !== "function") {
      return { ok: false, error: "Wing 계정 식별 기능을 사용할 수 없습니다." };
    }
    return identity.verifyExpectedVendorId(expectedVendorId);
  }

  function sendOwnerStep(action, attemptId, step, body) {
    return new Promise((resolve) => {
      const message = { action, attemptId, step };
      if (body !== undefined) message.body = body;
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "no response" });
      });
    });
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

  // Vue SPA lazy load 대비 — grid 가 데이터로 채워질 때까지 polling.
  // 페이지 진입 직후 / pageSize 변경 후 / page 이동 후 호출.
  async function waitForGridData(maxMs, minProducts) {
    if (typeof maxMs !== "number") maxMs = 15000;
    if (typeof minProducts !== "number") minProducts = 1;
    const minChildren = HEADER_COUNT + minProducts * COLS_PER_PRODUCT;
    const start = Date.now();
    let lastCount = -1;
    let stableTicks = 0;
    while (Date.now() - start < maxMs) {
      const container = document.querySelector('[class*="container_1pewv"]');
      if (container) {
        const childCount = container.children.length;
        if (childCount >= minChildren) {
          // child count 가 2 tick (= 1초) 동안 변동 없으면 안정 → 진행
          if (childCount === lastCount) {
            stableTicks += 1;
            if (stableTicks >= 2) return true;
          } else {
            lastCount = childCount;
            stableTicks = 0;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(
      "[KIDITEM] waitForGridData 타임아웃 — 진행은 함, last childCount:",
      lastCount,
    );
    return false;
  }

  function terminalPageObserved() {
    const next = document.querySelector('[data-wuic-partial="next"]');
    if (!next) return true;
    const control = next.querySelector("a") || next;
    return control.hasAttribute?.("disabled") ||
      control.getAttribute?.("aria-disabled") === "true" ||
      control.classList?.contains("disabled") ||
      next.classList?.contains("disabled");
  }

  // 전체 페이지 순회하며 상품 수집
  async function parseAllProductsWithPagination({ includeProof = false } = {}) {
    // (1) 페이지 진입 직후 row table 이 lazy load 중일 수 있음 → wait.
    //     row 안 채워진 상태에서 parseProductGrid 호출하면 0건 또는 부분만 잡힘.
    const initialGridReady = await waitForGridData(15000, 1);

    await setMaxPageSize();

    // (2) setMaxPageSize 가 pageSize 버튼 click → 데이터 다시 fetch + render.
    //     setMaxPageSize 내부 setTimeout 2000ms 만으로는 부족한 경우 많음.
    //     row 안정 wait 까지 한 번 더.
    const refreshedGridReady = await waitForGridData(15000, 1);

    const allProducts = parseProductGrid();
    const totalPages = getTotalPages();
    const pages = [{ pageIndex: 1, data: allProducts.slice(), url: location.href }];
    let complete = initialGridReady && refreshedGridReady;
    console.log("[KIDITEM] 총 페이지:", totalPages, "/ 1페이지 상품:", allProducts.length);

    for (let page = 2; page <= totalPages; page++) {
      const clicked = clickPage(page);
      if (!clicked) {
        console.log("[KIDITEM] 페이지", page, "이동 실패 — 중단");
        break;
      }
      await waitForPage(page, 12000);
      // (3) page click 후에도 row 안정 wait — waitForPage 가 페이지 indicator 만 체크해서
      //     row table 자체가 채워지기 전에 return 할 수 있음.
      await waitForGridData(10000, 1);
      const pageProducts = parseProductGrid();
      console.log("[KIDITEM] 페이지", page, "상품:", pageProducts.length);
      pages.push({ pageIndex: page, data: pageProducts.slice(), url: location.href });
      for (const p of pageProducts) allProducts.push(p);
      complete = true;
    }

    const terminal = pages.length === totalPages && terminalPageObserved();
    complete = complete && terminal;

    console.log("[KIDITEM] 전체 상품 수집 완료:", allProducts.length);
    if (!includeProof) return allProducts;
    return {
      products: allProducts,
      pages,
      expectedPages: totalPages,
      terminalPageObserved: terminal,
      complete,
      gridReady: initialGridReady && refreshedGridReady,
    };
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

  function trafficSummary(kpis) {
    return {
      visitors: kpis.visitor?.numValue || 0,
      views: kpis.pageView?.numValue || 0,
      cartAdds: kpis.addToCart?.numValue || 0,
      orders: kpis.order?.numValue || 0,
      conversionRate: kpis.conversion?.numValue || 0,
      salesQty: kpis.unitSold?.numValue || 0,
      revenue: kpis.sales?.numValue || 0,
    };
  }

  function dailyOptionEvidence(row) {
    if (!row || typeof row !== "object") return row;
    return {
      ...row,
      // Listing matching is server-owned. Keep the provider option identity
      // and explicit null listing scope as source evidence; never guess a
      // listing from the Wing inventory id in the browser.
      listingId: row.listingId ?? null,
      listingOptionId: row.listingOptionId ?? null,
      externalOptionId: row.externalOptionId ?? row.vendorItemId ?? null,
    };
  }

  async function syncTrafficDailyToSourceOwner(control, capture) {
    if (!capture?.gridReady || !Array.isArray(capture.dailyPages) ||
      !Array.isArray(capture.expectedDates) || !Array.isArray(capture.confirmedDates) ||
      (!capture.periodSummary && capture.periodSummaryAccepted !== true)) {
      return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 일별 범위를 확인하지 못했습니다." };
    }
    const identity = observedWingVendorId(control.plan.expectedAdvertiserId);
    if (!identity.ok) return { success: false, errorCode: "VENDOR_IDENTITY_UNAVAILABLE", error: identity.error };
    if (control.plan.providerVendorId !== identity.vendorId) {
      return { success: false, errorCode: "ADVERTISER_IDENTITY_MISMATCH", error: "Wing owner 계정 식별자가 계획과 다릅니다." };
    }
    const range = getDateRangeFromUrl();
    if (range.startDate !== control.plan.startDate || range.endDate !== control.plan.endDate) {
      return { success: false, errorCode: "TRAFFIC_DATE_RANGE_MISMATCH", error: "Wing 트래픽 URL 날짜가 owner 계획과 다릅니다." };
    }
    if (control.plan.filterScope !== "ALL_NORMAL_RFM" ||
      capture.expectedDates.length !== control.plan.expectedDates?.length ||
      capture.expectedDates.some((date, index) => date !== control.plan.expectedDates[index])) {
      return { success: false, errorCode: "TRAFFIC_DATE_RANGE_MISMATCH", error: "Wing 트래픽 owner 날짜 목록이 일치하지 않습니다." };
    }
    const dailyDates = new Set();
    for (const day of capture.dailyPages) {
      if (!day || typeof day.businessDate !== "string" || dailyDates.has(day.businessDate) ||
        !capture.expectedDates.includes(day.businessDate) || !Array.isArray(day.pages) ||
        !Number.isSafeInteger(day.expectedPages) || day.expectedPages < 1) {
        return { success: false, errorCode: "TRAFFIC_DATE_RANGE_MISMATCH", error: "Wing 트래픽 일별 receipt 날짜가 owner 계획과 일치하지 않습니다." };
      }
      dailyDates.add(day.businessDate);
    }
    // How many days this hand-off must carry is the window the capture
    // confirmed, not the window that was requested. They differ whenever the
    // provider has not published a later day yet — the ordinary case, since
    // Wing's traffic runs a day behind its sales. Counting against the request
    // would discard every measured day in the window for the sake of one the
    // provider never claimed. The plan's date vector stays un-narrowed above,
    // because receipt sequences are numbered off it.
    if (capture.confirmedDates.length !== dailyDates.size ||
      capture.confirmedDates.some((date) => !dailyDates.has(date))) {
      return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 일별 날짜가 일부 누락되었습니다." };
    }
    // A resumed capture gets a fresh observation timestamp. Accepted receipts
    // are never re-sent, so an old timestamp cannot be fabricated onto newly
    // observed provider pages.
    const priorCapturedAt = Array.isArray(control.receipts)
      ? control.receipts.map((receipt) => receipt?.capturedAt).filter((value) => typeof value === "string").sort().at(-1)
      : null;
    let capturedAt = new Date().toISOString();
    // Date.now() can share a millisecond with a same-turn retry. Keep the
    // observation fresh without ever reusing the accepted receipt timestamp.
    if (priorCapturedAt && Date.parse(capturedAt) <= Date.parse(priorCapturedAt)) {
      capturedAt = new Date(Date.parse(priorCapturedAt) + 1).toISOString();
    }
    let lastReceipt = null;
    let count = 0;
    for (const day of capture.dailyPages) {
      if (!day || !capture.expectedDates.includes(day.businessDate) || !Array.isArray(day.pages)) {
        return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 일별 페이지 증거가 유효하지 않습니다." };
      }
      for (const page of day.pages) {
        const finalPage = page.pageIndex === day.expectedPages;
        if (finalPage && !day.complete) break;
        const isFirstPage = page.pageIndex === 1;
        const body = {
          key: `${control.attemptId}:daily:${day.businessDate}:page:${page.pageIndex}`,
          capturedAt,
          kind: "daily_page",
          providerVendorId: identity.vendorId,
          filterScope: "ALL_NORMAL_RFM",
          url: page.url || location.href,
          businessDate: day.businessDate,
          startDate: day.businessDate,
          endDate: day.businessDate,
          period: 1,
          pageIndex: page.pageIndex,
          proof: {
            expectedPages: day.expectedPages,
            visitedPages: Array.from({ length: page.pageIndex }, (_, index) => index + 1),
            terminalPageObserved: finalPage && day.terminalPageObserved === true,
            verified: true,
            complete: finalPage && day.complete === true,
            ...(page.explicitEmpty === true ? { explicitEmpty: true } : {}),
          },
          data: (page.data || []).map(dailyOptionEvidence),
          ...(isFirstPage && day.accountSummary ? {
            accountSummary: day.accountSummary,
            accountSummaryRaw: day.accountSummaryRaw,
          } : {}),
        };
        const response = await sendOwnerStep("wingTrafficSourceStepV2", control.attemptId, "receipt", body);
        if (!response?.success) return response || { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing 트래픽 일별 receipt 전송 실패" };
        lastReceipt = response.trafficReceipt || lastReceipt;
        count += body.data.length;
      }
      if (!day.complete || !day.terminalPageObserved ||
        day.pages.length + Number(day.acceptedPageCount || 0) !== day.expectedPages) {
        return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 일별 페이지네이션이 완료되지 않았습니다.", trafficReceipt: lastReceipt };
      }
    }
    const period = capture.periodSummary;
    if (period) {
      // The summary carries the window the capture confirmed, and the owner
      // reads it as this run's coverage. Re-stating the plan's window here
      // would claim coverage for a day the provider never published — the
      // mirror of refusing the whole window for that same day.
      const periodBody = {
        key: `${control.attemptId}:period-summary:${period.startDate}:${period.endDate}`,
        capturedAt,
        kind: "period_summary",
        providerVendorId: identity.vendorId,
        filterScope: "ALL_NORMAL_RFM",
        url: period.url || location.href,
        startDate: period.startDate,
        endDate: period.endDate,
        period: period.period,
        accountSummary: period.accountSummary,
        accountSummaryRaw: period.accountSummaryRaw,
      };
      const periodResponse = await sendOwnerStep("wingTrafficSourceStepV2", control.attemptId, "receipt", periodBody);
      if (!periodResponse?.success) return periodResponse || { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing 트래픽 기간 summary 전송 실패" };
      lastReceipt = periodResponse.trafficReceipt || lastReceipt;
    }
    return { success: true, type: "traffic", count, trafficReceipt: lastReceipt };
  }

  async function syncTrafficToSourceOwner(control, pagination, kpis, adSummary, summaryOverride) {
    if (control?.plan?.parserVersion === "wing-traffic-daily-v2") {
      return syncTrafficDailyToSourceOwner(control, pagination);
    }
    if (!control?.attemptId || !control.plan || !pagination?.gridReady) {
      return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 그리드를 확인하지 못했습니다." };
    }
    const identity = observedWingVendorId(control.plan.expectedAdvertiserId);
    if (!identity.ok) {
      return { success: false, errorCode: "VENDOR_IDENTITY_UNAVAILABLE", error: identity.error };
    }
    const range = getDateRangeFromUrl();
    if (range.startDate !== control.plan.startDate || range.endDate !== control.plan.endDate) {
      return { success: false, errorCode: "TRAFFIC_DATE_RANGE_MISMATCH", error: "Wing 트래픽 URL 날짜가 owner 계획과 다릅니다." };
    }
    const period = Math.round((new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / 86400000) + 1;
    if (period !== control.plan.periodDays) {
      return { success: false, errorCode: "TRAFFIC_PERIOD_MISMATCH", error: "Wing 트래픽 기간이 owner 계획과 다릅니다." };
    }
    // A resumed owner attempt may already have accepted earlier pages.  Reuse
    // the first accepted receipt's timestamp when available so the repeated
    // dashboard payload remains one stable observation across the attempt.
    const priorReceipt = Array.isArray(control.receipts) ? control.receipts[0] : null;
    const capturedAt = priorReceipt?.capturedAt || new Date().toISOString();
    const summary = summaryOverride && typeof summaryOverride === "object"
      ? summaryOverride
      : trafficSummary(kpis);
    let lastReceipt = null;
    for (const page of pagination.pages || []) {
      const finalPage = page.pageIndex === pagination.expectedPages;
      if (finalPage && !pagination.complete) break;
      const body = {
        key: `${control.attemptId}:page:${page.pageIndex}`,
        capturedAt,
        url: page.url || location.href,
        startDate: range.startDate,
        endDate: range.endDate,
        period,
        pageIndex: page.pageIndex,
        proof: {
          expectedPages: pagination.expectedPages,
          visitedPages: Array.from({ length: page.pageIndex }, (_, index) => index + 1),
          terminalPageObserved: finalPage && pagination.terminalPageObserved === true,
          verified: true,
          complete: finalPage && pagination.complete === true,
          ...(page.data.length === 0 && pagination.expectedPages === 1 ? { explicitEmpty: true } : {}),
        },
        data: page.data,
        kpis,
        summary,
        adSummary,
      };
      const response = await sendOwnerStep("wingTrafficSourceStep", control.attemptId, "receipt", body);
      if (!response?.success) return response || { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing 트래픽 receipt 전송 실패" };
      lastReceipt = response.trafficReceipt || lastReceipt;
    }
    if (!pagination.complete || !pagination.terminalPageObserved || (pagination.pages || []).length !== pagination.expectedPages) {
      return { success: false, errorCode: "INCOMPLETE_TRAFFIC_COVERAGE", error: "Wing 트래픽 페이지네이션이 완료되지 않았습니다.", trafficReceipt: lastReceipt };
    }
    return { success: true, type: "traffic", count: pagination.products.length, trafficReceipt: lastReceipt };
  }

  async function syncItemWinnerToSourceOwner(control, tableData, cards, observedIdentity) {
    if (!control?.attemptId || !control.plan) {
      return { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing 아이템위너 owner 허가가 없습니다." };
    }
    const identity = observedIdentity || observedWingVendorId(control.plan.expectedVendorId);
    if (!identity.ok) return { success: false, errorCode: "VENDOR_IDENTITY_UNAVAILABLE", error: identity.error };
    if (tableData.length === 0 && Object.keys(cards).length === 0) {
      return { success: false, errorCode: "WING_ITEMWINNER_DATA_EMPTY", error: "Wing 아이템위너 현재 페이지에 데이터가 없습니다." };
    }
    const observedAt = new Date().toISOString();
    const body = {
      providerVendorId: identity.vendorId,
      observedAt,
      data: tableData,
      kpis: cards,
      url: window.location.href,
      title: document.title,
      timestamp: observedAt,
    };
    const response = await sendOwnerStep("wingItemwinnerSourceStep", control.attemptId, "capture", body);
    if (!response?.success) return response || { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing 아이템위너 capture 전송 실패" };
    return { success: true, type: "wing", count: tableData.length, itemwinnerReceipt: response.itemwinnerReceipt || { complete: true } };
  }

  // showBadge is loaded from utils/dom.js via manifest

  // ===== 메인 동기화 =====
  // paginate: true면 전체 페이지 순회, false면 현재 페이지만 (sales-analysis)
  async function doSync({ paginate = false, ownerControl = null } = {}) {
    const pageType = detectPageType();
    console.log("[KIDITEM] 페이지 타입:", pageType, "URL:", location.href, "paginate:", paginate);

    if (pageType === "sales-analysis") {
      let kpis;
      let adSummary;
      let summaryOverride = null;
      let pagination;
      let products;
      if (ownerControl) {
        const reader = globalThis.KidItemWingReadApi;
        if (!reader || typeof reader.collectTraffic !== "function") {
          const error = "Wing 트래픽 API 모듈을 사용할 수 없습니다.";
          showBadge(`❌ ${error}`, "#ef4444");
          return { success: false, errorCode: "WING_READ_API_UNAVAILABLE", error };
        }
        const capture = await reader.collectTraffic({ control: ownerControl });
        if (!capture?.success) {
          showBadge(`❌ ${capture?.error || "Wing 트래픽 API 수집 실패"}`, "#ef4444");
          return {
            success: false,
            errorCode: capture?.errorCode || "WING_TRAFFIC_COLLECTION_FAILED",
            error: capture?.error || "Wing 트래픽 API 수집 실패",
            ...(capture?.attentionRequired ? { attentionRequired: true } : {}),
          };
        }
        // JSON endpoints do not expose the legacy adSummary shape. Keep the
        // optional DOM parser for that one field while all traffic rows/KPIs
        // come from the verified API response.
        kpis = capture.kpis || {};
        summaryOverride = capture.summary || null;
        adSummary = parseAdSummary();
        pagination = capture;
        products = capture.products || [];
      } else {
        // Automatic/no-owner mode intentionally retains the old DOM-only
        // signal path and never calls the provider API.
        kpis = parseKpiCards();
        adSummary = parseAdSummary();
        products = paginate
          ? await parseAllProductsWithPagination()
          : parseProductGrid();
      }
      console.log("[KIDITEM] 광고 요약:", JSON.stringify(adSummary));

      console.log("[KIDITEM] 파싱 결과:", products.length, "상품, KPI:", Object.keys(kpis).length);

      const hasSummarySignal = Object.keys(kpis).length > 0 || adSummary !== null;

      if (ownerControl) {
        const result = await syncTrafficToSourceOwner(ownerControl, pagination, kpis, adSummary, summaryOverride);
        if (result?.success) {
          showBadge(`✅ 매출분석 ${products.length}개 owner 수집 완료`, "#22c55e");
          return { success: true, type: "traffic", count: products.length, trafficReceipt: result.trafficReceipt };
        }
        showBadge(`❌ ${result?.error || "Wing 트래픽 수집 실패"}`, "#ef4444");
        return { success: false, errorCode: result?.errorCode, error: result?.error || "Wing 트래픽 수집 실패", trafficReceipt: result?.trafficReceipt };
      }

      if (products.length > 0 || hasSummarySignal) {
        showBadge("❌ Wing 트래픽 source owner 허가가 없습니다.", "#ef4444");
        return {
          success: false,
          errorCode: "SOURCE_OWNER_REQUIRED",
          error: "Wing 트래픽 수집은 source owner에서 시작해야 합니다.",
        };
      }

      console.log("[KIDITEM] 그리드 데이터 없음 — 렌더링 대기 중");
      return { success: false, error: "그리드 데이터 없음" };
    }

    if (pageType !== "itemwinner") {
      // Wing 홈의 일반 대시보드 카드를 아이템위너 KPI로 저장하면 실제 순위
      // 수집이 0건이어도 성공으로 보이는 false positive가 된다.
      return {
        success: false,
        error: "아이템위너 페이지가 아닙니다. Wing 판매순위 수집을 사용해 주세요.",
      };
    }

    if (ownerControl) {
      const reader = globalThis.KidItemWingReadApi;
      if (!reader || typeof reader.collectItemwinner !== "function") {
        const error = "Wing 아이템위너 API 모듈을 사용할 수 없습니다.";
        showBadge(`❌ ${error}`, "#ef4444");
        return { success: false, errorCode: "WING_READ_API_UNAVAILABLE", error };
      }
      // Identity is a page-local guard. Re-check it after the provider read so
      // a tab/account switch cannot publish the response under the old account.
      const identityBefore = observedWingVendorId(ownerControl.plan.expectedVendorId);
      if (!identityBefore.ok) {
        showBadge(`❌ ${identityBefore.error}`, "#ef4444");
        return { success: false, errorCode: "VENDOR_IDENTITY_UNAVAILABLE", error: identityBefore.error };
      }
      const capture = await reader.collectItemwinner({ control: ownerControl });
      if (!capture?.success) {
        showBadge(`❌ ${capture?.error || "Wing 아이템위너 API 수집 실패"}`, "#ef4444");
        return {
          success: false,
          errorCode: capture?.errorCode || "WING_ITEMWINNER_COLLECTION_FAILED",
          error: capture?.error || "Wing 아이템위너 API 수집 실패",
          ...(capture?.attentionRequired ? { attentionRequired: true } : {}),
        };
      }
      const identityAfter = observedWingVendorId(ownerControl.plan.expectedVendorId);
      if (!identityAfter.ok || identityAfter.vendorId !== identityBefore.vendorId) {
        const error = identityAfter.error || "Wing 계정 식별자가 수집 중 변경되었습니다.";
        showBadge(`❌ ${error}`, "#ef4444");
        return { success: false, errorCode: "VENDOR_IDENTITY_CHANGED", error };
      }
      const result = await syncItemWinnerToSourceOwner(
        ownerControl,
        capture.products || [],
        capture.kpis || {},
        identityAfter,
      );
      if (result?.success) {
        showBadge(`✅ Wing 아이템위너 owner 수집 완료`, "#22c55e");
        return { success: true, type: "wing", count: result.count, itemwinnerReceipt: result.itemwinnerReceipt };
      }
      showBadge(`❌ ${result?.error || "Wing 아이템위너 수집 실패"}`, "#ef4444");
      return { success: false, errorCode: result?.errorCode, error: result?.error || "Wing 아이템위너 수집 실패" };
    }

    // Automatic/no-owner mode intentionally retains the legacy DOM-only signal
    // path. It cannot publish anything without the source-owner permit above.
    const tableData = parseWingTable();
    const cards = parseDashboardCards();
    const total = tableData.length + Object.keys(cards).length;

    if (total > 0) {
      showBadge("❌ Wing 아이템위너 source owner 허가가 없습니다.", "#ef4444");
      return {
        success: false,
        errorCode: "SOURCE_OWNER_REQUIRED",
        error: "Wing 아이템위너 수집은 source owner에서 시작해야 합니다.",
      };
    }
    return { success: false, error: "데이터 없음" };
  }

  // 수동 동기화 — 서버 응답까지 대기 후 결과 반환 (sales-analysis는 전체 페이지 순회)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const ownerControl = msg.syncMode === "wing_traffic"
        ? msg.wingTrafficControl
        : msg.syncMode === "wing_itemwinner"
          ? msg.wingItemwinnerControl
          : null;
      doSync({ paginate: true, ownerControl })
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, errorCode: "WING_COLLECTION_FAILED", error: error?.message || String(error) }));
      return true;
    }
  });

})();
