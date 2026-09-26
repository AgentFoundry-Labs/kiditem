// 떠리몰(샵바이 파트너 어드민 partner.shopby.co.kr) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js`
// `readThirtymallListings` 이식, 본문 그대로). 사이트 `extensions/src/sites/thirtymall/listings.ts`가 상품정보 조회/수정 화면 탭에
// `page-call/bridge.js`와 함께 주입하고 `thirtymall.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다 — 토큰은 싣지 않는다.
(function installThirtymallListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  /**
   * 떠리몰(샵바이 파트너 어드민) 상품정보 조회/수정 목록(라이브 2026-09-19: 479개 = 5쪽). 목록 화면(partner-remote
   * iframe)이 부르는 상품 검색 API 를 겉 화면(partner.shopby.co.kr) 안에서 그대로 부른다 — admin-api.e-ncp.com
   * `POST /products/search`, 머리 accessToken(파트너 로그인 쿠키) · Version 1.0 · ClientLocation(목록 화면 주소 — 없으면
   * 403 "권한이 없습니다"). 토큰은 이 함수 안에서만 쓴다. 등록일 전 기간 · 떠리몰(mallNo 78859)만 100개씩 1쪽부터 끝까지
   * 읽는다. 상태는 승인상태 · 판매설정 · 판매상태 · 품절 여부가 따로 와서 몰 글자 여럿으로 넘기고, 이름 끝의
   * "(업체별도 무료배송)"은 몰이 모든 상품에 붙이는 말이라 뗀다.
   */
  async function readThirtymallListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const API = "https://admin-api.e-ncp.com";
    const CLIENT_LOCATION = "https://partner-remote.shopby.co.kr/product/management/list";
    const TOKEN_COOKIE = "SHOPBY_PARTNER_SESSAT";
    const MALL_NO = 78859;
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const APPLY = ["REGISTRATION_READY", "APPROVAL_READY", "APPROVAL_REJECTION", "SALE_AGREEMENT_READY",
      "SALE_AGREEMENT_REJECTION", "FINISHED", "AFTER_APPROVAL_READY", "AFTER_APPROVAL_REJECTION"];
    const SALE = ["PRE_APPROVAL_STATUS", "ON_PRE_SALE", "WAITING_SALE", "ON_SALE", "END_SALE"];
    const SETTING = ["AVAILABLE_FOR_SALE", "STOP_SELLING", "PROHIBITION_SALE"];
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }

    const token = (() => {
      try {
        const hit = document.cookie.split(";").map((part) => part.trim())
          .find((part) => part.startsWith(`${TOKEN_COOKIE}=`));
        return hit ? decodeURIComponent(hit.slice(TOKEN_COOKIE.length + 1)) : "";
      } catch {
        return "";
      }
    })();
    if (!token) return fail("mall_login_required");

    // 목록 화면의 기본 검색 조건 그대로에 기간만 전체로 넓힌다(화면 기본은 등록일 최근 3개월).
    const condition = {
      adminNo: null, allowsFrontDisplay: "ALL", allowsPromotion: "ALL", allowsShippingTogether: "ALL",
      applyStatusTypes: APPLY.slice(), brandNo: null, canApplyAdditionalDiscount: "ALL", canApplyCoupon: "ALL",
      categoryCondition: { type: "DISPLAY", depth: null, no: null, nos: [] }, classType: null,
      commission: { type: "ALL", range: { min: 0, max: 100 } }, customPropertyValueNos: [], deliverable: "ALL",
      deliveryFeeType: "ALL", exceptedMallProductNos: [], excludeSalesEndProduct: false, hasAdditionalDiscount: "ALL",
      keywordInfo: { ignoreCase: false, type: "PRODUCT_NAME", keywords: [] }, mallNos: [MALL_NO], marketingChannels: [],
      marketingDisplayYn: "ALL", memberGradeNo: null, memberGroupNo: null, needsAdditionalDiscountInfo: "N",
      onlyAccessUrl: "ALL", onlyGlobalProduct: "ALL", onlyMappingProduct: "ALL", onlyParentProduct: "ALL",
      onlySingleProduct: "ALL", partnerNo: null,
      periodInfo: { type: "REGISTER_DATE", period: { startYmdt: "2000-01-01 00:00:00", endYmdt: "2999-12-31 23:59:59" } },
      platformType: "ALL", remainsSaleDays: 0, saleMethodType: "ALL",
      salePriceRange: { type: "ALL", minSalePrice: null, maxSalePrice: null },
      saleSettingStatus: { isAll: true, types: [] }, saleStatus: { isAll: true, types: [] }, shippingAreaType: "ALL",
      sort: null, stockRange: { type: "ALL", stockCnt: null, minStockCnt: null, maxStockCnt: null },
    };

    async function search(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${API}/products/search`, {
          method: "POST",
          cache: "no-store",
          headers: {
            accessToken: token,
            Version: "1.0",
            ClientLocation: CLIENT_LOCATION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...condition, page, size: plan.pageSize }),
          signal: controller.signal,
        });
        if (response.status === 401) throw new Error("LOGIN_REQUIRED");
        // 403 은 화면 주소(ClientLocation) 권한이 바뀐 것이다 — 로그인 문제가 아니다.
        if (response.status === 403) drift("forbidden");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    function words(product) {
      const apply = String(product.applyStatusType ?? "");
      const sale = String(product.saleStatusType ?? "");
      const setting = String(product.saleSettingStatusType ?? "");
      if (!APPLY.includes(apply)) drift("apply_status");
      if (!SALE.includes(sale)) drift("sale_status");
      if (!SETTING.includes(setting)) drift("sale_setting");
      if (typeof product.isSoldOut !== "boolean") drift("sold_out");
      const out = [];
      if (/REJECTION$/.test(apply)) out.push("승인거부");
      else if (/READY$/.test(apply)) out.push("승인대기");
      if (setting === "PROHIBITION_SALE") out.push("판매금지");
      else if (setting === "STOP_SELLING") out.push("판매중지");
      if (sale === "END_SALE") out.push("판매종료");
      else if (sale === "WAITING_SALE") out.push("판매대기");
      if (product.isSoldOut) out.push("품절");
      return out.length > 0 ? out : ["판매중"];
    }

    function imageOf(value) {
      if (typeof value !== "string") return null;
      // 샵바이 사진 주소는 스킴 없이 온다(//shopby-images.cdn-nhncommerce.com/…).
      const absolute = value.startsWith("//") ? `https:${value}` : value;
      return /^https:\/\//.test(absolute) && absolute.length <= 2000 ? absolute : null;
    }

    try {
      const first = await search(1);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      if (total > 0 && first.totalPage !== totalPages) drift("total_page");

      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const list = page === 1 ? first : await search(page);
        if (!Array.isArray(list.contents)) drift("contents");
        for (const product of list.contents) {
          if (Number(product?.mallNo) !== MALL_NO) drift("mall_no");
          const mallProductCode = String(product?.mallProductNo ?? "");
          if (!/^\d{6,12}$/.test(mallProductCode)) drift("product_no");
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(String(product.productName ?? "").replace(/\s*\(업체별도 무료배송\)\s*$/, ""), 400);
          if (!productName) drift("product_name");
          const price = Number(product.salePrice);
          const registered = String(product.registerDateTime ?? "");
          const image = imageOf(product.mainImageUrl);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(product.productManagementCd, 60),
            salePrice: Number.isInteger(price) && price >= 0 && price <= 1_000_000_000 ? price : null,
            statusWords: words(product),
            registeredOn: /^\d{4}-\d{2}-\d{2}/.test(registered) ? registered.slice(0, 10) : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
      if (rows.length !== total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: total,
            recordsRead: rows.length,
            pagesRead: totalPages,
            totalPages,
            detailsRead: 0,
            detailsMissing: 0,
          },
          rows,
          proof: { mallKey: plan.mallKey, pageSize: plan.pageSize, validatedList: true },
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") return fail("mall_timeout");
      if (error?.message === "LOGIN_REQUIRED") return fail("mall_login_required");
      if (error?.message === "INVALID_RESPONSE") return fail("mall_invalid_snapshot");
      if (error?.message?.startsWith("CONTRACT_DRIFT:")) {
        return fail("mall_contract_drift", error.message.slice("CONTRACT_DRIFT:".length, 160));
      }
      return fail("mall_network_failed");
    }
  }

  calls["thirtymall.listings"] = (args) => readThirtymallListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
