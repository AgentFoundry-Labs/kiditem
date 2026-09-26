// 롯데ON(store.lotteon.com) 판매자센터 신규주문 엑셀(ISOLATED world, KID-380 — 옛 worker.js `scrapeLotteonOrders` 이식).
// 사이트 `extensions/src/sites/lotte-on`이 판매자센터 탭(열린 탭을 재사용 — 토큰이 탭별 sessionStorage다)에
// `page-call/bridge.js`와 함께 주입하고 `lotte-on.orders`를 부른다. sessionStorage `AuthToken`으로 soapi 3단계
// (개인정보 다운로드 사유 등록 → 신규주문 엑셀 요청 → fileManage 파일)를 거쳐 xlsx를 base64로 돌려준다. 다운로드 사유는
// 사이트 모듈의 몰 상수를 인자로 받는다(옛 값 "배송을 위한 주문정보 다운로드"). 토큰은 이 페이지의 요청 머리글에만 쓴다.
(function installLotteOnOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["lotte-on.orders"] = async function lotteOnOrders(args) {
    const downloadReason = String(args?.downloadReason || "");

    try {
      // 판매자센터는 SPA 라서 화면이 뜬 뒤에야 `sessionStorage.AuthToken` 을 채운다. 문서 로드만
      // 보고 읽으면 사장님이 로그인해 두셨어도 토큰이 아직 없어 "로그인 필요"로 읽힌다.
      // 로그인 화면으로 밀려난 것이 아니면 토큰이 설 때까지 기다린다(최대 20초).
      const loginScreen = () => /login/i.test(location.href);
      let tok = sessionStorage.getItem("AuthToken");
      const deadline = Date.now() + 20000;
      while (!tok && !loginScreen() && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 500); });
        tok = sessionStorage.getItem("AuthToken");
      }
      if (!tok) {
        return { success: false, error: "롯데ON 판매자센터 로그인이 필요합니다. 로그인 후 다시 시도하세요." };
      }
      const API = "https://soapi.lotteon.com";
      const H = {
        authorization: "Bearer " + tok,
        accept: "application/json",
        "content-type": 'application/json; charset="UTF-8"',
      };
      // 배송관리 신규주문 검색 조건 = 최근 31일(주문접수 owhoDttm) + 진행단계 11(신규주문/상품준비). 판매자센터 기본값과 동일.
      const ymd = (d) =>
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0");
      const end = new Date();
      const start = new Date(end.getTime() - 31 * 24 * 60 * 60 * 1000);

      // 1) 개인정보 다운로드 사유 등록 → encryptKey
      const saveRes = await fetch(API + "/soapi/v1/bocommon/auth/saveDownloadReason", {
        method: "POST",
        headers: H,
        credentials: "include",
        body: JSON.stringify({ dnldRsnCnts: downloadReason }),
      });
      const saveJson = await saveRes.json();
      if (saveJson?.returnCode !== "SUCCESS" || !saveJson?.data) {
        return { success: false, error: "롯데ON 다운로드 사유 등록에 실패했습니다. (" + (saveJson?.returnCode || saveRes.status) + ")" };
      }
      const encryptKey = saveJson.data;

      // 2) 엑셀 다운로드 요청(_dnldKey 필수) → fileId 발급
      const params = new URLSearchParams({
        _dnldKey: encryptKey,
        searchDateType: "owhoDttm",
        strtDt: ymd(start),
        endDt: ymd(end),
        odPrgsStepCd: "11",
        dtlCndType: "",
        dtlCndCnts: "",
        sndDlYn: "",
        sndCloseYn: "",
        cmbnDvPsbYn: "all",
        cnclReqYn: "",
        alrdDvYn: "",
        menuId: "ML000003707",
        pageNo: "1",
        rowsPerPage: "500",
      });
      const dlRes = await fetch(
        API + "/soapi/v2/delivery/sodeliverymanagement/sodeliverymanagement/downloadDeliveryExcel?" + params.toString(),
        { headers: H, credentials: "include" },
      );
      const dlJson = await dlRes.json();
      if (dlJson?.returnCode !== "SUCCESS" || !dlJson?.data?.fileId) {
        if (dlJson?.returnCode === "REQUIRED_DOWN_LOAD_REASON") {
          return { success: false, error: "롯데ON 다운로드 사유 인증에 실패했습니다. 다시 시도하세요." };
        }
        return { success: false, error: "롯데ON 엑셀 생성에 실패했습니다. (" + (dlJson?.returnCode || dlRes.status) + ")" };
      }
      const fileId = dlJson.data.fileId;
      const fileName = dlJson.data.fileName || "롯데ON.xlsx";

      // 3) 발급된 fileId 로 실제 파일(xlsx) 다운로드 → base64
      const fileRes = await fetch(API + "/soapi/v1/bocommon/o/fileManage/download/" + fileId, {
        headers: { authorization: "Bearer " + tok, "x-timezone": "GMT+09:00" },
        credentials: "include",
      });
      if (!fileRes.ok) {
        return { success: false, error: "롯데ON 파일 다운로드에 실패했습니다. (" + fileRes.status + ")" };
      }
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
      return { success: true, xlsxBase64: btoa(bin), fileName, size: buf.length };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  };
})();
