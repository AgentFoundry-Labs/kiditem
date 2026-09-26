// 보리보리(seller-club.co.kr) 결제완료 주문 언마스킹 엑셀(MAIN world, KID-380 — 옛 worker.js `scrapeBoriboriOrders` 이식).
// 사이트 `extensions/src/sites/boribori`가 주문/배송관리 탭에 `page-call/runner.js`와 함께 주입하고 `boribori.orders`를
// 부른다. 페이지 컨텍스트로 fetch한다(ISOLATED는 SameSite 로그인 쿠키를 보내지 않아 404). 결제완료(stateCd=c) 60일을
// 다운로드 사유(`downloadReason`, 사이트 모듈의 몰 상수)와 다운로드 암호(`downloadPassword` — 몰 계정 비밀번호, 실행 자격에서
// 이 탭의 호출 인자로만 온다)로 언마스킹 xlsx를 받아 base64로 돌려준다. 암호는 요청 본문 밖으로 내보내지 않는다. 읽기만 한다.
(function installBoriboriOrders() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  calls["boribori.orders"] = async function boriboriOrders(args) {
    const downloadPassword = typeof args?.downloadPassword === "string" ? args.downloadPassword : "";
    const downloadReason = String(args?.downloadReason || "");

    const boriboriLoginRequired = () => ({
      success: false,
      pendingLogin: true,
      errorCode: "login_required",
      error:
        "보리보리 로그인이 필요합니다. seller-club.co.kr 에 로그인한 뒤 다시 수집해주세요.",
    });
    // 미로그인이면 주문 화면 대신 로그인 화면으로 리다이렉트된다. 그 상태로 아래 fetch 를 돌리면
    // 브라우저가 원인 없는 raw "Failed to fetch" 만 던져 사용자에게 "로그인 필요"를 알릴 수 없다.
    // 그래서 주문 경로에 머물러 있는지 먼저 확인한다.
    try {
      const path = typeof location !== "undefined" ? String(location.pathname || "") : "";
      if (path && !/\/order\//i.test(path)) return boriboriLoginRequired();
    } catch (e) {
      /* location 접근 실패는 판정하지 않고 그대로 진행 */
    }
    try {
      const p = (n) => String(n).padStart(2, "0");
      const ymd = (d) => `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
      const end = new Date();
      const start = new Date(end.getTime() - 60 * 24 * 60 * 60 * 1000); // 결제완료 미처리분이 밀렸을 수 있어 60일
      const password = typeof downloadPassword === "string" ? downloadPassword : "";
      const downloadType = password ? "password" : "reason";
      // orderAdmin.js paramVo 기본값 + 결제완료(stateCd='c') + 사유/비번. (showExcelDownloadPkgModal 와 동일 body)
      const paramVo = {
        siteCd: "0", brandNo: null, brandCd: "", brandNm: "", brndTyp: "01",
        schDtAuto: "", schDtTyp: "05", strDt: ymd(start), endDt: ymd(end),
        prdNmTyp: "01", prdNm: "", stateCd: "c", soldOut: "",
        defaultMdNo: null, defaultMdNm: "", prdGroupNo: "0", prdGroupCd: "0", prdGroupNm: "",
        prdGroupNoArray: [], prdGroupCdArray: [], prdGroupNmArray: [], defaultMdNoArray: [], defaultMdNmArray: [],
        selAcntNo: null, selAcntNm: "", appId: "", grnkBrandNo: null, deliList: [],
        currentPage: 1, currentIndex: 0, rowCount: 1000,
        reason: downloadReason, password, type: downloadType,
      };
      // 새 탭이면 SPA 인증 초기화 전에 fetch → 404. 준비될 때까지 재시도 (기존 로그인 탭이면 1회로 성공).
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bodies = [
        paramVo,
        { ...paramVo, type: "reason" },
        { paramVo, type: downloadType, reason: paramVo.reason, password },
        { paramVo: { ...paramVo, type: "reason" }, type: "reason", reason: paramVo.reason, password },
        { ...paramVo, type: "reason", password: "" },
      ];
      const endpoints = [
        "/order/rest/deli/downloadPkgOrdDeliList/excel-xlsx",
        "/order/rest/deli/downloadPkgOrdDeliList",
      ];
      let lastFailure = null;
      for (const body of uniqueJsonBodies(bodies)) {
        for (const endpoint of endpoints) {
          let res = null;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            res = await fetch(endpoint, {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body,
            });
            if (res.ok) break;
            if (res.status === 401 || res.status === 403) {
              await sleep(2000); // 인증(세션) 초기화 대기 후 재시도
              continue;
            }
            break; // 404(결제완료 0건)·그 외 상태는 재시도 무의미 (빠른 실패)
          }
          if (!res || !res.ok) {
            const failure = await boriboriHttpFailure(res);
            if (failure.empty || failure.pendingLogin) return failure;
            lastFailure = failure;
            continue;
          }
          const ct = res.headers.get("content-type") || "";
          const buf = new Uint8Array(await res.arrayBuffer());
          const kind = excelKind(ct, buf);
          if (kind) {
            let bin = "";
            for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
            return {
              success: true,
              xlsxBase64: btoa(bin),
              fileName: kind === "xls" ? "보리보리.xls" : "보리보리.xlsx",
              size: buf.length,
            };
          }
          const downloadError = boriboriDownloadError(buf, password);
          if (/로그인.*확인/.test(downloadError)) return boriboriLoginRequired();
          lastFailure = {
            success: false,
            errorCode: /비밀번호.*저장/.test(downloadError)
              ? "operator_action_required"
              : "provider_contract_changed",
            error: downloadError,
          };
          if (/비밀번호.*저장/.test(downloadError)) break;
        }
        if (lastFailure?.errorCode === "operator_action_required") break;
      }
      return lastFailure || {
        success: false,
        errorCode: "unknown_failure",
        error: "보리보리 다운로드가 거부되었습니다. 사유/비밀번호를 확인하세요.",
      };
    } catch (e) {
      const message = String((e && e.message) || e);
      // 주문 경로/401/403/로그인 응답으로 확인되지 않은 네트워크 오류를 로그인으로 추정하지 않는다.
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
        return {
          success: false,
          errorCode: "network_failed",
          error: "보리보리 주문 수집 요청에 실패했습니다. 네트워크 상태를 확인해주세요.",
        };
      }
      return { success: false, errorCode: "unknown_failure", error: "보리보리 수집 오류: " + message };
    }

    function uniqueJsonBodies(items) {
      const seen = new Set();
      return items
        .map((item) => JSON.stringify(item))
        .filter((item) => {
          if (seen.has(item)) return false;
          seen.add(item);
          return true;
        });
    }

    function excelKind(contentType, bytes) {
      const isXlsx = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      const isXls =
        bytes.length >= 8 &&
        bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0;
      if (isXlsx) return "xlsx";
      if (isXls) return "xls";
      if (bytes.length >= 200 && /spreadsheet|excel|octet-stream/i.test(contentType)) return "xlsx";
      return null;
    }

    async function boriboriHttpFailure(response) {
      if (!response) {
        return {
          success: false,
          errorCode: "network_failed",
          error: "보리보리 엑셀 다운로드 응답이 없습니다. 네트워크 상태를 확인해주세요.",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return boriboriLoginRequired();
      }
      let responseText = "";
      try {
        responseText = String(await response.text()).slice(0, 4000);
      } catch (e) {
        /* 상태 코드만으로 분류한다. */
      }
      if (/login|로그인|session|세션.*(?:만료|없)|unauthori/i.test(responseText)) {
        return boriboriLoginRequired();
      }
      if (response.status === 404) {
        // 404 자체는 라우트 변경/인증 초기화 실패일 수도 있다. 제공사 응답이 주문 없음임을 명시할 때만 empty다.
        if (/(?:조회|결제완료|주문|결과|데이터)[^\n]{0,40}(?:없|0건)|no\s*(?:orders?|data)/i.test(responseText)) {
          return { success: true, empty: true, rowCount: 0 };
        }
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "보리보리 주문 다운로드 경로를 확인하지 못했습니다. seller-club 화면 구조를 확인해주세요.",
        };
      }
      return {
        success: false,
        errorCode: "unknown_failure",
        error: "보리보리 엑셀 다운로드 실패 (" + response.status + ").",
      };
    }

    function boriboriDownloadError(bytes, sentPassword) {
      const decoded = new TextDecoder().decode(bytes.slice(0, 4000));
      try {
        const json = JSON.parse(decoded);
        const message = json && (json.message || json.returnMessage || json.error || json.msg);
        if (message) {
          const text = String(message);
          if (!sentPassword && /비밀번호|password|pwd/i.test(text)) {
            return "보리보리 언마스킹 다운로드에 비밀번호가 필요합니다. 몰 계정 관리에서 보리보리 비밀번호를 저장한 뒤 다시 수집해주세요.";
          }
          return "보리보리: " + text;
        }
      } catch {
        /* not json */
      }
      if (!sentPassword && /비밀번호|password|pwd/i.test(decoded)) {
        return "보리보리 언마스킹 다운로드에 비밀번호가 필요합니다. 몰 계정 관리에서 보리보리 비밀번호를 저장한 뒤 다시 수집해주세요.";
      }
      if (/login|로그인|session|세션/i.test(decoded)) {
        return "보리보리 seller-club 로그인을 확인한 뒤 다시 수집해주세요.";
      }
      return "보리보리 다운로드가 거부되었습니다. 사유/비밀번호를 확인하세요.";
    }
  };
})();
