// GS샵(partners.gsshop.com) 협력사 배송관리 주문 엑셀(MAIN world, KID-380 — 옛 worker.js `scrapeGsshopOrders` 이식).
// 사이트 `extensions/src/sites/gs-shop`이 배송관리 탭에 `page-call/runner.js`와 함께 주입하고 `gs-shop.orders`를 부른다.
// GS는 서버 엑셀 주소가 없고 다운로드를 누르면 화면이 xlsx를 조립해 `URL.createObjectURL`로 내려준다 — 페이지의
// createObjectURL을 가로채고(그래서 MAIN world) 1주일 조회 → 총주문 → 다운로드 → 모달 확인 → 조립된 blob을 base64로
// 돌려준다. 끝나면 가로채기를 되돌린다. `gs-shop.smsWall`은 로그인 화면이 SMS 인증번호를 받는 화면인지 본다(사이트가
// 운영자를 기다린다). 읽기만 한다.
(function installGsShopOrders() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  const SMS_WALL = /인증번호\s*받기|SMS\s*인증|인증방식/;

  calls["gs-shop.smsWall"] = async function gsShopSmsWall() {
    const bodyText = document.body ? document.body.innerText || "" : "";
    return { sms: SMS_WALL.test(bodyText) };
  };

  calls["gs-shop.orders"] = async function gsShopOrders() {

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, timeout, interval) => {
      const end = Date.now() + (timeout || 20000);
      while (Date.now() < end) {
        let v;
        try {
          v = fn();
        } catch (e) {
          v = null;
        }
        if (v) return v;
        await sleep(interval || 300);
      }
      return null;
    };
    const btnByText = (txt, inDialog) => {
      const scope = inDialog ? document.querySelector('[role=dialog]') : document;
      if (!scope) return null;
      return (
        Array.from(scope.querySelectorAll("button")).find(
          (b) =>
            (b.textContent || "").trim() === txt &&
            b.offsetParent !== null &&
            (inDialog || !b.closest("[role=dialog]")),
        ) || null
      );
    };
    try {
      // 0) SPA 렌더 대기 — 조회 버튼이 뜰 때까지
      const searchBtn = await waitFor(() => btnByText("조회"), 30000, 400);
      if (!searchBtn) {
        // 로그인/인증 벽 구분: SMS 인증방식이 걸리면 협력사 로그인 화면(인증번호 받기)이 뜬다.
        const bodyText = document.body ? document.body.innerText || "" : "";
        const href = typeof location !== "undefined" ? String(location.href || "") : "";
        if (/인증번호\s*받기|SMS\s*인증|인증방식/.test(bodyText)) {
          return {
            success: false,
            pendingAuth: true,
            errorCode: "operator_action_required",
            error:
              "GS샵 SMS 인증이 필요합니다. GS샵 협력사 로그인에서 [인증번호 받기]로 인증을 완료한 뒤 다시 '수집하기'를 눌러주세요.",
          };
        }
        if (
          /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
          || document.querySelector('input[type="password"]')
        ) {
          return {
            success: false,
            pendingLogin: true,
            errorCode: "login_required",
            error: "GS샵 로그인이 필요합니다. 로그인한 뒤 다시 수집해주세요.",
          };
        }
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "GS샵 배송관리 화면에서 조회 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.",
        };
      }
      // 스트레이 경고 다이얼로그 닫기
      const warn = document.querySelector("[role=dialog]");
      if (warn && /조회된 데이터가 없|경고/.test(warn.textContent || "")) {
        const ok = btnByText("확인", true);
        if (ok) ok.click();
        await sleep(600);
      }
      // 1) createObjectURL 후킹 (클라이언트 조립 xlsx blob 캡처)
      const blobs = [];
      const origCOU = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (obj) {
        try {
          if (obj instanceof Blob) blobs.push(obj);
        } catch (e) {
          /* noop */
        }
        return origCOU(obj);
      };
      // 2) 출하지시일 기간 1주일 프리셋 (조회조건의 두 번째 '1주일' 버튼) — 없으면 기본 범위 유지
      const wks = Array.from(document.querySelectorAll("button")).filter(
        (b) => (b.textContent || "").trim() === "1주일" && b.offsetParent !== null,
      );
      if (wks[1]) wks[1].click();
      else if (wks[0]) wks[0].click();
      await sleep(700);
      // 3) 조회
      const sb = btnByText("조회");
      if (!sb) {
        URL.createObjectURL = origCOU;
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "GS샵 조회 버튼을 찾지 못했습니다. 배송관리 화면 구조를 확인해주세요.",
        };
      }
      sb.click();
      await sleep(4500); // query/list 응답 대기
      // 4) 조회결과 건수 — 총주문(n)
      const cntEl = await waitFor(
        () =>
          Array.from(document.querySelectorAll("*")).find(
            (el) => /^총주문\s*\(\d+\)$/.test((el.textContent || "").trim()) && el.children.length <= 2,
          ),
        8000,
        400,
      );
      if (!cntEl) {
        URL.createObjectURL = origCOU; // 후킹 원복
        const bodyText = document.body ? document.body.innerText || "" : "";
        const href = typeof location !== "undefined" ? String(location.href || "") : "";
        if (
          /login|로그인|세션.*(?:만료|없)|인증번호\s*받기|SMS\s*인증|인증방식/i.test(bodyText + " " + href)
          || document.querySelector('input[type="password"]')
        ) {
          return {
            success: false,
            pendingLogin: true,
            errorCode: "login_required",
            error: "GS샵 로그인 세션을 확인하지 못했습니다. 로그인 또는 SMS 인증을 완료한 뒤 다시 수집해주세요.",
          };
        }
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "GS샵 주문 조회 결과 건수를 확인하지 못했습니다. 배송관리 화면 구조를 확인해주세요.",
        };
      }
      const countMatch = (cntEl.textContent || "").match(/\((\d+)\)/);
      const cnt = countMatch ? Number(countMatch[1]) : Number.NaN;
      if (!Number.isFinite(cnt)) {
        URL.createObjectURL = origCOU;
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "GS샵 주문 조회 건수 형식을 확인하지 못했습니다.",
        };
      }
      if (cnt === 0) {
        URL.createObjectURL = origCOU;
        return { success: true, empty: true, rowCount: 0 };
      }
      // 4.5) 총주문 탭 클릭 — 다운로드는 활성 서브탭의 그리드 데이터를 읽으므로 전체(총주문)를 활성화해야
      //      "먼저 조회를 실행해주세요" 경고 없이 데이터가 실린다. (탭 미활성 시 활성 그리드가 비어 다운로드 실패)
      if (cntEl) {
        cntEl.click();
        await sleep(2500);
      }
      // 5) 다운로드 → 모달(주소표기 도로명/전체주소 = 기본값 그대로)
      const dl = btnByText("다운로드");
      if (!dl) return { success: false, error: "GS샵 다운로드 버튼을 찾지 못했습니다." };
      dl.click();
      const modal = await waitFor(() => {
        const d = document.querySelector("[role=dialog]");
        return d && /주소|다운로드 방식/.test(d.textContent || "") ? d : null;
      }, 8000, 300);
      if (!modal) {
        return { success: false, error: "GS샵 다운로드 방식 모달이 열리지 않았습니다. 조회 후 다시 시도하세요." };
      }
      // 6) 모달 내 '다운로드' 확인
      const confirm = btnByText("다운로드", true);
      if (!confirm) return { success: false, error: "GS샵 다운로드 확인 버튼을 찾지 못했습니다." };
      confirm.click();
      // 7) 클라이언트가 조립한 xlsx blob 대기 (상세 fetch + 조립 → 최대 90초)
      const blob = await waitFor(() => (blobs.length ? blobs[blobs.length - 1] : null), 90000, 500);
      URL.createObjectURL = origCOU; // 후킹 원복
      if (!blob) {
        return { success: false, error: "GS샵 엑셀 생성(다운로드)에 실패했습니다." };
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
      return { success: true, xlsxBase64: btoa(bin), fileName: "GS샵.xlsx", size: buf.length };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  };
})();
