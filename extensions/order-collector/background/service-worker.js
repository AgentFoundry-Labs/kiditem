const ICECREAM_MALL_URL = "https://po.i-screammall.co.kr/main.do";
const ICECREAM_MALL_TAB_MATCHES = [
  "https://*.i-screammall.co.kr/*",
  "https://*.i-screammedia.com/*",
  "https://*.i-screammedia.co.kr/*",
];
const SELLPIA_ORDER_UPLOAD_URL = "https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE";
const SELLPIA_TAB_MATCHES = ["https://*.sellpia.com/*"];
// 송장 재출력 = 송장 업로드용 송장번호 소스(송장 채번된 주문). scrape 가 이 페이지의 #search_date_type 을 읽으므로 이 URL 이어야 함.
const SELLPIA_REPRINT_URL = "https://kiditem.sellpia.com/order_delivery_reprint.html";
const COUPANG_SHIPMENT_URL = "https://supplier.coupang.com/ibs/asn/active";
const COUPANG_SUPPLIER_TAB_MATCHES = ["https://supplier.coupang.com/*"];
const COUPANG_PO_LIST_URL = "https://supplier.coupang.com/po-web/purchase/order/list";
const KIDSNOTE_ORDER_URL = "https://shop.kidsnote.com/_manage/?body=3010";
const KIDSNOTE_TAB_MATCHES = ["https://shop.kidsnote.com/*"];
// 꼬망세(EduPre) 입점관리자 전체주문 (listmaxcount 크게 = 검색결과 전부)
const KKOMANGSE_ORDER_URL =
  "https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000";
const KKOMANGSE_TAB_MATCHES = ["https://nstore.edupre.co.kr/*"];
// 온채널 입점관리자 전체주문 (리스트 스크랩 + 주문별 상세모달 fetch)
const ONCHANNEL_ORDER_URL = "https://www.onch3.co.kr/supplier/orders.php?state=all";
const ONCHANNEL_TAB_MATCHES = ["https://www.onch3.co.kr/*"];
// 키드키즈 파트너센터 출고관리 (목록 logis_index + 주문서 logis_down5 스크랩)
// ⚠️미로그인 시 management.htm → partner.kidkids.net/partnerLogin.htm → www.kidkids.net/join/partner_login.htm
// 로 리다이렉트된다. 즉 로그인 폼은 www.kidkids.net 에 있으므로 자동 로그인(executeScript)에는
// manifest host_permissions 에 https://www.kidkids.net/* 가 반드시 있어야 한다(없으면 주입 실패=로그인 불가).
const KIDKIDS_ORDER_URL = "https://partner.kidkids.net/new/pages/logis/management.htm";
const KIDKIDS_TAB_MATCHES = ["https://partner.kidkids.net/*"];
const LOTTEON_ORDER_URL = "https://store.lotteon.com/cm/main/index_SO.wsp";
const LOTTEON_TAB_MATCHES = ["https://store.lotteon.com/*"];
const GSSHOP_ORDER_URL = "https://partners.gsshop.com/logistics/partner-logistics-mng";
const GSSHOP_TAB_MATCHES = ["https://partners.gsshop.com/*"];
const ALWAYZ_ORDER_URL = "https://alwayzseller.ilevit.com/shippings";
const ALWAYZ_TAB_MATCHES = ["https://alwayzseller.ilevit.com/*"];
const KAKAO_ORDER_URL = "https://shopping-seller.kakao.com/order/seller/store-order/integrate/list";
const KAKAO_TAB_MATCHES = ["https://shopping-seller.kakao.com/*"];
// 보리보리/하프클럽 협력사(TRICYCLE seller-club) 주문/배송관리
const BORIBORI_ORDER_URL = "https://seller-club.co.kr/order/orderDeliList";
const BORIBORI_TAB_MATCHES = ["https://seller-club.co.kr/*"];
const BORIBORI_ORDER_TAB_MATCHES = ["https://seller-club.co.kr/order/orderDeliList*"];

// 티쳐몰(퍼스트몰 selleradmin) 입점사배송 주문상품 리스트
const TEACHERVILLE_ORDER_URL = "https://shop.teacherville.co.kr/selleradmin/order/catalog";
const TEACHERVILLE_TAB_MATCHES = ["https://shop.teacherville.co.kr/*"];
const ART09_ORDER_URL = "https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1";
const ART09_TAB_MATCHES = ["https://zzogzzog1.cafe24.com/*"];
const ICECREAM_DELIVERY_HEADERS = [
  "No",
  "주문번호",
  "배송번호",
  "사이트",
  "주문완료일시",
  "주문구분",
  "주문내역구분",
  "주문내역상태",
  "배송유형",
  "배송종류",
  "배송처리유형",
  "택배사",
  "송장번호",
  "배송조회",
  "주문판매유형",
  "거래명세서동봉여부",
  "합배송여부",
  "직배변경 사유",
  "상품번호",
  "상품명",
  "단품명",
  "출고수량",
  "추가입력옵션",
  "증정품",
  "정상가",
  "판매가",
  "판매가(합계)",
  "공급가",
  "공급가(합계)",
  "배송비",
  "Y주문번호",
  "입점사",
  "회원ID",
  "주문자",
  "수취인",
  "수취인휴대폰번호",
  "우편번호",
  "배송지",
  "배송요청사항",
  "배송지시일시",
  "출고지시일시",
  "출고완료일시",
];

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        orderCollectionIcecreamMall: true,
        coupangShipmentDownloads: true,
        art09Orders: true,
        boriboriOrders: true,
        collectRocketPoRows: true,
        listRocketPos: true,
        collectCoupangProducts: true,
        openCoupangLogin: true,
        collectKakaoOrders: true,
        collectSellpiaDeliTracking: true,
        uploadDomeggookTracking: true,
        uploadOnchTracking: true,
        testRocketSourcing: true,
      },
    });
    return false;
  }

  if (msg?.action === "testRocketSourcing") {
    testRocketSourcing(Array.isArray(msg.vendorItemIds) ? msg.vendorItemIds : [])
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "로켓 불러오기 테스트 실패" });
      });
    return true;
  }

  if (msg?.action === "collectSellpiaDeliTracking") {
    collectSellpiaDeliTracking({
      startDate: typeof msg.startDate === "string" ? msg.startDate : null,
      endDate: typeof msg.endDate === "string" ? msg.endDate : null,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "셀피아 송장 조회 실패" });
      });
    return true;
  }

  if (msg?.action === "collectIcecreamMallOrders") {
    collectIcecreamMallOrders(
      typeof msg.date === "string" ? msg.date : null,
      normalizeIcecreamMallCredentials(msg.credentials),
    )
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "아이스크림몰 주문 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "sendOrderFileToSellpia") {
    sendOrderFileToSellpia({
      shopName: typeof msg.shopName === "string" ? msg.shopName : null,
      fileName: typeof msg.fileName === "string" ? msg.fileName : null,
      fileBase64: typeof msg.fileBase64 === "string" ? msg.fileBase64 : null,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "셀피아 전송 실패",
        });
      });
    return true;
  }

  if (msg?.action === "openCoupangShipmentPage") {
    openCoupangShipmentPage()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 화면 열기 실패",
        });
      });
    return true;
  }

  if (msg?.action === "openCoupangLogin") {
    openCoupangLoginPage()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 로그인창 열기 실패",
        });
      });
    return true;
  }

  if (msg?.action === "clickCoupangShipmentDownloads") {
    clickCoupangShipmentDownloads({
      date: typeof msg.date === "string" ? msg.date : null,
      labels: msg.labels !== false,
      statements: msg.statements !== false,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 쉽먼트 다운로드 실행 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectRocketPoRows") {
    collectRocketPoRows({
      from: typeof msg.from === "string" ? msg.from : null,
      to: typeof msg.to === "string" ? msg.to : null,
      status: typeof msg.status === "string" ? msg.status : "",
      dateType: typeof msg.dateType === "string" ? msg.dateType : "",
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "로켓 발주 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "listRocketPos") {
    listRocketPos({
      from: typeof msg.from === "string" ? msg.from : null,
      to: typeof msg.to === "string" ? msg.to : null,
      status: typeof msg.status === "string" ? msg.status : "",
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "로켓 발주 목록 조회 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectCoupangProducts") {
    collectCoupangProducts()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "쿠팡 상품목록 조회 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectKidsnoteOrders") {
    collectKidsnoteOrders({
      from: typeof msg.from === "string" ? msg.from : null,
      to: typeof msg.to === "string" ? msg.to : null,
      status: typeof msg.status === "string" ? msg.status : "",
      withDetail: msg.withDetail === true,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "키즈노트 주문 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "collectKkomangseOrders") {
    collectKkomangseOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "꼬망세 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectOnchannelOrders") {
    collectOnchannelOrders(msg.date)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "온채널 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "uploadOnchTracking") {
    uploadOnchTracking({ rows: Array.isArray(msg.rows) ? msg.rows : [] })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "온채널 송장 업로드 실패" });
      });
    return true;
  }

  if (msg?.action === "collectDomeggookOrders") {
    collectDomeggookOrders(msg.date)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "도매꾹 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "uploadDomeggookTracking") {
    uploadDomeggookTracking({
      fileBase64: typeof msg.fileBase64 === "string" ? msg.fileBase64 : "",
      fileName: typeof msg.fileName === "string" ? msg.fileName : "도매꾹_송장.xls",
      orderNos: Array.isArray(msg.orderNos) ? msg.orderNos : [],
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "도매꾹 송장 업로드 실패" });
      });
    return true;
  }

  if (msg?.action === "ensureMallLoggedIn") {
    ensureMallLoggedIn(msg.mallKey, msg.credentials)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "자동 로그인 실패" });
      });
    return true;
  }

  if (msg?.action === "collectKidkidsOrders") {
    collectKidkidsOrders(msg.date)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "키드키즈 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectLotteonOrders") {
    collectLotteonOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "롯데ON 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectGsshopOrders") {
    collectGsshopOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "GS샵 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectAlwayzOrders") {
    collectAlwayzOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "올웨이즈 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectKakaoOrders") {
    collectKakaoOrders(msg.date)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "카카오 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectBoriboriOrders") {
    collectBoriboriOrders({
      password: typeof msg.password === "string" ? msg.password : "",
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "보리보리 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectTeachervilleOrders") {
    collectTeachervilleOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "티쳐몰 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectArt09Orders") {
    collectArt09Orders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "아트공구 주문 수집 실패" });
      });
    return true;
  }

  if (msg?.action === "collectCoupangDirectOrders") {
    collectCoupangDirectOrders()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "쿠팡직배송 주문 수집 실패" });
      });
    return true;
  }

  return false;
});

function normalizeIcecreamMallCredentials(value) {
  if (!value || typeof value !== "object") return null;
  const loginId = typeof value.loginId === "string" ? value.loginId.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (!loginId || !password) return null;
  return { loginId, password };
}

// ── 공통: 몰 미로그인 / 페이지 접근불가 에러 처리 ──
// 미로그인 상태로 수집하면 백그라운드 탭이 로그인 페이지로 리다이렉트되고, 그 순간 executeScript 는
// "Cannot access contents of the page" 또는 "Frame with ID 0 was removed" 같은 크롬 날것 에러를 던진다.
// 이런 에러는 사실상 "로그인 필요"라서, 사용자용 메시지로 바꾸고 로그인 탭을 앞으로 띄운다.
function isMallAccessError(err) {
  const m = String((err && err.message) || err || "").toLowerCase();
  return (
    m.includes("cannot access contents") ||
    m.includes("frame with id") ||
    m.includes("no frame with id") ||
    m.includes("frame was removed") ||
    m.includes("cannot access a chrome") ||
    m.includes("cannot be scripted") ||
    m.includes("must request permission") ||
    m.includes("receiving end does not exist") ||
    m.includes("no tab with id")
  );
}

// 로그인 안내 탭을 해당 창에서 활성 탭으로 만든다(사용자가 찾아 로그인할 수 있게).
// ⚠️전체 수집 때 미로그인 몰마다 창 포커스를 뺏으면 산만하므로, 창 raise(windows.update focused)는
// 하지 않고 탭만 active 로 둔다. 사용자는 Chrome 을 볼 때 로그인 탭을 바로 발견한다.
async function bringMallTabToFront(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    /* 탭 활성화 실패 — 무시 */
  }
}

// 페이지 접근불가(=대체로 미로그인) 안내 결과. pendingLogin=true 로 프론트가 "로그인 필요"로 표시.
function mallAccessErrorResult(mallName) {
  return {
    success: false,
    pendingLogin: true,
    error:
      `${mallName} 로그인이 필요합니다. ${mallName}에 로그인되어 있는지 확인하세요. ` +
      `방금 열린 ${mallName} 탭에서 로그인한 뒤 다시 '수집하기'를 눌러주세요.`,
  };
}

// 그 외(타임아웃·스크립트 예외 등)는 원문 오류 내용을 몰 이름과 함께 그대로 노출.
function mallGenericErrorResult(mallName, err) {
  return { success: false, error: `${mallName} 수집 오류: ${String((err && err.message) || err)}` };
}

// ── 셀피아 전송 (API 아님 — order_collect 화면에 판매처 선택 + 파일 주입 + 주문접수 클릭) ──
async function sendOrderFileToSellpia({ shopName, fileName, fileBase64 }) {
  if (!fileBase64 || !fileName) {
    return { success: false, error: "셀피아로 보낼 파일이 없습니다." };
  }

  const tab = await findOrCreateSellpiaTab();
  if (!tab.id) {
    return { success: false, error: "셀피아 탭을 열 수 없습니다." };
  }

  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectSellpiaOrderFile,
      args: [{ shopName: shopName || null, fileName, fileBase64 }],
    }),
    45000,
    "셀피아 주문접수 화면 주입 시간이 초과되었습니다.",
  );

  const result = injected[0]?.result ?? {
    success: false,
    error: "셀피아 주문접수 화면에 접근하지 못했습니다.",
  };
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return { ...result, url: currentTab.url || tab.url || SELLPIA_ORDER_UPLOAD_URL };
}

async function findOrCreateSellpiaTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onUploadPage = tabs.find((tab) => (tab.url || "").includes("order_collect.html"));
  if (onUploadPage?.id) {
    await chrome.tabs.update(onUploadPage.id, { active: true });
    return onUploadPage;
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: SELLPIA_ORDER_UPLOAD_URL, active: true });
    return chrome.tabs.get(tabs[0].id);
  }
  return chrome.tabs.create({ url: SELLPIA_ORDER_UPLOAD_URL, active: true });
}

// ── 셀피아 송장 재출력 조회 = 송장 업로드용 송장번호 소스 ──
// scrape 가 #search_date_type 을 읽으므로 반드시 송장재출력 페이지 탭이어야 함. 이미 열려 있으면 재사용, 없으면 백그라운드 생성.
async function findOrCreateSellpiaReprintTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onReprint = tabs.find((t) => (t.url || "").includes("order_delivery_reprint"));
  if (onReprint?.id) return { tab: onReprint, created: false };
  const tab = await chrome.tabs.create({ url: SELLPIA_REPRINT_URL, active: false });
  return { tab, created: true };
}

