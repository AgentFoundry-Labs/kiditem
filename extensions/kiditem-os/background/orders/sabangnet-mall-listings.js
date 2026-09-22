(function installSabangnetMallListingsCollector(root) {
  "use strict";

  // 사방넷 송신 기록(몰 × 상품, 몰 상품코드)을 한 번에 읽는다(KID-246). 조회만 한다 —
  // 송신 · 저장 · 삭제 화면은 열지 않고, 목록 API 하나를 페이지로 부른다.
  const SOURCE_ORIGIN = "https://sbadmin08.sabangnet.co.kr";
  const PAGE_URL = `${SOURCE_ORIGIN}/`;
  const DEFAULT_TAB_READY_TIMEOUT_MS = 45_000;
  const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
  // 사방넷 서버에 부담을 주지 않게 페이지 사이를 띄운다. 6천여 건이 13쪽이다.
  const DEFAULT_PAGE_DELAY_MS = 800;

  const ERRORS = Object.freeze({
    login: Object.freeze({
      success: false,
      errorCode: "sabangnet_login_required",
      pendingLogin: true,
      error: "사방넷 로그인이 필요합니다. 열린 사방넷 화면에서 로그인한 뒤 다시 가져와 주세요.",
    }),
    contract: Object.freeze({
      success: false,
      errorCode: "sabangnet_contract_drift",
      error: "사방넷 목록 형식이 바뀌어 가져오기를 멈췄습니다.",
    }),
    totalChanged: Object.freeze({
      success: false,
      errorCode: "sabangnet_total_changed",
      error: "읽는 사이 사방넷 송신 기록이 늘었습니다. 잠시 뒤 다시 가져와 주세요.",
    }),
    invalid: Object.freeze({
      success: false,
      errorCode: "sabangnet_invalid_snapshot",
      error: "사방넷 송신 기록이 올바르지 않아 저장하지 않았습니다.",
    }),
    timeout: Object.freeze({
      success: false,
      errorCode: "sabangnet_timeout",
      error: "사방넷 응답이 늦어 가져오기를 멈췄습니다.",
    }),
    network: Object.freeze({
      success: false,
      errorCode: "sabangnet_network_failed",
      error: "사방넷 송신 기록을 읽지 못했습니다.",
    }),
  });

  function safeLimit(value, fallback, maximum) {
    return Number.isInteger(value) && value >= 0 && value <= maximum ? value : fallback;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForTabReady(chromeApi, tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab?.status === "complete") return;
      await delay(100);
    }
    throw new Error("SABANGNET_TIMEOUT");
  }

  // 사방넷 관리자 탭 안에서 돈다. 세션 토큰은 이 함수 밖으로 나가지 않고, 목록 원문도
  // 넘기지 않는다 — 원문에는 몰 로그인 ID와 비밀번호 칸이 함께 온다.
  async function readSabangnetMallListings(plan, requestTimeoutMs, pageDelayMs) {
    const MAX_RESPONSE_CHARS = 20 * 1024 * 1024;
    const PAGE_LIMIT = 100;
    const ROW_LIMIT = 20_000;
    // vue-element-admin 의 토큰 오류 코드 — 잘못된 토큰 · 다른 곳 로그인 · 만료.
    const LOGIN_CODES = new Set([50008, 50012, 50014]);
    const failure = (errorCode, stage) => ({
      success: false,
      errorCode,
      ...(stage ? { stage } : {}),
    });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function text(value, maximum) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    function digits(value, maximum) {
      const normalized = text(value, maximum);
      return normalized && /^\d+$/.test(normalized) ? normalized : null;
    }
    function price(value) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
    }
    function sentAt(value) {
      const normalized = text(value, 20);
      return normalized && /^\d{8} \d{2}:\d{2}$/.test(normalized) ? normalized : null;
    }
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

    try {
      if (location.origin !== plan.sourceOrigin) return failure("sabangnet_login_required");
      const token = sessionToken();
      if (!token) return failure("sabangnet_login_required");
      const planned = new Set(plan.malls.flatMap((mall) => mall.sabangnetShopIds));
      // 사방넷 "쇼핑몰상품수정" 화면의 기본 검색 조건 그대로에 기간과 페이지만 바꾼다.
      const search = {
        shmaId: "",
        tbCmmlShmaCnctnAcntD: {},
        mode: "search",
        searchDateType: "PRD_REGS_FST_TRNM_DT",
        startDate: plan.dateFrom,
        endDate: plan.dateTo,
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
        pageSize: plan.pageSize,
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
      };

      async function readPage(currentPage) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const response = await fetch(plan.listPath, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
              Authorization: token,
            },
            body: JSON.stringify({ ...search, currentPage }),
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.status === 401 || response.status === 403 || response.redirected) {
            throw new Error("LOGIN_REQUIRED");
          }
          if (!response.ok) throw new Error("NETWORK_FAILED");
          const body = await response.text();
          if (body.length > MAX_RESPONSE_CHARS) throw new Error("INVALID_RESPONSE");
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            drift("json");
          }
          if (LOGIN_CODES.has(json?.code)) throw new Error("LOGIN_REQUIRED");
          if (json?.code !== 20000) drift("code");
          const total = Number(json?.data?.metaData?.total);
          if (!Number.isSafeInteger(total) || total < 0) drift("total");
          if (!Array.isArray(json?.data?.list)) drift("list");
          return { total, list: json.data.list };
        } finally {
          clearTimeout(timer);
        }
      }

      const seen = new Set();
      const rows = [];
      const skippedByShop = {};
      let missingMallCode = 0;
      let recordsRead = 0;
      let pagesRead = 0;
      let totalRecords = null;
      let totalPages = 1;

      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        if (currentPage > 1) await wait(pageDelayMs);
        const page = await readPage(currentPage);
        if (totalRecords === null) {
          totalRecords = page.total;
          if (totalRecords > ROW_LIMIT) return failure("sabangnet_invalid_snapshot", "row_limit");
          totalPages = Math.max(1, Math.ceil(totalRecords / plan.pageSize));
          if (totalPages > PAGE_LIMIT) return failure("sabangnet_invalid_snapshot", "page_limit");
        } else if (page.total !== totalRecords) {
          return failure("sabangnet_total_changed");
        }
        pagesRead += 1;
        let pageRecords = 0;
        for (const item of page.list) {
          if (!item || typeof item !== "object" || Array.isArray(item)) drift("row");
          // 기록마다 실패 이력 줄이 끼어 온다. 사방넷 화면도 이 줄은 고르지 않는다.
          if (item.type === "message" || item.type === "input") continue;
          const shopId = text(item.shmaId, 20);
          if (!shopId || !/^shop\d{4}$/.test(shopId)) drift("shop");
          const sendSerial = digits(item.prdRegsTrnmSrno, 30);
          if (!sendSerial) drift("send_serial");
          pageRecords += 1;
          if (seen.has(sendSerial)) continue;
          seen.add(sendSerial);
          recordsRead += 1;
          if (!planned.has(shopId)) {
            skippedByShop[shopId] = (skippedByShop[shopId] || 0) + 1;
            continue;
          }
          const mallProductCode = text(item.shmaPrdNo, 60);
          if (!mallProductCode) {
            missingMallCode += 1;
            continue;
          }
          const sabangnetProductNo = digits(item.prdNo, 30);
          const productName = text(item.prdNm, 400);
          const supplyStatus = text(item.prdSplyStsCdNm, 20);
          if (!sabangnetProductNo) drift("product_no");
          if (!productName) drift("product_name");
          if (!supplyStatus) drift("supply_status");
          rows.push({
            sendSerial,
            sabangnetShopId: shopId,
            mallProductCode,
            sabangnetProductNo,
            modelName: text(item.modlNm, 120),
            ownProductCode: text(item.onsfPrdCd, 120),
            productName,
            salePrice: price(item.sepr),
            supplyStatus,
            firstSentAt: sentAt(item.prdRegsFstTrnmDt),
          });
        }
        // 마지막 쪽이 아니면 꽉 차 있어야 한다. 서버가 페이지 크기를 줄였으면 목록을 믿지 않는다.
        const expected = currentPage < totalPages
          ? plan.pageSize
          : totalRecords - plan.pageSize * (totalPages - 1);
        if (pageRecords !== expected) drift("page_size");
      }

      rows.sort((left, right) =>
        left.sendSerial.length - right.sendSerial.length
        || (left.sendSerial < right.sendSerial ? -1 : left.sendSerial > right.sendSerial ? 1 : 0));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords,
            recordsRead,
            pagesRead,
            totalPages,
            truncated: false,
            skippedByShop,
            missingMallCode,
          },
          rows,
          proof: {
            dateFrom: plan.dateFrom,
            dateTo: plan.dateTo,
            pageSize: plan.pageSize,
            validatedList: true,
          },
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") return failure("sabangnet_timeout");
      if (error?.message === "LOGIN_REQUIRED") return failure("sabangnet_login_required");
      if (error?.message?.startsWith("CONTRACT_DRIFT:")) {
        return failure("sabangnet_contract_drift", error.message.slice("CONTRACT_DRIFT:".length, 160));
      }
      if (error?.message === "INVALID_RESPONSE") return failure("sabangnet_invalid_snapshot");
      return failure("sabangnet_network_failed");
    }
  }

  function publicFailure(errorCode, stage) {
    if (errorCode === "sabangnet_login_required") return { ...ERRORS.login };
    if (errorCode === "sabangnet_contract_drift") {
      return {
        ...ERRORS.contract,
        ...(stage ? { stage, error: `${ERRORS.contract.error} [${stage}]` } : {}),
      };
    }
    if (errorCode === "sabangnet_total_changed") return { ...ERRORS.totalChanged };
    if (errorCode === "sabangnet_invalid_snapshot") {
      return { ...ERRORS.invalid, ...(stage ? { stage } : {}) };
    }
    if (errorCode === "sabangnet_timeout") return { ...ERRORS.timeout };
    return { ...ERRORS.network };
  }

  async function assertCollectionActive(collection) {
    if (typeof collection?.assertActive !== "function") return;
    if ((await collection.assertActive()) === false) {
      const error = new Error("사방넷 가져오기가 취소되었습니다.");
      error.code = "COLLECTION_CANCELLED";
      throw error;
    }
  }

  function create(options) {
    const chromeApi = options.chrome;
    const tabReadyTimeoutMs = safeLimit(
      options.tabReadyTimeoutMs,
      DEFAULT_TAB_READY_TIMEOUT_MS,
      DEFAULT_TAB_READY_TIMEOUT_MS,
    );
    const requestTimeoutMs = safeLimit(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const pageDelayMs = safeLimit(options.pageDelayMs, DEFAULT_PAGE_DELAY_MS, 10_000);

    // 계획(plan)은 owner 가 서버에서 받아 검증한 것이다. 사방넷 주소도 계획이 정한다.
    async function collect(plan, collection) {
      if (plan?.sourceOrigin !== SOURCE_ORIGIN) return publicFailure("sabangnet_contract_drift", "origin");
      let tab = null;
      let attached = false;
      let keepOpen = false;
      try {
        await assertCollectionActive(collection);
        // 새 비활성 탭을 연다. 사장님이 열어 둔 사방넷 탭은 건드리지 않는다.
        tab = await chromeApi.tabs.create({ url: PAGE_URL, active: false });
        if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
          return publicFailure("sabangnet_network_failed");
        }
        const attachment = await collection.attachTab(tab, { owned: true });
        if (attachment === null || attachment === false) {
          const error = new Error("사방넷 가져오기가 취소되었습니다.");
          error.code = "COLLECTION_CANCELLED";
          throw error;
        }
        attached = true;
        await waitForTabReady(chromeApi, tab.id, tabReadyTimeoutMs);
        await assertCollectionActive(collection);
        const injected = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: readSabangnetMallListings,
          args: [plan, requestTimeoutMs, pageDelayMs],
        });
        await assertCollectionActive(collection);
        const result = injected?.[0]?.result;
        if (!result || result.success !== true) {
          const failure = publicFailure(result?.errorCode, result?.stage);
          // 로그인은 사람이 그 탭에서 한다.
          if (failure.errorCode === "sabangnet_login_required") keepOpen = true;
          return failure;
        }
        return { success: true, snapshot: result.snapshot };
      } catch (error) {
        if (error?.code === "COLLECTION_CANCELLED") {
          return {
            success: false,
            errorCode: "COLLECTION_CANCELLED",
            error: String(error.message || "사방넷 가져오기가 취소되었습니다."),
          };
        }
        return error?.message === "SABANGNET_TIMEOUT"
          ? publicFailure("sabangnet_timeout")
          : publicFailure("sabangnet_network_failed");
      } finally {
        if (attached && !keepOpen) {
          try {
            await collection.detachTab(tab, { owned: true });
          } catch {
            // 탭을 닫지 못해도 결과는 남긴다. 세션 정리가 탭을 다시 닫는다.
          }
        }
      }
    }

    return Object.freeze({ collect });
  }

  root.KidItemSabangnetMallListings = Object.freeze({ create, readSabangnetMallListings });
})(globalThis);
