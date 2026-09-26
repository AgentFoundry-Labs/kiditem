// 네이버 스마트스토어센터(sell.smartstore.naver.com) 등록 상품 목록 읽기(MAIN world, KID-381 — 옛 `mall-admin-listings.js`
// `readSmartstoreListings` 이식, 본문 그대로). 화면 자신의 Angular `$http`(인터셉터가 요청 머리를 붙인다)가 페이지 변수라 MAIN world다.
// 사이트 `extensions/src/sites/smartstore/listings.ts`가 원상품 목록 화면 탭에 `page-call/bridge.js`·`page-call/runner.js`와 함께
// 주입하고 `smartstore.listings`를 부른다. 조회만 한다.
(function installSmartstoreListings() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 네이버 스마트스토어센터(원상품 목록) 화면 안(MAIN)에서 돈다. 목록 검색(`POST /api/products/list/search`)을 화면 자신의
  // Angular `$http` 로 검색어 없이 100개씩 0쪽부터 읽는다 — 화면 인터셉터가 붙이는 머리가 그대로 실린다. 사방넷이 채널상품번호와
  // 원상품번호를 섞어 줬으므로 채널상품번호를 몰 상품코드로, 원상품번호를 다른 코드로 함께 싣는다(이미 이어진 쪽을 쓴다).
  async function readSmartstoreListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const STATUS = {
      SALE: "판매중", OUTOFSTOCK: "품절", SUSPENSION: "판매중지", WAIT: "판매대기", UNADMISSION: "승인대기",
      REJECTION: "승인거부", PROHIBITION: "판매금지", CLOSE: "판매종료", DELETE: "삭제",
    };
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

    try {
      const deadline = Date.now() + 20_000;
      let injector = null;
      while (!injector) {
        try {
          injector = window.angular ? window.angular.element(document.body).injector() : null;
        } catch {
          injector = null;
        }
        if (injector) break;
        if (location.hostname !== "sell.smartstore.naver.com" || Date.now() > deadline) return fail("mall_login_required");
        await wait(500);
      }
      const $http = injector.get("$http");
      const search = async (page) => {
        try {
          // 원상품 목록 검색 폼이 처음 가진 값 그대로다(공개 번들 app.js: searchPeriodType · searchKeywordType ·
          // searchOrderType · searchKeyword · searchDynamicPricingType). 기간 칸은 비워 전체다.
          const response = await $http({
            method: "POST",
            url: "/api/products/list/search",
            timeout: requestTimeoutMs,
            data: {
              searchPeriodType: "PROD_REG_DAY",
              searchKeywordType: "CHANNEL_PRODUCT_NO",
              searchOrderType: "REG_DATE",
              searchKeyword: "",
              searchDynamicPricingType: "ALL",
              page,
              size: plan.pageSize,
            },
          });
          return response?.data;
        } catch (failure) {
          const status = Number(failure?.status) || 0;
          if (status === 401 || status === 403) throw new Error("LOGIN_REQUIRED");
          if (status === -1) throw Object.assign(new Error("timeout"), { name: "AbortError" });
          // 어떤 답이었는지 남긴다 — 이 몰은 화면을 직접 보지 못해 답 번호가 고칠 곳을 알려 준다.
          throw new Error(`CONTRACT_DRIFT:http_${status}`);
        }
      };

      const first = await search(0);
      if (!first || !Array.isArray(first.content)) drift("content");
      const total = Number(first.total ?? first.totalElements);
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 0; page < totalPages; page += 1) {
        if (page > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const data = page === 0 ? first : await search(page);
        if (!data || !Array.isArray(data.content)) drift("content");
        if (Number(data.total ?? data.totalElements) !== total) return fail("mall_total_changed");
        for (const product of data.content) {
          const originNo = String(product?.id ?? product?.originProductNo ?? "");
          if (!/^\d{6,15}$/.test(originNo)) drift("origin_no");
          const channel = Array.isArray(product.singleChannelProducts) ? product.singleChannelProducts[0] ?? null : null;
          const channelNo = channel?.channelProductNo === undefined || channel?.channelProductNo === null
            ? "" : String(channel.channelProductNo);
          const mallProductCode = /^\d{6,15}$/.test(channelNo) ? channelNo : originNo;
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(String(product.productName ?? product.name ?? channel?.name ?? ""), 400);
          if (!productName) drift("product_name");
          const statusType = String(product.productStatusType ?? channel?.statusType ?? "");
          const status = STATUS[statusType];
          if (!status) drift("status_type");
          const amount = Number(product.salePrice ?? channel?.salePrice);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(product.regDate ?? product.createdDate ?? ""));
          const code = text(String(product.sellerManagementCode ?? ""), 60);
          const imageSource = product.representImageUrl ?? product.representativeImage?.url ?? null;
          const image = typeof imageSource === "string" && /^https:\/\//.test(imageSource) && imageSource.length <= 2000
            ? imageSource : null;
          rows.push({
            mallProductCode,
            ...(mallProductCode !== originNo ? { alternateCodes: [originNo] } : {}),
            productName,
            sellpiaName: null,
            // 판매자 관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: code,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? registered[1] : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
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

  calls["smartstore.listings"] = (args) => readSmartstoreListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