async function collectSellpiaDeliTracking(options = {}) {
  const { tab, created } = await findOrCreateSellpiaReprintTab();
  if (!tab?.id) return { success: false, error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트 fetch (로그인 세션 쿠키). ISOLATED 는 SameSite 쿠키 미전송 위험.
        func: scrapeSellpiaDeliTracking,
        args: [options.startDate || null, options.endDate || null],
      }),
      60000,
      "셀피아 송장 조회 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "셀피아 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { await bringMallTabToFront(tab.id); return mallAccessErrorResult("셀피아"); }
    return mallGenericErrorResult("셀피아", e);
  } finally {
    if (created && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// kiditem.sellpia.com 페이지 컨텍스트: "송장 재출력" 목록 조회 → 송장 매핑 행 반환.
// ⭐송장은 배송완료목록(deli_list)이 아니라 송장 재출력(송장 채번된 주문)에 있다. delivery_link.action.html
//   domode=GET_ORDER_DELIVERY_REPRINT_LIST → rdata.list. 원주문번호=ship_info.ord_no(= group_no 밑줄 뒤).
//   delicom=셀피아 택배사코드(예 1136=CJ). 반환: ordNo · invNo(송장) · courier(택배사코드) · provider(판매처).
async function scrapeSellpiaDeliTracking(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const end = endDate || `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const s0 = new Date(d.getTime() - 30 * 24 * 60 * 60 * 1000); // 기본 최근 30일
    const start = startDate || `${s0.getFullYear()}-${p(s0.getMonth() + 1)}-${p(s0.getDate())}`;
    const dateType = (document.getElementById("search_date_type") || {}).value || "";
    const body = new URLSearchParams({
      domode: "GET_ORDER_DELIVERY_REPRINT_LIST",
      date_type: dateType, // 송장출력일자/송장번호채번일자/피킹일자 (기본값 사용)
      s_date: start,
      e_date: end,
      delinum: "",
      receiver: "",
      onlydeli_sellpia_code: "",
      pick_num: "",
    });
    const res = await fetch("delivery_link.action.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) {
      return { success: false, error: "셀피아 송장 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요." };
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: "셀피아 송장 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요." };
    }
    const list = Array.isArray(data && data.list) ? data.list : [];
    const s2 = (v) => String(v == null ? "" : v).trim();
    // ⭐전 몰 반환(판매처 필터는 프론트가 몰별로). 각 몰 송장 업로드가 이 소스를 공유한다.
    const rows = list
      .map((o) => {
        const si = o.ship_info || {};
        const ordNo = s2(si.ord_no || String(o.group_no || "").split("_").pop() || "");
        return {
          ordNo,
          itemNo: "",
          invNo: s2(o.delinum),
          courier: s2(o.delicom), // 셀피아 택배사코드(예 1136=CJ)
          provider: s2(si.provider_name || o.receiver), // 판매처명 (몰 매핑용)
          receiver: s2(o.receiver).replace(/\([^)]*\)\s*$/, "").trim(), // 수취인 (몰명 괄호 제거)
          post: s2(o.receiver_post),
          addr: [s2(o.receiver_addr1), s2(o.receiver_addr2)].filter(Boolean).join(" "),
        };
      })
      .filter((r) => r.ordNo && r.invNo);
    return { success: true, rows, total: list.length, range: { start, end } };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function openCoupangShipmentPage() {
  const tab = await findOrCreateCoupangSupplierTab();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return {
    success: true,
    tabId: tab.id,
    url: currentTab.url || tab.url || COUPANG_SHIPMENT_URL,
  };
}

// 로그아웃 상태에서 프론트가 호출 — supplier.coupang.com 탭을 앞으로(active) 가져와 사용자가 직접 로그인하게 한다.
// ⭐자동 로그인/비번 저장은 안 한다(쿠팡 봇탐지·캡차·본계정 잠김 위험). 한번 로그인하면 세션 쿠키로 유지됨.
async function openCoupangLoginPage() {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  const tab = tabs[0]?.id
    ? await chrome.tabs.update(tabs[0].id, { active: true })
    : await chrome.tabs.create({ url: "https://supplier.coupang.com/", active: true });
  if (tab && tab.windowId != null) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      /* 창 포커스 실패 — 무시 */
    }
  }
  return { success: true, tabId: tab?.id };
}

async function clickCoupangShipmentDownloads(options) {
  const tab = await findOrCreateCoupangSupplierTab();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickCoupangShipmentDownloadButtons,
      args: [options],
    }),
    90000,
    "쿠팡 쉽먼트 다운로드 버튼 실행 시간이 초과되었습니다.",
  );

  const result = injected[0]?.result ?? {
    success: false,
    error: "쿠팡 쉽먼트 화면에 접근하지 못했습니다.",
  };
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return {
    ...result,
    url: currentTab.url || tab.url || COUPANG_SHIPMENT_URL,
  };
}

// ── 로켓 발주확정: 발주리스트(거래처확인요청) + 상세를 풀컬럼 스크래핑 ──
async function collectRocketPoRows({ from, to, status, dateType }) {
  const tab = await findCoupangSupplierTabBg();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);

    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeRocketPoRows,
        args: [from, to, status || "RP", dateType || "WAREHOUSING_PLAN_DATE"],
      }),
      180000,
      "로켓 발주 수집 시간이 초과되었습니다.",
    );

    return (
      injected[0]?.result ?? {
        success: false,
        error: "supplier 화면에 접근하지 못했습니다.",
      }
    );
  } catch (e) {
    // 미로그인 → supplier 탭이 로그인 페이지로 리다이렉트되면 executeScript 가 host 권한 에러("must
    // request permission"/"Cannot access contents")를 던진다. 로그인 안내로 바꾸고 탭을 앞으로.
    if (isMallAccessError(e)) {
      await bringMallTabToFront(tab.id);
      return mallAccessErrorResult("쿠팡 supplier");
    }
    return mallGenericErrorResult("로켓 발주 수집", e);
  }
}

// ── 로켓 발주 목록(PO 단위, SKU 상세 없이) — 화면 리스트용 빠른 조회 ──
async function listRocketPos({ from, to, status }) {
  const tab = await findCoupangSupplierTabBg();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);

    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeRocketPoList,
        args: [from, to, status || ""],
      }),
      60000,
      "로켓 발주 목록 조회 시간이 초과되었습니다.",
    );

    return (
      injected[0]?.result ?? {
        success: false,
        error: "supplier 화면에 접근하지 못했습니다.",
      }
    );
  } catch (e) {
    // 미로그인 → supplier 탭이 로그인 페이지로 리다이렉트되면 executeScript 가 host 권한 에러("must
    // request permission"/"Cannot access contents")를 던진다. 로그인 안내로 바꾸고 탭을 앞으로.
    if (isMallAccessError(e)) {
      await bringMallTabToFront(tab.id);
      return mallAccessErrorResult("쿠팡 supplier");
    }
    return mallGenericErrorResult("로켓 발주 목록", e);
  }
}

// supplier 페이지 컨텍스트: 입고예정일(WAREHOUSING_PLAN_DATE) 범위의 발주를 PO 단위로만 빠르게.
async function scrapeRocketPoList(from, to, statusCode) {
  try {
    const clean = (s, n) =>
      (s || "").replace(new RegExp("[\\u0000-\\u001F]", "g"), " ").trim().slice(0, n || 60);
    // expectedDeliveryDate 는 UTC(예: 06-30T15:00Z = KST 07-01). KST 날짜로 변환해서 입고예정일로 사용.
    const kstDate = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0, 10);
      d.setUTCHours(d.getUTCHours() + 9);
      return d.toISOString().slice(0, 10);
    };
    const listUrl = (p) =>
      "/po-web/app/purchase-order/list?page=" + p +
      "&searchDateType=WAREHOUSING_PLAN_DATE&searchStartDate=" + (from || "") + "&searchEndDate=" + (to || "") +
      "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=" + (statusCode || "") +
      "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";
    const out = [];
    for (let p = 1; p <= 20; p++) {
      const res = await fetch(listUrl(p), { credentials: "include", headers: { accept: "application/json" } });
      const text = await res.text();
      if (!res.ok || text.trim().charAt(0) === "<") {
        if (p === 1)
          return {
            success: false,
            pendingLogin: true,
            error: "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.",
          };
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (p === 1) return { success: false, error: "발주리스트 응답을 해석하지 못했습니다 (supplier 로그인/세션 확인)." };
        break;
      }
      const b = j.body || {};
      const rows = b.body || [];
      for (const o of rows) {
        // 서버가 입고예정일(WAREHOUSING_PLAN_DATE)+상태로 이미 필터함. eta/orderedAt 은 KST 날짜.
        out.push({
          poSeq: o.purchaseOrderSeq,
          orderedAt: kstDate(o.createdAt),
          eta: kstDate(o.expectedDeliveryDate),
          status: o.purchaseOrderStatusDescription || "",
          vendorName: o.vendorName || "",
          centerName: o.centerName || "",
          inboundType: o.transportTypeDescription || "",
          firstSkuName: clean(o.firstSkuName, 60),
          skuCount: o.skuCount || 0,
          orderQty: o.sumOfOrderQty || 0,
          orderAmount: o.sumOfOrderAmount || 0,
        });
      }
      if (p >= (b.lastPageNumber || 1)) break;
    }
    return { success: true, pos: out };
  } catch (e) {
    return { success: false, error: (e && e.message) || "로켓 발주 목록 조회 실패" };
  }
}

// 쿠팡 supplier 상품(SKU) 목록 수집 — 발주 리스트와 동일 패턴(supplier 탭 same-origin fetch).
// supplier.coupang.com: 각 vendorItemId 를 /sr/sourcing/api/3p-product/{id} 로 조회해
// 로켓 "등록된 상품 불러오기" 가능여부(200+productName)를 테스트한다. 등록상품ID(vendorInventoryId)는 500이라
// 반드시 옵션ID(vendorItemId)를 넘겨야 한다.
async function testRocketSourcing(vendorItemIds) {
  const ids = (Array.isArray(vendorItemIds) ? vendorItemIds : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (ids.length === 0) return { success: true, results: [], okCount: 0, failCount: 0 };

  const tab = await findCoupangSupplierTabBg();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (idList) => {
          const results = [];
          const chunk = 8;
          for (let i = 0; i < idList.length; i += chunk) {
            const batch = idList.slice(i, i + chunk);
            const part = await Promise.all(
              batch.map(async (id) => {
                try {
                  const res = await fetch("/sr/sourcing/api/3p-product/" + encodeURIComponent(id), {
                    credentials: "include",
                  });
                  if (res.status === 401 || res.status === 403) {
                    return { vendorItemId: id, ok: false, status: res.status, loginRequired: true };
                  }
                  const text = await res.text();
                  let productName = null;
                  let productId = null;
                  let reason = "";
                  try {
                    const j = JSON.parse(text);
                    productName = j.productName || null;
                    productId = j.productId != null ? String(j.productId) : null;
                    reason = j.errorMessage || j.errorCode || "";
                  } catch (e) {
                    /* non-json */
                  }
                  return {
                    vendorItemId: id,
                    ok: res.status === 200 && !!productName,
                    status: res.status,
                    productName,
                    productId,
                    reason: (reason || "").slice(0, 80),
                  };
                } catch (e) {
                  return {
                    vendorItemId: id,
                    ok: false,
                    status: 0,
                    reason: (e && e.message ? e.message : String(e)).slice(0, 80),
                  };
                }
              }),
            );
            results.push(...part);
          }
          const anyLogin = results.some((r) => r.loginRequired);
          if (anyLogin && results.every((r) => !r.ok)) {
            return {
              success: false,
              pendingLogin: true,
              error: "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.",
            };
          }
          return {
            success: true,
            results,
            okCount: results.filter((r) => r.ok).length,
            failCount: results.filter((r) => !r.ok).length,
          };
        },
        args: [ids],
      }),
      180000,
      "로켓 불러오기 테스트 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "supplier 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) {
      await bringMallTabToFront(tab.id);
      return mallAccessErrorResult("쿠팡 supplier");
    }
    return mallGenericErrorResult("로켓 불러오기 테스트", e);
  } finally {
    clearInterval(keepAlive);
  }
}

async function collectCoupangProducts() {
  const tab = await findCoupangSupplierTabBg();
  if (!tab.id) return { success: false, error: "쿠팡 supplier 탭을 열 수 없습니다." };
  // vendorSearch 페이지네이션(+페이지 텀)으로 길다. MV3 서비스워커 유휴 종료(=message port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeCoupangProducts,
      }),
      160000,
      "쿠팡 상품목록 조회 시간이 초과되었습니다.",
    );
    return (
      injected[0]?.result ?? {
        success: false,
        error: "supplier 화면에 접근하지 못했습니다.",
      }
    );
  } catch (e) {
    if (isMallAccessError(e)) {
      await bringMallTabToFront(tab.id);
      return mallAccessErrorResult("쿠팡 supplier");
    }
    return mallGenericErrorResult("쿠팡 상품목록", e);
  } finally {
    clearInterval(keepAlive);
  }
}

// supplier 페이지 컨텍스트: /qvt/v2/wims/vendorSearch 를 페이지네이션하며 전체 상품(바코드·상품명·skuId) 수집.
// registerDate 기준 필터라 전체를 받기 위해 넓은 범위(2018 ~ 내일)로 조회한다.
async function scrapeCoupangProducts() {
  try {
    const clean = (s, n) =>
      (s || "").replace(new RegExp("[\\u0000-\\u001F]", "g"), " ").replace(/\s+/g, " ").trim().slice(0, n || 200);
    const startDate = String(Date.UTC(2018, 0, 1));
    const endDate = String(Date.now() + 86400000);
    const body = (page) => ({
      startDate,
      endDate,
      conditions: {
        vendorId: "", state: "", skuId: "", sourcingChannelId: "",
        quotationId: "", estimationId: "", progress: "",
        productName: "", categoryCode: "", barcode: "", isReplyNeeded: false,
      },
      page,
      sizePerPage: 50,
    });
    const out = [];
    const seen = new Set();
    for (let p = 1; p <= 200; p++) {
      // 페이지 간 텀 — 쿠팡 봇탐지(Akamai) 완화. 첫 페이지는 지연 없음.
      if (p > 1) await new Promise((r) => setTimeout(r, 400));
      const res = await fetch("/qvt/v2/wims/vendorSearch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body(p)),
      });
      const text = await res.text();
      if (!res.ok || text.trim().charAt(0) === "<") {
        if (p === 1)
          return {
            success: false,
            pendingLogin: true,
            error: "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.",
          };
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (p === 1) return { success: false, error: "상품목록 응답을 해석하지 못했습니다 (supplier 로그인/세션 확인)." };
        break;
      }
      const items = (j && j.items) || [];
      for (const it of items) {
        const barcode = String(it.barcode || "").trim();
        const key = barcode || String(it.skuId || "") || String(it.vendorItemId || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          barcode,
          productName: clean(it.productName, 200),
          skuId: String(it.skuId || ""),
          vendorItemId: String(it.vendorItemId || ""),
          state: String(it.state || ""),
        });
      }
      const nav = (j && j.pageNavigator) || {};
      if (!items.length || p >= (nav.totalPages || 1)) break;
    }
    return { success: true, products: out };
  } catch (e) {
    return { success: false, error: (e && e.message) || "쿠팡 상품목록 조회 실패" };
  }
}

// supplier.coupang.com 페이지 컨텍스트에서 실행 (DOMParser + same-origin fetch + 쿠키).
async function scrapeRocketPoRows(from, to, statusCode, dateType) {
  try {
    const ctrl = new RegExp("[\\u0000-\\u001F]", "g");
    const clean = (s, n) => (s || "").replace(ctrl, " ").replace(/^\d{8,}\s*/, "").trim().slice(0, n || 80);
    const num = (s) => Number(String(s == null ? "" : s).replace(/[^0-9.-]/g, "")) || 0;
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    // expectedDeliveryDate/createdAt 는 UTC → KST 변환.
    const kstDate = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0, 10);
      d.setUTCHours(d.getUTCHours() + 9);
      return d.toISOString().slice(0, 10);
    };
    const kstDateTime = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).replace("T", " ").slice(0, 19);
      d.setUTCHours(d.getUTCHours() + 9);
      return d.toISOString().replace("T", " ").slice(0, 19);
    };
    // from/to = 날짜 범위. 기본은 발주확정 양식 화면용 입고예정일, 매출 동기화는 발주일.
    const poStatusCode = statusCode || "RP";
    const searchDateType = dateType || "WAREHOUSING_PLAN_DATE";
    const useOrderedAtBusinessDate = searchDateType === "PURCHASE_ORDER_DATE";
    const isConfirmedPo = (po) => {
      const status = String(po.purchaseOrderStatus || po.purchaseOrderStatusCode || "").replace(/\s+/g, "").toUpperCase();
      const statusText = String(po.purchaseOrderStatusDescription || po.purchaseOrderStatusName || "").replace(/\s+/g, "");
      return status === "PA" || statusText.includes("발주확정");
    };
    const listUrl = (p) =>
      "/po-web/app/purchase-order/list?page=" + p +
      "&searchDateType=" + encodeURIComponent(searchDateType) +
      "&searchStartDate=" + (from || "") + "&searchEndDate=" + (to || "") +
      "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=" + encodeURIComponent(poStatusCode) +
      "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";

    const pos = [];
    for (let p = 1; p <= 40; p++) {
      const res = await fetch(listUrl(p), { credentials: "include", headers: { accept: "application/json" } });
      const text = await res.text();
      if (!res.ok || text.trim().charAt(0) === "<") {
        if (p === 1)
          return {
            success: false,
            pendingLogin: true,
            error:
              "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요. (발주리스트가 JSON 대신 로그인 페이지를 반환했습니다)",
          };
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (p === 1) return { success: false, error: "발주리스트 응답을 해석하지 못했습니다 (supplier 로그인/세션 확인)." };
        break;
      }
      const b = j.body || {};
      const rows = b.body || [];
      for (const o of rows) {
        // 서버가 발주현황 + 날짜 범위로 이미 필터함.
        if (useOrderedAtBusinessDate && !isConfirmedPo(o)) continue;
        pos.push(o);
      }
      if (p >= (b.lastPageNumber || 1)) break;
    }
    if (pos.length === 0) return { success: true, rows: [], poCount: 0 };

    const out = [];
    const parseDetail = async (po) => {
      try {
        const html = await (await fetch("/scm/purchase/order/get/" + po.purchaseOrderSeq, { credentials: "include" })).text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const tabs = Array.from(doc.querySelectorAll("table"));
        const rt = tabs.find((t) => /회송\s*담당자/.test(t.textContent) && /회송지/.test(t.textContent));
        const rtRow = rt && rt.rows[1] ? Array.from(rt.rows[1].cells).map((c) => norm(c.textContent)) : ["", "", ""];
        const st = tabs.find((t) => /상품\s*번호/.test(t.textContent) && /발주금액/.test(t.textContent));
        const skus = st
          ? Array.from(st.rows)
              .map((r) => Array.from(r.cells).map((c) => norm(c.textContent)))
              .filter((r) => /^\d+$/.test(r[0]) && r.length > 9)
          : [];
        for (const r of skus) {
          out.push({
            poNumber: String(po.purchaseOrderSeq),
            center: po.centerName || "",
            inboundType: po.transportTypeDescription || "",
            poStatus: po.purchaseOrderStatusDescription || "",
            poStatusCode: po.purchaseOrderStatus || po.purchaseOrderStatusCode || "",
            vendorName: po.vendorName || "",
            productNo: r[1] || "",
            barcode: (String(r[2]).match(/^\d{8,}/) || [""])[0],
            productName: clean(r[2], 80),
            orderQty: num(r[4]),
            returnManager: rtRow[0] || "",
            returnContact: rtRow[1] || "",
            returnAddress: rtRow[2] || "",
            purchasePrice: num(r[6]),
            supplyPrice: num(r[7]),
            vat: num(r[8]),
            totalPurchase: num(r[9]),
            expectedInboundDate: kstDate(po.expectedDeliveryDate).replace(/-/g, ""),
            poRegisteredAt: kstDateTime(po.createdAt),
            businessDateBasis: useOrderedAtBusinessDate ? "ordered_at" : "expected_inbound",
            xdock: "N",
          });
        }
      } catch (e) {
        /* skip this PO */
      }
    };

    for (let i = 0; i < pos.length; i += 5) {
      await Promise.all(pos.slice(i, i + 5).map(parseDetail));
    }
    return { success: true, rows: out, poCount: pos.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function findOrCreateCoupangSupplierTab() {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  const shipmentTab = tabs.find((tab) => (tab.url || "").includes("/ibs/asn/active"));
  if (shipmentTab?.id) {
    await chrome.tabs.update(shipmentTab.id, { active: true });
    return shipmentTab;
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: COUPANG_SHIPMENT_URL, active: true });
    return chrome.tabs.get(tabs[0].id);
  }
  return chrome.tabs.create({ url: COUPANG_SHIPMENT_URL, active: true });
}

// PO/상품 수집용 — same-origin fetch 만 하면 되므로 기존 supplier 탭을 앞으로 가져오거나 이동하지 않는다.
// (findOrCreateCoupangSupplierTab 는 쉽먼트 페이지로 이동+active:true 라 사용자 화면이 쿠팡으로 넘어감. 수집은 백그라운드.)
async function findCoupangSupplierTabBg() {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  if (tabs[0]?.id) return tabs[0]; // 기존 supplier 탭 그대로 사용 — 활성화/이동 안 함(화면 안 넘어감)
  return chrome.tabs.create({ url: "https://supplier.coupang.com/", active: false }); // 없으면 백그라운드 새 탭
}

// ── 꼬망세(EduPre) 주문 수집: 입점관리자 "선택엑셀다운"(get_search_excel) xlsx export 를 fetch ──
async function findOrCreateKkomangseTab() {
  const tabs = await chrome.tabs.query({ url: KKOMANGSE_TAB_MATCHES });
  const listTab = tabs.find((tab) => (tab.url || "").includes("_order_product.list"));
  if (listTab?.id) {
    await chrome.tabs.update(listTab.id, { url: KKOMANGSE_ORDER_URL }); // 검색 파라미터 보장 (백그라운드)
    return { tab: await chrome.tabs.get(listTab.id), created: false };
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KKOMANGSE_ORDER_URL });
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KKOMANGSE_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKkomangseOrders() {
  const { tab, created } = await findOrCreateKkomangseTab();
  if (!tab?.id) return { success: false, error: "꼬망세(nstore.edupre.co.kr) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeKkomangseExport }),
      90000,
      "꼬망세 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "꼬망세 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("꼬망세"); }
    return mallGenericErrorResult("꼬망세", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// nstore.edupre.co.kr 페이지 컨텍스트: .form_list 직렬화 + _mode=get_search_excel 로 xlsx export fetch → base64.
async function scrapeKkomangseExport() {
  try {
    const form = document.querySelector(".form_list") || document.forms[0];
    if (!form) {
      return { success: false, error: "꼬망세 주문 폼을 찾지 못했습니다. nstore.edupre.co.kr 로그인을 확인하세요." };
    }
    const params = new URLSearchParams();
    for (const el of form.querySelectorAll("input[name],select[name],textarea[name]")) {
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      params.append(el.name, el.value);
    }
    params.set("_mode", "get_search_excel");
    const action = form.getAttribute("action") || location.pathname;
    const res = await fetch(action + "?" + params.toString(), { credentials: "include" });
    if (!res.ok) return { success: false, error: "꼬망세 엑셀 다운로드 실패 (HTTP " + res.status + ")" };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
      return { success: false, error: "엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다." };
    }
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
    }
    return { success: true, xlsxBase64: btoa(bin), size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 온채널(onch3) 주문 수집: orders.php 리스트(주문코드+일자) + 주문별 상세모달 fetch ──
// ── 카카오(톡스토어) 주문 수집: OMS `_search` API 로 배송준비중(301)만 스크랩 (다운로드 없이, PII 언마스킹) ──
async function findOrCreateKakaoTab() {
  const tabs = await chrome.tabs.query({ url: KAKAO_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 기존 카카오 탭 재사용 (포커스 안 뺏음)
  const tab = await chrome.tabs.create({ url: KAKAO_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKakaoOrders(dateFilter) {
  const { tab, created } = await findOrCreateKakaoTab();
  if (!tab?.id) return { success: false, error: "카카오쇼핑 판매자센터(shopping-seller.kakao.com) 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKakaoOrders,
        args: [dateFilter || ""],
      }),
      120000,
      "카카오 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "카카오 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("카카오"); }
    return mallGenericErrorResult("카카오", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// shopping-seller.kakao.com 페이지 컨텍스트: POST /api/oms/v2/orders/_search/SELLER_ORDER/101 (배송준비중 301, 페이지네이션).
// ⭐응답 PII 언마스킹됨(주소·연락처 풀). channelId 101 = 톡스토어. dateFilter(YYYY-MM-DD) 있으면 그날 결제분만.
async function scrapeKakaoOrders(dateFilter) {
  try {
    const pad = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const now = new Date();
    let from, to;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter || "")) {
      const s = dateFilter.replace(/-/g, "");
      from = s + "000000";
      to = s + "235959";
    } else {
      // 배송준비중은 미출고분이라 최근분 — 넉넉히 90일 결제분 조회.
      to = ymd(now) + "235959";
      from = ymd(new Date(now.getTime() - 90 * 86400000)) + "000000";
    }
    const orders = [];
    for (let page = 0; page < 50; page++) {
      const res = await fetch("/api/oms/v2/orders/_search/SELLER_ORDER/101", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        // ⭐배송준비중 = enum 이름 "ShippingWaiting" (숫자 301 을 보내면 500). 응답의 statusCode 는 301.
        body: JSON.stringify({
          size: "200",
          statuses: ["ShippingWaiting"],
          orderPaidAt: { from, to },
          page: String(page),
        }),
      });
      const text = await res.text();
      // 로그인 리다이렉트(HTML)면 로그인 안내, API 오류(JSON errorMessage)면 실제 메시지 전달 — 500 을 "로그인"으로 오표시하지 않는다.
      if (text.trim().charAt(0) === "<") {
        if (page === 0)
          return {
            success: false,
            pendingLogin: true,
            error: "카카오쇼핑 판매자센터 로그인이 필요합니다. shopping-seller.kakao.com 에 로그인한 뒤 다시 시도하세요.",
          };
        break;
      }
      if (!res.ok) {
        let msg = `카카오 주문 조회 실패 (HTTP ${res.status})`;
        try {
          const j = JSON.parse(text);
          if (j && j.errorMessage) msg = `카카오: ${j.errorMessage}`;
        } catch (e) {
          /* 파싱 실패 — 기본 메시지 */
        }
        if (page === 0) return { success: false, error: msg };
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (page === 0) return { success: false, error: "카카오 주문 응답을 해석하지 못했습니다 (로그인/세션 확인)." };
        break;
      }
      const contents = (j && j.contents) || [];
      for (const o of contents) {
        if (Number(o.statusCode) === 301) orders.push(o); // 배송준비중만 (방어적 재확인)
      }
      if (j.last || contents.length < 200) break;
    }
    return { success: true, orders, count: orders.length };
  } catch (e) {
    return { success: false, error: (e && e.message) || "카카오 주문 수집 실패" };
  }
}

async function findOrCreateOnchannelTab() {
  const tabs = await chrome.tabs.query({ url: ONCHANNEL_TAB_MATCHES });
  const orderTab = tabs.find((tab) => (tab.url || "").includes("/supplier/orders"));
  if (orderTab?.id) {
    return { tab: orderTab, created: false }; // 기존 주문 탭 재사용 (포커스 안 뺏음)
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ONCHANNEL_ORDER_URL }); // active 미지정 = 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ONCHANNEL_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

// ── 온채널 송장 업로드(발송처리): 목록에서 주문코드→memberOrderNum 스크랩 → 주문당 trans_ok POST ──
// ⚠️파괴적. 셀피아 ord_no(=온채널 주문코드 MO_/GO_)로 조인. rows=[{ordNo, invNo, courier}].
async function uploadOnchTracking(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  if (rows.length === 0) return { success: false, error: "온채널 송장이 없습니다." };
  const { tab, created } = await findOrCreateOnchannelTab();
  if (!tab?.id) return { success: false, error: "온채널(onch3.co.kr) 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 로그인 세션 same-origin POST
        func: scrapeOnchUpload,
        args: [rows],
      }),
      120000,
      "온채널 송장 업로드 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "온채널 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { await bringMallTabToFront(tab.id); return mallAccessErrorResult("온채널"); }
    return mallGenericErrorResult("온채널", e);
  } finally {
    if (created && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// onch3.co.kr 주문 화면: 목록 주문코드↔memberOrderNum 매핑 후 각 송장 POST /access/order_access.php?ubr=trans_ok.
async function scrapeOnchUpload(rows) {
  try {
    if (/login/i.test(location.href) || document.querySelector('input[type="password"]')) {
      return { success: false, error: "온채널 로그인이 필요합니다. onch3.co.kr 에 로그인 후 다시 시도하세요." };
    }
    // 택배사 정식명(CJ 대한통운) — #deliveryObjs 에서 확정, 없으면 기본값.
    let cjName = "CJ 대한통운";
    try {
      const objs = JSON.parse(document.getElementById("deliveryObjs").value || "[]");
      const cj = objs.find((o) => /대한통운/.test(o.delivery_name || ""));
      if (cj && cj.delivery_name) cjName = cj.delivery_name;
    } catch { /* 기본값 사용 */ }

    // 목록: 주문코드(상세모달) → { member(memberOrderNum), isFirst }. 송장입력 버튼과 같은 행의 주문코드를 페어링.
    const map = {};
    const sjBtns = [...document.querySelectorAll('[onclick*="supplierDeliveryNumberModal"]')];
    for (const b of sjBtns) {
      const oc = b.getAttribute("onclick") || "";
      const m = oc.match(/supplierDeliveryNumberModal\('([^']*)','([^']*)','([^']*)'/);
      if (!m) continue;
      let el = b;
      let code = null;
      for (let i = 0; i < 12 && el; i += 1) {
        el = el.parentElement;
        const d = el && el.querySelector('[onclick*="supplierOrderDetailModal"]');
        if (d) { code = ((d.getAttribute("onclick") || "").match(/'([^']+)'/) || [])[1]; break; }
      }
      if (code && !map[code]) map[code] = { member: m[1], isFirst: m[3] };
    }

    const results = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const r of rows) {
      const ordNo = String(r.ordNo || "").trim();
      const invNo = String(r.invNo || "").trim();
      if (!ordNo || !invNo) { results.push({ ordNo, ok: false, reason: "송장/주문번호 없음" }); continue; }
      const hit = map[ordNo];
      if (!hit) { results.push({ ordNo, ok: false, reason: "온채널 목록에 없음(이미 발송 또는 기간 밖)" }); continue; }
      if (hit.isFirst !== "true") { results.push({ ordNo, ok: false, reason: "이미 송장 등록됨" }); continue; }
      const body = new URLSearchParams({ trans_nm: cjName, trans_num: invNo, hidden_trans_num: hit.member });
      try {
        const res = await fetch("/access/order_access.php?ubr=trans_ok", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: body.toString(),
        });
        const txt = await res.text();
        let code = null;
        try { code = JSON.parse(txt).code; } catch { /* not json */ }
        const ok = String(code) === "200";
        results.push({ ordNo, ok, code, reason: ok ? "" : "응답 " + (code ?? txt.slice(0, 40)) });
        await sleep(250); // 연속 POST 간격
      } catch (e) {
        results.push({ ordNo, ok: false, reason: String((e && e.message) || e) });
      }
    }
    const okCount = results.filter((x) => x.ok).length;
    return { success: true, total: rows.length, okCount, listSize: Object.keys(map).length, results: results.slice(0, 60) };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function collectOnchannelOrders(dateFilter) {
  const { tab, created } = await findOrCreateOnchannelTab();
  if (!tab?.id) return { success: false, error: "온채널(onch3.co.kr) 탭을 열 수 없습니다." };
  // 모달 fetch 가 수십 번 → 작업이 길다. MV3 서비스워커 유휴 종료(=message port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeOnchannelOrders,
        args: [dateFilter || ""], // "YYYY-MM-DD" 면 그날 주문만
      }),
      120000,
      "온채널 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "온채널 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("온채널"); }
    return mallGenericErrorResult("온채널", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// onch3.co.kr 페이지 컨텍스트: 리스트에서 주문코드+일자 추출 → (dateFilter 면 그날만) → 주문별 모달 fetch → 파싱.
async function scrapeOnchannelOrders(dateFilter) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  try {
    // 1) 리스트: 주문코드 + 주문일자 (supplierOrderDetailModal arg + 행 첫 날짜)
    const listHtml = await (await fetch("/supplier/orders.php?state=all", { credentials: "include" })).text();
    const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
    const rows = [];
    const seen = new Set();
    for (const tr of ldoc.querySelectorAll("tr")) {
      const m = tr.innerHTML.match(/supplierOrderDetailModal\('([^']+)'\)/);
      if (!m) continue;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const dm = norm(tr.innerText).match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // 첫 날짜 = 주문일자
      rows.push({ orderCode: m[1], date: dm ? dm[0] : "" });
    }
    if (!rows.length) {
      return { success: false, error: "온채널 주문 목록을 찾지 못했습니다. onch3.co.kr 로그인을 확인하세요." };
    }
    // 그날 날짜 필터 (일자가 "YYYY-MM-DD ..." 이므로 startsWith). dateFilter 없으면 전체.
    const dayRows = dateFilter ? rows.filter((r) => r.date.startsWith(dateFilter)) : rows;
    if (!dayRows.length) {
      return { success: true, orders: [], count: 0 }; // 그날 신규 주문 없음 (정상)
    }
    const targets = dayRows.slice(0, 100); // 상한 (오늘만이라 보통 적음)

    // 검증된 상세모달 파서
    const parseModal = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let productPrice = 0;
      let shippingFee = 0;
      for (const t of doc.querySelectorAll("table")) {
        const trs = [...t.rows];
        const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
        const pi = hdr.findIndex((h) => /상품금액/.test(h));
        const si = hdr.findIndex((h) => /배송비/.test(h));
        if (pi >= 0 && si >= 0 && trs[1]) {
          const v = [...trs[1].cells].map((c) => num(c.innerText));
          productPrice = v[pi];
          shippingFee = v[si];
          break;
        }
      }
      let option = "";
      let qty = 1;
      for (const t of doc.querySelectorAll("table")) {
        const trs = [...t.rows];
        const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
        const oi = hdr.findIndex((h) => /^옵션/.test(h));
        const qi = hdr.findIndex((h) => /^수량/.test(h));
        if (oi >= 0 && qi >= 0 && trs[1]) {
          const v = [...trs[1].cells];
          option = norm(v[oi] ? v[oi].innerText : "");
          qty = num(v[qi] ? v[qi].innerText : "") || 1;
          break;
        }
      }
      const field = (re) => {
        for (const t of doc.querySelectorAll("table")) {
          for (const tr of t.rows) {
            const c = [...tr.cells];
            for (let i = 0; i + 1 < c.length; i++) {
              if (re.test(norm(c[i].innerText))) return norm(c[i + 1].innerText);
            }
          }
        }
        return "";
      };
      const addrRaw = field(/^주소$/);
      const zipM = addrRaw.match(/\(?(\d{5})\)?/);
      const txt = norm(doc.body ? doc.body.innerText : "");
      const pm = txt.match(/\(([A-Za-z0-9_-]+)\)\s*(.+?)\s*옵션/);
      return {
        productCode: pm ? pm[1] : "",
        productName: pm ? pm[2].trim() : "",
        option,
        qty,
        productPrice,
        shippingFee,
        customer: field(/받는\s*사람/),
        phone: field(/전화번호/),
        emergency: field(/비상\s*연락처/),
        zip: zipM ? zipM[1] : "",
        address: addrRaw.replace(/^\(?\d{5}\)?\s*/, "").trim(),
        message: field(/배송\s*메시지/),
      };
    };

    // 2) 주문별 상세모달 fetch (4개씩 병렬)
    const orders = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      await Promise.all(
        targets.slice(i, i + CONCURRENCY).map(async (r) => {
          try {
            const res = await fetch("/access/order_access.php?ubr=order_detail_supplier", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: "orderCode=" + encodeURIComponent(r.orderCode),
            });
            orders.push({ orderCode: r.orderCode, date: r.date, ...parseModal(await res.text()) });
          } catch {
            orders.push({ orderCode: r.orderCode, date: r.date }); // 모달 실패 시 최소 정보
          }
        }),
      );
    }
    return { success: true, orders, count: orders.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 키드키즈(kidkids) 주문 수집: 출고관리 목록(logis_index) + 주문서(logis_down5) 스크랩 ──
// 목록 CheckBox2[delivery_plan_date] 속성으로 출고예정일 필터 → od별 발주서01(logis_down5) POST
// (단일 od 도 주문 전체품목 반환) → om 기준 그룹핑. 가격·우편번호는 발주서에만 있어 필수 단계.
async function findOrCreateKidkidsTab() {
  const tabs = await chrome.tabs.query({ url: KIDKIDS_TAB_MATCHES });
  const mgmtTab = tabs.find((tab) => (tab.url || "").includes("/logis/management.htm"));
  if (mgmtTab?.id) return { tab: mgmtTab, created: false }; // 기존 출고관리 탭 재사용
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KIDKIDS_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KIDKIDS_ORDER_URL, active: false });
  return { tab, created: true };
}

async function collectKidkidsOrders(dateFilter) {
  const { tab, created } = await findOrCreateKidkidsTab();
  if (!tab?.id) return { success: false, error: "키드키즈(partner.kidkids.net) 탭을 열 수 없습니다." };
  // 주문서 fetch 가 주문 수만큼 → 길다. MV3 서비스워커 유휴 종료(=port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKidkidsOrders,
        args: [dateFilter || ""], // "YYYY-MM-DD" 면 그 출고예정일만 (없으면 전체)
      }),
      180000,
      "키드키즈 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "키드키즈 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("키드키즈"); }
    return mallGenericErrorResult("키드키즈", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// ── 롯데ON(store.lotteon.com) 주문 수집: 판매자센터 배송관리 "신규주문" 엑셀을 백그라운드 다운로드 ──
// 롯데ON 판매자센터는 soapi.lotteon.com REST(Authorization: Bearer, 토큰은 sessionStorage.AuthToken).
// 개인정보 다운로드 사유(saveDownloadReason)를 먼저 등록해 encryptKey 를 받고, 그걸 _dnldKey 쿼리로
// downloadDeliveryExcel 에 넘겨 fileId 발급 → fileManage CDN 다운로드. 반환은 xlsx(OpenXML) base64.
async function findOrCreateLotteonTab() {
  const tabs = await chrome.tabs.query({ url: LOTTEON_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 로그인된 기존 탭 재사용
  const tab = await chrome.tabs.create({ url: LOTTEON_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectLotteonOrders() {
  const { tab, created } = await findOrCreateLotteonTab();
  if (!tab?.id) return { success: false, error: "롯데ON(store.lotteon.com) 탭을 열 수 없습니다." };
  // 롯데ON 판매자센터는 SPA + 토큰(sessionStorage.AuthToken)/SSO 로그인이라 확장이 ID/비번을 자동 입력할 수
  // 없다(캡차·통합회원 로그인). 미로그인이면 로그인 탭을 앞으로 띄워 사용자가 직접 로그인하도록 안내한다.
  let loginNeeded = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeLotteonOrders,
      }),
      120000,
      "롯데ON 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "롯데ON 화면에 접근하지 못했습니다." };
    if (!result.success && /로그인|인증|세션/.test(result.error || "")) {
      loginNeeded = true;
      await bringMallTabToFront(tab.id); // 로그인 탭을 활성 탭으로 (사용자가 직접 로그인)
      return {
        success: false,
        pendingLogin: true,
        error:
          "롯데ON 판매자센터에 로그인되어 있지 않습니다. 방금 열린 롯데ON 탭에서 로그인한 뒤 다시 '수집하기'를 눌러주세요. (롯데ON은 통합회원 로그인이라 자동 로그인은 지원하지 않습니다.)",
      };
    }
    return result;
  } finally {
    // 로그인 안내로 띄운 탭은 사용자가 로그인해야 하므로 닫지 않는다.
    if (created && tab.id && !loginNeeded) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// store.lotteon.com 페이지 컨텍스트: sessionStorage 토큰으로 soapi 3단계(사유등록→엑셀요청→파일다운) 호출.
async function scrapeLotteonOrders() {
  try {
    const tok = sessionStorage.getItem("AuthToken");
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
      body: JSON.stringify({ dnldRsnCnts: "배송을 위한 주문정보 다운로드" }),
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
}

// ── 보리보리(seller-club) 주문 수집: 출고대기 일괄엑셀다운로드(사유+비번) 언마스킹 xlsx ──
// 셀피아 보리보리 양식 = 출고대기 언마스킹 다운로드와 동일(35컬럼 passthrough). 서버가 사유+비번으로
// 개인정보 언마스킹 → POST /order/rest/deli/downloadPkgOrdDeliList/excel-xlsx (검색조건+reason+password).
// 세션 쿠키만 있으면 seller-club 아무 페이지에서나 same-origin fetch 가능. 비번=seller-club 로그인 비밀번호.
async function findOrCreateBoriboriTab() {
  const orderTabs = await chrome.tabs.query({ url: BORIBORI_ORDER_TAB_MATCHES });
  if (orderTabs[0]?.id) return { tab: orderTabs[0], created: false }; // 주문/배송관리 탭 우선 재사용
  const tab = await chrome.tabs.create({ url: BORIBORI_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectBoriboriOrders(options = {}) {
  const { tab, created } = await findOrCreateBoriboriTab();
  if (!tab?.id) return { success: false, error: "보리보리(seller-club.co.kr) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트로 fetch (ISOLATED 는 SameSite 로그인 쿠키 미전송 → 404)
        func: scrapeBoriboriOrders,
        args: [typeof options.password === "string" ? options.password : ""],
      }),
      120000,
      "보리보리 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "보리보리 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("보리보리"); }
    return mallGenericErrorResult("보리보리", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// ── 티쳐몰(퍼스트몰 selleradmin) 출고 전 주문 수집 ──
// 리스트 order/catalog 의 excel_down 이 셀피아 양식(엑셀템플릿 117 "티쳐몰 주문서") SpreadsheetML(36컬럼)을 반환.
// 실제 사이트 JS excel_down(step): order_seq='search' + seq=<양식id> + params(search-form 직렬화) POST.
async function findOrCreateTeachervilleTab() {
  const tabs = await chrome.tabs.query({ url: TEACHERVILLE_TAB_MATCHES });
  if (tabs[0]?.id) return { tab: tabs[0], created: false }; // 로그인된 기존 탭 재사용
  const tab = await chrome.tabs.create({ url: TEACHERVILLE_ORDER_URL, active: false }); // 백그라운드
  return { tab, created: true };
}

async function collectTeachervilleOrders() {
  const { tab, created } = await findOrCreateTeachervilleTab();
  if (!tab?.id) return { success: false, error: "티쳐몰(shop.teacherville.co.kr) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    // search-form 은 order/catalog 에만 있으므로 다른 페이지면 이동.
    const cur = await chrome.tabs.get(tab.id);
    if (!(cur.url || "").includes("/selleradmin/order/catalog")) {
      await chrome.tabs.update(tab.id, { url: TEACHERVILLE_ORDER_URL });
      await waitForTabReady(tab.id);
    }
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 페이지 컨텍스트로 fetch (로그인 세션 쿠키 + jQuery serialize)
        func: scrapeTeachervilleOrders,
      }),
      120000,
      "티쳐몰 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "티쳐몰 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("티쳐몰"); }
    return mallGenericErrorResult("티쳐몰", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// shop.teacherville.co.kr(selleradmin) 페이지 컨텍스트: 출고 전 주문을 셀피아 양식(엑셀템플릿 117)으로
// order_process/excel_down POST → SpreadsheetML(.xls) base64.
// ⭐이 몰은 excel_type='search'/params 를 지원하지 않는다(폼에 해당 input 자체가 없음). 실제 사이트
//   excel_down() 도 항상 excel_type='select' 로 "목록 체크박스(order_seq[]) 파이프 목록"을 전송한다.
//   'search' 로 보내면 서버가 order_seq 를 무시하고 header-only 빈엑셀(7KB)을 반환 → 과거 "주문없음" 버그.
//   ✅정답: 출고 전 행의 order_seq[] 값들을 '|' 로 이어 보내면 데이터가 채워진다(라이브 실증).
async function scrapeTeachervilleOrders() {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // 페이지/jQuery/엑셀폼 로딩 대기
    for (let i = 0; i < 30 && !(document.querySelector("form#excel_down_form") && (window.$ || window.jQuery)); i += 1) {
      await sleep(300);
    }
    const form = document.querySelector("form#excel_down_form");
    if (!form) {
      return { success: false, error: "티쳐몰 주문 폼을 찾지 못했습니다. selleradmin/order/catalog 로그인을 확인하세요." };
    }
    // 목록(catalog_ajax)이 채워질 때까지 잠깐 더 대기 — 주문 행 체크박스가 지연 렌더된다.
    for (let i = 0; i < 20 && document.querySelectorAll('input[type="checkbox"][name="order_seq[]"]').length === 0; i += 1) {
      await sleep(300);
    }
    // 출고 전 상태 행(25 결제확인·35 상품준비·40 부분출고준비·45 출고준비)의 order_seq[] 수집.
    // 55 출고완료부터는 이미 출고된 주문이라 제외. (tr class 예: "list-row step25")
    const PRE_SHIP = ["25", "35", "40", "45"];
    const seqs = [];
    document.querySelectorAll('input[type="checkbox"][name="order_seq[]"]').forEach((c) => {
      const tr = c.closest("tr");
      const step = ((tr && tr.className) || "").match(/step(\d+)/);
      if (step && PRE_SHIP.includes(step[1]) && c.value) seqs.push(c.value);
    });
    if (seqs.length === 0) {
      return { success: false, error: "출고 전 티쳐몰 신규 주문이 없습니다." };
    }
    // excel_down: 양식 117(티쳐몰 주문서) + 체크박스 order_seq 파이프 목록 + 다운로드 사유(5~50자).
    // excel_provider_seq(입점사 seq)/ship_set 은 폼 히든값을 그대로 사용. excel_type/step/params 는 보내지 않는다.
    const providerSeq = (form.querySelector('input[name="excel_provider_seq"]') || {}).value || "708";
    const shipSet = (form.querySelector('[name="excel_ship_set_code"]') || {}).value || "";
    const body = new URLSearchParams();
    body.set("order_seq", seqs.join("|") + "|");
    body.set("seq", "117");
    body.set("excel_provider_seq", providerSeq);
    body.set("excel_ship_set_code", shipSet);
    body.set("download_reason_select", "direct");
    body.set("download_reason_text", "배송준비확인");
    body.set("download_reason", "배송준비확인");
    const res = await fetch("/selleradmin/order_process/excel_down", {
      method: "POST",
      credentials: "include",
      body,
    });
    if (!res.ok) {
      return { success: false, error: "티쳐몰 엑셀 다운로드 실패 (HTTP " + res.status + "). teacherville 로그인을 확인하세요." };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 100) {
      return { success: false, error: "티쳐몰 엑셀 응답이 비어 있습니다. 출고 전 주문이 없거나 로그인이 필요합니다." };
    }
    // SpreadsheetML(XML) 텍스트 → base64 그대로 전달 (백엔드 SheetJS 가 파싱). btoa 는 latin1 바이트 기준.
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
    return { success: true, xlsxBase64: btoa(bin), fileName: "티쳐몰.xls", size: buf.length, orderCount: seqs.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 아트공구(Cafe24) 주문 수집: 주문목록의 주문번호 → 배송정보 상세 fetch → Cafe24 CSV 행 ──
async function findOrCreateArt09Tab() {
  const tabs = await chrome.tabs.query({ url: ART09_TAB_MATCHES });
  const listTab = tabs.find((tab) => (tab.url || "").includes("/order_list.php"));
  if (listTab?.id) return { tab: listTab, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ART09_ORDER_URL });
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ART09_ORDER_URL, active: false });
  return { tab, created: true };
}

async function collectArt09Orders() {
  const { tab, created } = await findOrCreateArt09Tab();
  if (!tab?.id) return { success: false, error: "아트공구(zzogzzog1.cafe24.com) 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const current = await chrome.tabs.get(tab.id).catch(() => tab);
    if (!(current.url || "").includes("/order_list.php")) {
      await chrome.tabs.update(tab.id, { url: ART09_ORDER_URL });
      await waitForTabReady(tab.id);
    }
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeArt09Orders,
      }),
      180000,
      "아트공구 주문 수집 시간이 초과되었습니다.",
    );
    const result = injected[0]?.result ?? { success: false, error: "아트공구 화면에 접근하지 못했습니다." };
    if (!result.success && result.pendingLogin) {
      keepOpen = true;
      await bringMallTabToFront(tab.id);
    }
    return result;
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("아트공구"); }
    return mallGenericErrorResult("아트공구", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

async function scrapeArt09Orders() {
  const ORDER_ID_RE = /\b\d{8}-\d{7}\b/g;
  const ORDER_DATETIME_RE = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
  const compact = (s) => clean(s).replace(/\s|[:：]/g, "").toLowerCase();

  try {
    const listOrders = readVisibleOrderList();
    if (listOrders.length === 0) {
      const bodyText = clean(document.body?.innerText || "");
      if (document.querySelector('input[type="password"]') || /로그인|login/i.test(bodyText)) {
        return {
          success: false,
          pendingLogin: true,
          error: "아트공구 로그인이 필요합니다. zzogzzog1.cafe24.com 에 로그인한 뒤 다시 수집해주세요.",
        };
      }
      return {
        success: false,
        error:
          "아트공구 주문목록에서 주문번호를 찾지 못했습니다. Cafe24 주문목록 화면을 열고 조회 결과가 보이는지 확인해주세요.",
      };
    }

    const rows = [];
    const failures = [];
    for (const order of listOrders) {
      try {
        const detail = await fetchOrderDetail(order.orderId);
        const items = detail.items.length > 0 ? detail.items : fallbackItems(order.productText);
        items.forEach((item, index) => {
          rows.push({
            shopName: "한국어 쇼핑몰",
            shopNo: "1",
            orderId: order.orderId,
            orderItemId: `${order.orderId}-${String(index + 1).padStart(2, "0")}`,
            message: detail.message || "",
            totalOrderAmount: "****",
            totalPaymentAmount: "****",
            productNo: item.productNo || "",
            productName: item.name || "",
            productNameWithOption: item.optionName || item.name || "",
            qty: item.qty || "1",
            salePrice: "****",
            receiver: detail.receiver || "",
            receiverPhone: detail.receiverPhone || "",
            receiverZip: detail.receiverZip || "",
            receiverAddress: detail.receiverAddress || "",
            receiverAddressDetail: detail.receiverAddressDetail || "",
            paymentType: detail.paymentType || "T",
            paymentMethod: detail.paymentMethod || "",
            orderedAt: detail.orderedAt || order.orderedAt || "",
            country: "",
          });
        });
      } catch (e) {
        failures.push(`${order.orderId}: ${String((e && e.message) || e)}`);
      }
    }

    if (rows.length === 0 && failures.length > 0) {
      return { success: false, error: "아트공구 주문 상세 수집 실패: " + failures.slice(0, 3).join(" / ") };
    }

    return {
      success: true,
      rows,
      count: rows.length,
      orderCount: new Set(rows.map((row) => row.orderId).filter(Boolean)).size,
      failures,
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }

  function readVisibleOrderList() {
    const candidates = [];
    let hasCheckedRows = false;
    for (const tr of Array.from(document.querySelectorAll("tr"))) {
      if (!isVisible(tr)) continue;
      const text = clean(tr.innerText || "");
      const ids = Array.from(text.matchAll(ORDER_ID_RE)).map((m) => m[0]);
      if (!ids.length) continue;
      const orderId = ids[0];
      const checkbox = tr.querySelector('input[type="checkbox"]');
      const checked = Boolean(checkbox && checkbox.checked);
      if (checked) hasCheckedRows = true;
      const cells = Array.from(tr.cells || []).map((cell) => clean(cell.innerText || cell.textContent || ""));
      const headers = tableHeaderCells(tr.closest("table")).map((cell) => compact(cell));
      const productIndex = findHeaderIndex(headers, ["상품명", "주문상품명"]);
      const orderCellIndex = cells.findIndex((cell) => cell.includes(orderId));
      const orderedAt = (text.match(ORDER_DATETIME_RE) || [])[0] || "";
      const productText =
        productIndex >= 0 ? normalizeProductName(cells[productIndex] || "") : pickListProductText(cells, orderCellIndex);
      candidates.push({ orderId, orderedAt, productText, checked });
    }
    const filtered = hasCheckedRows ? candidates.filter((row) => row.checked) : candidates;
    const seen = new Set();
    const out = [];
    for (const item of filtered) {
      if (seen.has(item.orderId)) continue;
      seen.add(item.orderId);
      out.push(item);
    }
    return out;
  }

  function tableHeaderCells(table) {
    if (!table) return [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const cells = rowCells(tr);
      const headers = cells.map((cell) => compact(cell));
      if (headers.some((cell) => cell.includes("주문번호")) && headers.some((cell) => cell.includes("상품명"))) {
        return cells;
      }
    }
    return [];
  }

  function pickListProductText(cells, orderCellIndex) {
    const start = Math.max(0, orderCellIndex + 1);
    for (const cell of cells.slice(start)) {
      if (!cell) continue;
      if (/\b\d{8}-\d{7}\b/.test(cell)) continue;
      if (/^\*+$/.test(cell)) continue;
      if (/총\s*상품|금액|주문자|회원/.test(cell)) continue;
      if (cell.length > 8) return normalizeProductName(cell);
    }
    return "";
  }

  async function fetchOrderDetail(orderId) {
    const url = `/supp/php/s/order_shipping_info.php?order_id=${encodeURIComponent(orderId)}&menu_no=74`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`상세 HTTP ${res.status}`);
    const html = await decodeResponse(res);
    if (!/<html|<table|수령|상품|배송|주문/i.test(html)) throw new Error("상세 응답이 비어 있습니다");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rawAddress = readLabeledValue(doc, ["수령인주소", "수취인주소", "배송지주소", "배송주소", "주소"], ["우편"]);
    const detailAddress = readLabeledValue(doc, ["상세주소", "수령인상세주소", "수취인상세주소"], []);
    const zip = readLabeledValue(doc, ["수령인우편번호", "수취인우편번호", "우편번호"], []);
    const address = splitAddress(zip, rawAddress, detailAddress);
    return {
      receiver: readLabeledValue(doc, ["수령인", "수취인", "받는분", "받으시는분"], ["휴대", "전화", "연락", "우편", "주소"]),
      receiverPhone: readLabeledValue(doc, ["수령인휴대전화", "수취인휴대전화", "휴대전화", "휴대폰", "연락처", "전화번호"], []),
      receiverZip: address.zip,
      receiverAddress: address.address,
      receiverAddressDetail: address.detail,
      message: readLabeledValue(doc, ["배송메시지", "배송메세지", "배송요청사항", "배송요청"], []),
      paymentType: readLabeledValue(doc, ["결제구분"], []) || "T",
      paymentMethod: readLabeledValue(doc, ["결제수단", "결제방법"], []),
      orderedAt: readLabeledValue(doc, ["발주일", "주문일", "결제일", "주문일시"], []) || ((clean(doc.body?.innerText || "").match(ORDER_DATETIME_RE) || [])[0] || ""),
      items: parseItems(doc),
    };
  }

  async function decodeResponse(res) {
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "";
    const charset = (contentType.match(/charset=([^;]+)/i) || [])[1] || "";
    const encodings = [charset, "euc-kr", "utf-8"].filter(Boolean);
    let best = "";
    let bestScore = -1;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding).decode(buf);
        const score = (text.match(/[가-힣]/g) || []).length - (text.match(/\uFFFD/g) || []).length * 20;
        if (score > bestScore) {
          best = text;
          bestScore = score;
        }
      } catch {
        /* unsupported encoding */
      }
    }
    return best || new TextDecoder().decode(buf);
  }

  function parseItems(doc) {
    const out = [];
    for (const table of Array.from(doc.querySelectorAll("table"))) {
      const trs = Array.from(table.querySelectorAll("tr"));
      const headerInfo = findItemHeader(trs);
      if (!headerInfo) continue;
      const { index, headers } = headerInfo;
      const nameIndex = findHeaderIndex(headers, ["주문상품명", "상품명", "품목명"]);
      const optionIndex = findHeaderIndex(headers, ["옵션포함", "옵션", "옵션명"]);
      const productNoIndex = findHeaderIndex(headers, ["상품번호", "상품코드", "품목코드", "상품품목코드"]);
      const qtyIndex = findHeaderIndex(headers, ["수량", "주문수량", "구매수량"]);
      for (const tr of trs.slice(index + 1)) {
        const cells = rowCells(tr);
        if (cells.length < 2) continue;
        const normalized = cells.map((cell) => compact(cell));
        if (normalized.some((cell) => cell.includes("상품명")) && normalized.some((cell) => cell.includes("수량"))) continue;
        const name = normalizeProductName(cells[nameIndex] || cells.find((cell) => /[가-힣A-Za-z]/.test(cell)) || "");
        if (!name || /합계|총계|배송비|결제정보/.test(name)) continue;
        const qty = qtyIndex >= 0 ? numericText(cells[qtyIndex]) || "1" : "1";
        out.push({
          productNo: productNoIndex >= 0 ? productNumber(cells[productNoIndex]) : "",
          name,
          optionName: optionIndex >= 0 ? normalizeProductName(cells[optionIndex]) || name : name,
          qty,
        });
      }
      if (out.length > 0) return out;
    }
    return out;
  }

  function findItemHeader(trs) {
    for (let i = 0; i < Math.min(trs.length, 8); i += 1) {
      const headers = rowCells(trs[i]).map((cell) => compact(cell));
      const hasName = headers.some((cell) => cell.includes("상품명") || cell.includes("품목명"));
      const hasQty = headers.some((cell) => cell.includes("수량"));
      const hasProductNo = headers.some((cell) => cell.includes("상품번호") || cell.includes("상품코드"));
      if (hasName && (hasQty || hasProductNo)) return { index: i, headers };
    }
    return null;
  }

  function findHeaderIndex(headers, labels) {
    const normalized = labels.map((label) => compact(label));
    return headers.findIndex((header) => normalized.some((label) => header.includes(label)));
  }

  function rowCells(tr) {
    return Array.from(tr.cells || []).map((cell) => cellText(cell));
  }

  function readLabeledValue(doc, labels, excludes) {
    const normalizedLabels = labels.map((label) => compact(label));
    const normalizedExcludes = excludes.map((label) => compact(label));
    for (const tr of Array.from(doc.querySelectorAll("tr"))) {
      const cells = rowCells(tr);
      for (let i = 0; i < cells.length; i += 1) {
        const key = compact(cells[i]);
        if (!key) continue;
        if (normalizedExcludes.some((label) => key.includes(label))) continue;
        if (!normalizedLabels.some((label) => key.includes(label))) continue;
        const next = cleanMultiline(cells[i + 1] || "");
        if (next) return next;
        const stripped = stripLabels(cells[i], labels);
        if (stripped) return stripped;
      }
    }
    return "";
  }

  function stripLabels(value, labels) {
    let out = cleanMultiline(value);
    for (const label of labels) {
      out = out.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：]?", "gi"), "");
    }
    return cleanMultiline(out);
  }

  function splitAddress(zipValue, addressValue, detailValue) {
    let zip = clean(zipValue).replace(/[^0-9]/g, "").slice(0, 5);
    let addressRaw = cleanMultiline(addressValue);
    const match = addressRaw.match(/\b\d{5}\b/);
    if (!zip && match) zip = match[0];
    if (match) addressRaw = cleanMultiline(addressRaw.replace(match[0], ""));
    addressRaw = addressRaw.replace(/^\[|\]$/g, "").trim();
    const parts = addressRaw.split(/\n+/).map(clean).filter(Boolean);
    return {
      zip,
      address: parts[0] || addressRaw,
      detail: clean(detailValue) || parts.slice(1).join(" "),
    };
  }

  function fallbackItems(productText) {
    const name = normalizeProductName(productText);
    return name ? [{ productNo: "", name, optionName: name, qty: "1" }] : [];
  }

  function productNumber(value) {
    const m = clean(value).match(/\d{3,}/);
    return m ? m[0] : clean(value);
  }

  function numericText(value) {
    const m = clean(value).match(/\d+/);
    return m ? m[0] : "";
  }

  function normalizeProductName(value) {
    const lines = String(value || "")
      .split(/\r?\n| {2,}/)
      .map(clean)
      .filter(Boolean);
    const picked =
      lines.find((line) => !/공급사상품명|옵션|상품번호|품목번호|^\d+$/.test(line)) || lines[0] || "";
    return clean(picked.replace(/\[[^\]]*공급사상품명[^\]]*\]/g, ""));
  }

  function cellText(cell) {
    return cleanMultiline((cell && (cell.innerText || cell.textContent)) || "");
  }

  function cleanMultiline(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .join("\n");
  }

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}

// seller-club.co.kr 페이지 컨텍스트: 결제완료(stateCd=c) 일괄엑셀 언마스킹 다운로드 POST → base64 xlsx.
// ⭐새 주문은 결제완료(c)에 쌓인다. 출고대기(d)는 셀러가 출고처리로 옮겨야 차는 칸이라 보통 비어 있고,
//   비어 있으면 excel-xlsx 가 404(JSON 에러바디)를 반환한다 — 과거 stateCd='d' 로 404 나던 원인.
// 다운로드 사유는 항상 전달하고, 사이트가 비밀번호 언마스킹을 요구하면 저장된 계정 비밀번호를 함께 보낸다.
async function scrapeBoriboriOrders(downloadPassword) {
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
      reason: "배송확인합니다", password, type: downloadType,
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
    let lastError = "";
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
          lastError = boriboriHttpError(res, endpoint);
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
        lastError = boriboriDownloadError(buf, password);
        if (/비밀번호.*저장|로그인.*확인/.test(lastError)) break;
      }
      if (/비밀번호.*저장|로그인.*확인/.test(lastError)) break;
    }
    return { success: false, error: lastError || "보리보리 다운로드가 거부되었습니다. 사유/비밀번호를 확인하세요." };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
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

  function boriboriHttpError(response, endpoint) {
    if (!response) return "보리보리 엑셀 다운로드 응답이 없습니다. seller-club 화면을 확인해주세요.";
    if (response.status === 401 || response.status === 403) {
      return "보리보리 seller-club 로그인을 확인한 뒤 다시 수집해주세요.";
    }
    if (response.status === 404) {
      // excel-xlsx 는 조회 결과가 0건이면 404(JSON 에러바디)를 반환한다 → 결제완료 신규 주문 없음.
      return "결제완료 보리보리 신규 주문이 없습니다.";
    }
    return "보리보리 엑셀 다운로드 실패 (" + response.status + ").";
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
}

// ── 쿠팡직배송(사입) 발주 수집: 발주확정(PA) 발주 → 품목(/scm 상세) + 센터주소 ──
// 발주현황=발주확정(PA), 운송유형(SHIPMENT=쉽먼트/MILKRUN=밀크런) 그대로 담아 백엔드가 분리 생성.
// ⚠️품목 상세(/scm/purchase/order/get)는 po-web 컨텍스트서 fetch 하면 로그인페이지 → /scm 페이지로
// 이동한 뒤 그 컨텍스트에서 fetch 해야 인증됨. 목록/센터(po-web API)는 같은 origin이라 /scm 서도 됨.
async function collectCoupangDirectOrders() {
  const { tab, created } = await findOrCreateCoupangPoTab();
  if (!tab?.id) return { success: false, error: "쿠팡 공급사허브(supplier.coupang.com) 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    // 1) 발주확정 목록 (po-web API) → seq/센터/운송유형
    const listInjected = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeCoupangPaList }),
      60000,
      "쿠팡 발주 목록 수집 시간이 초과되었습니다.",
    );
    const listRes = listInjected[0]?.result;
    if (!listRes?.success) return listRes ?? { success: false, error: "쿠팡 발주 목록에 접근하지 못했습니다." };
    if (!listRes.pos.length) return { success: true, pos: [], centers: {}, count: 0 };

    // 2) /scm 컨텍스트로 이동 (품목 fetch 인증 위해). 첫 발주 상세 페이지.
    await chrome.tabs.update(tab.id, { url: "https://supplier.coupang.com/scm/purchase/order/get/" + listRes.pos[0].seq });
    await waitForTabReady(tab.id);

    // 3) 품목(/scm) + 센터주소 수집
    const dataInjected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeCoupangDirectData,
        args: [listRes.pos],
      }),
      180000,
      "쿠팡 발주 품목 수집 시간이 초과되었습니다.",
    );
    return dataInjected[0]?.result ?? { success: false, error: "쿠팡 발주 상세에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("쿠팡직배송"); }
    return mallGenericErrorResult("쿠팡직배송", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

async function findOrCreateCoupangPoTab() {
  const tabs = await chrome.tabs.query({ url: COUPANG_SUPPLIER_TAB_MATCHES });
  const poTab = tabs.find((tab) => (tab.url || "").includes("/po-web/purchase/order"));
  if (poTab?.id) return { tab: poTab, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: COUPANG_PO_LIST_URL });
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: COUPANG_PO_LIST_URL, active: false });
  return { tab, created: true };
}

// po-web 페이지 컨텍스트: 발주확정(PA) 목록 fetch → seq/센터/운송유형/입고예정일/발주일.
async function scrapeCoupangPaList() {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    // 발주일(PURCHASE_ORDER_DATE) 기준 최근 7일(오늘 포함 지난 7일). 발주일은 과거라 미래 범위는 0건.
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const pos = [];
    for (let page = 1; page <= 40; page++) {
      const qs =
        "page=" + page + "&searchDateType=PURCHASE_ORDER_DATE&searchStartDate=" + ymd(start) +
        "&searchEndDate=" + ymd(end) +
        "&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=PA" +
        "&purchaseOrderType=&skuIdArray=&crossdock=&transportType=";
      const res = await fetch("/po-web/app/purchase-order/list?" + qs, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok || text.trim().charAt(0) === "<") {
        if (page === 1) {
          return {
            success: false,
            error: "쿠팡 supplier 로그인이 필요합니다. supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.",
          };
        }
        break;
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        if (page === 1) return { success: false, error: "쿠팡 발주 목록 응답을 해석하지 못했습니다." };
        break;
      }
      const body = (j && j.body) || {};
      const list = body.body || [];
      for (const po of list) {
        const status = String(po.purchaseOrderStatus || po.purchaseOrderStatusCode || "").toUpperCase();
        const statusText = String(po.purchaseOrderStatusDescription || po.purchaseOrderStatusName || "");
        if (status && status !== "PA") continue;
        if (!status && statusText && !/발주\s*확정/.test(statusText)) continue;
        pos.push({
          seq: po.purchaseOrderSeq,
          center: po.centerName,
          transport: po.transportType, // SHIPMENT | MILKRUN
          edd: po.expectedDeliveryDate,
          reg: po.createdAt,
          status: status || statusText || "PA",
        });
      }
      if (page >= (body.lastPageNumber || 1)) break;
    }
    return { success: true, pos };
  } catch (e) {
    return { success: false, error: "쿠팡 발주 목록 조회 실패(로그인 확인): " + String((e && e.message) || e) };
  }
}

// /scm 페이지 컨텍스트: 발주별 품목(/scm 상세 HTML 파싱) + 센터주소(po-web) 수집.
async function scrapeCoupangDirectData(pos) {
  try {
    const confirmedPos = Array.isArray(pos) ? pos.filter(isCoupangConfirmedPo) : [];
    const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
    // 센터주소맵 (po-web API, 같은 origin)
    const centers = {};
    try {
      const cj = await (await fetch("/po-web/app/center/purchasable/list", { credentials: "include" })).json();
      const cb = (cj && cj.body) || cj;
      const clist = Array.isArray(cb) ? cb : (cb && cb.body) || [];
      clist.forEach((c) => {
        if (c && c.centerName) centers[String(c.centerName).trim()] = { addr: c.address, zip: c.zipCode, contact: c.contact };
      });
    } catch { /* 센터맵 실패 — 주소 빈칸으로 진행 */ }

    // 품목 파싱: /scm 상세의 "바코드" 헤더 테이블. 각 품목행 td = [순번,상품번호,"바코드 상품명",매입유형,발주수량,납품가능,매입가,...,총발주매입금(idx9)]
    const parseItems = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const t of doc.querySelectorAll("table")) {
        if (!/바코드/.test(t.innerText)) continue;
        const items = [];
        for (const tr of t.querySelectorAll("tr")) {
          const c = [...tr.querySelectorAll("td")].map((x) => x.textContent.replace(/\s+/g, " ").trim());
          const m = c[2] && c[2].match(/^(\d{12,14})\s+(.+)/);
          if (m) items.push({ skuId: c[1], barcode: m[1], name: m[2], qty: num(c[4]), amount: num(c[9]) });
        }
        if (items.length) return items;
      }
      return [];
    };

    const out = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < confirmedPos.length; i += CONCURRENCY) {
      await Promise.all(
        confirmedPos.slice(i, i + CONCURRENCY).map(async (po) => {
          try {
            const html = await (await fetch("/scm/purchase/order/get/" + po.seq, { credentials: "include" })).text();
            out.push({ ...po, items: parseItems(html) });
          } catch {
            out.push({ ...po, items: [] });
          }
        }),
      );
    }
    return { success: true, pos: out, centers, count: out.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }

  function isCoupangConfirmedPo(po) {
    const status = String(po?.status || po?.purchaseOrderStatus || po?.purchaseOrderStatusCode || "").toUpperCase();
    const statusText = String(po?.purchaseOrderStatusDescription || po?.purchaseOrderStatusName || "");
    if (status) return status === "PA";
    if (statusText) return /발주\s*확정/.test(statusText);
    return true;
  }
}

// ── GS샵(partners.gsshop.com) 주문 수집: 협력사 배송관리 화면 UI 구동 + 클라이언트 조립 엑셀 blob 캡처 ──
// GS 는 서버 엑셀 엔드포인트가 없고 다운로드 클릭 시 브라우저가 xlsx 를 조립해 URL.createObjectURL 로 내려준다.
// → MAIN world 에서 createObjectURL 후킹 후 1주일 조회 → 다운로드 → 모달(도로명/전체주소 기본) 확인 → blob 캡처.
async function findOrCreateGsshopTab() {
  const tabs = await chrome.tabs.query({ url: GSSHOP_TAB_MATCHES });
  const mng = tabs.find((t) => (t.url || "").includes("partner-logistics-mng"));
  if (mng?.id) return { tab: mng, created: false }; // 기존 배송관리 탭 재사용
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: GSSHOP_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: GSSHOP_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectGsshopOrders() {
  const { tab, created } = await findOrCreateGsshopTab();
  if (!tab?.id) return { success: false, error: "GS샵(partners.gsshop.com) 탭을 열 수 없습니다." };
  // 조회+상세 fetch 후 클라이언트 엑셀 조립까지 길다. MV3 서비스워커 유휴 종료(=port closed) 방지 keepalive.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeGsshopOrders,
      }),
      140000,
      "GS샵 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "GS샵 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("GS샵"); }
    return mallGenericErrorResult("GS샵", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// partners.gsshop.com 페이지 컨텍스트(MAIN): 1주일 조회 → 다운로드 → 모달 확인 → 조립된 xlsx blob → base64.
async function scrapeGsshopOrders() {
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
      return { success: false, error: "GS샵 협력사 배송관리 화면을 불러오지 못했습니다. 로그인을 확인하세요." };
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
    if (!sb) return { success: false, error: "GS샵 조회 버튼을 찾지 못했습니다." };
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
    const cnt = cntEl ? Number((cntEl.textContent.match(/\((\d+)\)/) || [])[1]) : 0;
    if (!cnt) {
      URL.createObjectURL = origCOU; // 후킹 원복
      return { success: true, empty: true }; // 조회결과 없음 = 주문 없음
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
}

// ── 올웨이즈(alwayzseller.ilevit.com) 주문 수집: "팀모집완료(엑셀추출 이전)" → 엑셀추출하기 blob 캡처 ──
// SPA 가 pre-excel(x-access-token) 데이터를 클라이언트서 xlsx 로 조립해 URL.createObjectURL 로 내려준다.
// → MAIN world 에서 createObjectURL 후킹 + pre-excel 로 건수 확인 + 엑셀추출하기 클릭 → blob 캡처.
async function findOrCreateAlwayzTab() {
  const tabs = await chrome.tabs.query({ url: ALWAYZ_TAB_MATCHES });
  const shipTab = tabs.find((t) => (t.url || "").includes("/shippings"));
  if (shipTab?.id) return { tab: shipTab, created: false };
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: ALWAYZ_ORDER_URL }); // 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: ALWAYZ_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectAlwayzOrders() {
  const { tab, created } = await findOrCreateAlwayzTab();
  if (!tab?.id) return { success: false, error: "올웨이즈(alwayzseller.ilevit.com) 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // createObjectURL 후킹 + React UI 구동은 페이지 메인 컨텍스트 필요
        func: scrapeAlwayzOrders,
      }),
      120000,
      "올웨이즈 주문 수집 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "올웨이즈 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("올웨이즈"); }
    return mallGenericErrorResult("올웨이즈", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// alwayzseller.ilevit.com 페이지 컨텍스트(MAIN): pre-excel 건수 확인 → 엑셀추출하기 → 조립 xlsx blob → base64.
async function scrapeAlwayzOrders() {
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
  const btnByText = (txt, scope) =>
    Array.from((scope || document).querySelectorAll("button, a")).find(
      (b) => (b.textContent || "").replace(/\s+/g, "").includes(txt.replace(/\s+/g, "")) && b.offsetParent !== null,
    ) || null;
  try {
    // 0) 엑셀추출하기 버튼 뜰 때까지 SPA 렌더 대기
    const exBtn = await waitFor(() => btnByText("엑셀추출하기"), 30000, 400);
    if (!exBtn) {
      return { success: false, error: "올웨이즈 배송관리 화면(엑셀추출하기)을 불러오지 못했습니다. 로그인을 확인하세요." };
    }
    // 1) pre-excel API 로 신규주문(엑셀추출 이전) 건수 확인 (0이면 추출 안 함)
    const token = localStorage.getItem("@alwayz@seller@token@") || "";
    let cnt = -1;
    try {
      const pre = await (
        await fetch("https://alwayz-seller-back.ilevit.com/sellers/items/pre-shipping/pre-excel", {
          headers: { "x-access-token": token },
        })
      ).json();
      if (pre && Array.isArray(pre.data)) cnt = pre.data.length;
    } catch (e) {
      /* 건수 확인 실패 — 그냥 진행 */
    }
    if (cnt === 0) return { success: true, empty: true }; // 팀모집완료 신규주문 없음
    // 2) createObjectURL 후킹 (클라이언트 조립 xlsx blob 캡처)
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
    // 3) 엑셀추출하기 클릭 → (확인 모달 있으면 확인)
    (btnByText("엑셀추출하기") || exBtn).click();
    await sleep(900);
    const confirm = Array.from(document.querySelectorAll("[role=dialog] button, .modal button, button")).find(
      (b) => /^(확인|추출|다운로드|네|예)$/.test((b.textContent || "").trim()) && b.offsetParent !== null,
    );
    if (confirm) confirm.click();
    // 4) 조립된 xlsx blob 대기 (최대 60초)
    const blob = await waitFor(() => (blobs.length ? blobs[blobs.length - 1] : null), 60000, 500);
    URL.createObjectURL = origCOU; // 후킹 원복
    if (!blob) {
      return { success: false, error: "올웨이즈 엑셀 추출(다운로드)에 실패했습니다." };
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
    return { success: true, xlsxBase64: btoa(bin), fileName: "올웨이즈.xlsx", size: buf.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// partner.kidkids.net 페이지 컨텍스트: 목록 HTML fetch → 출고예정일 필터 → od별 발주서 fetch → om 그룹.
async function scrapeKidkidsOrders(dateFilter) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  try {
    // 1) 출고관리 목록 (page_view_cnt 크게 = 전부). management 는 partner.kidkids.net 동일 origin.
    // 목록도 euc-kr → arrayBuffer 로 받아 명시 디코딩(아니면 주문자명 한글 깨짐).
    const listRes = await fetch("/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=500", { credentials: "include" });
    const listHtml = new TextDecoder("euc-kr").decode(await listRes.arrayBuffer());
    const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
    const seen = [];
    for (const cb of ldoc.querySelectorAll('input[name="CheckBox2"]')) {
      const dpd = cb.getAttribute("delivery_plan_date") || "";
      if (!dpd) continue; // 출고예정일 미지정 = 주문서 조회 불가
      if (dateFilter && !dpd.startsWith(dateFilter)) continue; // 그 출고예정일만
      let tr = cb;
      while (tr && tr.tagName !== "TR") tr = tr.parentElement;
      if (!tr) continue;
      const a = tr.querySelector('a[href*="logis_down.htm"]');
      if (!a) continue;
      const href = a.getAttribute("href") || "";
      const om = (href.match(/om=(\d+)/) || [])[1] || "";
      const ordName = norm(a.textContent); // 주문자명(유치원) = 앵커 텍스트
      const cells = [...tr.querySelectorAll("td")].map((td) => norm(td.textContent));
      const orderDate = cells.find((c) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c)) || "";
      seen.push({ od: cb.value, om, ordName, orderDate });
    }
    if (!seen.length) {
      return { success: true, orders: [], count: 0 }; // 해당 출고예정일 주문 없음 (정상)
    }

    // 발주서01(logis_down5) 파서: 첫 공급단가 테이블 품목 + 받는사람 정보. (상품표 2회 렌더 → 첫 것만)
    const parseDown = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const items = [];
      let name = "";
      let addr = "";
      let tel = "";
      let mobile = "";
      let msg = "";
      let done = false;
      for (const t of doc.querySelectorAll("table")) {
        const trs = [...t.rows];
        const isHdr = trs.some((tr) => [...tr.cells].map((c) => norm(c.textContent)).join("|").includes("공급단가"));
        if (isHdr && !done) {
          for (const tr of trs) {
            const c = [...tr.cells].map((x) => norm(x.textContent));
            if (c.length >= 6 && /^\d{4,}$/.test(c[0]) && c[1]) {
              items.push({ name: c[1], qty: num(c[2]), unit: num(c[4]), sum: num(c[5]) });
            }
          }
          if (items.length) done = true;
        }
        for (const tr of trs) {
          const c = [...tr.cells].map((x) => norm(x.textContent));
          for (let i = 0; i + 1 < c.length; i++) {
            if (c[i] === "받는 사람 이름" && !name) name = c[i + 1];
            if (c[i] === "받는 사람 주소" && !addr) addr = c[i + 1];
            if (c[i] === "전화" && !tel) tel = c[i + 1];
            if (c[i] === "휴대폰" && !mobile) mobile = c[i + 1];
            if (c[i] === "배송 요청사항" && !msg) msg = c[i + 1];
          }
        }
      }
      return { items, name, addr, tel, mobile, msg };
    };

    // 2) od별 발주서 fetch → om 기준 그룹핑 (첫 od 품목 = 주문 전체품목).
    const byOm = new Map();
    const CONCURRENCY = 4;
    for (let i = 0; i < seen.length; i += CONCURRENCY) {
      await Promise.all(
        seen.slice(i, i + CONCURRENCY).map(async (o) => {
          if (byOm.has(o.om)) return; // 다품목: 이미 다른 od 로 전체 수집됨
          try {
            const body = new URLSearchParams();
            body.set("from_logis_index", "Y");
            body.set("mul_id", "|" + o.od);
            body.set("mode", "");
            const res = await fetch("/logis/logis_down5.htm", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });
            const buf = await res.arrayBuffer();
            const html = new TextDecoder("euc-kr").decode(buf); // 발주서 = euc-kr
            const d = parseDown(html);
            if (!d.items.length) return;
            byOm.set(o.om, {
              om: o.om,
              ordName: o.ordName,
              orderDate: o.orderDate,
              recvName: d.name,
              recvAddr: d.addr,
              recvTel: d.tel,
              recvMobile: d.mobile,
              recvMsg: d.msg,
              items: d.items,
            });
          } catch {
            /* 개별 주문서 실패 — 스킵 */
          }
        }),
      );
    }
    const orders = [...byOm.values()];
    return { success: true, orders, count: orders.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 도매꾹(domeggook) 주문 수집: 풀 자동 (엑셀 생성요청 → 완료 폴링 → CDN 다운로드) ──
// 엑셀다운로드는 서버 비동기 생성(~1분). 백그라운드 탭에서 "엑셀다운로드" 클릭 + 생성요청 모달
// submit 으로 오늘 포함 기간 export 를 생성 → getOrderList JSON 폴링(SUCCESS) → CDN CSV base64.
const DOMEGGOOK_LIST_URL = "https://domeggook.com/sc/order/lstAll";
const DOMEGGOOK_ORDERLIST_API = "https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1";

async function domeggookOrderList() {
  const res = await fetch(DOMEGGOOK_ORDERLIST_API, {
    credentials: "include",
    headers: { "x-requested-with": "XMLHttpRequest" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim().startsWith("{")) return null; // 로그인 필요 시 HTML
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// 생성완료(SUCCESS) + 전체주문(ORDER_ALL) CDN URL. afterReq 주면 그 요청시각 이후 것만(새로 생성분).
function pickDomeggookUrl(data, afterReq) {
  const items = Array.isArray(data && data.dat) ? data.dat : [];
  for (const d of items) {
    if (!d || d.state !== "SUCCESS" || !/ORDER_ALL/.test(d.dlBtn || "")) continue;
    if (afterReq && !(String(d.dateReq || "") > afterReq)) continue;
    const url = (String(d.dlBtn).match(/href=['"]([^'"]+)['"]/) || [])[1];
    if (url) return url;
  }
  return null;
}

async function findOrCreateDomeggookTab(navUrl) {
  const tabs = await chrome.tabs.query({ url: "https://domeggook.com/*" });
  const listTab = tabs.find((t) => (t.url || "").includes("/sc/order/lstAll"));
  if (listTab?.id) {
    await chrome.tabs.update(listTab.id, { url: navUrl }); // 기간 설정 URL 로 이동 (백그라운드)
    return { tab: await chrome.tabs.get(listTab.id), created: false };
  }
  const tab = await chrome.tabs.create({ url: navUrl, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

// ── 도매꾹 송장 업로드(발송처리): 송장 엑셀일괄입력 = POST /sc/order/shipXls (multipart deliXls + tar) ──
// ⚠️파괴적: 실주문 발송처리. 프론트가 사용자 확인 후에만 호출한다. 양식 = [주문번호·택배사코드명(DAEHAN)·송장번호] .xls.
const DOMEGGOOK_INPROCESS_URL = "https://domeggook.com/sc/order/lstInprocess";

async function uploadDomeggookTracking(options = {}) {
  const fileBase64 = typeof options.fileBase64 === "string" ? options.fileBase64 : "";
  const fileName = typeof options.fileName === "string" ? options.fileName : "도매꾹_송장.xls";
  const tar = Array.isArray(options.orderNos) ? options.orderNos.join(",") : "";
  if (!fileBase64) return { success: false, error: "도매꾹 송장 파일이 없습니다." };
  const { tab, created } = await findOrCreateDomeggookTab(DOMEGGOOK_INPROCESS_URL);
  if (!tab?.id) return { success: false, error: "도매꾹(domeggook.com) 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN", // 로그인 세션 쿠키로 same-origin POST
        func: scrapeDomeggookShipUpload,
        args: [fileBase64, fileName, tar],
      }),
      60000,
      "도매꾹 송장 업로드 시간이 초과되었습니다.",
    );
    return injected[0]?.result ?? { success: false, error: "도매꾹 화면에 접근하지 못했습니다." };
  } catch (e) {
    if (isMallAccessError(e)) { await bringMallTabToFront(tab.id); return mallAccessErrorResult("도매꾹"); }
    return mallGenericErrorResult("도매꾹", e);
  } finally {
    if (created && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 이미 닫힘 */ }
    }
  }
}

// domeggook.com 페이지 컨텍스트: 송장 엑셀(base64) → File → multipart POST /sc/order/shipXls.
async function scrapeDomeggookShipUpload(fileBase64, fileName, tar) {
  try {
    const bin = atob(fileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], fileName, { type: "application/vnd.ms-excel" });
    const fd = new FormData();
    fd.append("deliXls", file); // 폼 file input 이름
    fd.append("tar", tar || ""); // 대상 주문번호 목록(콤마조인)
    const res = await fetch("/sc/order/shipXls", { method: "POST", credentials: "include", body: fd });
    const text = await res.text();
    if (!res.ok) {
      return { success: false, error: "도매꾹 송장 업로드 실패 (HTTP " + res.status + "). 로그인을 확인하세요.", snippet: text.slice(0, 300) };
    }
    // 응답(HTML/JSON)에서 성공 여부 추정. 확정 못 하면 원문 스니펫을 프론트로 넘겨 사용자가 확인.
    let uploaded = /완료|성공|반영|success/i.test(text) && !/실패|오류|불가/.test(text);
    try {
      const j = JSON.parse(text);
      if (j && (j.res === true || j.result === true || j.success === true)) uploaded = true;
      if (j && (j.res === false || j.result === false)) uploaded = false;
    } catch { /* not json */ }
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    return { success: true, uploaded, httpStatus: res.status, snippet };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function collectDomeggookOrders(date) {
  // 로그인/기존 목록 확인 + 트리거 전 최신 요청시각(이후 새로 생성된 것만 고르기 위함)
  const before = await domeggookOrderList();
  if (!before) return { success: false, error: "domeggook.com 로그인이 필요합니다. 로그인 후 다시 시도하세요." };
  const beforeReq = ((before.dat || [])[0] || {}).dateReq || "";

  // 기간을 지정일로 설정한 URL 로 진입 (dt1=dt2=날짜). date 없으면 기본 기간.
  const dateDot = date ? String(date).replace(/-/g, ".") : ""; // 2026-06-30 → 2026.06.30
  const navUrl = dateDot
    ? DOMEGGOOK_LIST_URL + "?dtbase=ord&dt1=" + dateDot + "&dt2=" + dateDot
    : DOMEGGOOK_LIST_URL;

  const { tab, created } = await findOrCreateDomeggookTab(navUrl);
  if (!tab?.id) return { success: false, error: "도매꾹(domeggook.com) 탭을 열 수 없습니다." };
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    await delay(1500); // 기간 필터 목록 렌더 대기
    // 1) 엑셀다운로드 → 생성요청 모달 submit (설정한 기간으로 export 생성 요청)
    const trig = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: triggerDomeggookExcelGen }),
      30000,
      "도매꾹 생성 요청 시간이 초과되었습니다.",
    );
    const tr = trig[0]?.result;
    if (!tr?.success) return { success: false, error: tr?.error || "도매꾹 엑셀 생성 요청 실패" };
    // 2) 생성 완료 폴링 (최대 ~4분): SUCCESS + beforeReq 이후 파일. 도매꾹 생성이 느려 넉넉히.
    let url = null;
    for (let i = 0; i < 48; i++) {
      await delay(5000);
      url = pickDomeggookUrl(await domeggookOrderList(), beforeReq);
      if (url) break;
    }
    if (!url) {
      return { success: false, error: "도매꾹 엑셀 생성이 지연됩니다(최대 4분 대기 초과). 잠시 후 다시 시도하세요." };
    }
    // 3) CDN CSV fetch (SW = CORS 우회)
    const csvRes = await fetch(url, { credentials: "include" });
    if (!csvRes.ok) return { success: false, error: "도매꾹 CSV 다운로드 실패 (HTTP " + csvRes.status + ")" };
    const buf = new Uint8Array(await csvRes.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
    }
    return {
      success: true,
      csvBase64: btoa(bin), // EUC-KR 원본 bytes 그대로 (백엔드가 디코딩)
      fileName: url.split("/").pop() || "domeggook.csv",
      size: buf.length,
    };
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("도매꾹"); }
    return mallGenericErrorResult("도매꾹", e);
  } finally {
    clearInterval(keepAlive);
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 이미 닫힘 — 무시 */
      }
    }
  }
}

// lstAll 페이지 컨텍스트: "엑셀다운로드" 클릭 → reqXlsNotice iframe(#gLayerFrame, 같은 오리진) submit.
async function triggerDomeggookExcelGen() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const btn = [...document.querySelectorAll("#lList a, #lList button, #lList span, #lList div")].find(
      (e) => (e.textContent || "").replace(/\s+/g, "") === "엑셀다운로드",
    );
    if (!btn) return { success: false, error: "엑셀다운로드 버튼을 찾지 못했습니다. (로그인/화면 확인)" };
    btn.click();
    let doc = null;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      const iframe = document.querySelector("#gLayerFrame iframe");
      try {
        if (iframe && iframe.contentDocument && iframe.contentDocument.querySelector("#lXlsReqNoticeBtnSubmit")) {
          doc = iframe.contentDocument;
          if (iframe.contentWindow) {
            iframe.contentWindow.confirm = () => true; // 혹시 모를 confirm 자동 승인
            iframe.contentWindow.alert = () => {};
          }
          break;
        }
      } catch (e) {
        /* 로딩 중 접근 예외 — 무시하고 재시도 */
      }
    }
    if (!doc) return { success: false, error: "도매꾹 생성 요청 모달을 열지 못했습니다." };
    const submit = doc.querySelector("#lXlsReqNoticeBtnSubmit");
    if (!submit) return { success: false, error: "도매꾹 생성 요청 버튼을 찾지 못했습니다." };
    submit.click();
    return { success: true };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

// ── 키즈노트(WISA) 주문 수집: _manage?body=3010 전체주문조회 테이블 스크래핑 ──
// 백그라운드 수집: 포커스를 뺏지 않고(active 미지정/false) 탭을 연다.
// created=true 면 우리가 새로 연 탭 → 수집 후 자동으로 닫는다(기존 사용자 탭은 건드리지 않음).
async function findOrCreateKidsnoteTab() {
  const tabs = await chrome.tabs.query({ url: KIDSNOTE_TAB_MATCHES });
  const manageTab = tabs.find((tab) => (tab.url || "").includes("/_manage/"));
  if (manageTab?.id) {
    return { tab: manageTab, created: false }; // 기존 _manage 탭 재사용 (포커스 안 뺏음)
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: KIDSNOTE_ORDER_URL }); // active 미지정 = 백그라운드
    return { tab: await chrome.tabs.get(tabs[0].id), created: false };
  }
  const tab = await chrome.tabs.create({ url: KIDSNOTE_ORDER_URL, active: false }); // 백그라운드 새 탭
  return { tab, created: true };
}

async function collectKidsnoteOrders({ from, to, status, withDetail }) {
  const { tab, created } = await findOrCreateKidsnoteTab();
  if (!tab?.id) return { success: false, error: "키즈노트(shop.kidsnote.com) 탭을 열 수 없습니다." };
  let keepOpen = false;
  try {
    await waitForTabReady(tab.id);
    const injected = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeKidsnoteOrders,
        args: [from, to, status || "", withDetail === true],
      }),
      190000,
      "키즈노트 주문 수집 시간이 초과되었습니다.",
    );
    return (
      injected[0]?.result ?? {
        success: false,
        error: "키즈노트 화면에 접근하지 못했습니다.",
      }
    );
  } catch (e) {
    if (isMallAccessError(e)) { keepOpen = created; await bringMallTabToFront(tab.id); return mallAccessErrorResult("키즈노트"); }
    return mallGenericErrorResult("키즈노트", e);
  } finally {
    if (created && tab.id && !keepOpen) {
      try {
        await chrome.tabs.remove(tab.id); // 우리가 연 백그라운드 탭 정리
      } catch {
        /* 탭이 이미 닫힘 — 무시 */
      }
    }
  }
}

// shop.kidsnote.com 페이지 컨텍스트에서 실행 (DOMParser + same-origin fetch + 쿠키).
async function scrapeKidsnoteOrders(from, to, status, withDetail) {
  try {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const num = (s) => Number(String(s == null ? "" : s).replace(/[^0-9.-]/g, "")) || 0;
    // all_date=N 이어야 start_date~finish_date(주문일시)로 필터됨. Y 면 전체 기간(날짜 무시).
    const listUrl = (p) =>
      "/_manage/?body=3010&search_date_type=1&all_date=N" +
      "&start_date=" + (from || "") + "&finish_date=" + (to || "") +
      (status ? "&ord_stat=" + encodeURIComponent(status) : "") +
      "&page=" + p;

    const orders = [];
    const seen = new Set();
    for (let p = 1; p <= 30; p++) {
      const res = await fetch(listUrl(p), { credentials: "include" });
      const html = await res.text();
      if (!res.ok) {
        if (p === 1) return { success: false, error: "키즈노트 주문 조회 실패 (HTTP " + res.status + ")" };
        break;
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = Array.from(doc.querySelectorAll("table")).find(
        (t) => /주문번호/.test((t.rows[0] && t.rows[0].innerText) || ""),
      );
      if (!table) {
        if (p === 1) {
          if (/type=["']?password|로그인|login/i.test(html)) {
            return {
              success: false,
              error: "shop.kidsnote.com 관리자 로그인이 필요합니다. 로그인 후 다시 시도하세요.",
            };
          }
          return { success: true, orders: [], count: 0 };
        }
        break;
      }
      let pageCount = 0;
      let reachedOlder = false;
      for (const r of Array.from(table.rows).slice(1)) {
        const m = r.innerHTML.match(/viewOrder\(['"]([^'"]+)['"]\)/);
        const ono = m && m[1];
        if (!ono || seen.has(ono)) continue;
        const c = Array.from(r.cells);
        if (c.length < 10) continue;
        const ymd = /^(\d{4})(\d{2})(\d{2})/.exec(ono);
        const orderDate = ymd ? ymd[1] + "-" + ymd[2] + "-" + ymd[3] : "";
        // WISA GET 날짜파라미터가 안 먹혀(검색=폼/세션) → 주문일(ono)로 클라 필터. 목록은 최신순 desc.
        if (to && orderDate && orderDate > to) continue; // 범위보다 최신 — 건너뛰고 계속
        if (from && orderDate && orderDate < from) {
          reachedOlder = true; // 범위보다 과거 — 이후는 다 더 과거이므로 중단
          continue;
        }
        seen.add(ono);
        pageCount++;
        const timeM = norm(c[4].innerText).match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        const pnoM =
          r.innerHTML.match(/check_pno\[\][^>]*value=["']([^"']+)["']/i) ||
          r.innerHTML.match(/value=["']([^"']+)["'][^>]*name=["']?check_pno/i);
        orders.push({
          ono: ono,
          pno: pnoM ? pnoM[1] : "",
          orderDate: orderDate,
          orderedAt: orderDate + (timeM ? " " + timeM[1] : ""),
          productName: norm(c[3].innerText),
          ordererName: norm(c[5].innerText),
          totalAmount: num(c[6].innerText),
          paidAmount: num(c[7].innerText),
          payMethod: norm(c[8].innerText),
          status: norm(c[9].innerText),
        });
      }
      if (reachedOlder) break;
      if (pageCount === 0 && orders.length > 0) break;
    }

    // 셀피아 변환용 상세 — "주문서 인쇄"(POST order@order_print.frm, check_pno) 가 마스킹 없이 깔끔.
    if (withDetail && orders.length) {
      const parseDetail = async (o) => {
        try {
          const body = "body=order@order_print.frm&check_pno[]=" + encodeURIComponent(o.pno || "");
          const dhtml = await (
            await fetch("/_manage/?", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: body,
            })
          ).text();
          const ddoc = new DOMParser().parseFromString(dhtml, "text/html");
          // 인쇄페이지는 섹션헤더(○)가 td/th 아님 → innerText 라인 단위 파싱(라벨 다음 줄=값).
          const lines = (ddoc.body ? ddoc.body.innerText : "").split("\n").map((s) => s.trim()).filter(Boolean);
          let sec = "";
          let buyer = "", receiver = "", contact = "", addrRaw = "", request = "", pay = "";
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const nv = lines[i + 1] || "";
            if (/^[○\s]*주문상품/.test(l)) sec = "product";
            else if (/^[○\s]*주문정보/.test(l)) sec = "info";
            else if (/^[○\s]*주문자/.test(l)) sec = "orderer";
            else if (/^[○\s]*배송지/.test(l)) sec = "ship";
            if (sec === "orderer" && l === "이름") buyer = nv.replace(/\s*\(.*\)\s*$/, "").trim();
            else if (sec === "ship" && l === "이름") receiver = nv;
            else if (sec === "ship" && /^연락처/.test(l)) contact = nv;
            else if (sec === "ship" && l === "주소") addrRaw = nv;
            else if (sec === "ship" && /메세지|메시지|요청/.test(l))
              request = /[<>{}=]|function|window\.|onload|confirm\(|\$\(/.test(nv) ? "" : nv;
            else if (sec === "info" && /결제방법|결제수단/.test(l)) pay = nv;
          }
          const zipM = addrRaw.match(/\[?\s*(\d{5})\s*\]?/);
          if (buyer) o.ordererName = buyer; // 마스킹 안 된 주문자명
          o.receiver = receiver;
          o.mobile = (contact.match(/01[0-9-]{7,}/) || contact.match(/[0-9][0-9-]{7,}/) || [""])[0];
          o.tel = "";
          o.zip = zipM ? zipM[1] : "";
          o.address = addrRaw.replace(/\[?\s*\d{5}\s*\]?\s*/, "").trim();
          o.request = request;
          if (pay) o.payMethod = pay;
          // 금액·배송비는 인쇄페이지가 부정확(상품합계/배송비 부풀려짐) → viewOrder 품목표가 정답.
          // viewOrder head: [_, 주문번호, 제품명, 상품가격, 수량, 할인적용, 금액, 배송비, 소계, 주문상태, 속성]
          o.items = [];
          try {
            const vhtml = await (
              await fetch("/_manage/?body=order@order_view.frm&ono=" + encodeURIComponent(o.ono), {
                credentials: "include",
              })
            ).text();
            const vdoc = new DOMParser().parseFromString(vhtml, "text/html");
            // 입금일시 = 상태이력의 "결제완료" 처리일시(분 단위; 초는 화면에 없음). 주문시각보다 정확.
            const vtext = (vdoc.body ? vdoc.body.innerText : "").replace(/[ \t]+/g, " ");
            const payM = vtext.match(/결제완료\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
            if (payM) o.paidAt = payM[1];
            const itemT = Array.from(vdoc.querySelectorAll("table")).find(
              (t) => /제품명|상품명/.test(norm(t.rows[0] && t.rows[0].innerText)) && /수량/.test(norm(t.innerText)),
            );
            if (itemT) {
              const head = Array.from(itemT.rows[0].cells).map((cc) => norm(cc.innerText));
              const ci = (n) => head.findIndex((h) => h.includes(n));
              const ni = ci("제품명") >= 0 ? ci("제품명") : ci("상품");
              const qi = ci("수량");
              const ai = ci("금액"); // 상품총액 = 수량 × 상품가격
              const fi = ci("배송비");
              for (const row of Array.from(itemT.rows).slice(1)) {
                const cc = Array.from(row.cells);
                if (cc.length < 9) continue; // 품목행은 11칸; 변경내역(colspan 1칸) 제외
                // 제품명 = 가장 긴 링크(공급사/재고상세/송장 링크 제외) → 상품명만.
                const nameCell = ni >= 0 ? cc[ni] : null;
                const links = nameCell
                  ? Array.from(nameCell.querySelectorAll("a")).map((a) => norm(a.innerText)).filter(Boolean)
                  : [];
                let nm = links.filter((t) => !/재고상세/.test(t)).sort((a, b) => b.length - a.length)[0] ||
                  norm(nameCell ? nameCell.innerText : "");
                if (!nm || /합계|소계|배송비|총결제|제품명/.test(nm)) continue;
                // 공급사/재고/택배 정보 컷 (주식회사… 현재고… [재고상세]… 택배사…)
                nm = nm.split(/\s*(?:주식회사|\(주\)|㈜|현재고\s*[:：]|재고상세|CJ대한통운|우체국|한진택배|롯데택배|로젠택배)/)[0].trim();
                o.items.push({
                  productName: nm,
                  qty: qi >= 0 ? num(cc[qi].innerText) : 0,
                  option: "",
                  amount: ai >= 0 ? num(cc[ai].innerText) : 0,
                  shipFee: fi >= 0 ? num(cc[fi].innerText) : 0,
                });
              }
            }
          } catch (ve) {
            o.detailError = "viewOrder: " + String((ve && ve.message) || ve);
          }
          if (!o.items.length) o.items = [{ productName: o.productName, qty: 1, option: "", amount: 0, shipFee: 0 }];
        } catch (e) {
          o.detailError = String((e && e.message) || e);
        }
      };
      for (let i = 0; i < orders.length; i += 4) {
        await Promise.all(orders.slice(i, i + 4).map(parseDetail));
      }
    }

    return { success: true, orders: orders, count: orders.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}

async function clickCoupangShipmentDownloadButtons(options) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const targetDate = compactDate(options?.date || "");
  const wantLabels = options?.labels !== false;
  const wantStatements = options?.statements !== false;

  const table = findShipmentTable();
  if (!table) {
    return {
      success: false,
      error: "쿠팡 쉽먼트 조회 결과 표를 찾지 못했습니다.",
    };
  }

  const headerMap = buildHeaderMap(table);
  const rowElements = Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    return cells.length >= 6 && row.offsetParent !== null;
  });

  const rows = [];
  const availableDates = new Set();
  let labelCount = 0;
  let statementCount = 0;

  for (const row of rowElements) {
    const cells = Array.from(row.querySelectorAll("td"));
    const shipmentId = textAt(cells, headerMap, ["쉽먼트 번호", "shipment"]);
    const outboundAt = textAt(cells, headerMap, ["발송일"]);
    const inboundDate = textAt(cells, headerMap, ["입고예정일", "입고 예정일"]);
    const center = textAt(cells, headerMap, ["센터"]);
    // 입고예정일·발송일 둘 다 후보(화면 컬럼 의미차 흡수). 하나라도 선택 날짜와 맞으면 통과.
    const candInbound = compactDate(inboundDate);
    const candOutbound = compactDate(outboundAt);
    if (candInbound) availableDates.add(candInbound);
    if (candOutbound) availableDates.add(candOutbound);
    if (targetDate && candInbound !== targetDate && candOutbound !== targetDate) continue;

    let labelClicked = false;
    let statementClicked = false;

    if (wantLabels) {
      const button = findRowButton(row, ["label", "라벨"]);
      if (button) {
        button.click();
        labelClicked = true;
        labelCount += 1;
        await delay(450);
      }
    }
    if (wantStatements) {
      const button = findRowButton(row, ["내역서"]);
      if (button) {
        button.click();
        statementClicked = true;
        statementCount += 1;
        await delay(450);
      }
    }

    rows.push({
      shipmentId,
      outboundAt,
      inboundDate,
      center,
      labelClicked,
      statementClicked,
    });
  }

  if (rows.length === 0) {
    const seen = Array.from(availableDates).sort();
    const hint = seen.length
      ? ` (화면 표의 날짜: ${seen.join(", ")} — '다운로드 날짜'를 이 중 하나로 맞춰 다시 시도하세요)`
      : ` (표 ${rowElements.length}행에서 입고예정일/발송일 날짜를 읽지 못했습니다. 쿠팡 쉽먼트 화면에 해당 날짜 결과가 조회돼 있는지 확인하세요)`;
    return {
      success: false,
      error: targetDate
        ? `선택한 날짜(${targetDate})에 해당하는 쉽먼트 행을 찾지 못했습니다.${hint}`
        : "다운로드할 쉽먼트 행을 찾지 못했습니다.",
      availableDates: seen,
      rowCount: rowElements.length,
    };
  }

  return {
    success: true,
    rows,
    labelCount,
    statementCount,
    url: location.href,
  };

  function findShipmentTable() {
    const tables = Array.from(document.querySelectorAll("table"));
    return tables.find((candidate) => {
      const text = (candidate.textContent || "").replace(/\s+/g, "");
      return text.includes("쉽먼트번호") && text.includes("입고예정일") && text.includes("센터");
    }) || null;
  }

  function buildHeaderMap(tableElement) {
    const headers = Array.from(tableElement.querySelectorAll("thead th, tr:first-child th"));
    const map = new Map();
    headers.forEach((header, index) => {
      const text = normalizeText(header.textContent || "");
      if (text) map.set(text, index);
    });
    return map;
  }

  function textAt(cells, map, names) {
    for (const name of names) {
      const normalized = normalizeText(name);
      const exact = map.get(normalized);
      if (typeof exact === "number" && cells[exact]) {
        return normalizeText(cells[exact].textContent || "");
      }
      const fuzzy = Array.from(map.entries()).find(([header]) => header.includes(normalized));
      if (fuzzy && cells[fuzzy[1]]) return normalizeText(cells[fuzzy[1]].textContent || "");
    }
    return "";
  }

  function findRowButton(row, labels) {
    const targets = labels.map((label) => label.toLowerCase());
    return Array.from(row.querySelectorAll("button, a, input[type='button']")).find((element) => {
      const text = normalizeText(
        element.tagName === "INPUT"
          ? element.value || element.getAttribute("aria-label") || ""
          : element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "",
      ).toLowerCase();
      return targets.some((target) => text.includes(target));
    }) || null;
  }

  function compactDate(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (digits.length >= 8) return digits.slice(0, 8);
    return "";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
}

async function injectSellpiaOrderFile(payload) {
  const shopName = payload.shopName;
  const fileName = payload.fileName;
  const fileBase64 = payload.fileBase64;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  if (!shopSelect || !fileInput) {
    return {
      success: false,
      pendingPage: true,
      error:
        "셀피아 주문접수(파일 업로드) 화면 요소를 찾지 못했습니다. order_collect 화면이 열렸는지/로그인 상태인지 확인해주세요.",
    };
  }
  if (shopName && !matched) {
    return {
      success: false,
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
        shop: matched ? String(matched.textContent || "").trim() : null,
        error:
          "셀피아 엑셀양식이 자동으로 설정되지 않았습니다. 해당 판매처의 엑셀양식을 셀피아에서 먼저 설정해주세요.",
      };
    }
  }

  // 3) 파일 주입 (file input 은 값 직접 설정 불가 → DataTransfer 로 files 세팅)
  let bytes;
  try {
    bytes = base64ToBytes(fileBase64);
  } catch (error) {
    return { success: false, error: "전송 파일 디코딩에 실패했습니다." };
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
    return {
      success: false,
      shop: matched ? String(matched.textContent || "").trim() : null,
      error: "셀피아 파일 입력칸에 파일을 넣지 못했습니다.",
    };
  }

  // 4) 주문접수 클릭 (om_fileupload())
  if (!submitButton) {
    return {
      success: false,
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error: "파일은 주입했지만 '주문접수' 버튼을 찾지 못했습니다.",
    };
  }
  submitButton.click();

  return {
    success: true,
    submitted: true,
    shop: matched ? String(matched.textContent || "").trim() : null,
    excelFormat: excelSelect ? excelSelect.value : null,
    fileName,
  };

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
}

async function collectIcecreamMallOrders(date, credentials) {
  const tab = await findOrCreateIcecreamMallTab();
  if (!tab.id) {
    return { success: false, error: "아이스크림몰 탭을 열 수 없습니다." };
  }

  await waitForTabReady(tab.id);
  const login = await withTimeout(
    ensureIcecreamMallLogin(tab.id, credentials),
    35000,
    "아이스크림몰 로그인 자동 입력 시간이 초과되었습니다.",
  );
  if (!login.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: login.pendingLogin ?? true,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: login.error || "아이스크림몰 로그인 자동 입력에 실패했습니다.",
    };
  }

  const deliveryInquiry = await withTimeout(
    openIcecreamMallDeliveryInquiry(tab.id),
    15000,
    "아이스크림몰 배송조회 화면 이동 시간이 초과되었습니다.",
  );
  if (!deliveryInquiry.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: deliveryInquiry.pendingLogin,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: deliveryInquiry.error,
    };
  }

  const deliveryFrameId = await findIcecreamMallDeliveryFrameId(tab.id);
  const target =
    deliveryFrameId == null ? { tabId: tab.id, allFrames: true } : { tabId: tab.id, frameIds: [deliveryFrameId] };
  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target,
      world: "MAIN", // ⭐페이지 컨텍스트로 실행: 조회(#btn_list) 클릭이 몰 프레임워크(WebSquare) 핸들러를
      // 확실히 발동시켜 그리드가 로딩됨. ISOLATED 월드 클릭은 핸들러를 못 깨워 "총 0건"에서 멈춘다.
      func: scrapeIcecreamMallDeliveryGrid,
      args: [date, ICECREAM_DELIVERY_HEADERS],
    }),
    35000,
    "아이스크림몰 배송목록 수집 시간이 초과되었습니다.",
  );

  const results = injected.map((item) => item.result).filter(Boolean);
  const candidates = results.filter((item) => item?.success && Array.isArray(item.rows));
  candidates.sort((a, b) => b.rows.length - a.rows.length);
  const best = candidates[0];

  if (!best) {
    const failure = summarizeScrapeFailures(results);
    return {
      success: false,
      pendingLogin: false,
      url: tab.url || ICECREAM_MALL_URL,
      error: failure || "아이스크림몰 배송조회 화면은 열었지만 배송목록 표를 찾지 못했습니다.",
    };
  }

  return {
    success: true,
    tabId: tab.id,
    url: tab.url || ICECREAM_MALL_URL,
    ...best,
  };
}

async function findIcecreamMallDeliveryFrameId(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallDeliveryFrame,
  });
  const candidates = injected
    .filter((item) => item.result?.candidate)
    .sort((a, b) => (b.result.score || 0) - (a.result.score || 0));
  return candidates[0]?.frameId ?? null;
}

function detectIcecreamMallDeliveryFrame() {
  const text = document.body?.innerText || "";
  const compact = text.replace(/\s+/g, "");
  const href = location.href || "";
  let score = 0;
  if (href.includes("deliveryInquiry.deliveryInquiryListView")) score += 10;
  if (compact.includes("배송조회")) score += 5;
  if (compact.includes("배송목록")) score += 5;
  if (compact.includes("주문번호") && compact.includes("배송번호")) score += 5;
  if (compact.includes("상품번호") || compact.includes("상품명")) score += 2;
  return {
    candidate: score > 0,
    score,
    href,
  };
}

function summarizeScrapeFailures(results) {
  const reasons = results.map((item) => item?.reason).filter(Boolean);
  const dataFail = results.find((item) => item?.reason === "data rows not found");
  if (dataFail) {
    // 주문은 있는데 전부 이미 출고/완료 상태라 제외된 경우.
    if ((dataFail.doneExcluded || 0) > 0 && (dataFail.orderRows || 0) > 0) {
      return `수집할 출고 전 주문이 없습니다. (최근 30일 주문 ${dataFail.orderRows}건이 전부 이미 출고완료/배송완료 등 처리됨)`;
    }
    // 표는 있는데 주문번호(YYYYMMDDM…) 형식 행이 0건.
    if ((dataFail.candidateRows || 0) > 0) {
      return (
        `배송목록 표(${dataFail.candidateRows}행)는 찾았지만 주문번호(YYYYMMDDM…) 형식의 주문이 없습니다. ` +
        "최근 30일 주문이 없거나, 주문번호가 마스킹되어 있을 수 있습니다."
      );
    }
    return "배송목록 표는 찾았지만 주문 행을 찾지 못했습니다. 조회 결과를 확인해주세요.";
  }
  if (reasons.includes("header not found")) {
    return "배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다. 표가 로딩된 뒤 다시 시도해주세요.";
  }
  if (reasons.includes("not delivery inquiry frame")) {
    return "배송조회 화면은 열었지만 수집 가능한 배송조회 프레임을 찾지 못했습니다.";
  }
  return "";
}

async function findOrCreateIcecreamMallTab() {
  const tabs = await chrome.tabs.query({ url: ICECREAM_MALL_TAB_MATCHES });
  const active = tabs.find((tab) => tab.active) || tabs[0];
  if (active) return active;

  return chrome.tabs.create({ url: ICECREAM_MALL_URL, active: true });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const done = () => resolve();
    const timeout = setTimeout(done, 10000);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        clearTimeout(timeout);
        done();
        return;
      }

      const listener = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        done();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function ensureIcecreamMallLogin(tabId, credentials) {
  if (!credentials) return { success: true, submitted: false };

  // 로그인 페이지는 main.do → loginForm.do 리다이렉트 + JS 렌더라 늦게 뜬다.
  // 첫 스캔에서 폼이 덜 그려졌다고 바로 실패 처리하지 말고, 창 안에서 계속 재시도한다.
  const loginDetectExpiresAt = Date.now() + 15000;
  let sawLoginForm = false;
  let lastIncompleteReason = null;

  while (Date.now() < loginDetectExpiresAt) {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: autoSubmitIcecreamMallLogin,
      args: [credentials],
    });
    const results = injected.map((item) => item.result).filter(Boolean);

    if (results.some((item) => item.state === "submitted")) {
      return waitForIcecreamMallLoginComplete(tabId);
    }
    if (results.some((item) => item.state === "credentials-missing")) {
      return {
        success: false,
        submitted: false,
        pendingLogin: true,
        error: "아이스크림몰 계정 ID와 비밀번호가 저장되어 있지 않습니다.",
      };
    }
    const incomplete = results.find((item) => item.state === "incomplete");
    if (incomplete) {
      sawLoginForm = true;
      lastIncompleteReason = incomplete.reason || lastIncompleteReason;
    }

    await delay(500);
  }

  if (sawLoginForm) {
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: `아이스크림몰 로그인 폼은 찾았지만 자동 로그인을 완료하지 못했습니다 (${lastIncompleteReason || "unknown"}). 로그인 화면 구조가 바뀌었을 수 있습니다.`,
    };
  }

  // 창 내내 로그인 폼(비밀번호 입력칸)을 한 번도 못 봤으면 이미 로그인된 상태로 본다.
  return { success: true, submitted: false };
}

async function waitForIcecreamMallLoginComplete(tabId) {
  const expiresAt = Date.now() + 25000;
  while (Date.now() < expiresAt) {
    await delay(500);
    await waitForTabReady(tabId);
    const state = await detectIcecreamMallLoginInFrames(tabId);
    if (!state.loginPage) {
      return { success: true, submitted: true };
    }
  }

  return {
    success: false,
    submitted: true,
    pendingLogin: true,
    error: "아이스크림몰 로그인 자동 입력은 완료했지만 로그인 후 화면으로 넘어가지 않았습니다. 계정 정보를 확인해주세요.",
  };
}

async function detectIcecreamMallLoginInFrames(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallLoginState,
  });
  const frames = injected.map((item) => item.result).filter(Boolean);
  return {
    loginPage: frames.some((item) => item.loginPage),
    frames,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 제네릭 자동 로그인: 탭에 로그인 폼(ID/비밀번호칸)이 보이면 저장된 계정으로 채워 제출한다.
// credentials 없으면 아무것도 안 함(세션에 의존 = 기존 동작). autoSubmitIcecreamMallLogin 휴리스틱 재사용.
async function ensureMallLogin(tabId, credentials) {
  if (!credentials || !credentials.loginId || !credentials.password) {
    return { success: true, submitted: false };
  }
  const expiresAt = Date.now() + 15000;
  while (Date.now() < expiresAt) {
    let results = [];
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: autoSubmitIcecreamMallLogin,
        args: [credentials],
      });
      results = injected.map((item) => item.result).filter(Boolean);
    } catch (e) {
      /* 프레임 아직 준비 안 됨 — 재시도 */
    }
    if (results.some((r) => r.state === "submitted")) {
      await delay(1500);
      await waitForTabReady(tabId); // 로그인 후 리다이렉트 정착
      await delay(1200);
      return { success: true, submitted: true };
    }
    // 어느 프레임에서도 로그인 폼이 없으면 이미 로그인된 상태로 간주.
    if (results.length && results.every((r) => r.state === "no-login-form")) {
      return { success: true, submitted: false };
    }
    await delay(500);
  }
  return { success: true, submitted: false }; // 폼 못 봄 → 이미 로그인 간주
}

// 수집 전 자동 로그인 보장: 몰 주문/홈 URL 을 백그라운드로 열어(미로그인 시 로그인 페이지로 리다이렉트)
// 저장된 계정으로 로그인 후 닫는다. 이후 수집 탭은 같은 세션 쿠키라 로그인 상태. credentials 없으면 스킵.
async function ensureMallLoggedIn(mallKey, credentials) {
  if (!credentials || !credentials.loginId || !credentials.password) {
    return { success: true, submitted: false };
  }
  const urls = {
    kidsnote: KIDSNOTE_ORDER_URL,
    kkomangse: KKOMANGSE_ORDER_URL,
    onch: ONCHANNEL_ORDER_URL,
    domeggook: DOMEGGOOK_LIST_URL,
    kidkids: KIDKIDS_ORDER_URL,
    boribori: BORIBORI_ORDER_URL,
    art09: ART09_ORDER_URL,
    "icecream-mall": ICECREAM_MALL_URL,
  };
  const url = urls[mallKey];
  if (!url) return { success: true, submitted: false }; // 자동 로그인 미지원 몰
  const tab = await chrome.tabs.create({ url, active: false }); // 백그라운드
  if (!tab?.id) return { success: false, error: "자동 로그인 탭을 열 수 없습니다." };
  try {
    await waitForTabReady(tab.id);
    await delay(1000);
    return await withTimeout(
      ensureMallLogin(tab.id, credentials),
      35000,
      "자동 로그인 시간이 초과되었습니다.",
    );
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      /* 이미 닫힘 — 무시 */
    }
  }
}

function detectIcecreamMallLoginState() {
  const passwordInput = findPasswordInput();
  return {
    loginPage: Boolean(passwordInput),
    href: location.href,
  };

  function findPasswordInput() {
    return Array.from(document.querySelectorAll("input")).find((input) => {
      const type = String(input.type || "").toLowerCase();
      const descriptor = inputDescriptor(input);
      return isVisibleInput(input) && (type === "password" || descriptor.includes("비밀번호") || descriptor.includes("password") || descriptor.includes("passwd") || descriptor.includes("pwd"));
    });
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleInput(input) {
    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !input.disabled
    );
  }
}

function autoSubmitIcecreamMallLogin(credentials) {
  const passwordInput = pickPasswordInput();
  if (!passwordInput) {
    // 비밀번호 입력칸이 아직 없음 → 로그인 폼 미표시(이미 로그인했거나 렌더 전). 호출부에서 재시도.
    return { state: "no-login-form" };
  }

  if (!credentials || !credentials.loginId || !credentials.password) {
    return { state: "credentials-missing" };
  }

  const loginInput = pickLoginIdInput(passwordInput);
  if (!loginInput) {
    // 비번칸은 떴는데 ID칸이 아직 안 보임 → 다음 스캔에서 재시도.
    return { state: "incomplete", reason: "id-input-not-found" };
  }

  setInputValue(loginInput, credentials.loginId);
  setInputValue(passwordInput, credentials.password);

  if (triggerLogin(passwordInput)) {
    return { state: "submitted" };
  }
  return { state: "incomplete", reason: "submit-not-found" };

  // 아이스크림몰 정확 셀렉터(#password) 우선, 못 찾으면 일반 휴리스틱.
  function pickPasswordInput() {
    const exact = document.querySelector("input#password, input[name='password']");
    if (exact && isVisibleInput(exact)) return exact;
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        const type = String(input.type || "").toLowerCase();
        const descriptor = inputDescriptor(input);
        return (
          isVisibleInput(input) &&
          (type === "password" ||
            descriptor.includes("비밀번호") ||
            descriptor.includes("password") ||
            descriptor.includes("passwd") ||
            descriptor.includes("pwd"))
        );
      }) || null
    );
  }

  // 아이스크림몰 정확 셀렉터(#loginId) 우선, 못 찾으면 폼/문서에서 랭킹.
  function pickLoginIdInput(anchor) {
    const exact = document.querySelector("input#loginId, input[name='loginId']");
    if (exact && isVisibleInput(exact)) return exact;
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return rankLoginInputs(inputs, anchor)[0] || null;
  }

  function textInputs(root) {
    return Array.from(root.querySelectorAll("input")).filter((input) => {
      const type = String(input.type || "text").toLowerCase();
      return ["", "text", "email", "tel", "search", "number"].includes(type) && isVisibleInput(input);
    });
  }

  // 1) onclick 에 doLogin 이 든 컨트롤 → 2) 텍스트가 "로그인" → 3) form submit 순으로 시도.
  function triggerLogin(anchor) {
    const byHandler = Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .filter(isVisibleControl)
      .find((el) => /dologin/i.test(el.getAttribute("onclick") || ""));
    if (byHandler) {
      byHandler.click();
      return true;
    }

    const form = anchor.closest("form");
    const byText = findLoginControl(form || document) || (form ? findLoginControl(document) : null);
    if (byText) {
      byText.click();
      return true;
    }

    if (form) {
      const submitControl = Array.from(
        form.querySelectorAll("input[type='submit'],button[type='submit']"),
      ).filter(isVisibleControl)[0];
      if (submitControl) {
        submitControl.click();
        return true;
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return true;
      }
      if (form.submit) {
        form.submit();
        return true;
      }
    }
    return false;
  }

  function findLoginControl(root) {
    const controls = Array.from(
      root.querySelectorAll("a,button,input[type='button'],input[type='submit'],[role='button'],[onclick]"),
    ).filter(isVisibleControl);
    return (
      controls.find((control) => {
        const text = String(
          control.textContent ||
            control.value ||
            control.getAttribute("title") ||
            control.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim();
        return text === "로그인" || text.toLowerCase() === "login";
      }) || null
    );
  }

  function rankLoginInputs(inputs, anchor) {
    return inputs
      .map((input) => ({ input, score: loginInputScore(input, anchor) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.input);
  }

  function loginInputScore(input, anchor) {
    const descriptor = [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 1;
    if (descriptor.includes("아이디")) score += 6;
    if (descriptor.includes("loginid")) score += 6;
    if (descriptor.includes("id")) score += 4;
    if (descriptor.includes("login")) score += 4;
    if (descriptor.includes("user")) score += 3;
    if (descriptor.includes("email")) score += 2;
    if (anchor && input.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) score += 3;
    return score;
  }

  function associatedLabelText(input) {
    const labels = [];
    if (input.labels) {
      labels.push(...Array.from(input.labels).map((label) => label.textContent || ""));
    }
    const parentLabel = input.closest("label");
    if (parentLabel) labels.push(parentLabel.textContent || "");
    return labels.join(" ");
  }

  function setInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisibleInput(input) {
    return isVisibleControl(input) && !input.readOnly;
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleControl(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.disabled
    );
  }
}

async function openIcecreamMallDeliveryInquiry(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: ensureIcecreamMallDeliveryInquiry,
  });

  return injected[0]?.result ?? {
    success: false,
    pendingLogin: true,
    error: "아이스크림몰 화면에 접근하지 못했습니다. 로그인 상태를 확인해주세요.",
  };
}

async function ensureIcecreamMallDeliveryInquiry() {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function hasDeliveryInquiryFrame() {
    const bodyText = document.body?.innerText || "";
    if (hasDeliveryInquiryText(bodyText)) {
      return true;
    }

    return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
      const src = String(frame.getAttribute("src") || "");
      if (src.includes("deliveryInquiry.deliveryInquiryListView")) return true;

      try {
        const frameText = frame.contentDocument?.body?.innerText || "";
        return hasDeliveryInquiryText(frameText);
      } catch {
        return false;
      }
    });
  }

  function clickDeliveryInquiryMenu() {
    const candidates = menuCandidates();
    const exact = candidates.find((item) => item.text === "배송 조회" || item.text === "배송조회");
    if (exact) {
      exact.element.click();
      return true;
    }

    const deliverySection = candidates.find((item) => item.text === "배송");
    deliverySection?.element.click();

    const afterSectionClick = menuCandidates().find(
      (item) => item.text === "배송 조회" || item.text === "배송조회",
    );
    if (afterSectionClick) {
      afterSectionClick.element.click();
      return true;
    }

    return false;
  }

  function menuCandidates() {
    return Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .map((element) => ({
        element,
        text: String(
          element.textContent ||
            element.value ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((item) => item.text.includes("배송"));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  if (hasDeliveryInquiryFrame()) {
    return { success: true, opened: false };
  }

  const clicked = clickDeliveryInquiryMenu();
  if (!clicked) {
    const bodyText = document.body?.innerText || "";
    return {
      success: false,
      pendingLogin: !bodyText.includes("배송"),
      error: "아이스크림몰 배송조회 메뉴를 찾지 못했습니다. 로그인 후 다시 시도해주세요.",
    };
  }

  const expiresAt = Date.now() + 12000;
  while (Date.now() < expiresAt) {
    if (hasDeliveryInquiryFrame()) {
      return { success: true, opened: true };
    }
    await delay(400);
  }

  return {
    success: false,
    pendingLogin: false,
    error: "배송조회 메뉴를 눌렀지만 배송목록 화면이 열리지 않았습니다.",
  };
}

async function scrapeIcecreamMallDeliveryGrid(date, expectedHeaders) {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  // 조회 기간을 [startYmd, endYmd] 로 설정. startDate/endDate 이름 우선, 없으면 값이 날짜인 input 첫 2개.
  function setDateRange(startYmd, endYmd) {
    const applyVal = (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    let startEl = document.querySelector("input[name='startDate'], input#startDate, input[name='startDt']");
    let endEl = document.querySelector("input[name='endDate'], input#endDate, input[name='endDt']");
    if (!startEl || !endEl) {
      const dateInputs = Array.from(document.querySelectorAll("input")).filter((input) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(input.value || "")),
      );
      startEl = startEl || dateInputs[0] || null;
      endEl = endEl || dateInputs[1] || null;
    }
    if (startEl) applyVal(startEl, startYmd);
    if (endEl) applyVal(endEl, endYmd);
    return Boolean(startEl && endEl);
  }

  function clickSearchButton() {
    const controls = Array.from(document.querySelectorAll("a,button,input[type='button']"));
    const byText = controls.find((control) => {
      const text = String(control.textContent || control.value || "").replace(/\s+/g, " ").trim();
      return text === "조회";
    });
    const search = document.getElementById("btn_list") || byText; // 배송조회 조회 버튼(#btn_list 우선)
    search?.click();
    return Boolean(search);
  }

  function findHeaderCells() {
    const candidates = collectCandidateRows()
      .map((row) => cellTexts(row))
      .filter((cells) => cells.length > 0);
    const header = candidates
      .map(normalizeHeaderCells)
      .filter((cells) => isDeliveryHeader(cells))
      .sort((a, b) => b.length - a.length)[0];

    const hasOrderRows = candidates.some((cells) =>
      cells.some((cell) => /^\d{8}M\d+/.test(cell || "")),
    );
    if (header && header.length >= 20) return header;
    return hasOrderRows ? expectedHeaders : header ?? [];
  }

  function findDataRows(headers) {
    const columnCount = headers.length;
    const statusIdx = headers.indexOf("주문내역상태");
    // 이미 처리된 상태(출고/배송완료·구매확정·반품·회수)는 제외 = 출고 전 주문만 수집(중복 배송 방지).
    const DONE_STATUS = ["출고완료", "배송완료", "구매확정", "반품접수", "회수지시", "회수확인", "회수완료"];
    const rows = [];
    const seen = new Set();
    let candidateRows = 0; // 표에서 스캔한 행 수(진단용)
    let orderRows = 0; // 주문번호(YYYYMMDDM…) 형식 행 수(진단용)
    let doneExcluded = 0; // 이미 출고/완료로 제외된 주문 수(진단용)
    for (const row of collectCandidateRows()) {
      const cells = cellTexts(row);
      if (cells.length) candidateRows += 1;
      const orderIndex = cells.findIndex((cell) => /^\d{8}M\d+/.test(cell || ""));
      if (orderIndex < 0) continue;
      orderRows += 1;

      const hasNoColumn = headers[0] === "No";
      const start =
        hasNoColumn && orderIndex > 0 && /^\d+$/.test(cells[orderIndex - 1] || "")
          ? orderIndex - 1
          : orderIndex;
      if (cells.length - start < Math.min(columnCount, 12)) continue;

      const normalized = cells.slice(start, start + columnCount);
      while (normalized.length < columnCount) normalized.push("");

      const key = normalized.join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);

      // 출고 전 주문만: 이미 출고/배송완료·구매확정·반품·회수 상태는 제외.
      const status = statusIdx >= 0 ? String(normalized[statusIdx] || "") : "";
      if (DONE_STATUS.some((s) => status.includes(s))) {
        doneExcluded += 1;
        continue;
      }

      rows.push(normalized);
    }
    // 출고 전(미출고) 주문 전부 반환. 조회일 무관 — 기간 내 미출고 주문을 셀피아로 전송(사용자가 미리보기 확인).
    return { rows, candidateRows, orderRows, doneExcluded };
  }

  function collectCandidateRows() {
    const selectors = [
      "table tr",
      "[role='row']",
      ".slick-row",
      ".aui-grid-row",
      ".tui-grid-row",
      ".x-grid-row",
      ".ui-jqgrid-btable tr",
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")));
  }

  function cellTexts(row) {
    const cells = Array.from(
      row.matches("tr")
        ? row.querySelectorAll("th,td")
        : row.querySelectorAll(
            [
              "[role='columnheader']",
              "[role='gridcell']",
              ".slick-cell",
              ".aui-grid-cell",
              ".tui-grid-cell",
              ".x-grid-cell",
              "th",
              "td",
            ].join(","),
          ),
    );
    return cells.map((cell) =>
      String(cell.textContent || "").replace(/\s+/g, " ").trim(),
    );
  }

  function normalizeHeaderCells(cells) {
    return cells.map((cell) => {
      if (cell === "거래명세서통봉여부") return "거래명세서동봉여부";
      return cell;
    });
  }

  function isDeliveryHeader(cells) {
    const compact = cells.join("\u001f");
    return (
      cells.includes("주문번호") &&
      cells.includes("배송번호") &&
      cells.includes("주문완료일시") &&
      (cells.includes("상품번호") || compact.includes("상품번호")) &&
      (cells.includes("상품명") || compact.includes("상품명"))
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 헤더(≥20열)+출고 전 주문행이 나타날 때까지 windowMs 동안 폴링. 표 로딩 지연 대비.
  async function pollGrid(windowMs) {
    let headers = [];
    let rows = [];
    let diag = { candidateRows: 0, orderRows: 0, doneExcluded: 0 };
    const end = Date.now() + windowMs;
    while (Date.now() < end) {
      headers = findHeaderCells();
      if (headers.length >= 20) {
        const found = findDataRows(headers);
        rows = found.rows;
        diag = { candidateRows: found.candidateRows, orderRows: found.orderRows, doneExcluded: found.doneExcluded };
      } else {
        rows = [];
      }
      if (headers.length >= 20 && rows.length > 0) break;
      await delay(400);
    }
    return { headers, rows, diag };
  }

  const bodyText = document.body?.innerText || "";
  if (!hasDeliveryInquiryText(bodyText)) {
    return { success: false, reason: "not delivery inquiry frame" };
  }

  // 조회 기간 = 최근 30일(오늘 포함 지난 30일). ⚠️today-today 로 좁히지 않는다(새벽엔 전일 주문만 배송대기
  // 라 0건). 대신 주문내역상태로 "출고 전" 주문만 수집(findDataRows). 배송조회 기본화면은 비어 조회 클릭 필수.
  const p2 = (n) => String(n).padStart(2, "0");
  const fmt = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const endD = date ? new Date(date + "T00:00:00") : new Date();
  const startD = new Date(endD.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) 이미 데이터가 로딩된 탭(재사용)이면 바로 스크랩.
  let result = await pollGrid(4000);

  // 2) 출고 전 주문을 못 얻었으면 30일 범위 설정 + 조회 클릭 후 넉넉히 재폴링. (35s 타임아웃 안 4s + 22s + 여유)
  if (result.rows.length === 0) {
    setDateRange(fmt(startD), fmt(endD));
    clickSearchButton();
    await delay(1500); // 조회 재로딩(AJAX) 시작 → 빈 상태로 바뀌는 구간을 넘긴 뒤 폴링
    const retried = await pollGrid(22000);
    if (retried.rows.length > 0 || retried.headers.length >= 20 || retried.diag.orderRows > 0) result = retried;
  }

  const { headers, rows, diag } = result;

  if (headers.length < 20 || !headers.includes("주문번호") || !headers.includes("배송번호")) {
    return { success: false, reason: "header not found", headerCount: headers.length };
  }
  if (rows.length === 0) {
    return {
      success: false,
      reason: "data rows not found",
      headerCount: headers.length,
      candidateRows: diag.candidateRows,
      orderRows: diag.orderRows,
      doneExcluded: diag.doneExcluded,
    };
  }

  const masked = rows.some((row) => row.some((cell) => /\*{2,}/.test(cell)));
  return {
    success: true,
    mall: "아이스크림몰",
    date: date || null,
    headers,
    rows,
    rowCount: rows.length,
    masked,
    source: "icecream-mall-delivery-grid",
  };
}
