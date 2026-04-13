// KIDITEM OS — Wing 상품 수정 자동화
// vendor-inventory/list 페이지에서 상품 검색 후 수정 버튼 클릭

(function () {
  "use strict";

  // ── 현재 페이지가 vendor-inventory/list인지 확인 ──
  if (!location.href.includes("vendor-inventory/list")) return;

  // ── 유틸: 요소가 나타날 때까지 대기 (MutationObserver) ──
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForElement timeout: ${selector}`));
      }, timeout);
    });
  }

  // ── 유틸: 텍스트를 포함하는 요소 대기 ──
  function waitForText(selector, text, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          if (el.textContent.includes(text)) return resolve(el);
        }
        return null;
      };

      const found = check();
      if (found) return;

      const observer = new MutationObserver(() => {
        const el = check();
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForText timeout: "${text}" in ${selector}`));
      }, timeout);
    });
  }

  // ── 유틸: React 호환 입력값 설정 ──
  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── 유틸: 상품명 정규화 (공백/특수문자 통일 후 비교) ──
  function normalize(str) {
    return (str || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // ── 메인: 상품 검색 + 수정 버튼 클릭 ──
  async function searchAndClickEdit(productName) {
    console.log(`[KIDITEM] 상품 검색 시작: "${productName}"`);
    const norm = normalize(productName);

    try {
      // 1. 검색창 대기 및 입력
      const searchInput = await waitForElement(
        'input[placeholder*="상품"], input[placeholder*="검색"], input[type="search"], input[class*="search"]'
      );
      searchInput.focus();
      setInputValue(searchInput, productName);

      // Enter 로 검색 실행
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent("keyup",  { key: "Enter", keyCode: 13, bubbles: true }));

      // 검색 버튼이 있으면 클릭 (Enter 미작동 대비)
      const searchBtn = document.querySelector(
        'button[type="submit"], button[class*="search"], [class*="btn-search"]'
      );
      if (searchBtn) searchBtn.click();

      console.log(`[KIDITEM] 검색어 입력 완료, 결과 대기 중...`);

      // 2. 로딩 대기 (결과 테이블 행 출현)
      await waitForElement('table tbody tr, [class*="product-row"], [class*="item-row"]');
      await new Promise((r) => setTimeout(r, 500)); // 렌더링 안정화

      // 3. 상품 행 순회 — 이름 일치 행 탐색
      const rows = document.querySelectorAll(
        'table tbody tr, [class*="product-row"], [class*="item-row"]'
      );

      let targetRow = null;
      for (const row of rows) {
        // 상품명 셀만 비교 (td:first-child 또는 [class*="name"] 셀)
        const nameCell =
          row.querySelector('[class*="name"], [class*="title"], td:nth-child(2), td:first-child') || row;
        if (normalize(nameCell.textContent).includes(norm)) {
          targetRow = row;
          break;
        }
      }

      if (!targetRow) {
        console.warn(`[KIDITEM] 일치 상품 없음: "${productName}"`);
        return { success: false, error: `"${productName}" 상품을 찾을 수 없습니다` };
      }

      console.log(`[KIDITEM] 상품 행 발견, 수정 버튼 탐색 중...`);

      // 4. 수정 버튼 클릭
      const allBtns = targetRow.querySelectorAll("button, a");
      let editBtn = null;

      for (const btn of allBtns) {
        const txt = btn.textContent.trim();
        if (txt === "수정" || txt === "편집" || txt.toLowerCase() === "edit") {
          editBtn = btn;
          break;
        }
      }

      // 텍스트 불일치 시 포함 검색으로 폴백
      if (!editBtn) {
        for (const btn of allBtns) {
          if (btn.textContent.includes("수정") || btn.textContent.includes("편집")) {
            editBtn = btn;
            break;
          }
        }
      }

      if (!editBtn) {
        console.warn("[KIDITEM] 수정 버튼 없음");
        return { success: false, error: "수정 버튼을 찾을 수 없습니다" };
      }

      editBtn.click();
      console.log("[KIDITEM] 수정 버튼 클릭 완료");
      return { success: true };

    } catch (err) {
      console.error("[KIDITEM] 자동화 오류:", err.message);
      return { success: false, error: err.message };
    }
  }

  // ── 페이지 로드 시 저장된 작업 자동 실행 ──
  async function checkPendingTask() {
    const data = await chrome.storage.local.get("kiditem_pending_edit");
    const task = data.kiditem_pending_edit;
    if (!task || !task.productName) return;

    // 작업 소비 (재실행 방지)
    await chrome.storage.local.remove("kiditem_pending_edit");

    const result = await searchAndClickEdit(task.productName);
    console.log("[KIDITEM] 작업 결과:", result);
  }

  // ── 메시지 리스너 (background → content) ──
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "searchAndEdit") {
      searchAndClickEdit(msg.productName)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async
    }
  });

  // 페이지 로드 완료 후 pending 작업 확인
  if (document.readyState === "complete") {
    checkPendingTask();
  } else {
    window.addEventListener("load", checkPendingTask);
  }

  console.log("[KIDITEM] wing-product-edit.js loaded");
})();
