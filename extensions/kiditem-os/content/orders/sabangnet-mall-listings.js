// 사방넷 송신 기록 한 쪽 읽기(ISOLATED world, KID-363 L1 — 옛 `sabangnet-mall-listings.js` `readSabangnetMallListings`
// 이식). 사이트 `extensions/src/sites/sabangnet`이 사방넷 관리자 탭에 `page-call/bridge.js`와 함께 주입하고
// `sabangnet.mallListingPage`를 쪽마다 부른다. "쇼핑몰상품수정" 목록 API를 사방넷 세션 토큰으로 한 번 POST하고, 행에서
// 허용한 칸만 복사해 돌려준다 — 사방넷 원문에는 몰 로그인 ID와 비밀번호 칸이 함께 오므로 원문·토큰은 이 파일 밖으로
// 나가지 않는다. 쪽 사이 간격·전체 수 확인·행 검증은 수집기(`collectors/channels.sabangnet_mall_listings`)가 한다.
(function installSabangnetMallListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const MAX_RESPONSE_CHARS = 20 * 1024 * 1024;
  const REQUEST_TIMEOUT_MS = 30000;
  // vue-element-admin 의 토큰 오류 코드 — 잘못된 토큰 · 다른 곳 로그인 · 만료.
  const LOGIN_CODES = new Set([50008, 50012, 50014]);
  // 행에서 복사하는 칸. 여기 없는 칸(몰 로그인 ID·비밀번호 등)은 절대 싣지 않는다.
  const ALLOWED_FIELDS = [
    "shmaId",
    "prdRegsTrnmSrno",
    "shmaPrdNo",
    "prdNo",
    "prdNm",
    "prdSplyStsCdNm",
    "modlNm",
    "onsfPrdCd",
    "sepr",
    "prdRegsFstTrnmDt",
  ];

  function sessionToken() {
    const prefix = "Authorization=";
    const entry = String(document.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (!entry) return null;
    try {
      return decodeURIComponent(entry.slice(prefix.length)) || null;
    } catch {
      return null;
    }
  }

  function pick(item) {
    const copy = {};
    for (const field of ALLOWED_FIELDS) {
      const value = item[field];
      if (typeof value === "string" || typeof value === "number") copy[field] = value;
      else if (value === null || value === undefined) copy[field] = null;
    }
    return copy;
  }

  // 사방넷 "쇼핑몰상품수정" 화면의 기본 검색 조건 그대로에 기간과 페이지만 바꾼다.
  function search(args) {
    return {
      shmaId: "",
      tbCmmlShmaCnctnAcntD: {},
      mode: "search",
      searchDateType: "PRD_REGS_FST_TRNM_DT",
      startDate: args.dateFrom,
      endDate: args.dateTo,
      startTime: "",
      endTime: "",
      svcAcntId: "",
      catLvl: 0,
      uprCatSrno: null,
      catLaclCd: null,
      catMidclCd: null,
      catSmclsCd: null,
      catDtclsCd: null,
      imgExpoYn: "",
      exlImgExpoYn: "",
      seprChk1: "",
      seprChk2: "",
      searchPriceYn: "N",
      searchPrice1: null,
      searchPrice2: null,
      skuYn: "",
      bypcSvcAcntId: "",
      lgstscSvcAcntId: "",
      stocUseYn: "",
      dechGvMthdDivCd: "",
      taxDivCd: "",
      prdDivCd: "",
      prdcYy: "",
      sesnDivCd: "",
      shmaIdMulti: [],
      bypcSvcAcntIdMulti: [],
      prdSplyStsCd3: "",
      prdSplyStsCd2: "",
      seprYn: "",
      prdNmYn: "",
      prdUpdTrnmSucsYn: "",
      shmaPrdLnkgStsCd: "",
      lnkgCrtnDivCd: "",
      setPrdDivCd: "",
      sortField: "b.PRD_REGS_FST_TRNM_DT",
      sortMethod: "DESC",
      scale: 0,
      searchCondition: "",
      searchKeyword: "",
      pageSize: args.pageSize,
      total: 0,
      exclPrtScpDivCd: "SELECTED",
      mallProductUpdateArray: [],
      catDivCd: "MY_CAT",
      catMpngDivCd: "",
      stdCatLaclNm: "",
      stdCatMidclNm: "",
      stdCatSmclsNm: "",
      stdCatDtclsNm: "",
      stdCatCdList: [],
      currentPage: args.currentPage,
    };
  }

  calls["sabangnet.mallListingPage"] = async function sabangnetMallListingPage(args) {
    const token = sessionToken();
    if (!token) return { status: "login_required" };
    if (typeof args?.listPath !== "string" || !args.listPath.startsWith("/prod-api/")) {
      return { status: "contract_drift", stage: "list_path" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(args.listPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Authorization: token,
        },
        body: JSON.stringify(search(args)),
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403 || response.redirected) return { status: "login_required" };
      if (!response.ok) return { status: "http_error", httpStatus: response.status };
      const body = await response.text();
      if (body.length > MAX_RESPONSE_CHARS) return { status: "contract_drift", stage: "size" };
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        return { status: "contract_drift", stage: "json" };
      }
      if (LOGIN_CODES.has(json?.code)) return { status: "login_required" };
      if (json?.code !== 20000) return { status: "contract_drift", stage: "code" };
      const total = Number(json?.data?.metaData?.total);
      if (!Number.isSafeInteger(total) || total < 0) return { status: "contract_drift", stage: "total" };
      if (!Array.isArray(json?.data?.list)) return { status: "contract_drift", stage: "list" };
      const items = [];
      for (const item of json.data.list) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return { status: "contract_drift", stage: "row" };
        // 기록마다 실패 이력 줄이 끼어 온다. 사방넷 화면도 이 줄은 고르지 않는다.
        if (item.type === "message" || item.type === "input") continue;
        items.push(pick(item));
      }
      return { status: "ok", total, items };
    } catch (error) {
      if (error && error.name === "AbortError") return { status: "timeout" };
      return { status: "network_failed" };
    } finally {
      clearTimeout(timer);
    }
  };
})();
