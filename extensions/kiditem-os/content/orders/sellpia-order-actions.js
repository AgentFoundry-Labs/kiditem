// 셀피아 주문 작업 페이지 처리기(MAIN world, KID-366 wave8b — 옛 worker.js `injectSellpiaOrderFile`과
// 옛 셀피아 후처리 모듈의 `driveStep` 이식). 사이트 `extensions/src/sites/sellpia`가 운영자 셀피아 탭에
// `page-call/runner.js`와 함께 주입하고 두 호출을 부른다. 셀피아 SlickGrid(`dataView`·`grid`)와 `$.prompt`가 페이지
// 전역이라 MAIN world다. 셀렉터·문구·대기 시간은 옛 코드 그대로다.
//   `sellpia.injectOrderFile` {shopName, fileName, fileBase64, targetOrderNumbers} — 주문서수집 화면에 판매처를 고르고 파일을
//     넣어 [주문접수]를 누른다(셀피아에 쓴다). 누르기 전 실패는 `not_submitted`, 누른 뒤 행 증가를 못 보면 `unknown`.
//   `sellpia.orderStep` {step, targetOrderNumbers} — verify·orderSnapshot(읽기), register·stockmatch·invoice(셀피아에 쓴다).
// 화면(그리드·jQuery·버튼)을 못 찾으면 `unreadable: true`, 로그인 화면이면 `loginRequired: true`로 답한다.
(function installSellpiaOrderActions() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  function loginPage() {
    return /login/i.test(String((window.location && window.location.pathname) || "")) || Boolean(document.querySelector('input[type="password"]'));
  }

  function normalizeTargets(value) {
    return Array.from(new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry == null ? "" : entry).trim())
        .filter(Boolean),
    ));
  }

  // 대상 주문번호가 셀피아 행의 주문번호 칸과 같거나, 판매처 접두어(`_:|/ -` 뒤)를 붙인 값인가(옛 규칙).
  function targetForRow(row, targets) {
    const text = (value) => String(value == null ? "" : value).trim();
    const values = [
      row && row.group_no,
      row && row.c_group_no,
      row && row.ord_no,
      row && row.order_no,
      row && row.shop_order_no,
      row && row.provider_order_no,
      row && row.seller_order_no,
      row && row.om_order_no,
    ].map(text).filter(Boolean);
    for (const target of targets) {
      for (const value of values) {
        if (value === target) return target;
        if (!value.endsWith(target)) continue;
        const prefix = value.slice(0, -target.length);
        if (/[_:|\/\s-]$/.test(prefix)) return target;
      }
    }
    return null;
  }

  calls["sellpia.injectOrderFile"] = async function injectSellpiaOrderFile(payload) {
    if (loginPage()) return { success: false, loginRequired: true, outcome: "not_submitted" };
    const shopName = payload.shopName;
    const fileName = payload.fileName;
    const fileBase64 = payload.fileBase64;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const targetOrderNumbers = normalizeTargets(payload.targetOrderNumbers);

    function pendingTargetOrderNumbers() {
      try {
        if (!window.dataView || typeof window.dataView.getItems !== "function") return [];
        return Array.from(new Set(
          window.dataView.getItems()
            .map((row) => targetForRow(row, targetOrderNumbers))
            .filter(Boolean),
        ));
      } catch {
        return [];
      }
    }

    function parsePendingRowCount(value) {
      const match = String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .match(/(?:^|\s)전체\s*([\d,]+)\s*개(?:\s|$)/);
      if (!match) return null;
      const count = Number(match[1].replace(/,/g, ""));
      return Number.isSafeInteger(count) && count >= 0 ? count : null;
    }

    function pendingRowCount() {
      // 셀피아의 SlickGrid dataView는 페이지 전역에 노출되는 버전도 있고 아닌 버전도 있다. 실제 주문접수 화면이 제공하는
      // #pager의 "전체 N 개"를 동일한 대기 주문 근거로 사용한다.
      try {
        if (window.dataView && typeof window.dataView.getLength === "function") {
          const count = Number(window.dataView.getLength());
          if (Number.isSafeInteger(count) && count >= 0) return count;
        }
      } catch {
        // 페이지 전역 접근 실패 시 아래의 DOM pager 근거로 계속 확인한다.
      }
      if (typeof document.querySelector !== "function") return null;
      const pagerStatus = document.querySelector("#pager .slick-pager-status");
      return parsePendingRowCount(pagerStatus && pagerStatus.textContent);
    }

    function visibleDialogText() {
      if (typeof document.querySelectorAll !== "function") return "";
      const nodes = document.querySelectorAll(
        ".jconfirm .jconfirm-content, .ui-dialog-content, .swal2-html-container, .swal2-title",
      );
      return Array.from(nodes)
        .filter((node) => {
          if (node.hidden) return false;
          if (typeof window.getComputedStyle !== "function") return true;
          const style = window.getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        })
        .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
    }

    async function waitForStablePendingRowCount() {
      let previousCount = pendingRowCount();
      let stableChecks = 0;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const currentCount = pendingRowCount();
        const activeRequests = Number((window.jQuery && window.jQuery.active) || 0);
        if (currentCount !== null && currentCount === previousCount && activeRequests === 0) {
          stableChecks += 1;
          if (stableChecks >= 2) return currentCount;
        } else {
          stableChecks = 0;
        }
        previousCount = currentCount;
        await delay(200);
      }
      return pendingRowCount();
    }

    async function waitForUploadEvidence(beforeCount, targetOrderNumbersBefore) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        // 셀피아는 일부 주문을 정상 접수하면서 이미 수집된 중복 주문 경고를 같은 결과 팝업에 함께 표시한다. 새 대기 행이
        // 실제로 늘었다면 그 증가분을 우선 성공 근거로 인정하고, 행 증가가 없을 때만 팝업을 전체 거절로 본다.
        const afterCount = pendingRowCount();
        if (afterCount !== null && afterCount > beforeCount) {
          const beforeTargets = new Set(targetOrderNumbersBefore);
          const acceptedTargetOrderNumbers = pendingTargetOrderNumbers()
            .filter((orderNumber) => !beforeTargets.has(orderNumber));
          return {
            kind: "accepted",
            acceptedRows: afterCount - beforeCount,
            pendingRows: afterCount,
            acceptedTargetOrderNumbers,
          };
        }
        const dialogText = visibleDialogText();
        if (dialogText && /실패|오류|잘못|불가|업로드할 수 없|접수할 수 없/.test(dialogText)) {
          return { kind: "rejected", message: dialogText.slice(0, 300) };
        }
        await delay(300);
      }
      return { kind: "unknown" };
    }

    function setSelectValue(element, value) {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function base64ToBytes(base64) {
      const binary = atob(base64);
      const length = binary.length;
      const result = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        result[i] = binary.charCodeAt(i);
      }
      return result;
    }

    // 0) 화면/판매처 옵션 로딩 대기 — 새 탭은 옵션이 AJAX 로 늦게 채워진다.
    // 몰 표기명 ≠ 셀피아 판매처 등록명인 경우 별칭으로 치환 후 검색.
    // 키=shopName 공백제거, 값=셀피아 판매처명의 고유 부분문자열. 대부분은 부분일치로 잡히지만(키즈노트→
    // (주)키즈노트(외부몰) 등) 이름이 완전히 다르면(쿠팡직배송→쿠팡-직배송, 토스→비바리퍼블리카) 명시 필요.
    const SELLPIA_SHOP_ALIASES = {
      "롯데ON": "롯데온",
      "쿠팡직배송쉽먼트": "쿠팡-직배송", // 셀피아 판매처 = "쿠팡-직배송" (쉽먼트/밀크런 파일 모두 동일 판매처)
      "쿠팡직배송밀크런": "쿠팡-직배송",
      "쿠팡직배송": "쿠팡-직배송",
      "토스": "비바리퍼블리카", // 셀피아 판매처 = "(주) 비바리퍼블리카"
    };
    let shopSelect = null;
    let matched = null;
    const aliasKey = (shopName || "").replace(/\s+/g, "");
    const target = (SELLPIA_SHOP_ALIASES[aliasKey] || shopName || "").replace(/\s+/g, "");
    const pageReadyAt = Date.now() + 10000;
    while (Date.now() < pageReadyAt) {
      shopSelect = document.getElementById("search_om_shop");
      if (shopSelect && shopSelect.options.length > 1) {
        if (!shopName) break;
        matched = Array.from(shopSelect.options).find(
          (option) =>
            option.value && String(option.textContent || "").replace(/\s+/g, "").includes(target),
        );
        if (matched) break;
      }
      await delay(300);
    }

    const fileInput = document.getElementById("userfile");
    const submitButton = document.getElementById("btn_om_upload");
    const shop = () => (matched ? String(matched.textContent || "").trim() : null);

    if (!shopSelect || !fileInput) {
      return {
        success: false,
        outcome: "not_submitted",
        unreadable: true,
        error:
          "셀피아 주문접수(파일 업로드) 화면 요소를 찾지 못했습니다. order_collect 화면이 열렸는지/로그인 상태인지 확인해주세요.",
      };
    }
    if (shopName && !matched) {
      return {
        success: false,
        outcome: "not_submitted",
        error: `셀피아 판매처 목록에서 '${shopName}' 을(를) 찾지 못했습니다. 셀피아 거래처 등록을 확인해주세요.`,
      };
    }

    // 1) 판매처 선택 — 셀피아가 이 시점에 엑셀양식을 비동기로 자동 로드한다.
    if (matched) setSelectValue(shopSelect, matched.value);

    // 2) 엑셀양식(om_excelformed) 자동 로드 대기 — 이걸 안 기다리고 주문접수하면
    //    "엑셀양식이 정해지지 않았습니다" 에러. (탭이 이미 열려 있으면 즉시 통과)
    const excelSelect = document.getElementById("om_excelformed");
    if (excelSelect) {
      const excelReadyAt = Date.now() + 10000;
      while (Date.now() < excelReadyAt && !excelSelect.value) {
        await delay(300);
      }
      if (!excelSelect.value) {
        return {
          success: false,
          outcome: "not_submitted",
          shop: shop(),
          error:
            "셀피아 엑셀양식이 자동으로 설정되지 않았습니다. 해당 판매처의 엑셀양식을 셀피아에서 먼저 설정해주세요.",
        };
      }
    }

    // 3) 파일 주입 (file input 은 값 직접 설정 불가 → DataTransfer 로 files 세팅)
    let bytes;
    try {
      bytes = base64ToBytes(fileBase64);
    } catch {
      return { success: false, outcome: "not_submitted", error: "전송 파일 디코딩에 실패했습니다." };
    }
    const file = new File([bytes], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    if (fileInput.files.length !== 1) {
      return { success: false, outcome: "not_submitted", shop: shop(), error: "셀피아 파일 입력칸에 파일을 넣지 못했습니다." };
    }

    // 4) 주문접수 클릭 (om_fileupload())
    if (!submitButton) {
      return {
        success: false,
        outcome: "not_submitted",
        unreadable: true,
        shop: shop(),
        fileName,
        error: "파일은 주입했지만 '주문접수' 버튼을 찾지 못했습니다.",
      };
    }
    // 기존 대기 목록의 초기 AJAX 로딩을 업로드 성공으로 오인하지 않도록 기준 행 수가 안정화된 뒤 클릭한다. 이후 실제 행 수
    // 증가만 접수 성공 근거로 인정한다.
    const pendingRowsBefore = await waitForStablePendingRowCount();
    if (pendingRowsBefore === null) {
      return {
        success: false,
        outcome: "not_submitted",
        unreadable: true,
        shop: shop(),
        fileName,
        error:
          "셀피아 대기 주문 목록을 읽지 못해 주문접수를 실행하지 않았습니다. 화면을 새로고침한 뒤 다시 시도해주세요.",
      };
    }
    const pendingTargetOrderNumbersBefore = pendingTargetOrderNumbers();
    try {
      submitButton.click();
    } catch (error) {
      return {
        success: false,
        outcome: "unknown",
        shop: shop(),
        fileName,
        pendingRowsBefore,
        error: (error && error.message) || "주문접수 클릭 결과를 확인하지 못했습니다.",
      };
    }

    const uploadEvidence = await waitForUploadEvidence(pendingRowsBefore, pendingTargetOrderNumbersBefore);
    if (uploadEvidence.kind === "rejected") {
      return {
        success: false,
        outcome: "unknown",
        shop: shop(),
        fileName,
        pendingRowsBefore,
        error: `셀피아 주문접수 결과 확인 필요: ${uploadEvidence.message}`,
      };
    }
    if (uploadEvidence.kind !== "accepted") {
      return {
        success: false,
        outcome: "unknown",
        shop: shop(),
        fileName,
        pendingRowsBefore,
        error:
          "주문접수 버튼은 실행됐지만 셀피아 접수 결과를 확인하지 못했습니다. 셀피아 대기 주문을 확인해주세요.",
      };
    }

    return {
      success: true,
      outcome: "submitted",
      shop: shop(),
      excelFormat: excelSelect ? excelSelect.value : null,
      fileName,
      pendingRowsBefore,
      acceptedRows: uploadEvidence.acceptedRows,
      pendingRows: uploadEvidence.pendingRows,
      acceptedTargetOrderNumbers: uploadEvidence.acceptedTargetOrderNumbers,
    };
  };

  calls["sellpia.orderStep"] = async function driveStep(args) {
    const step = args && args.step;
    const targetOrderNumbers = normalizeTargets(args && args.targetOrderNumbers);
    if (loginPage()) return { success: false, loginRequired: true };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const jq = window.jQuery;
    if (!jq) {
      return { success: false, unreadable: true, error: "셀피아 페이지(jQuery)를 찾지 못했습니다. 로그인/화면을 확인하세요." };
    }
    const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, "");
    const stripHtml = (h) => {
      const d = document.createElement("div");
      d.innerHTML = String(h == null ? "" : h);
      return (d.textContent || "").trim();
    };
    const promptButtons = () => Array.from(document.querySelectorAll(".jqibuttons button"));
    const promptOpen = () => promptButtons().length > 0;
    const promptMessage = () => {
      const els = Array.from(document.querySelectorAll(".jqimessage"));
      const el = els[els.length - 1];
      return el ? (el.textContent || "").trim() : "";
    };
    function answerPrompt(labels) {
      const btns = promptButtons();
      for (const label of labels) {
        const want = norm(label);
        const b = btns.find((x) => norm(x.textContent).includes(want));
        if (b) {
          b.click();
          return true;
        }
      }
      return false;
    }
    async function waitPrompt(matchRe, timeoutMs) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (promptOpen()) {
          const t = promptMessage();
          if (!matchRe || matchRe.test(t)) return t;
        }
        await sleep(150);
      }
      return null;
    }
    async function waitIdle(timeoutMs) {
      const until = Date.now() + timeoutMs;
      await sleep(400);
      while (Date.now() < until) {
        if ((jq.active || 0) === 0) {
          await sleep(300);
          if ((jq.active || 0) === 0) return true;
        }
        await sleep(200);
      }
      return false;
    }
    async function waitGrid(timeoutMs) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (window.dataView && typeof window.dataView.getLength === "function") return true;
        await sleep(200);
      }
      return false;
    }
    const st = (v) => String(v == null ? "" : v).trim();
    // 재고매칭 화면은 조회를 눌러야 목록이 뜬다. 대기목록 화면에는 조회 버튼이 없다.
    async function searchIfPresent() {
      const searchBtn = document.getElementById("btn_search");
      if (searchBtn) {
        searchBtn.click();
        const initP = await waitPrompt(/초기화|계속/, 1500);
        if (initP) answerPrompt(["예"]);
        await waitIdle(70000);
        await sleep(600);
      } else {
        await waitIdle(15000);
      }
    }
    const gridItems = () => (window.dataView && window.dataView.getItems ? window.dataView.getItems() : []);
    // [송장번호채번]을 누르기 시작했는가 — 그 뒤의 실패는 발급됐는지 모르는 것이라 `pressed: true`로 답한다(다시 실행하면 이중 채번).
    let pressed = false;

    try {
      // 전송한 주문이 셀피아에 실제로 들어갔는지 확인만 한다(비파괴: 조회 외 클릭 없음).
      // order_collect(업로드 직후 대기목록)와 order_stockmatch(등록 이후) 양쪽에서 동작한다.
      if (step === "verify") {
        if (!(await waitGrid(15000))) {
          return { success: false, unreadable: true, error: "셀피아 주문 목록(그리드)을 찾지 못했습니다. 로그인/화면을 확인하세요." };
        }
        await searchIfPresent();
        const items = gridItems();
        const remaining = new Set(targetOrderNumbers);
        const found = [];
        for (const it of items) {
          if (remaining.size === 0) break;
          const candidates = [
            it.c_group_no, it.group_no, it.ord_no, it.c_ord_no,
            it.order_no, it.shop_order_no, it.provider_order_no,
            it.seller_order_no, it.om_order_no,
          ].map((v) => stripHtml(st(v))).filter(Boolean);
          for (const want of Array.from(remaining)) {
            const hit = candidates.some((value) => {
              if (value === want) return true;
              if (!value.endsWith(want)) return false;
              return /[_:|/\s-]$/.test(value.slice(0, -want.length));
            });
            if (!hit) continue;
            remaining.delete(want);
            found.push({
              orderNo: want,
              receiver: stripHtml(it.c_receiver || it.receiver),
              provider: stripHtml(it.c_provider_name || it.provider_name),
            });
          }
        }
        return {
          success: true,
          listCount: items.length,
          requestedCount: targetOrderNumbers.length,
          foundCount: found.length,
          missingCount: Math.max(0, targetOrderNumbers.length - found.length),
          found,
          missing: Array.from(remaining),
        };
      }

      // 셀피아에 현재 올라와 있는 주문을 그대로 읽어온다(비파괴: 조회 외 클릭 없음). 판매처(수취인 괄호 안 이름)와
      // 주문번호를 함께 돌려주어 웹앱이 몰별로 대조해 "아직 셀피아에 안 올라간 주문"을 계산할 수 있게 한다.
      if (step === "orderSnapshot") {
        if (!(await waitGrid(15000))) {
          return { success: false, unreadable: true, error: "셀피아 주문 목록(그리드)을 찾지 못했습니다. 로그인/화면을 확인하세요." };
        }
        await searchIfPresent();
        const items = gridItems();
        const seen = new Set();
        const rows = [];
        for (const it of items) {
          const orderNo = stripHtml(
            st(it.c_group_no || it.group_no || it.c_ord_no || it.ord_no || it.order_no),
          );
          if (!orderNo || seen.has(orderNo)) continue;
          seen.add(orderNo);
          rows.push({
            orderNo,
            receiver: stripHtml(it.c_receiver || it.receiver),
            provider: stripHtml(it.c_provider_name || it.provider_name),
          });
          if (rows.length >= 5000) break; // 비정상 응답 방어
        }
        return { success: true, rowCount: items.length, orderCount: rows.length, rows };
      }

      if (step === "register") {
        if (!(await waitGrid(12000))) {
          return { success: false, unreadable: true, error: "셀피아 주문 목록(그리드)을 찾지 못했습니다. 로그인/화면을 확인하세요." };
        }
        await waitIdle(15000);
        const btn = document.getElementById("save_b");
        if (!btn) {
          return {
            success: false,
            unreadable: true,
            error: "등록 버튼(#save_b)을 찾지 못했습니다. 셀피아 주문서수집 화면인지/로그인 상태인지 확인하세요.",
          };
        }
        if (window.dataView.getLength() <= 0) {
          return {
            success: false,
            empty: true,
            error: "등록할 수집 주문이 없습니다. 먼저 셀피아 전송을 진행한 뒤 후처리를 실행하세요.",
          };
        }
        const pending = window.dataView.getLength();
        btn.click();
        const confirmTxt = await waitPrompt(/정리된 내용|등록/, 8000);
        if (!confirmTxt) return { success: false, error: "등록 확인창이 표시되지 않았습니다." };
        if (!answerPrompt(["기 등록된 내용 유지", "확인"])) {
          return { success: false, error: "등록 확인 버튼(기 등록된 내용 유지)을 찾지 못했습니다." };
        }
        await waitIdle(50000);
        const resultTxt = await waitPrompt(/등록되었습니다|등록에 실패|실패/, 4000);
        answerPrompt(["Ok", "확인", "닫기"]);
        await sleep(300);
        if (resultTxt && /실패/.test(resultTxt)) return { success: false, error: stripHtml(resultTxt) };
        return { success: true, registered: pending, message: resultTxt ? stripHtml(resultTxt) : "주문 등록 완료" };
      }

      if (step === "stockmatch") {
        if (!(await waitGrid(15000))) {
          return { success: false, unreadable: true, error: "재고매칭 화면(그리드)을 찾지 못했습니다. 로그인/화면을 확인하세요." };
        }
        const searchBtn = document.getElementById("btn_search");
        if (!searchBtn) return { success: false, unreadable: true, error: "조회 버튼(#btn_search)을 찾지 못했습니다." };
        searchBtn.click();
        const initP = await waitPrompt(/초기화|계속/, 1500);
        if (initP) answerPrompt(["예"]);
        await waitIdle(70000);
        await sleep(600);
        const listCount = window.dataView ? window.dataView.getLength() : 0;
        if (listCount <= 0) {
          return {
            success: true,
            listCount: 0,
            matched: 0,
            unmatched: [],
            unmatchedCount: 0,
            message: "재고매칭 화면에 조회된 주문이 없습니다.",
          };
        }

        const tieBtn = document.getElementById("btn_tie");
        if (tieBtn) {
          tieBtn.click();
          const tieP = await waitPrompt(/합포|일치/, 6000);
          if (tieP) {
            answerPrompt(["자동합포 리스트", "확인", "예"]);
            await waitIdle(70000);
            const tieDone = await waitPrompt(/합포|완료|없습니다/, 2500);
            if (tieDone) answerPrompt(["확인", "예", "Ok", "닫기"]);
            await sleep(400);
          }
        }

        const smatchBtn = document.getElementById("btn_smatch");
        if (!smatchBtn) return { success: false, unreadable: true, error: "자동재고매칭 버튼(#btn_smatch)을 찾지 못했습니다." };
        smatchBtn.click();
        const smP = await waitPrompt(/재고매칭|계속/, 6000);
        if (!smP) return { success: false, error: "자동재고매칭 확인창이 표시되지 않았습니다." };
        answerPrompt(["예"]);
        await waitIdle(120000);
        const doneTxt = await waitPrompt(/재고매칭을 완료|없습니다/, 5000);
        let matchedFromPrompt = null;
        if (doneTxt) {
          const m = doneTxt.match(/완료\s*\(?\s*([0-9,]+)/);
          if (m) matchedFromPrompt = Number(m[1].replace(/,/g, ""));
          answerPrompt(["확인", "예", "Ok", "닫기"]);
          await sleep(400);
        }

        const items = gridItems();
        const isFee = (nm) => /택배비|배송비/.test(String(nm || ""));
        const unmatched = [];
        let matched = 0;
        let productRows = 0;
        for (const it of items) {
          const name = it.c_prd_name || it.c_prd_name_sp || "";
          if (isFee(name)) continue;
          productRows += 1;
          const result = stripHtml(it.c_result);
          if (/재고매칭/.test(result)) {
            matched += 1;
            continue;
          }
          unmatched.push({
            groupNo: String(it.c_group_no || ""),
            receiver: stripHtml(it.c_receiver),
            provider: stripHtml(it.c_provider_name),
            product: stripHtml(name),
            option: stripHtml(it.c_opt_name),
            result: result || "미매칭",
          });
        }
        return {
          success: true,
          listCount,
          productRows,
          matched: matchedFromPrompt != null ? matchedFromPrompt : matched,
          unmatched,
          unmatchedCount: unmatched.length,
          message: `조회 ${listCount}건 · 재고매칭 ${matched}건 · 미매칭 ${unmatched.length}건`,
        };
      }

      // ⚠️되돌리기 어려움: 실제 송장번호를 발급한다. 대상 주문번호 행만 고르고, 고를 행이 없으면 누르지 않는다
      // (`pressed: false` — 대기 행 전체 채번 금지, 옛 규칙).
      if (step === "invoice") {
        if (!(await waitGrid(20000))) {
          return { success: false, unreadable: true, error: "송장채번 화면(그리드)을 찾지 못했습니다. 로그인/자동송장연동 설정을 확인하세요." };
        }
        await waitIdle(25000);
        await sleep(500);
        const btn = document.getElementById("btn_get_auto_delinum");
        if (!btn) {
          return { success: false, unreadable: true, error: "송장번호채번 버튼(#btn_get_auto_delinum)을 찾지 못했습니다." };
        }
        if (btn.disabled) {
          return { success: false, error: "송장번호 채번 불가 상태입니다(자동송장연동/발송지 설정을 확인하세요)." };
        }
        const targets = targetOrderNumbers;
        const notPressed = (message) => ({
          success: true,
          pressed: false,
          requestedTargetCount: targets.length,
          selectedTargetCount: 0,
          missingTargetCount: targets.length,
          selectedTargetOrderNumbers: [],
          rows: [],
          message,
        });
        const waiting = window.dataView.getLength();
        if (waiting <= 0) return notPressed("송장채번 대기 주문이 없습니다(이미 채번되었거나 재고매칭 대기).");
        if (targets.length <= 0) return notPressed("송장채번 대상 주문번호가 없어 누르지 않았습니다.");
        const beforeItems = gridItems();
        const selectedRows = [];
        const selectedTargets = new Set();
        for (let index = 0; index < beforeItems.length; index += 1) {
          const target = targetForRow(beforeItems[index], targets);
          if (!target) continue;
          selectedRows.push(index);
          selectedTargets.add(target);
        }
        if (selectedRows.length <= 0) {
          return notPressed(`이번 전송 주문 ${targets.length}건과 일치하는 송장 대기 행이 없습니다. 다른 대기 주문은 채번하지 않았습니다.`);
        }
        if (!window.grid || typeof window.grid.setSelectedRows !== "function") {
          return {
            success: false,
            unreadable: true,
            error: "송장채번 대상 행을 선택할 수 없어 중단했습니다. 다른 대기 주문은 채번하지 않았습니다.",
          };
        }
        try {
          window.grid.setSelectedRows(selectedRows);
        } catch {
          return {
            success: false,
            error: "송장채번 대상 행 선택에 실패해 중단했습니다. 다른 대기 주문은 채번하지 않았습니다.",
          };
        }
        await sleep(300);
        pressed = true;
        btn.click();
        const confirmTxt = await waitPrompt(/채번|진행/, 6000);
        if (!confirmTxt) return { success: false, pressed: true, error: "송장채번 확인창이 표시되지 않았습니다." };
        answerPrompt(["예"]);
        await waitIdle(120000);
        const doneTxt = await waitPrompt(/완료|채번|실패|없습니다/, 6000);
        answerPrompt(["확인", "예", "Ok", "닫기"]);
        await sleep(700);
        if (doneTxt && /실패/.test(doneTxt)) return { success: false, pressed: true, error: stripHtml(doneTxt) };
        const rows = gridItems()
          .filter((it) => targetForRow(it, targets) && st(it.delinum))
          .map((it) => {
            const target = targetForRow(it, targets);
            const gno = st(it.group_no);
            const addr = st(it.receiver_addr) || [st(it.receiver_addr1), st(it.receiver_addr2)].filter(Boolean).join(" ");
            return {
              ordNo: target || gno,
              itemNo: "",
              invNo: st(it.delinum),
              courier: "1136",
              provider: st(it.provider_name),
              receiver: st(it.receiver).replace(/\([^)]*\)\s*$/, "").trim(),
              post: st(it.receiver_post),
              addr,
              groupNo: gno,
            };
          });
        return {
          success: true,
          pressed: true,
          requestedTargetCount: targets.length,
          selectedTargetCount: selectedTargets.size,
          missingTargetCount: Math.max(0, targets.length - selectedTargets.size),
          selectedTargetOrderNumbers: [...selectedTargets],
          invoiced: rows.length || selectedRows.length,
          rows,
          message: doneTxt
            ? stripHtml(doneTxt)
            : `이번 전송 주문 송장채번 완료(${rows.length || selectedRows.length}건)`,
        };
      }

      return { success: false, error: "알 수 없는 단계: " + step };
    } catch (e) {
      return { success: false, ...(pressed ? { pressed: true } : {}), error: String((e && e.message) || e) };
    }
  };
})();
