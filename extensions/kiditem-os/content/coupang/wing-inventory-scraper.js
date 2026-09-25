// KIDITEM OS — Wing 상품목록 크롤러
// /tenants/seller-web/vendor-inventory/list 페이지에서 전체 상품 스크래핑 → 엑셀 다운로드
// 팝업 버튼(scrapeInventoryList)으로만 실행

(function () {
  "use strict";

  if (!location.href.includes("vendor-inventory/list")) return;

  console.log("[KIDITEM] wing-inventory-scraper.js loaded");

  // ── 유틸: 요소 대기 ──
  function waitForSelector(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error("timeout: " + selector)); }, timeout);
    });
  }

  // ── 유틸: 잠시 대기 ──
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── 상세 파싱: 각 열의 의미를 헤더에서 추출 ──
  function parseWithHeaders() {
    const products = [];

    // 헤더 추출
    const headers = [];
    const ths = document.querySelectorAll("table thead th, table thead td");
    for (const th of ths) {
      headers.push(th.innerText.trim().replace(/\n/g, " "));
    }
    console.log("[KIDITEM] 헤더:", headers);

    const rows = document.querySelectorAll("table tbody tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) continue;

      const product = {};
      for (let i = 0; i < cells.length && i < headers.length; i++) {
        const header = headers[i] || ("col_" + i);
        let value = cells[i].innerText.trim().replace(/\n+/g, " | ");

        // 이미지 URL
        const img = cells[i].querySelector("img");
        if (img && img.src) {
          product["이미지URL"] = img.src;
        }

        // 링크에서 상품ID 추출
        const link = cells[i].querySelector("a[href]");
        if (link) {
          const href = link.href;
          const idMatch = href.match(/productId=(\d+)/) || href.match(/\/products\/(\d+)/);
          if (idMatch) product["등록상품ID"] = idMatch[1];
        }

        product[header] = value;
      }
      products.push(product);
    }
    return products;
  }

  // ── 총 페이지 수 추출 ──
  function getTotalPages() {
    const bodyText = document.body?.innerText || "";
    const totalMatch =
      bodyText.match(/(?:전체|총)\s*([\d,]+)\s*(?:건|개)/) ||
      bodyText.match(/([\d,]+)\s*(?:건|개)\s*(?:의|중)/);
    if (totalMatch) {
      const totalCount = Number(totalMatch[1].replace(/,/g, ""));
      const perPage = Number(new URL(location.href).searchParams.get("countPerPage")) || 50;
      if (Number.isInteger(totalCount) && totalCount > 0) {
        return Math.ceil(totalCount / perPage);
      }
    }

    // 페이지네이션 영역에서 마지막 페이지 번호
    const pageLinks = document.querySelectorAll('[class*="pagination"] a, [class*="paging"] a, [class*="page-num"], .pagination a, .paging a, [class*="page"] button, [class*="page"] a');
    let max = 1;
    for (const el of pageLinks) {
      const num = parseInt(el.textContent.trim());
      if (!isNaN(num) && num > max) max = num;
    }

    // "전체 N건" 텍스트에서 추출
    const totalText = document.body.innerText.match(/전체\s*[\d,]+\s*건/);
    if (totalText) {
      const totalCount = parseInt(totalText[0].replace(/[^\d]/g, ""));
      // 페이지당 건수 — URL 파라미터 또는 기본값 50
      const urlParams = new URLSearchParams(location.search);
      const perPage = parseInt(urlParams.get("countPerPage")) || 50;
      const pages = Math.ceil(totalCount / perPage);
      if (pages > max) max = pages;
    }

    // "N / M" 형태 페이지 표시에서 M 추출
    const pageText = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)\s*페이지/);
    if (pageText) {
      const totalPages = parseInt(pageText[2]);
      if (totalPages > max) max = totalPages;
    }

    return max;
  }

  // ── 페이지 이동 ──
  async function goToPage(pageNum) {
    // 페이지네이션 버튼 클릭 시도
    const pageLinks = document.querySelectorAll('[class*="pagination"] a, [class*="paging"] a, .pagination a, .paging a, [class*="page"] button, [class*="page"] a');
    for (const link of pageLinks) {
      if (link.textContent.trim() === String(pageNum)) {
        link.click();
        await sleep(3000); // 렌더링 대기
        return true;
      }
    }

    // 버튼 못 찾으면 URL 직접 이동
    const url = new URL(location.href);
    url.searchParams.set("page", String(pageNum));
    location.href = url.toString();
    await sleep(4000);
    return true;
  }

  // ── 서버 변환 결과 다운로드 ──
  function requestServerWorkbook(products) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "exportWingInventoryWorkbook", products },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.success || typeof response.fileBase64 !== "string") {
            reject(new Error(response?.error || "Wing 상품목록 엑셀 변환 실패"));
            return;
          }
          resolve(response);
        },
      );
    });
  }

  function downloadServerWorkbook(file) {
    const binary = atob(file.fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: file.contentType || "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName || "wing-inventory.xls";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    console.log(`[KIDITEM] 서버 엑셀 다운로드 완료: ${file.total || 0}개 상품`);
  }

  // ── 메인: 전체 페이지 크롤링 ──
  async function scrapeAllPages() {
    console.log("[KIDITEM] 상품목록 크롤링 시작...");

    // 테이블 로딩 대기
    try {
      await waitForSelector("table tbody tr", 20000);
    } catch (e) {
      return { success: false, error: "테이블 로딩 실패" };
    }
    await sleep(1500);

    const totalPages = getTotalPages();
    console.log("[KIDITEM] 총 페이지:", totalPages);

    const allProducts = [];

    // 1페이지 파싱
    const page1 = parseWithHeaders();
    console.log("[KIDITEM] 1페이지:", page1.length, "개");
    allProducts.push(...page1);

    // 2페이지부터 순회
    for (let p = 2; p <= totalPages; p++) {
      console.log("[KIDITEM] 페이지", p, "/", totalPages, "이동 중...");
      await goToPage(p);

      try {
        await waitForSelector("table tbody tr", 15000);
      } catch (e) {
        console.log("[KIDITEM] 페이지", p, "로딩 실패 — 중단");
        break;
      }
      await sleep(1500);

      const pageProducts = parseWithHeaders();
      console.log("[KIDITEM] 페이지", p, ":", pageProducts.length, "개");
      allProducts.push(...pageProducts);
    }

    console.log("[KIDITEM] 총 수집:", allProducts.length, "개");

    if (!allProducts.length) {
      alert("[KIDITEM] 다운로드할 데이터가 없습니다.");
      return { success: true, total: 0 };
    }

    try {
      // Raw rows stay in the content script; only authenticated server output
      // crosses back as a file. The browser never builds the workbook.
      const file = await requestServerWorkbook(allProducts);
      downloadServerWorkbook(file);
      return { success: true, total: allProducts.length };
    } catch (error) {
      return { success: false, error: error?.message || "Wing 상품목록 엑셀 변환 실패" };
    }
  }

  // ── 메시지 리스너: 팝업에서 트리거 ──
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.action === "scrapeInventoryList") {
      scrapeAllPages().then(sendResponse);
      return true; // async
    }
  });
})();
