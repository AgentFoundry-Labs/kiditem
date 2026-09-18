(function initializeMallAvailabilitySend(root) {
  "use strict";

  // 몰 품절 송신 — 키드키즈·꼬망세·온채널·도매꾹·쿠팡 윙(옵션 재고 0)·카카오 톡스토어(재고 0)·올웨이즈·
  // 아트공구(판매안함)·롯데ON(판매상태 품절)·티쳐몰(재고 0)·아이스크림몰(판매상태 품절)·키즈노트(상태 품절)·
  // 지마켓/옥션(ESM 판매중지)·11번가(판매중지)·스마트스토어(판매중지).
  //
  // 사장님이 품절 버튼을 한 번 누르면 **여기서 끝까지 보낸다.** 사람이 몰마다 들어가
  // 다시 누르게 하지 않는다(사장님 2026-09-18: "내가 버튼 누르면 너가 알아서 몰에
  // 들어가서 품절 처리해야지").
  //
  // 상품등록(`mall-form-register.js`)이 제출하지 않는 것과 다르다. 등록은 승인이
  // 붙고 되돌리기 어렵지만, 품절은 **같은 화면에서 같은 값으로 되돌릴 수 있다**
  // (매니페스트 `supports.resume`). 되돌릴 수 있는 일이라 끝까지 한다.
  //
  // ⚠️ 대화상자를 가로채지 않는다. 몰의 버튼을 누르는 대신 **그 버튼이 만들 폼을
  //    그대로 직렬화해서 보낸다** — 나가는 바이트가 같고 confirm 창이 끼어들 자리가
  //    없다. 몰이 무엇을 받을지 우리가 정확히 알고 보내는 것이 요점이다.
  //
  // ⚠️ 보냈다(`sent`)와 반영됐다(`published`)는 다른 사실이다. 이 파일은 보낸 것과
  //    몰이 뭐라고 답했는지까지만 말한다. 반영은 몰 재조회가 답한다.

  const SEND_TIMEOUT_MS = 180000;
  /** 몰 관리자를 몰아치지 않는다. 한 건 보내고 쉬는 간격. */
  const PACE_MS = 700;
  /**
   * 쿠팡 윙 상품 사이 간격. 윙은 몰아치면 HTTP 429 로 막는다(실측 2026-09-18: 쉬지 않고 옵션 목록을 읽으면
   * 170번쯤에서 막혔다). 이미 품절이라 보낼 것이 없는 상품도 읽기는 하므로 상품마다 쉰다.
   */
  const WING_PRODUCT_PACE_MS = 400;
  /** 윙이 429 로 막으면 이만큼 쉬고 같은 요청을 다시 보낸다. 끝까지 막히면 거기서 멈춘다. */
  const WING_RATE_LIMIT_WAITS_MS = [5000, 15000, 30000];
  /** 보낸 뒤 다시 읽어 아직 안 바뀌었으면 한 번 더 볼 때까지 기다리는 시간. */
  const WING_RECHECK_MS = 1500;
  /** 지금 재고 읽기 한 번에 읽는 상품 수. 등록현황 한 페이지(25줄)가 한 번에 들어간다. */
  const READ_LIMIT = 50;
  /**
   * 윙 상품목록은 재고를 바꾼 뒤 늦게 따라온다(실측 2026-09-18: 15초 뒤에는 옛 값, 70초 뒤에는 새 값). 앞에 띄운
   * 상품목록은 이 간격으로 새로 고쳐 바뀐 재고가 보일 때까지 기다린다 — 사장님은 그 화면을 보고 판단한다.
   */
  const LIST_RECHECK_MS = 10000;
  const LIST_RECHECK_TIMES = 6;
  /** 상품목록 문서가 뜬 뒤 목록(검색 결과)이 그려질 때까지. */
  const LIST_RENDER_MS = 3500;
  /**
   * 롯데ON 상품 조회는 바꾼 판매상태를 늦게 보여 준다(실측 2026-09-19: 보낸 직후와 몇 초 뒤엔 옛 값, 10여 초 뒤 새 값).
   * 보낸 뒤 이 간격으로 다시 읽어 바뀐 상태가 보일 때까지 기다린다.
   */
  const LOTTEON_RECHECK_MS = 3000;
  const LOTTEON_RECHECK_TIMES = 8;
  /** 보내기 전 "이미 원하는 상태"로 보인 롯데ON 상품을 다시 읽는 횟수(3초 간격) — 방금 바꾼 옛 값인지 가린다. */
  const LOTTEON_SETTLE_TIMES = 4;
  /** 아이스크림몰은 보낸 뒤 상품 목록을 다시 읽어 확인한다. 아직 옛 상태면 이 간격으로 몇 번 더 본다. */
  const ICECREAM_RECHECK_MS = 2000;
  const ICECREAM_RECHECK_TIMES = 3;
  /**
   * 키즈노트 관리자 상품목록은 상품번호로 검색하지 못해 100개씩 넘기며 찾는다(1,107개 = 12쪽). 쪽 사이 간격은 짧게.
   * 보낸 뒤 다시 읽어 아직 옛 상태면 이 간격으로 몇 번 더 본다.
   */
  const KIDSNOTE_PAGE_PACE_MS = 200;
  const KIDSNOTE_RECHECK_MS = 2000;
  const KIDSNOTE_RECHECK_TIMES = 2;
  /** ESM 은 상품마다 한 번씩 보낸다(화면도 상품마다 PUT 한다). 그 사이 간격. 보낸 뒤 다시 읽는 간격 · 횟수. */
  const ESM_PACE_MS = 300;
  const MARKET_RECHECK_MS = 2000;
  const MARKET_RECHECK_TIMES = 3;
  /** 스마트스토어 일괄변경은 비동기다 — 결과가 나올 때까지 화면처럼 1초 · 3초 · 5초 간격으로 묻는다(최대 이만큼). */
  const SMARTSTORE_PROGRESS_WAITS_MS = [1000, 1000, 1000, 3000, 3000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];

  /**
   * 몰마다 다른 것 전부.
   *
   * `codeFrom` 은 그 몰이 상품코드를 어디에 두는지다. 우리가 가진 코드
   * (`ChannelListing.externalId`)와 같은 값이어야 줄을 짚을 수 있다 — 목록을 가져올 때
   * 쓴 것과 같은 코드다(`mall-admin-listings.js`).
   *
   * `perCode` 는 "한 번에 한 상품" 이라는 뜻이다(폼을 직렬화해 보내는 몰에서만 쓴다). 그 몰의 화면이 그렇게
   * 생겼을 때만 켠다.
   */
  const SPECS = {
    /**
     * 꼬망세(EduPre 입점관리자). 품절 = **재고 0**, 판매 재개 = **재고 999** — 노출/재고/KC 설정 화면
     * (`_product_mass.view.php`)의 줄마다 있는 [개별수정] 버튼이 보내는 요청 그대로다(2026-09-19 실측, 화면 코드
     * `$('.product_view_change')`).
     *
     *  - [개별수정]은 그 줄의 지금 값을 모아 POST `_product_mass.pro.php` 에 `_mode=view_direct_change` · `pcode` ·
     *    `_view` · `_stock` · `_stock_control` · `_kc_yn` · `_kc_num` · `_kc_date` 를 싣고 JSON `{res:"success"}` 로 답한다.
     *    지금 값은 같은 화면을 상품코드로 검색해(`mode=search&pass_input_type=pcode`) 그 줄에서 읽고, 재고만 바꾼다.
     *  - 재고 0 이면 재고관리가 자동이든 수동이든 쇼핑몰에 "일시품절된 상품입니다"로 뜬다(실측: 판매중 449개 중
     *    수동 · 재고 0 이 133개, 자동 · 재고 0 이 8개 — 모두 일시품절 표시). 이 몰에는 '일시품절' 값이 따로 없고 끄는
     *    값이 판매종료(_view=N)뿐이라, 노출은 건드리지 않고 재고만 쓴다. 재고관리(자동/수동)도 그대로 둔다.
     *  - 예전에는 `입력값 전체저장`처럼 페이지 전체(2,602줄)를 다시 저장했다 — 상품 하나를 바꾸려고 전부를 다시 쓰지
     *    않는다.
     *  - 보낸 뒤 같은 검색으로 다시 읽어 재고가 바뀐 것을 센다.
     */
    kkomangse: {
      label: "꼬망세",
      origin: "https://nstore.edupre.co.kr",
      directChange: {
        pageUrl: "https://nstore.edupre.co.kr/subAdmin/_product_mass.view.php",
        viewPath: "/subAdmin/_product_mass.view.php",
        changePath: "/subAdmin/_product_mass.pro.php",
        resumeStock: 999,
      },
    },
    /**
     * 키드키즈 파트너센터(EUC-KR PHP). 품절 = **일시품절**(use_flag N), 판매 재개 = **품절해제**(Y) — 상품관리 목록에서
     * 상품코드로 검색해 그 줄을 고르고 [일시품절] · [품절해제]를 누른 것과 같다(2026-09-19 실측, 화면 코드
     * `changeUseFlag`: `commitType=change_use_flag` · `use_flag` 를 채워 목록 폼 `frmGoodsList` 전체를 숨은 창으로
     * `./proc_logis.htm` 에 보낸다).
     *
     *  - 목록은 수정일 순 동률이라 쪽을 넘겨선 못 찾는다 — 상품코드 검색(`s_option=goods_code&s_key=`)으로 그 줄만 띄운다.
     *  - 폼에 한글(상품명 · 송장용 상품명)이 같이 실리므로 화면처럼 **EUC-KR 로 폼을 제출**한다(숨은 창, 스크립트는 막은 채).
     *  - "품절상품" 칸이 판매(정상) · 품절(일시품절)이다. 세금 구분(`tax_type`)이 비어 있는 상품은 화면도 막는다.
     *  - 보낸 뒤 같은 검색으로 다시 읽어 확인한다.
     */
    kidkids: {
      label: "키드키즈",
      origin: "https://partner.kidkids.net",
      useFlag: {
        pageUrl: "https://partner.kidkids.net/sales/goods_list_renewal.htm?pNum=1",
        listPath: "/sales/goods_list_renewal.htm",
        savePath: "/sales/proc_logis.htm",
      },
    },
    onch: {
      label: "온채널",
      origin: "https://www.onch3.co.kr",
      listPath: () => "/products_management.php",
      perCode: false,
      // 폼이 아니라 ajax 한 방이다. 상품코드를 / 로 이어 한 번에 보낸다.
      post: {
        path: "/access/product_access.php?ubr=option_state_modi",
        // 4 = 일시품절(되돌릴 수 있는 값). 1 = 재입고.
        body: (codes) => ({ prd_code_str: codes.join("/"), sec: "4", comment: "재고 소진" }),
        resumeBody: (codes) => ({ prd_code_str: codes.join("/"), sec: "1", comment: "재입고" }),
      },
      // ⚠️ 이건 관리자에게 가는 **요청**이다. 200 이 와도 승인 전까지 반영이 아니다.
      requestOnly: true,
    },
    /**
     * 도매꾹 상품공급사센터. 상품조회/수정 목록(`/sc/item/lstAll`)의 [수정저장] 이 보내는 것과 같은
     * 요청이다(실측 2026-09-18).
     *
     *  - 품절 = 진열안함, 해제 = 진열함. 도매꾹 목록에서는 재고를 못 고친다(재고 칸 편집이 막혀 있다).
     *    사방넷도 도매꾹은 일시중지 · 완전품절 둘 다 `숨김중` 으로 보낸다(쇼핑몰특이사항).
     *  - [수정저장] 은 고친 줄마다 `{no, disp, title, loq, useOpt}` 를 모아 `dat=` 한 번으로 보낸다. 상품명 ·
     *    최대판매수량 · 옵션 사용도 같이 가므로 **지금 값을 그대로** 실어야 한다 — 먼저 목록 조회
     *    (`/sc/item/lst`, 상품번호 500개까지)로 그 줄을 읽는다. 목록의 검색 폼이 보내는 기본값 그대로다.
     *  - 보낸 뒤 같은 조회로 진열여부를 다시 읽어 반영을 확인한다(`confirmed`).
     */
    domeggook: {
      label: "도매꾹",
      origin: "https://www.domeggook.com",
      listEdit: {
        lookupPath: "/sc/item/lst",
        editPath: "/sc/item/editOnList",
        // 상품번호 검색 칸이 받는 최대 개수.
        maxCodes: 500,
        shown: { hide: "진열안함", show: "진열함" },
      },
    },
    /**
     * 쿠팡 윙. 품절 = **옵션 재고수량 0** — 윙 상품목록의 재고수량 칸을 고치면 보내는 것과 같은 요청이다
     * (실측 2026-09-18, 화면 코드 `app/listV3.js`). 윙에서 품절과 판매중지는 다르다: 품절은 판매중인 채로
     * '품절' 로 보이고 재고를 넣으면 다시 팔린다(사장님: "품절 처리할려는건데").
     *
     *  - 옵션 단위다. 등록상품ID로 옵션 목록(`vendor-inventory-items-with-vendorItems`)을 읽어
     *    `vendorInventoryItemId` 를 얻고, 품절 옵션(옵션ID = vendorItemId)만 `stock-manager/remain-change/request`
     *    에 `stockManageItems={"dtos":[{vendorInventoryItemId, vendorItemId, inventoryQuantity:0}]}` 로 보낸다.
     *    해제는 같은 칸에 `resumeQuantity`.
     *  - 옵션을 짚지 않은 상품(등록현황 칸의 품절 처리)은 그 상품의 옵션 전부다.
     *  - 로켓그로스(RFM) 옵션은 쿠팡 재고라 윙 화면도 못 고친다 — 건너뛴다.
     *  - 보낸 뒤 옵션 목록을 다시 읽어 재고가 바뀐 옵션을 센다(`confirmed`). 세는 단위는 옵션이다.
     *  - **윙 상품목록(`vendor-inventory/list`) 안에서** 보낸다 — 사장님이 손으로 품절을 하는 바로 그 화면이고, 윙 API 는
     *    윙 화면의 로그인으로 불러야 한다(사장님 2026-09-18: "vendor-inventory/list 여기 가서 해야하잖아" — 리뷰
     *    화면을 쓰던 것이 잘못이었다).
     *  - 등록현황 칸에서 상품 하나를 누르면(`show`) 그 상품을 검색한 상품목록을 **앞에** 띄우고, 보낸 뒤 새로 고쳐
     *    바뀐 재고(품절)를 보여 준 채로 둔다. 여러 상품을 나눠 보낼 때와 지금 재고 읽기는 상품목록을 뒤에서 열고 닫는다.
     *  - 해제는 재고 0 인 옵션에만 `resumeQuantity` 를 넣는다. 재고가 남아 있는 옵션(1861 · 9954 …)을 999 로
     *    낮추지 않는다.
     */
    coupang: {
      label: "쿠팡 윙",
      origin: "https://wing.coupang.com",
      optionStock: {
        // 윙 상품목록. 사장님이 쓰는 주소 그대로이고 검색어 칸에 등록상품ID 를 넣는다.
        listUrl: (keyword) => "https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL"
          + `&searchKeywords=${encodeURIComponent(keyword || "")}`
          + "&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes="
          + "&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL"
          + "&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR"
          + "&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50&page=1",
        listPath: "/vendor-inventory/list",
        itemsPath: "/tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/",
        itemsQuery: "hasProgressiveDiscountRule=true&queryNonVariationJustificationProof=true&queryMpnProof=true",
        changePath: "/tenants/seller-web/vendorinventory/stock-manager/remain-change/request",
        // 해제할 때 품절(재고 0) 옵션에 넣는 재고. 원래 값이 아니라 "다시 판다"는 기본값이다 — 윙 재고는
        // 상품마다 다르다(999 · 1861 · 9954 …, 실측 2026-09-18).
        resumeQuantity: 999,
      },
    },
    /**
     * 카카오 톡스토어. 품절 = **재고 0** — 판매자센터 상품조회의 [선택 수정]이 보내는 요청 그대로다
     * (PUT /api/tstore/products/grid/columns, 2026-09-19 실측). 판매상태 품절(OUT_OF_STOCK)은 재고 0 이면 저절로 된다.
     *
     *  - [선택 수정]은 상품마다 {productId, name, salePrice, storeManagementCode, stockQuantity, displayStatus} 를
     *    한 배열로 보낸다. 지금 값을 목록 API(GET /api/tstore/products?productIds=)로 읽어 **그대로** 싣고 재고만 바꾼다.
     *  - 옵션이 있는 상품(optionSetting 설정)은 이 칸으로 재고를 못 고친다 — 보내지 않고 알린다(386개 중 10개).
     *  - 해제는 재고 0 인 상품에만 `resumeQuantity`. 보낸 뒤 목록 API 로 다시 읽어 확인한다.
     */
    kakao: {
      label: "카카오 톡스토어",
      origin: "https://shopping-seller.kakao.com",
      gridStock: {
        pageUrl: "https://shopping-seller.kakao.com/product/store-seller/list",
        listPath: "/api/tstore/products",
        gridPath: "/api/tstore/products/grid/columns",
        resumeQuantity: 999,
      },
    },
    /**
     * 올웨이즈. 판매자센터 상품 조회/수정의 [품절] · [판매재개] 버튼이 보내는 요청 그대로다(2026-09-19 실측).
     * 품절 POST /items/sold-out-many {itemIdList} · 재개 /items/resume-many {itemIdList}, 확인
     * POST /sellers/items/info-request {itemIds} 의 soldOut. 인증 토큰은 판매자센터 화면의 localStorage 에 있고
     * x-access-token 으로 싣는다 — **화면 안에서만 읽고 쓴다.** 밖으로 돌려주지 않는다.
     */
    always: {
      label: "올웨이즈",
      origin: "https://alwayzseller.ilevit.com",
      itemApi: {
        pageUrl: "https://alwayzseller.ilevit.com/items/management",
        backend: "https://alwayz-seller-back.ilevit.com",
        tokenKey: "@alwayz@seller@token@",
      },
    },
    /**
     * 아트공구(카페24 공급사 관리자). 품절 = **판매안함**, 판매 재개 = **판매함** — 상품목록(ProductManage)의
     * [판매안함] · [판매함] 버튼이 보내는 요청 그대로다(2026-09-19 실측, 화면 코드 `PRODUCT_MANAGE._manageState`).
     *
     *  - POST /exec/admin/product/ProductManageState 에 `product_no[]` · `change=is_selling` · `state=F|T` 와
     *    고른 상품마다 지금 값 `market[번호][is_display|is_selling]` 을 싣는다(버튼이 싣는 그대로). 답은 JSON `{passed, msg}`.
     *  - 카페24 판매안함은 진열된 채 품절로 보이고 주문을 받지 않는다. 재고 칸은 건드리지 않는다.
     *  - 세트상품은 화면도 이 버튼으로 판매상태를 못 바꾸게 막는다 — 보내지 않고 알린다.
     *  - 상품번호(product_no)로 짚는다. 목록 검색으로는 상품번호를 못 찾아서, 상품목록을 100개씩 끝까지 읽어 지금
     *    값을 얻고, 보낸 뒤 다시 읽어 확인한다(550개 = 6쪽).
     */
    art09: {
      label: "아트공구",
      origin: "https://zzogzzog1.cafe24.com",
      sellingState: {
        pageUrl: "https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductManage",
        listPath: "/disp/admin/shop1/product/ProductManage",
        statePath: "/exec/admin/product/ProductManageState",
        // 상품목록 한 쪽 최대(화면의 '100개씩보기'). 보낼 때도 한 번에 이만큼 — 화면에서 한 쪽을 다 골라 누른 것과 같다.
        pageSize: 100,
        maxPages: 60,
      },
    },
    /**
     * 롯데ON 판매자센터. 품절 = 상품 판매상태 **품절(SOUT)**, 판매 재개 = **판매중(SALE)** — 상품 조회/수정의
     * [상품판매 변경]이 여는 상품정보일괄수정 → 일괄수정항목 팝업의 [저장]이 보내는 요청 그대로다(2026-09-19 실측,
     * 팝업 `productChangeInfo.xml` 의 `btn_trigger2_onclick` case '07').
     *
     *  - POST soapi `/soapi/v1/product/registration/updateProductBatch` 에 상품마다
     *    `{spdNo, trNo, lrtrNo, trGrpCd, dvPdTypCd, code:"07", ctrtTypCd:"all", dvProcTypCd:"all", dmstOvsDvDvsCd:"all",
     *    reqTxt:"spdSlStatCd", spdSlStatCd}` 배열을 싣는다. 거래처 · 배송상품유형은 상품 조회(selectProductList)가 준
     *    값 그대로, "all" 은 일괄수정 화면의 검색 칸이 처음 가진 값(전체, `WebSquare.allValue`)이다. 팝업이 고르게 하는
     *    값은 SALE · SOUT · END 뿐이다 — END(판매종료)는 보내지 않는다.
     *  - 요청 머리(토큰 · 시간대 · 기기)는 화면이 요청마다 쓰는 함수(`gcm._sbm_setRequestHeader`)로 붙인다 — 그래서
     *    화면 안(MAIN)에서 부르고, 토큰은 밖으로 나가지 않는다.
     *  - 롯데ON이 판매중지(STP)했거나 판매종료(END)한 상품은 바꾸지 않는다.
     *  - 보낸 뒤 상품 조회로 판매상태를 다시 읽어 확인한다.
     */
    /**
     * 티쳐몰(퍼스트몰 selleradmin). 품절 = **재고 0**, 판매 재개 = **재고 999** — 판매상품 > [실물] 일괄 업데이트의
     * "상품코드/무게/재고 직접 업데이트"(batch_modify?mode=goodsetc)에서 [업데이트하기]가 보내는 요청 그대로다
     * (2026-09-19 실측, 화면 코드 `batch_goods_save_submit`).
     *
     *  - 상품번호로 검색한 일괄 업데이트 화면의 폼 `goodsBatchUpdateForm` 을 그대로 모아 그 상품의 `stock[옵션번호]` 만 바꾸고,
     *    화면의 검색 조건(`get_search_field`: page · mode · keyword · goods_kind · orderby · sort · perpage · provider_seq)을
     *    붙여 POST `/selleradmin/goods_process/batch_goods_modify` 로 보낸다. [업데이트하기]가 먼저 띄우는 역마진 확인
     *    창(goods_batch_permit)은 보여 주기만 하는 창이라 거치지 않는다.
     *  - 퍼스트몰은 재고 0 이면 저절로 품절이다(판매상태에 '품절'만 고르는 값이 없다). 정보수정(goods/regist)으로 바꾸면
     *    승인이 풀려 판매중지 · 미노출로 돌아가므로 그 길은 쓰지 않는다.
     *  - 보낸 뒤 재고를 다시 읽고 상품목록(catalog?keyword=)의 상태가 "승인 품절"(재개면 "승인 정상")인지 본다. "미승인"이면
     *    확인하지 않고 알린다.
     *  - 옵션이 여럿인 상품은 옵션마다 재고라 보내지 않고 알린다.
     */
    "teacher-mall": {
      label: "티쳐몰",
      origin: "https://shop.teacherville.co.kr",
      batchStock: {
        pageUrl: "https://shop.teacherville.co.kr/selleradmin/goods/catalog",
        batchPath: "/selleradmin/goods/batch_modify",
        savePath: "/selleradmin/goods_process/batch_goods_modify",
        catalogPath: "/selleradmin/goods/catalog",
        resumeStock: 999,
      },
    },
    "lotte-on": {
      label: "롯데ON",
      origin: "https://store.lotteon.com",
      saleStatus: {
        pageUrl: "https://store.lotteon.com/cm/main/index_SO.wsp",
        api: "https://soapi.lotteon.com",
        listPath: "/soapi/v1/product/information/selectProductList",
        updatePath: "/soapi/v1/product/registration/updateProductBatch",
        // 한 번에 조회 · 저장하는 상품 수. 판매자상품번호 칸은 줄바꿈으로 여러 개를 받는다.
        batchSize: 100,
      },
    },
    /**
     * 아이스크림몰(아이스크림 PO). 품절 = 판매상태 **품절(20)**, 판매 재개 = **판매중(10)** — 상품 정보 관리 목록의
     * [판매상태 일괄변경]이 여는 "단품 판매상태 일괄 변경" 창의 [적용]이 보내는 요청 그대로다(2026-09-19 실측, 창 코드
     * `goodsSaleStateModify.eventhandler` 의 `#btn_apply`).
     *
     *  - POST `/goods/goodsMgmtPopup.modifyGoodsSaleState.do` 에 JSON `{goodsSaleStateList: [{goodsNo, saleStatCd,
     *    itmSaleStatCd, soutCausCd:"12", saleStatChgCausCd:null}]}` 를 싣는다. `saleStatCd` 는 목록이 준 지금 상태,
     *    `itmSaleStatCd` 가 고른 상태다. 품절 사유(soutCausCd)는 창이 늘 "12"를 싣고, 판매종료 사유(saleStatChgCausCd)는
     *    판매종료(40)에서만 고르는 칸이라 품절 · 판매중이면 비어 있다(null). 머리는 화면의 jQuery 가 붙이는 것
     *    (Content-Type · Accept · X-Requested-With)뿐이다. 답은 JSON `{succeeded, message}`.
     *  - 목록은 판매방식(saleMethCd)이 다른 상품을 한 번에 넘기지 못하게 막는다 — 판매방식마다 나눠 보낸다. 예약상품(20)이
     *    품절이면 창이 판매중을 고르지 못하게 숨긴다 — 그 상품은 재개하지 않고 알린다. 판매종료(40) 상품은 건드리지 않는다.
     *  - 지금 상태는 상품 정보 관리 목록 조회(`goodsMgmt.getGoodsList.do`)를 상품번호 여럿(멀티)으로 불러 읽는다. 검색
     *    폼(보안 서명 포함)은 목록 화면을 받아 그 폼 그대로 쓰고, 업체번호는 화면 스크립트가 채우는 값(`_entrNo`)을 쓴다.
     *  - 보낸 뒤 같은 조회로 판매상태를 다시 읽어 확인한다.
     */
    "icecream-mall": {
      label: "아이스크림몰",
      origin: "https://po.i-screammall.co.kr",
      goodsSaleState: {
        pageUrl: "https://po.i-screammall.co.kr/goods/goodsMgmt.goodsMgmtView.do",
        viewPath: "/goods/goodsMgmt.goodsMgmtView.do",
        listPath: "/goods/goodsMgmt.getGoodsList.do",
        savePath: "/goods/goodsMgmtPopup.modifyGoodsSaleState.do",
        // 한 번에 조회 · 저장하는 상품 수. 상품번호 칸(멀티)은 줄바꿈으로 여러 개를 받는다.
        batchSize: 100,
      },
    },
    /**
     * 키즈노트(WISA 스마트윙 관리자). 품절 = 상태 **품절(3)**, 판매 재개 = **정상(2)** — 판매 상품 내역(body=2010)의
     * [상태/노출일괄수정] 폼(`edt_layer_4`)에서 "선택한 상품의" 상태를 바꿔 [확인]을 누른 요청 그대로다(2026-09-19 실측,
     * 화면 코드 `edtConfirm` · `numSelect`).
     *
     *  - POST `/_manage/` 에 그 폼 전체(`body=product@product_price.exe` · `w` · `prd_no` · `nums` · `exec=stat` ·
     *    `where` · `change_stat` · `perm_lst` · `perm_dtl` · `perm_sch`)를 싣는다. `nums` 는 고른 상품번호마다 "@"를 앞에
     *    붙여 이은 것(`@155982@187336`), `where=1` 은 "선택한 상품의", 노출 칸(perm_*)은 "변화없음"(빈 값) 그대로다.
     *    `w` · `prd_no` 는 목록 화면이 폼에 넣어 둔 값 그대로 싣는다.
     *  - 상품번호(pno) 검색이 없어 목록을 100개씩 넘기며 지금 상태(정상 · 품절 · 숨김)를 읽는다. 숨김 상품은 사장님이 숨긴
     *    것이라 바꾸지 않는다.
     *  - 답은 숨은 창에 그리는 화면이라, 보낸 뒤 목록을 다시 읽어 상태가 바뀐 것을 센다.
     */
    kidsnote: {
      label: "키즈노트",
      origin: "https://shop.kidsnote.com",
      stateBatch: {
        pageUrl: "https://shop.kidsnote.com/_manage/?body=2010",
        listPath: "/_manage/",
        savePath: "/_manage/",
        // 목록 한 쪽 최대(화면의 '100개씩'). 보낼 때도 한 번에 이만큼 — 화면에서 한 쪽을 다 골라 누른 것과 같다.
        pageSize: 100,
        maxPages: 60,
      },
    },
    /**
     * 지마켓 · 옥션(ESM Plus 상품 조회/수정, item.esmplus.com). 품절 = **판매중지(21)**, 판매 재개 = **판매가능(11)** —
     * 목록의 [판매 상태 변경] → 판매중지 · 판매가능 창의 [변경]이 보내는 요청 그대로다(2026-09-19 실측, 화면 코드
     * `sellStatusChangeModal`). ESM 은 재고를 1~99,999 로만 받아 재고 0 으로는 품절을 못 만든다.
     *
     *  - 상품마다 PUT `/api/ea/goods/{마스터상품번호}/sellStatus` 에 `{isSell:{gmkt|iac: false|true}}`, 머리
     *    `X-G-SELLER-ID` · `X-A-SELLER-ID`(그 상품의 사이트별 판매자 아이디, 없으면 빈 값)를 싣는다. 답은
     *    `{resultCode, data:{gmkt|iac:{resultCode, message}}}` — 사이트 결과가 0(또는 5300)이면 받은 것이다.
     *  - 지금 상태는 목록 검색 POST `/api/ea/goods/search`(상품번호 여럿을 쉼표로)로 읽는다. 우리 상품코드는 사방넷이 준
     *    `{사이트상품번호}_{마스터상품번호}` — 앞쪽 사이트상품번호로 찾는다.
     *  - 판매가능 · 판매중지 상품만 바꾼다(판매불가 · SKU품절 · 등록대기는 화면도 막는다). 지마켓 · 옥션을 한 상품으로
     *    묶은 통합상품은 한쪽만 바꾸는 요청을 확인하지 못해 보내지 않는다.
     *  - ⚠️ 판매중지를 오래 두면 몰이 상품을 지운다(지마켓 13개월 · 옥션 90일 동안 상품정보를 안 고치면, 최근 3년 상품평이
     *    있으면 제외).
     */
    gmarket: {
      label: "지마켓",
      origin: "https://item.esmplus.com",
      esmSellStatus: {
        site: "gmkt",
        pageUrl: "https://item.esmplus.com/goods/list",
        searchPath: "/api/ea/goods/search",
        goodsPath: "/api/ea/goods/",
        batchSize: 100,
      },
    },
    auction: {
      label: "옥션",
      origin: "https://item.esmplus.com",
      esmSellStatus: {
        site: "iac",
        pageUrl: "https://item.esmplus.com/goods/list",
        searchPath: "/api/ea/goods/search",
        goodsPath: "/api/ea/goods/",
        batchSize: 100,
      },
    },
    /**
     * 11번가 셀러오피스(상품조회/수정). 품절 = **판매중지(105)**, 판매 재개 = **판매중지 해제** — 목록의 [판매중지] ·
     * [판매중지 해제]가 여는 확인 창(`getSelStatList`)의 [적용]이 보내는 요청 그대로다(2026-09-19 실측, 창 코드
     * `applySelStat`).
     *
     *  - POST `/product/SellProductAction.tmall?method=updateProductSelStat&prdStatCd=SELL_STOP|SELL_RELEASE` 에
     *    `chkPrdNoCount` · `trgtPrdNos`(상품번호를 쉼표로) · `content`(사유, 비움)를 싣는다. 답은 창 화면이고
     *    `msg = "SAVE_OK"` 와 "총 N건 중 M건" 을 담는다.
     *  - 지금 상태는 목록 조회 `SellProductAjaxAction.tmall?method=getSellProductListJSON`(상품번호 여럿을 줄바꿈으로 잇고
     *    화면처럼 한 번 더 인코딩)로 읽는다. selStatCd 103 판매중 · 104 품절(재고 0) · 105 판매중지 · 102 전시전.
     *  - 판매중인 상품만 멈추고, 해제는 판매중지이면서 재고가 있는 상품만 푼다(화면도 재고 0 이면 막는다).
     */
    "11st": {
      label: "11번가",
      origin: "https://soffice.11st.co.kr",
      st11SellStatus: {
        pageUrl: "https://soffice.11st.co.kr/view/8006",
        listPath: "/product/SellProductAjaxAction.tmall",
        savePath: "/product/SellProductAction.tmall",
        batchSize: 100,
      },
    },
    /**
     * 네이버 스마트스토어센터(상품 조회/수정, 원상품 목록). 품절 = **판매중지(SUSPENSION)**, 판매 재개 = **판매중(SALE)** —
     * 목록의 판매상태 변경이 보내는 요청 그대로다(2026-09-19, 공개 번들 app.js 로 확인 — naver.com 은 조사 도구가 막혀
     * 라이브 화면은 못 봤다).
     *
     *  - PATCH `/api/products/bulk-update?_action=updateProductStatusType` 에 `{productNos:[원상품번호], productStatusType,
     *    productBulkUpdateType}`. 답이 `STARTED` 면 비동기라 `getBulkUpdateProgressResult` 를 끝날 때까지 묻는다
     *    (`completed`, `productBulkUpdateResultVO.successIds`). `ALREADY_PROGRESS` · `BUSY` 는 받지 않은 것이다.
     *  - 요청은 화면 자신의 Angular `$http` 로 보낸다 — 화면 인터셉터가 붙이는 머리(x-current-state 등)가 그대로 실린다.
     *    그래서 화면 안(MAIN)에서 부른다.
     *  - 지금 상태는 목록 검색 POST `/api/products/list/search`(상품번호 여럿을 쉼표로)로 읽는다. 우리 상품코드가 채널상품번호인지
     *    원상품번호인지 몰라서 채널상품번호로 먼저 찾고, 못 찾은 것은 원상품번호로 찾는다.
     *  - 판매중인 상품만 멈추고(품절 · 판매중지는 이미 못 산다), 해제는 판매중지인 상품만 푼다 — 재고가 없으면 네이버가
     *    품절로 둔다.
     */
    smartstore: {
      label: "스마트스토어",
      origin: "https://sell.smartstore.naver.com",
      naverStatus: {
        pageUrl: "https://sell.smartstore.naver.com/#/products/origin-list",
        searchPath: "/api/products/list/search",
        updatePath: "/api/products/bulk-update?_action=updateProductStatusType",
        progressPath: "/api/products/bulk-update?_action=getBulkUpdateProgressResult",
        batchSize: 50,
      },
    },
  };

  /** 이 몰은 아직 경로가 없다. 화면이 버튼을 세우지 않게 이름만 남긴다. */
  const PENDING = {};

  /**
   * 윙 화면 안에서 요청 하나를 보낸다. 워커가 인자로만 넘긴다(클로저를 잡을 수 없다).
   * 답은 몰이 준 JSON 그대로 돌려주되, JSON 이 아니면 앞부분만 싣는다(로그인 화면 판별용).
   */
  async function requestOnPage(path, method, contentType, body, extraHeaders) {
    try {
      const response = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {}),
        },
        ...(body === null || body === undefined ? {} : { body }),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json, preview: json ? "" : text.slice(0, 200), url: response.url };
    } catch (error) {
      return { status: 0, json: null, preview: String(error?.message || error).slice(0, 200), url: "" };
    }
  }

  /**
   * 올웨이즈 판매자센터 화면 안에서 백엔드에 요청 하나를 보낸다. 토큰은 이 함수 안에서 localStorage 로 읽어 헤더에만
   * 싣고, **돌려주지 않는다.** 워커가 인자로만 넘긴다(클로저를 잡을 수 없다).
   */
  async function alwayzRequestOnPage(url, body, tokenKey) {
    try {
      const token = localStorage.getItem(tokenKey);
      if (!token) return { status: 401, json: null, loggedOut: true };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json, loggedOut: response.status === 401 || response.status === 403 };
    } catch (error) {
      return { status: 0, json: null, loggedOut: false, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 롯데ON 판매자센터 화면 안(MAIN)에서 soapi 에 JSON 을 POST 한다. 요청 머리는 화면이 요청마다 쓰는 함수
   * (`gcm._sbm_setRequestHeader` — 토큰 · 시간대 · 기기)로 붙인다. 토큰은 이 함수 밖으로 나가지 않는다.
   * 판매자센터는 화면이 뜬 뒤에야 토큰을 채우므로 로그인 화면이 아니면 잠시 기다린다.
   * `slimRows` 면 상품 조회 답에서 우리가 쓰는 칸만 추려 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function lotteonPostOnPage(url, body, slimRows) {
    try {
      const deadline = Date.now() + 20000;
      const ready = () => typeof gcm !== "undefined" && gcm && typeof gcm._sbm_setRequestHeader === "function"
        && Boolean(sessionStorage.getItem("AuthToken"));
      while (!ready()) {
        if (/login/i.test(location.href) || Date.now() > deadline) return { status: 401, json: null, loggedOut: true };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const answer = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        xhr.setRequestHeader("Accept", "application/json");
        gcm._sbm_setRequestHeader(xhr);
        xhr.onload = () => {
          let json = null;
          try {
            json = JSON.parse(xhr.responseText);
          } catch {
            json = null;
          }
          resolve({ status: xhr.status, json });
        };
        xhr.onerror = () => resolve({ status: 0, json: null });
        xhr.send(JSON.stringify(body));
      });
      const loggedOut = answer.status === 401 || answer.status === 403;
      if (slimRows) {
        const rows = Array.isArray(answer.json?.data)
          ? answer.json.data.map((row) => ({
            spdNo: row?.spdNo ?? null,
            slStatCd: row?.slStatCd ?? null,
            trNo: row?.trNo ?? null,
            lrtrNo: row?.lrtrNo ?? null,
            trGrpCd: row?.trGrpCd ?? null,
            dvPdTypCd: row?.dvPdTypCd ?? null,
          }))
          : null;
        return { status: answer.status, loggedOut, returnCode: answer.json?.returnCode ?? null, rows };
      }
      return { status: answer.status, loggedOut, json: answer.json };
    } catch (error) {
      return { status: 0, json: null, loggedOut: false, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 티쳐몰 [실물] 일괄 업데이트(상품코드/무게/재고)를 상품번호로 검색해 그 폼이 보낼 값을 모은다. 읽기만 한다.
   * 워커가 인자로만 넘긴다. 체크박스는 이 상품만 고른다. `search` 는 [업데이트하기]가 폼에 덧붙이는 검색 조건이다.
   * 로그인이 풀렸으면 일괄 업데이트 화면이 아닌 곳에 닿는다.
   */
  async function teacherBatchFormOnPage(batchPath, code) {
    try {
      const params = new URLSearchParams({ page: "1", mode: "goodsetc", keyword: code });
      const response = await fetch(`${batchPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== batchPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.querySelector("form#goodsBatchUpdateForm");
      if (!form) return { loggedOut: true };
      const box = [...form.querySelectorAll('input[name="goods_seq[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const pairs = [];
      for (const element of form.elements) {
        if (!element.name || element.disabled) continue;
        if (element.type === "button" || element.type === "submit" || element.type === "file") continue;
        if (element.name === "goods_seq[]") {
          if (element.value === code) pairs.push([element.name, element.value]);
          continue;
        }
        if (element.type === "checkbox" || element.type === "radio") {
          if (element.checked) pairs.push([element.name, element.value]);
          continue;
        }
        pairs.push([element.name, element.value]);
      }
      // 이 상품의 옵션 = default_option_seq[옵션번호] 가 이 상품번호인 옵션.
      const options = pairs.filter(([name, value]) => /^default_option_seq\[\d+\]$/.test(name) && value === code)
        .map(([name]) => name.slice("default_option_seq[".length, -1));
      const stocks = options.map((option) => [option, pairs.find(([name]) => name === `stock[${option}]`)?.[1] ?? ""]);
      const search = [...html.matchAll(/get_search_field\[\d+\]\s*=\s*\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\]/g)]
        .map((match) => [match[1], match[2]]);
      return { found: true, pairs, stocks, search };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /** 티쳐몰 상품목록에서 그 상품의 승인 · 판매 상태("승인정상" · "승인품절" · "미승인…")를 읽는다. 읽기만 한다. */
  async function teacherCatalogStatusOnPage(catalogPath, code) {
    try {
      const response = await fetch(`${catalogPath}?keyword=${encodeURIComponent(code)}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== catalogPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const box = [...doc.querySelectorAll('input[name="goods_seq[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const text = (box.closest("tr")?.textContent || "").replace(/\s+/g, " ");
      const match = /(미승인|승인)\s*(정상|품절|재고확보중|판매중지)/.exec(text);
      return { found: true, approval: match ? match[1] : null, state: match ? match[2] : null };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 아이스크림몰 상품 정보 관리 목록을 상품번호 여럿으로 조회해 판매상태를 읽는다. 읽기만 한다. 워커가 인자로만 넘긴다.
   * 검색 폼(보안 서명 포함)은 목록 화면을 받아 그 폼 그대로 쓴다 — 열린 탭이 목록 화면이 아니어도 된다. 화면처럼 기간
   * 조건을 앞에 두고(기간 무시), 폼 전체, 쪽 크기와 쪽 번호를 붙인다. 업체번호 · 업체명은 화면 스크립트가 채우는 값이다.
   */
  async function icecreamRowsOnPage(viewPath, listPath, codes) {
    try {
      const page = await fetch(viewPath, { credentials: "include", cache: "no-store" });
      const landed = new URL(page.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!page.ok) return { error: `HTTP ${page.status}` };
      const html = await page.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.getElementById("goodsInfoGridForm");
      if (!form) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "search_form" };
      const literal = (name) => {
        const match = new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(html);
        if (!match) return "";
        try {
          return String(JSON.parse(match[1]));
        } catch {
          return "";
        }
      };
      const today = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const params = new URLSearchParams({
        goodsStartDtm: "2000-01-01T00:00:00",
        goodsEndDtm: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T23:59:59`,
        goodsDtmIgnoreOption: "check",
      });
      for (const [name, value] of new FormData(form)) {
        if (typeof value !== "string") continue;
        if (name === "goodsNoOption" || name === "goodsNoList") continue;
        if (name === "entrNo" || name === "entrNm") {
          params.append(name, value || literal(name === "entrNo" ? "_entrNo" : "_entrNm"));
          continue;
        }
        params.append(name, value);
      }
      params.append("goodsNoOption", "mt");
      // 화면 폼(jQuery serialize)처럼 줄바꿈은 CRLF 다 — LF 로만 이으면 한 건도 안 나온다(2026-09-19 실측).
      params.append("goodsNoList", codes.join("\r\n"));
      params.append("rowsPerPage", String(Math.max(10, codes.length)));
      params.append("pageIdx", "1");
      const response = await fetch(`${listPath}?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const listed = new URL(response.url || location.href, location.href);
      if (listed.origin !== location.origin || /login/i.test(listed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        return /type=["']?password|loginForm/i.test(text) ? { loggedOut: true } : { error: "json" };
      }
      if (json?.succeeded === false) return { error: String(json.message || "succeeded=false").slice(0, 120) };
      if (!Array.isArray(json?.payloads)) return { error: "payloads" };
      return {
        rows: json.payloads.map((row) => ({
          goodsNo: row?.goodsNo === undefined || row?.goodsNo === null ? "" : String(row.goodsNo),
          saleStatCd: row?.saleStatCd ?? null,
          saleMethCd: row?.saleMethCd ?? null,
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 아이스크림몰 "단품 판매상태 일괄 변경" 창의 [적용]과 같은 요청을 보낸다. 머리는 화면의 jQuery 가 붙이는 것만 싣는다.
   * 워커가 인자로만 넘긴다. 답은 성공 여부와 몰이 준 글(있으면 앞부분)뿐이다.
   */
  async function icecreamSaveOnPage(savePath, goodsSaleStateList) {
    try {
      const response = await fetch(savePath, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ goodsSaleStateList }),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { status: response.status, loggedOut: true };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!json && /type=["']?password|loginForm|loginExpired/i.test(text)) return { status: response.status, loggedOut: true };
      return {
        status: response.status,
        succeeded: json?.succeeded === true,
        message: typeof json?.message === "string" ? json.message.slice(0, 160) : null,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키즈노트 판매 상품 내역 한 쪽을 읽는다 — 줄마다 상품번호(pno)와 상태 글자. `withForm` 이면 [상태/노출일괄수정] 폼
   * (`edt_layer_4`)이 보낼 값도 모아 온다(목록 화면이 넣어 둔 `w` · `prd_no` 포함). 읽기만 한다. 워커가 인자로만 넘긴다.
   */
  async function kidsnoteListOnPage(listPath, page, pageSize, withForm) {
    try {
      const params = new URLSearchParams({ body: "2010", row: String(pageSize), page: String(page) });
      const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname + landed.search)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const list = doc.querySelector('form[name="prdFrm"], form#prdFrm');
      if (!list) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "list_form" };
      const boxes = [...list.querySelectorAll('input[name="check_pno[]"]')];
      let statIndex = -1;
      const table = boxes[0]?.closest("table");
      if (table) {
        const headRow = [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th"));
        const heads = headRow ? [...headRow.cells].map((cell) => cell.textContent.replace(/\s+/g, "")) : [];
        statIndex = heads.indexOf("상태");
      }
      if (boxes.length > 0 && statIndex < 0) return { error: "status_column" };
      const rows = boxes.map((box) => ({
        pno: String(box.value || ""),
        stat: String(box.closest("tr")?.cells?.[statIndex]?.textContent || "").replace(/\s+/g, " ").trim(),
      }));
      let form = null;
      if (withForm) {
        const edit = doc.getElementById("edt_layer_4");
        if (!edit) return { error: "state_form" };
        form = [...new FormData(edit)].map(([name, value]) => [name, String(value)]);
      }
      return { rows, form };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키즈노트 [상태/노출일괄수정] 폼을 보낸 것과 같은 요청(폼 그대로, urlencoded)을 보낸다. 답은 숨은 창에 그리는 화면이라
   * 알림(alert) 글만 앞부분을 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function kidsnoteSaveOnPage(savePath, pairs) {
    try {
      const body = new URLSearchParams();
      for (const [name, value] of pairs) body.append(name, value);
      const response = await fetch(savePath, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const landed = new URL(response.url || location.href, location.href);
      const text = await response.text();
      if (landed.origin !== location.origin || /login/i.test(landed.pathname + landed.search)
        || /type=["']?password/i.test(text)) {
        return { status: response.status, loggedOut: true };
      }
      const alerted = /alert\(\s*(['"])((?:(?!\1).){1,200})\1/.exec(text);
      return { status: response.status, alert: alerted ? alerted[2].slice(0, 160) : null };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * ESM 상품 조회/수정 목록을 상품번호 여럿으로 검색한다(화면의 검색과 같은 몸통, 쉼표로 이은 번호). 읽기만 한다.
   * 워커가 인자로만 넘긴다. 우리가 쓰는 칸만 추린다 — 사이트상품번호 · 마스터상품번호 · 판매상태 · 판매자 아이디.
   */
  async function esmSearchOnPage(searchPath, ids) {
    try {
      const body = {
        query: { goodsIds: ids.join(","), sellStatus: [], category: {}, registrationDate: {}, shipping: {}, additionalService: [] },
        pageIndex: 1,
        pageSize: Math.max(20, ids.length),
      };
      const response = await fetch(searchPath, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login|signin/i.test(landed.pathname)) return { loggedOut: true };
      if (response.status === 401 || response.status === 403) return { loggedOut: true };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        return /password|login/i.test(text) ? { loggedOut: true } : { error: `HTTP ${response.status}` };
      }
      const items = json?.data?.items;
      if (!Array.isArray(items)) return { error: json?.message ? String(json.message).slice(0, 120) : `HTTP ${response.status}` };
      const pair = (value) => ({ gmkt: value?.gmkt ?? null, iac: value?.iac ?? null });
      return {
        items: items.map((item) => ({
          goodsNo: item?.goodsNo === undefined || item?.goodsNo === null ? "" : String(item.goodsNo),
          siteGoodsNo: pair(item?.siteGoodsNo),
          sellStatus: pair(item?.sellStatus),
          siteSellerId: pair(item?.siteSellerId),
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * ESM [판매 상태 변경] 창의 [변경]과 같은 요청 하나(상품 하나)를 보낸다. 워커가 인자로만 넘긴다. 답은 결과 코드와 몰이 준
   * 글뿐이다.
   */
  async function esmSellStatusOnPage(goodsPath, goodsNo, body, sellerHeaders) {
    try {
      const response = await fetch(`${goodsPath}${encodeURIComponent(goodsNo)}/sellStatus`, {
        method: "PUT",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-G-SELLER-ID": sellerHeaders?.gmkt ?? "",
          "X-A-SELLER-ID": sellerHeaders?.iac ?? "",
        },
        body: JSON.stringify(body),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || response.status === 401 || response.status === 403) {
        return { status: response.status, loggedOut: true };
      }
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const site = (key) => {
        const entry = json?.data?.[key];
        return entry && typeof entry === "object"
          ? { resultCode: entry.resultCode ?? null, message: entry.message ? String(entry.message).slice(0, 160) : null }
          : null;
      };
      return {
        status: response.status,
        resultCode: json?.resultCode ?? null,
        message: json?.message ? String(json.message).slice(0, 160) : null,
        gmkt: site("gmkt"),
        iac: site("iac"),
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 11번가 상품조회/수정 목록을 상품번호 여럿으로 읽는다. 화면의 그리드가 부르는 JSON 조회와 같고, 상품번호 칸은 화면처럼
   * 줄바꿈으로 잇고 한 번 인코딩한 값을 싣는다(쉼표는 "상품번호가 잘못 입력됐습니다"). 읽기만 한다.
   */
  async function st11ListOnPage(listPath, prdNos) {
    try {
      const params = new URLSearchParams({
        method: "getSellProductListJSON", srchTyp: "prdNew", start: "0", limit: String(Math.max(30, prdNos.length)),
        prdNo: encodeURIComponent(prdNos.join("\r\n")), prdNm: "", searchType: "PRDNO", dateType: "CREATE",
        category1: "", category2: "", category3: "", category4: "", chkSelStatCds: "", selMthdCd: "", createDt: "",
        createDtTo: "", stckQty: "", remainSelDt: "", premiumAplDt: "", dlvCstInstBasiCd: "", dlvCstPayTypCd: "",
        premiumPlusAplDt: "", dlvClf: "", dlvClfDtl: "", data: "", searchListingItemClsf: "", mobilePrdYn: "", shopNo: "",
        prdTypCd: "", omPrdYn: "", svcAreaCd: "", isPaging: "Y", reglDlvYn: "N", mnbdClfCd: "", stdPrdYn: "",
        sendClfCd: "ALL", selStopRsnCd: "",
      });
      const response = await fetch(`${listPath}?${params.toString()}`, { method: "POST", credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const text = (await response.text()).trim();
      if (!/^[({]/.test(text)) {
        return /login|로그인/i.test(text) ? { loggedOut: true } : { error: text.slice(0, 80) };
      }
      let json = null;
      try {
        json = JSON.parse(text.replace(/^\(/, "").replace(/\)$/, ""));
      } catch {
        return { error: "json" };
      }
      if (!Array.isArray(json?.DATA_LIST)) return { error: "DATA_LIST" };
      return {
        rows: json.DATA_LIST.map((row) => ({
          prdNo: row?.prdNo === undefined || row?.prdNo === null ? "" : String(row.prdNo),
          selStatCd: row?.selStatCd === undefined || row?.selStatCd === null ? "" : String(row.selStatCd),
          stckQty: Number(row?.stckQty),
          setTypCd: row?.setTypCd ?? null,
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 11번가 [판매중지] · [판매중지 해제] 확인 창의 [적용]과 같은 요청을 보낸다(창의 폼 그대로 — 건수 · 상품번호 · 사유).
   * 답은 창 화면(EUC-KR)이라 `msg` 와 "총 N건 중 M건" 만 읽어 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function st11SaveOnPage(savePath, mode, prdNos) {
    try {
      const body = new URLSearchParams({ chkPrdNoCount: String(prdNos.length), trgtPrdNos: prdNos.join(","), content: "" });
      const response = await fetch(`${savePath}?method=updateProductSelStat&prdStatCd=${encodeURIComponent(mode)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { status: response.status, loggedOut: true };
      const buffer = await response.arrayBuffer();
      let text = "";
      try {
        text = new TextDecoder("euc-kr").decode(buffer);
      } catch {
        text = new TextDecoder().decode(buffer);
      }
      const msg = /var\s+msg\s*=\s*["']([^"']*)["']/.exec(text);
      const counted = /총\s*(\d+)\s*건\s*중\s*(\d+)\s*건/.exec(text)
        || /constructReleaseMessage\(\s*Number\((\d*)\)\s*,\s*Number\((\d*)\)/.exec(text);
      const alerted = /alert\(\s*(["'])((?:(?!\1).){1,200})\1/.exec(text);
      return {
        status: response.status,
        msg: msg ? msg[1].slice(0, 80) : null,
        total: counted && counted[1] !== "" ? Number(counted[1]) : null,
        done: counted && counted[2] !== "" ? Number(counted[2]) : null,
        alert: alerted ? alerted[2].slice(0, 160) : null,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 스마트스토어센터 화면 안(MAIN)에서 화면 자신의 Angular `$http` 로 요청 하나를 보낸다 — 화면 인터셉터가 붙이는 머리가
   * 그대로 실린다. `kind` 는 search(목록 검색) · status(판매상태 변경) · progress(일괄변경 결과). 우리가 쓰는 칸만 추린다.
   * 화면이 다 뜰 때까지(Angular 가 설 때까지) 잠시 기다린다. 워커가 인자로만 넘긴다.
   */
  async function smartstoreApiOnPage(kind, url, payload) {
    try {
      const deadline = Date.now() + 20000;
      let injector = null;
      while (!injector) {
        try {
          injector = window.angular ? window.angular.element(document.body).injector() : null;
        } catch {
          injector = null;
        }
        if (injector) break;
        if (location.hostname !== "sell.smartstore.naver.com" || Date.now() > deadline) return { status: 401, loggedOut: true };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const $http = injector.get("$http");
      const method = kind === "progress" ? "GET" : kind === "status" ? "PATCH" : "POST";
      let response;
      try {
        response = await $http(kind === "progress" ? { method, url } : { method, url, data: payload });
      } catch (failure) {
        const status = Number(failure?.status) || 0;
        const said = failure?.data?.message || failure?.data?.errorMessage || null;
        return { status, loggedOut: status === 401 || status === 403, message: said ? String(said).slice(0, 160) : null };
      }
      const data = response?.data;
      if (kind === "search") {
        if (!Array.isArray(data?.content)) return { status: response.status, error: "content" };
        return {
          status: response.status,
          rows: data.content.map((row) => ({
            id: row?.id === undefined || row?.id === null ? "" : String(row.id),
            productStatusType: row?.productStatusType ?? null,
            channelProductNos: Array.isArray(row?.singleChannelProducts)
              ? row.singleChannelProducts.map((channel) => String(channel?.channelProductNo ?? "")).filter(Boolean)
              : [],
          })),
        };
      }
      if (kind === "status") return { status: response.status, state: data?.status ?? null };
      const result = data?.productBulkUpdateResultVO || null;
      const failures = result?.resultMessage && typeof result.resultMessage === "object"
        ? Object.values(result.resultMessage).map((value) => String(value).slice(0, 120)).slice(0, 3)
        : [];
      return {
        status: response.status,
        completed: data?.completed === undefined ? null : data.completed === true,
        state: data?.status ?? null,
        errorMessage: data?.errorMessage ? String(data.errorMessage).slice(0, 160) : null,
        successIds: Array.isArray(result?.successIds) ? result.successIds.map(String) : null,
        failures,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키드키즈 상품관리 목록을 상품코드로 검색해 그 줄을 읽는다(EUC-KR) — "품절상품" 칸(판매 · 품절), 세금 구분, 그리고
   * [일시품절] · [품절해제]가 보낼 목록 폼 값(그 줄을 고른 채). 읽기만 한다. 워커가 인자로만 넘긴다.
   */
  async function kidkidsRowOnPage(listPath, code) {
    try {
      const params = new URLSearchParams({ s_option: "goods_code", s_key: code });
      const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const html = new TextDecoder("euc-kr").decode(await response.arrayBuffer());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.querySelector('form[name="frmGoodsList"]');
      if (!form) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "list_form" };
      const box = [...form.querySelectorAll('input[name="goods_code[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const table = box.closest("table");
      const headRow = table ? [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")) : null;
      const heads = headRow ? [...headRow.cells].map((cell) => cell.textContent.replace(/[\s△▽]/g, "")) : [];
      const index = heads.indexOf("품절상품");
      if (index < 0) return { error: "status_column" };
      const word = String(box.closest("tr")?.cells?.[index]?.textContent || "").replace(/\s+/g, "");
      box.checked = true;
      const pairs = [...new FormData(form)].map(([name, value]) => [name, String(value)]);
      return { found: true, word, taxType: box.getAttribute("tax_type") ?? "", pairs };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키드키즈 [일시품절] · [품절해제]처럼 목록 폼을 숨은 창으로 제출한다. 폼은 화면 문서(EUC-KR)에서 만들어 브라우저가
   * 화면과 같은 인코딩으로 보내게 하고, 답 화면의 스크립트(부모 새로고침 · 알림)는 창을 막아 돌지 않게 한다. 답은 알림 글만
   * 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function kidkidsSaveOnPage(savePath, pairs) {
    let frame = null;
    let form = null;
    try {
      const frameName = `kiditem_kidkids_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      frame = document.createElement("iframe");
      frame.name = frameName;
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.style.display = "none";
      document.body.appendChild(frame);
      form = document.createElement("form");
      form.method = "post";
      form.action = savePath;
      form.acceptCharset = "euc-kr";
      form.target = frameName;
      form.style.display = "none";
      for (const [name, value] of pairs) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      const target = frame;
      const loaded = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 30000);
        target.addEventListener("load", function onLoad() {
          let href = "";
          try {
            href = String(target.contentWindow?.location?.href || "");
          } catch {
            href = "";
          }
          if (href === "" || href === "about:blank") return;
          target.removeEventListener("load", onLoad);
          clearTimeout(timer);
          resolve(true);
        });
      });
      form.submit();
      if (!(await loaded)) return { status: 0, error: "timeout" };
      let text = "";
      let path = "";
      try {
        text = String(frame.contentDocument?.documentElement?.outerHTML || "");
        path = String(frame.contentWindow?.location?.pathname || "");
      } catch {
        text = "";
      }
      if (/login/i.test(path) || /type=["']?password/i.test(text)) return { status: 200, loggedOut: true };
      const alerted = /alert\(\s*(["'])((?:(?!\1).){1,200})\1/.exec(text);
      return { status: 200, alert: alerted ? alerted[2].slice(0, 160) : null };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    } finally {
      form?.remove();
      frame?.remove();
    }
  }

  /**
   * 꼬망세 노출/재고/KC 설정 화면을 상품코드로 검색해 그 줄의 지금 값을 읽는다. 읽기만 한다. 워커가 인자로만 넘긴다.
   * 로그인이 풀렸으면 설정 화면이 아닌 곳(로그인)으로 넘어간다.
   */
  async function kkomangseRowOnPage(viewPath, code) {
    try {
      const params = new URLSearchParams({ mode: "search", pass_input_type: "pcode", pass_input_value: code });
      const response = await fetch(`${viewPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== viewPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!doc.querySelector('form[name="searchfrm"]')) return { loggedOut: true };
      const box = [...doc.querySelectorAll("input.js_ck")].find((candidate) => candidate.getAttribute("data-pcode") === code);
      if (!box) return { found: false };
      const row = box.closest("tr");
      const field = (name) => [...row.querySelectorAll("input")].filter((input) => input.name === `${name}[${code}]`);
      const checked = (name) => field(name).find((input) => input.checked)?.value ?? "";
      const text = (name) => field(name)[0]?.value ?? "";
      return {
        found: true,
        view: checked("_view"),
        stock: text("_stock"),
        stockControl: checked("_stock_control"),
        kcYn: checked("_kc_yn"),
        kcNum: text("_kc_num"),
        kcDate: text("_kc_date"),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 카페24 관리자 상품목록을 끝까지 읽어 상품마다 진열 · 판매 상태를 돌려준다. 읽기만 한다. 워커가 인자로만 넘긴다.
   *
   * 줄마다 있는 체크박스(`input._product_no`)가 상품번호와 지금 값(`is_display` · `is_selling` · `is_set_product`)을
   * 들고 있다 — [판매함] · [판매안함] 버튼도 이 값을 읽어 보낸다. 로그인이 풀렸으면 목록 화면이 아닌 곳에 닿는다.
   */
  async function cafe24ListOnPage(listPath, pageSize, maxPages) {
    try {
      const rows = [];
      const seen = new Set();
      let total = null;
      for (let page = 1; page <= maxPages; page += 1) {
        const params = new URLSearchParams({ orderby: "regist_d", limit: String(pageSize), page: String(page) });
        const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || landed.pathname.toLowerCase() !== listPath.toLowerCase()) {
          return { loggedOut: true };
        }
        if (!response.ok) return { error: `HTTP ${response.status}` };
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!doc.querySelector("#eProductSearchForm")) return { loggedOut: true };
        if (total === null) {
          // 칸이 없거나 숫자가 없으면 0 으로 읽혀 첫 쪽만 읽고 멈춘다 — 숫자가 있어야 믿는다.
          const counter = String(doc.querySelector(".total strong")?.textContent || "");
          const counted = Number(counter.replace(/[^\d]/g, ""));
          if (!/\d/.test(counter) || !Number.isSafeInteger(counted)) return { error: "상품 수를 읽지 못했습니다" };
          total = counted;
        }
        // T · F 가 아니면 모른다(null) — 모르는 상태를 판매안함으로 읽지 않는다.
        const flag = (value) => (value === "T" ? true : value === "F" ? false : null);
        const boxes = [...doc.querySelectorAll("input._product_no")];
        for (const box of boxes) {
          const no = String(box.value || "").trim();
          if (!/^\d{1,12}$/.test(no) || seen.has(no)) continue;
          seen.add(no);
          rows.push({
            no,
            display: flag(box.getAttribute("is_display")),
            selling: flag(box.getAttribute("is_selling")),
            set: box.getAttribute("is_set_product") === "T",
          });
        }
        if (rows.length >= total || boxes.length < pageSize) break;
      }
      return { total, rows };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 윙 상품목록에 보이는 그 상품의 재고 칸('품절' 또는 '999개'). 읽기만 한다. 못 찾으면 null.
   * 줄 글자는 "… 등록상품ID 16340985357 … 판매중 품절 상품수정" 모양이다(실측 2026-09-18).
   */
  function listStockCellOnPage(productCode) {
    const text = document.body ? document.body.innerText : "";
    const at = text.indexOf(`등록상품ID ${productCode}`);
    if (at < 0) return null;
    const match = /\s(품절|[\d,]+개)\s+상품수정/.exec(text.slice(at, at + 800));
    return match ? match[1] : null;
  }

  function create({ chrome: chromeApi, fetch: fetchApi, interactiveTabs, tabReason, sleep: sleepOverride }) {
    /** 판매자센터 탭 가운데 우리가 지금 쓰려고 연 것. 다른 송신 · 읽기가 빌리지 않는다(끝나면 우리가 닫는다). */
    const ownedTabs = new Set();

    /**
     * 보내는 도중 멈췄을 때(로그인이 풀림 등). 이미 몰에 간 것은 버리지 않는다 — 하나라도 새로 보냈으면 그 건수와 멈춘
     * 까닭을 돌려주고(`stopped`, 웹은 남은 묶음을 보내지 않는다), 하나도 안 보냈으면 실패다.
     */
    /**
     * 품절 여부만 주는 몰의 지금 상태 한 줄. 판매중이면 재고 모름(null), 아니면 못 사니 0 이고 그 몰의 상태 글자를 싣는다 —
     * 칸이 '품절' 로 뭉개지 않고 판매중지 · 판매종료 · 숨김처럼 몰의 말 그대로 적는다.
     */
    function flagOption(code, selling, state) {
      return selling
        ? { optionCode: code, stock: null, rocket: false }
        : { optionCode: code, stock: 0, rocket: false, ...(state ? { state: String(state) } : {}) };
    }

    function lotteonOption(code, status) {
      return flagOption(code, status === "SALE", { SOUT: "품절", STP: "판매중지", END: "판매종료" }[status]);
    }

    function stoppedMidway(message, { sent, failed, confirmed, already, warnings, left }) {
      if (sent === 0) return { success: false, error: message };
      return {
        success: true,
        sent: sent + already,
        failed: failed + left,
        confirmed: confirmed + already,
        already,
        rocket: 0,
        requestOnly: false,
        warnings: [...warnings, `${message} ${left > 0 ? `— ${left}건은 보내지 못했습니다.` : ""}`.trim()],
        stopped: "halted",
      };
    }
    function waitForTabComplete(tabId, timeoutMs = 45000) {
      if (!chromeApi.tabs?.onUpdated?.addListener) return Promise.resolve(null);
      return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          chromeApi.tabs.onUpdated.removeListener(onUpdated);
          clearTimeout(timer);
          resolve(value);
        };
        const onUpdated = (id, changeInfo, tab) => {
          if (id === tabId && changeInfo.status === "complete") finish(tab || {});
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        chromeApi.tabs.onUpdated.addListener(onUpdated);
      });
    }

    // 시험은 기다리는 시간을 건너뛴다(429 로 30초씩 쉬는 길을 실제로 기다리지 않는다).
    const sleep = sleepOverride || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    /** 몰이 뭐라고 답했는지. 본문은 남기지 않는다 — 길이와 신호만 본다. */
    function readAnswer(status, text) {
      const body = String(text || "");
      const failed = /로그인|login|오류|실패|error|권한/i.test(body.slice(0, 500));
      return { status, accepted: status >= 200 && status < 400 && !failed, failed };
    }

    /** 몰이 JSON 으로 답하면 읽는다. 아니면 null. 본문은 남기지 않는다. */
    async function readJson(response) {
      const text = await response.text().catch(() => "");
      try {
        return { json: JSON.parse(text), text };
      } catch {
        return { json: null, text };
      }
    }

    /** 도매꾹 목록 조회 — 상품번호로. 목록 검색 폼이 보내는 기본값에 번호만 넣는다. 읽기만 한다. */
    async function lookupListRows(spec, codes) {
      const params = new URLSearchParams();
      for (const [key, value] of [
        ["ktype", "no"], ["nos", codes.join(",")], ["ttl", ""], ["st", ""],
        ["chn[]", "dome"], ["chn[]", "supply"], ["sec[]", "sell"], ["sec[]", "shop"],
        ["ca1", "00"], ["ca2", "00"], ["ca3", "00"], ["ca4", "00"],
        ["idx", ""], ["qty", ""], ["disp", ""], ["rmp", ""], ["format", "grid"],
        ["pg", "1"], ["sz", String(spec.listEdit.maxCodes)], ["so", "rd"],
      ]) params.append(key, value);
      const response = await fetchApi(`${spec.origin}${spec.listEdit.lookupPath}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
      });
      const { json, text } = await readJson(response);
      if (!response.ok || !json || json.res !== true || !Array.isArray(json.dat)) {
        const loggedOut = /로그인|login/i.test(`${json?.msg || ""} ${text.slice(0, 300)}`);
        throw new Error(loggedOut
          ? `${spec.label}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 보내세요.`
          : `${spec.label} 상품 목록을 읽지 못했습니다.`);
      }
      return json.dat;
    }

    /**
     * 목록 수정 한 방으로 진열여부를 바꾸는 몰(도매꾹).
     *
     * 줄을 먼저 읽어 지금 값(상품명 · 최대판매수량 · 옵션 사용)을 그대로 싣고 진열여부만 바꾼다. 이미
     * 원하는 상태인 줄은 보내지 않는다. 보낸 뒤 다시 읽어 바뀐 줄을 센다.
     */
    async function sendByListEdit(spec, codes, resume) {
      const edit = spec.listEdit;
      const wanted = resume ? edit.shown.show : edit.shown.hide;
      const warnings = [];
      let sent = 0;
      let failed = 0;
      let confirmed = 0;
      let already = 0;
      const missing = [];
      for (let start = 0; start < codes.length; start += edit.maxCodes) {
        const group = codes.slice(start, start + edit.maxCodes);
        const rows = new Map((await lookupListRows(spec, group)).map((row) => [String(row.no), row]));
        const found = group.filter((code) => rows.has(code));
        missing.push(...group.filter((code) => !rows.has(code)));
        const targets = found.filter((code) => rows.get(code).disp !== wanted);
        already += found.length - targets.length;
        if (targets.length > 0) {
          // [수정저장] 이 만드는 모양 그대로다(`loq` 는 첫 쉼표만 뗀다 — 화면 코드가 그렇게 한다).
          const dat = targets.map((code) => {
            const row = rows.get(code);
            return {
              no: row.no,
              disp: resume,
              title: row.title,
              loq: String(row.loq ?? "").replace(",", ""),
              useOpt: row.useOpt !== "N",
            };
          });
          const response = await fetchApi(`${spec.origin}${edit.editPath}`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              accept: "application/json",
              "x-requested-with": "XMLHttpRequest",
            },
            body: `dat=${encodeURIComponent(JSON.stringify(dat))}`,
          });
          const { json } = await readJson(response);
          if (!response.ok || !json || json.res !== true) {
            failed += targets.length;
            warnings.push(`${spec.label}이 수정을 받지 않았습니다${json?.msg ? `: ${String(json.msg).slice(0, 120)}` : ""}.`);
          } else {
            // 건수가 숫자로 왔을 때만 믿는다(null · "" · true 를 0 · 1 로 읽지 않는다). 없으면 묶음 전체로 본다.
            const counted = typeof json.success === "number" || (typeof json.success === "string" && /^\d+$/.test(json.success))
              ? Number(json.success)
              : null;
            const ok = counted === null ? targets.length : Math.min(counted, targets.length);
            sent += ok;
            failed += targets.length - ok;
            if (ok < targets.length) warnings.push(`${spec.label}이 ${targets.length}건 중 ${ok}건만 바꿨다고 답했습니다.`);
          }
          await sleep(PACE_MS);
        }
        // 반영 확인 — 같은 조회로 진열여부를 다시 읽는다. 못 읽으면 확인하지 못한 것으로 둔다.
        const after = found.length > 0 ? await lookupListRows(spec, found).catch(() => null) : [];
        if (after) confirmed += after.filter((row) => row.disp === wanted).length;
        else warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 목록에서 확인하세요.`);
      }
      if (already > 0) warnings.push(`${already}건은 이미 ${wanted}이었습니다.`);
      if (missing.length > 0) warnings.push(`${missing.length}건은 ${spec.label} 상품번호로 찾지 못했습니다.`);
      return {
        success: true,
        // 이미 원하는 상태인 줄은 보낼 것이 없었을 뿐 끝난 일이다.
        sent: sent + already,
        failed: failed + missing.length,
        confirmed,
        requestOnly: false,
        warnings,
      };
    }

    /**
     * 윙 상품목록을 열고, 그 안에서 윙 API 를 부르는 도구를 `work` 에 넘긴다. 윙 API 는 윙 화면의 로그인으로 불러야
     * 한다. 로그인 화면으로 넘어갔으면 부르지 않는다.
     *
     *  - `show`(상품코드)가 있으면 그 상품을 검색한 상품목록을 **앞에** 띄운다. 이미 열린 상품목록 탭이 있으면 그 탭을
     *    쓴다. 보낸 뒤 새로 고쳐 바뀐 재고를 보여 주고, 사장님이 보도록 닫지 않는다. 로그인 화면이 떠도 닫지 않는다 —
     *    거기서 로그인하면 된다.
     *  - 없으면 상품목록을 뒤에서 열고 끝나면(실패해도) 닫는다.
     *
     * 윙이 429 로 막으면 쉬었다 같은 요청을 다시 보낸다(재고를 정해진 값으로 두는 요청이라 다시 보내도 같다).
     * 429 를 로그아웃으로 읽지 않는다.
     */
    async function withWingPage(spec, work, { show = null, reuseOpen = false } = {}) {
      const stock = spec.optionStock;
      let tabId = null;
      let closeWhenDone = !show;
      const inPage = async (path, method, contentType, body) => {
        for (let attempt = 0; ; attempt += 1) {
          const [injected] = await chromeApi.scripting.executeScript({
            target: { tabId },
            func: requestOnPage,
            args: [path, method, contentType, body],
          });
          const answer = injected?.result || { status: 0, json: null, preview: "", url: "" };
          if (answer.status !== 429 || attempt >= WING_RATE_LIMIT_WAITS_MS.length) return answer;
          await sleep(WING_RATE_LIMIT_WAITS_MS[attempt]);
        }
      };
      const readItems = async (product) => {
        const answer = await inPage(`${stock.itemsPath}${product}?${stock.itemsQuery}`, "GET", null, null);
        if (answer.status === 200 && answer.json?.success === true && Array.isArray(answer.json.data)) {
          return { items: answer.json.data };
        }
        return {
          status: answer.status,
          rateLimited: answer.status === 429,
          loggedOut: answer.status !== 429 && /login|로그인|xauth/i.test(`${answer.url} ${answer.preview}`),
        };
      };
      try {
        const url = stock.listUrl(show || "");
        // 읽기만 할 때는 이미 열린 윙 화면이 있으면 그 화면에서 부른다 — 탭을 새로 열지 않아 빠르고 화면도 안 바뀐다.
        const reusable = reuseOpen ? await findOpenWingTab(spec) : null;
        if (reusable) {
          tabId = reusable.id;
          closeWhenDone = false;
          return await work({ inPage, readItems, showList: async () => null });
        }
        if (show) {
          // 이미 열린 상품목록 탭이 있으면 그 탭에서 이 상품을 검색해 앞에 띄운다. 탭이 쌓이지 않는다.
          const [open] = await chromeApi.tabs.query({ url: `${spec.origin}${stock.listPath}*` }).catch(() => []);
          const tab = open
            ? await chromeApi.tabs.update(open.id, { url, active: true })
            : await chromeApi.tabs.create({ url, active: true });
          tabId = tab.id;
        } else {
          const tab = await chromeApi.tabs.create({ url, active: false });
          tabId = tab.id;
        }
        const waited = await waitForTabComplete(tabId).catch(() => undefined);
        await sleep(waited ? 900 : 2200);
        const current = await chromeApi.tabs.get(tabId).catch(() => null);
        if (!String(current?.url || current?.pendingUrl || "").startsWith(spec.origin)) {
          return {
            success: false,
            error: show
              ? `${spec.label}에 로그인되어 있지 않습니다. 열린 윙 화면에서 로그인한 뒤 다시 누르세요.`
              : `${spec.label}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도하세요.`,
          };
        }
        /**
         * 앞에 띄운 상품목록을 새로 고쳐 바뀐 재고가 보일 때까지 기다린다. `settled(재고 칸)` 이 참이면 끝이다.
         * 보인 것을 확인했으면 true, 끝내 옛 값이면 false, 그 상품 줄을 못 찾았으면 null.
         */
        const showList = async (settled) => {
          if (!show) return null;
          let cell = null;
          for (let attempt = 0; attempt < LIST_RECHECK_TIMES; attempt += 1) {
            if (attempt > 0) await sleep(LIST_RECHECK_MS);
            await chromeApi.tabs.reload(tabId).catch(() => undefined);
            const loaded = await waitForTabComplete(tabId).catch(() => undefined);
            await sleep(loaded ? LIST_RENDER_MS : 2200);
            const [injected] = await chromeApi.scripting.executeScript({
              target: { tabId },
              func: listStockCellOnPage,
              args: [show],
            }).catch(() => []);
            cell = injected?.result ?? null;
            if (cell === null) return null;
            if (settled(cell)) return true;
          }
          return false;
        };
        return await work({ inPage, readItems, showList });
      } finally {
        // 뒤에서 연 탭만 닫는다. 앞에 띄운 상품목록은 사장님 것이다(원래 열려 있던 탭일 수도 있다).
        if (tabId !== null && closeWhenDone) await chromeApi.tabs.remove(tabId).catch(() => undefined);
      }
    }

    /** 로그인된 채 다 뜬 윙 화면 하나. 없으면 null. 그 화면은 건드리지 않고 그 안에서 부르기만 한다. */
    async function findOpenWingTab(spec) {
      const tabs = await chromeApi.tabs.query({ url: `${spec.origin}/*` }).catch(() => []);
      return (tabs || []).find((tab) => tab && tab.status === "complete"
        && String(tab.url || "").startsWith(spec.origin)
        && !/login|xauth/i.test(String(tab.url || ""))) || null;
    }

    /**
     * 쿠팡 윙 옵션 재고. 상품마다 옵션 목록을 읽고, 짚은 옵션의 재고를 0(해제는 재고 0 인 옵션에
     * `resumeQuantity`)으로 보낸 뒤 다시 읽어 확인한다.
     *
     * 윙이 끝까지 막으면(429) 거기서 멈춰 남은 상품을 보내지 못한 것으로 센다(`stopped: "rate_limited"`).
     */
    async function sendByOptionStock(spec, codes, options, resume, show) {
      const stock = spec.optionStock;
      const quantity = resume ? stock.resumeQuantity : 0;
      const warnings = [];
      const products = codes.filter((code) => /^\d{1,15}$/.test(code));
      const invalid = codes.length - products.length;
      if (invalid > 0) warnings.push(`${invalid}건은 ${spec.label} 등록상품ID 모양이 아니라 보내지 않았습니다.`);

      let sent = 0;
      let failed = invalid;
      let confirmed = 0;
      let already = 0;
      let rocket = 0;
      // 윙이 끝까지 막아 멈춘 자리(products 의 index). 여기부터는 보내지 않았다.
      let stoppedAt = null;
      // 보내기에서 막힌 상품(읽기는 됐다). 멈춘 자리 앞이지만 역시 보내지 못했다.
      let blockedOnSend = 0;
      // 짚은 옵션코드. 비었거나 없으면 모든 옵션이다. 모양이 틀린 코드는 버리지 않고 실패로 센다(아래).
      const wantedOf = (product) => {
        if (!Array.isArray(options?.[product]) || options[product].length === 0) return null;
        return new Set(options[product].map((code) => String(code)).filter((code) => /^\d{1,15}$/.test(code)));
      };
      const badOptionsOf = (product) => (Array.isArray(options?.[product])
        ? options[product].map((code) => String(code)).filter((code) => !/^\d{1,15}$/.test(code)).length
        : 0);
      // 로그인이 풀려 멈춘 자리(products 의 index). 이미 보낸 것은 버리지 않는다.
      let loggedOutAt = null;
      const isTarget = (item) => (resume
        ? Number(item.stockQuantity) === 0
        : Number(item.stockQuantity) !== 0);
      // 상품 하나를 사장님이 눌렀을 때만 상품목록을 앞에 띄운다. 나눠 보내는 묶음은 뒤에서.
      const shown = show && products.length === 1 ? products[0] : null;
      // 앞에 띄운 상품목록에 바뀐 재고가 보였는가(true) · 끝내 옛 값(false) · 줄을 못 찾음/띄우지 않음(null).
      let listShown = null;
      const halted = await withWingPage(spec, async ({ inPage, readItems, showList }) => {
        for (let index = 0; index < products.length; index += 1) {
          const product = products[index];
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const wanted = wantedOf(product);
          const badOptions = badOptionsOf(product);
          if (badOptions > 0) {
            failed += badOptions;
            warnings.push(`${product}: 옵션코드 ${badOptions}개가 ${spec.label} 옵션ID 모양이 아니라 보내지 않았습니다.`);
          }
          if (wanted && wanted.size === 0) continue;
          const read = await readItems(product);
          if (!read.items) {
            if (read.loggedOut) {
              if (sent === 0) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.` };
              loggedOutAt = index;
              break;
            }
            if (read.rateLimited) {
              stoppedAt = index;
              break;
            }
            failed += wanted ? wanted.size : 1;
            warnings.push(`${product}: ${spec.label} 옵션 목록을 읽지 못했습니다(HTTP ${read.status}).`);
            continue;
          }
          const items = read.items.filter((item) => !wanted || wanted.has(String(item.vendorItemId)));
          if (!wanted && read.items.length === 0) {
            // 옵션 목록이 비어 오면 보낼 것도 확인할 것도 없다 — 조용히 넘기지 않고 실패로 센다.
            failed += 1;
            warnings.push(`${product}: ${spec.label} 옵션 목록이 비어 있습니다.`);
            continue;
          }
          if (wanted) {
            const missing = [...wanted].filter((code) => !read.items.some((item) => String(item.vendorItemId) === code));
            if (missing.length > 0) {
              failed += missing.length;
              warnings.push(`${product}: 옵션 ${missing.length}개가 ${spec.label}에 없습니다.`);
            }
          }
          const editable = items.filter((item) => item.registrationType !== "RFM");
          rocket += items.length - editable.length;
          const targets = editable.filter(isTarget);
          already += editable.length - targets.length;
          if (targets.length === 0) continue;
          const dtos = targets.map((item) => ({
            vendorInventoryItemId: item.vendorInventoryItemId,
            vendorItemId: item.vendorItemId,
            inventoryQuantity: quantity,
          }));
          const answer = await inPage(
            stock.changePath,
            "POST",
            "application/x-www-form-urlencoded; charset=UTF-8",
            `stockManageItems=${encodeURIComponent(JSON.stringify({ dtos }))}`,
          );
          if (answer.status === 429) {
            failed += targets.length;
            blockedOnSend = 1;
            stoppedAt = index + 1;
            break;
          }
          const results = Array.isArray(answer.json) ? answer.json : null;
          if (answer.status < 200 || answer.status >= 300 || !results) {
            failed += targets.length;
            warnings.push(`${product}: ${spec.label}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
            continue;
          }
          const ok = new Set(results.filter((entry) => entry && entry.success === true).map((entry) => String(entry.vendorItemId)));
          const okCount = targets.filter((item) => ok.has(String(item.vendorItemId))).length;
          sent += okCount;
          failed += targets.length - okCount;
          if (okCount < targets.length) {
            const reasons = [...new Set(results
              .filter((entry) => entry && entry.success !== true)
              .map((entry) => String(entry.message || "").trim())
              .filter(Boolean))].slice(0, 2);
            warnings.push(`${product}: ${targets.length - okCount}개 옵션을 바꾸지 않았습니다${reasons.length ? ` — ${reasons.join(" / ").slice(0, 160)}` : ""}.`);
          }
          // 다시 읽어 재고가 바뀐 옵션을 센다. 윙이 받은 뒤 조금 늦게 반영하면 한 번 더 본다.
          // 못 읽으면 확인하지 못한 것으로 둔다.
          const countChanged = (list) => {
            const changed = new Set(list
              .filter((item) => Number(item.stockQuantity) === quantity)
              .map((item) => String(item.vendorItemId)));
            return targets.filter((item) => changed.has(String(item.vendorItemId))).length;
          };
          let after = await readItems(product);
          let seen = after.items ? countChanged(after.items) : 0;
          if (after.items && seen < okCount) {
            await sleep(WING_RECHECK_MS);
            after = await readItems(product);
            if (after.items) seen = Math.max(seen, countChanged(after.items));
          }
          confirmed += seen;
          await sleep(PACE_MS);
        }
        // 사장님이 보는 상품목록은 바뀐 재고가 보일 때까지 새로 고친다. 보낸 것이 없으면(이미 그 재고) 한 번만.
        if (shown) {
          listShown = await showList((cell) => (sent === 0 || (resume ? cell !== "품절" : cell === "품절")));
        }
        return null;
      }, { show: shown });
      if (halted) return halted;
      if (stoppedAt !== null) {
        const rest = products.slice(stoppedAt);
        failed += rest.reduce((sum, product) => sum + (wantedOf(product)?.size || 1), 0);
        warnings.push(`${spec.label}이 요청을 잠시 막았습니다(HTTP 429). 상품 ${rest.length + blockedOnSend}개는 보내지 못했습니다 — 몇 분 뒤 다시 보내세요.`);
      }
      if (loggedOutAt !== null) {
        const rest = products.slice(loggedOutAt);
        failed += rest.reduce((sum, product) => sum + (wantedOf(product)?.size || 1), 0);
        warnings.push(`${spec.label} 로그인이 풀려 멈췄습니다 — 상품 ${rest.length}개는 보내지 못했습니다. 로그인한 뒤 다시 보내세요.`);
      }
      return {
        success: true,
        // 이미 원하는 재고인 옵션은 보낼 것이 없었을 뿐 끝난 일이다.
        sent: sent + already,
        failed,
        confirmed: confirmed + already,
        // 문장은 웹이 만든다 — 여러 번 나눠 보내면 합쳐서 한 줄로 말해야 한다.
        already,
        rocket,
        requestOnly: false,
        warnings,
        ...(shown ? { listShown } : {}),
        ...(stoppedAt !== null ? { stopped: "rate_limited" } : loggedOutAt !== null ? { stopped: "logged_out" } : {}),
      };
    }

    async function postForm(origin, action, pairs, encoding) {
      const params = new URLSearchParams();
      for (const [name, value] of pairs) params.append(name, value);
      const response = await fetchApi(`${origin}${action}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": `application/x-www-form-urlencoded${encoding ? `; charset=${encoding}` : ""}`,
        },
        body: params.toString(),
      });
      // 로그인 화면으로 넘어갔으면 받은 것이 아니다.
      const landed = String(response.url || "");
      if (landed && (!landed.startsWith(origin) || /login/i.test(landed))) {
        return { status: response.status, accepted: false, failed: true, loggedOut: true };
      }
      return readAnswer(response.status, await response.text().catch(() => ""));
    }

    /**
     * 판매자센터 화면 하나에서 일한다. 이미 열린 그 몰 화면(로그인된 채 다 뜬 것)이 있으면 빌려 쓰고 건드리지 않는다.
     * 없으면 뒤에서 열고, 끝나면(실패해도) 닫는다. 로그인 화면으로 넘어갔으면 부르지 않는다.
     */
    async function withSellerPage(spec, pageUrl, work) {
      let tabId = null;
      let created = false;
      try {
        const open = await chromeApi.tabs.query({ url: `${spec.origin}/*` }).catch(() => []);
        // 우리가 다른 일로 연 탭은 빌리지 않는다 — 그 일이 끝나면 닫혀서, 빌린 쪽이 보내는 도중에 탭을 잃는다.
        const reusable = (open || []).find((tab) => tab && tab.status === "complete"
          && !ownedTabs.has(tab.id)
          && String(tab.url || "").startsWith(spec.origin)
          && !/login|signin|auth/i.test(String(tab.url || "")));
        if (reusable) {
          tabId = reusable.id;
        } else {
          const tab = await chromeApi.tabs.create({ url: pageUrl, active: false });
          tabId = tab.id;
          created = true;
          ownedTabs.add(tabId);
          const waited = await waitForTabComplete(tabId).catch(() => undefined);
          await sleep(waited ? 1200 : 2500);
          const current = await chromeApi.tabs.get(tabId).catch(() => null);
          const url = String(current?.url || current?.pendingUrl || "");
          if (!url.startsWith(spec.origin) || /login|signin/i.test(url)) {
            return { success: false, error: `${spec.label}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도하세요.` };
          }
        }
        // `world` 가 "MAIN" 이면 화면 자신의 전역(롯데ON `gcm`)을 쓰는 함수다. 없으면 격리된 곳에서 돈다.
        const run = async (func, args, world) => {
          const [injected] = await chromeApi.scripting.executeScript({
            target: { tabId },
            func,
            args,
            ...(world ? { world } : {}),
          });
          return injected?.result || { status: 0, json: null };
        };
        return await work(run);
      } finally {
        if (created && tabId !== null) {
          ownedTabs.delete(tabId);
          await chromeApi.tabs.remove(tabId).catch(() => undefined);
        }
      }
    }

    /** 톡스토어 상품 하나를 목록 API 로 읽는다. 없으면 null, 로그인이 풀렸으면 { loggedOut }. */
    async function readKakaoProduct(spec, run, productId) {
      const answer = await run(requestOnPage, [
        `${spec.gridStock.listPath}?productIds=${encodeURIComponent(productId)}&size=1&page=0`, "GET", null, null,
      ]);
      if (answer.status === 401 || answer.status === 403 || /login|xauth|accounts\.kakao/i.test(`${answer.url} ${answer.preview}`)) {
        return { loggedOut: true };
      }
      if (answer.status !== 200 || !Array.isArray(answer.json?.contents)) return { error: `HTTP ${answer.status}` };
      return { product: answer.json.contents.find((row) => String(row.id) === String(productId)) || null };
    }

    /**
     * 카카오 톡스토어 재고. 상품마다 지금 값을 읽어 [선택 수정]과 같은 모양으로 재고만 바꿔 보내고, 다시 읽어 확인한다.
     */
    async function sendByKakaoGrid(spec, codes, resume) {
      const grid = spec.gridStock;
      const quantity = resume ? grid.resumeQuantity : 0;
      const warnings = [];
      const products = codes.filter((code) => /^\d{1,15}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      let withOptions = 0;
      const halted = await withSellerPage(spec, grid.pageUrl, async (run) => {
        const targets = [];
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const read = await readKakaoProduct(spec, run, products[index]);
          if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (!read.product) {
            failed += 1;
            warnings.push(`${products[index]}: ${spec.label}에서 찾지 못했습니다${read.error ? `(${read.error})` : ""}.`);
            continue;
          }
          const product = read.product;
          if (product.optionSetting && product.optionSetting !== "미설정") {
            withOptions += 1;
            failed += 1;
            continue;
          }
          const stock = Number(product.stockQuantity);
          const isTarget = resume ? stock === 0 : stock !== 0;
          if (!isTarget) {
            already += 1;
            continue;
          }
          targets.push(product);
        }
        if (targets.length === 0) return null;
        // [선택 수정]이 만드는 모양 그대로 — 지금 값을 그대로 싣고 재고만 바꾼다.
        const edits = targets.map((product) => ({
          name: product.name,
          salePrice: product.salePrice,
          storeManagementCode: product.storeManagementCode ?? "",
          stockQuantity: quantity,
          productId: product.id,
          displayStatus: product.displayStatusType,
        }));
        const answer = await run(requestOnPage, [
          grid.gridPath, "PUT", "application/json", JSON.stringify(edits),
        ]);
        if (answer.status < 200 || answer.status >= 300) {
          failed += targets.length;
          const reason = answer.json?.message || answer.json?.errorMessage || "";
          warnings.push(`${spec.label}이 재고 변경을 받지 않았습니다(HTTP ${answer.status})${reason ? `: ${String(reason).slice(0, 120)}` : ""}.`);
          return null;
        }
        // 몰이 받은 건수를 주면 그만큼만 보낸 것으로 센다(없으면 묶음 전체).
        const counted = Number.isSafeInteger(answer.json?.successCount) ? Math.max(0, Math.min(answer.json.successCount, targets.length)) : null;
        sent += counted ?? targets.length;
        if (counted !== null && counted < targets.length) {
          failed += targets.length - counted;
          warnings.push(`${spec.label}이 ${targets.length}건 중 ${counted}건만 바꿨다고 답했습니다.`);
        }
        // 다시 읽어 재고가 바뀐 상품을 센다.
        for (const product of targets) {
          await sleep(WING_PRODUCT_PACE_MS);
          const after = await readKakaoProduct(spec, run, product.id);
          if (after.product && Number(after.product.stockQuantity) === quantity) confirmed += 1;
        }
        return null;
      });
      if (halted) return halted;
      if (withOptions > 0) {
        warnings.push(`옵션이 있는 상품 ${withOptions}개는 옵션마다 재고라 보내지 않았습니다 — ${spec.label}에서 옵션 재고를 고쳐 주세요.`);
      }
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 올웨이즈 상품 상태를 읽는다(soldOut). 로그인이 풀렸으면 { loggedOut }. */
    async function readAlwayzItems(spec, run, itemIds) {
      const api = spec.itemApi;
      const answer = await run(alwayzRequestOnPage, [`${api.backend}/sellers/items/info-request`, { itemIds }, api.tokenKey]);
      if (answer.loggedOut) return { loggedOut: true };
      const items = Array.isArray(answer.json?.data) ? answer.json.data : null;
      if (answer.status !== 200 || !items) return { error: `HTTP ${answer.status}` };
      return { items };
    }

    /** 올웨이즈 품절 · 재개. [품절] · [판매재개] 버튼이 보내는 요청을 여러 개 한 번에 보내고, 다시 읽어 확인한다. */
    async function sendByAlwayzItems(spec, codes, resume) {
      const api = spec.itemApi;
      const warnings = [];
      const ids = codes.filter((code) => /^[0-9a-f]{24}$/i.test(code));
      let failed = codes.length - ids.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품 고유번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (ids.length === 0) return null;
        const read = await readAlwayzItems(spec, run, ids);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.items) return { success: false, error: `${spec.label} 상품 상태를 읽지 못했습니다(${read.error}).` };
        const byId = new Map(read.items.map((item) => [String(item._id), item]));
        const missing = ids.filter((id) => !byId.has(id));
        if (missing.length > 0) {
          failed += missing.length;
          warnings.push(`${missing.length}건은 ${spec.label}에서 찾지 못했습니다.`);
        }
        const targets = ids.filter((id) => byId.has(id) && Boolean(byId.get(id).soldOut) === resume);
        already += ids.filter((id) => byId.has(id)).length - targets.length;
        if (targets.length === 0) return null;
        const path = resume ? "/items/resume-many" : "/items/sold-out-many";
        const answer = await run(alwayzRequestOnPage, [`${api.backend}${path}`, { itemIdList: targets }, api.tokenKey]);
        const ok = answer.status === 200 && (answer.json?.status === undefined || Number(answer.json.status) === 200);
        if (!ok) {
          failed += targets.length;
          warnings.push(`${spec.label}이 ${resume ? "판매재개" : "품절"}를 받지 않았습니다(HTTP ${answer.status}).`);
          return null;
        }
        sent += targets.length;
        await sleep(PACE_MS);
        const after = await readAlwayzItems(spec, run, targets);
        if (after.items) confirmed += after.items.filter((item) => Boolean(item.soldOut) === !resume).length;
        else warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다.`);
        return null;
      });
      if (halted) return halted;
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 카페24 상품목록 전체를 읽는다. 로그인이 풀렸으면 { loggedOut }, 못 읽었으면 { error }. */
    async function readCafe24Rows(spec, run) {
      const api = spec.sellingState;
      const answer = await run(cafe24ListOnPage, [api.listPath, api.pageSize, api.maxPages]);
      if (answer?.loggedOut) return { loggedOut: true };
      if (!Array.isArray(answer?.rows)) return { error: answer?.error || "형식을 모릅니다" };
      return { rows: new Map(answer.rows.map((row) => [row.no, row])) };
    }

    /**
     * 카페24 판매상태. 상품목록을 읽어 지금 값을 얻고, [판매안함] · [판매함] 버튼이 보내는 요청을 한 쪽(100개)씩 보낸 뒤
     * 목록을 다시 읽어 확인한다.
     */
    async function sendBySellingState(spec, codes, resume) {
      const api = spec.sellingState;
      const warnings = [];
      const products = codes.filter((code) => /^\d{1,12}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readCafe24Rows(spec, run);
        if (before.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품목록을 읽지 못했습니다(${before.error}).` };
        const found = products.filter((no) => before.rows.has(no));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label} 상품목록에 없습니다.`);
        }
        const sets = found.filter((no) => before.rows.get(no).set).length;
        if (sets > 0) {
          failed += sets;
          warnings.push(`세트상품 ${sets}개는 ${spec.label} 화면도 판매상태를 바꾸지 못하게 막아 보내지 않았습니다.`);
        }
        const unknown = found.filter((no) => !before.rows.get(no).set
          && (before.rows.get(no).selling === null || before.rows.get(no).display === null)).length;
        if (unknown > 0) {
          failed += unknown;
          warnings.push(`${unknown}건은 ${spec.label} 상품목록에서 판매 · 진열 상태를 읽지 못해 보내지 않았습니다.`);
        }
        const known = found.filter((no) => !before.rows.get(no).set
          && before.rows.get(no).selling !== null && before.rows.get(no).display !== null);
        const targets = known.filter((no) => before.rows.get(no).selling !== resume);
        already += known.length - targets.length;
        const accepted = [];
        for (let start = 0; start < targets.length; start += api.pageSize) {
          const group = targets.slice(start, start + api.pageSize);
          // 버튼이 만드는 모양 그대로(jQuery 가 {product_no, change, state, market} 을 펼친 순서).
          const body = new URLSearchParams();
          for (const no of group) body.append("product_no[]", no);
          body.append("change", "is_selling");
          body.append("state", resume ? "T" : "F");
          for (const no of group) {
            const row = before.rows.get(no);
            body.append(`market[${no}][is_display]`, row.display ? "T" : "F");
            body.append(`market[${no}][is_selling]`, row.selling ? "T" : "F");
          }
          const answer = await run(requestOnPage, [
            api.statePath, "POST", "application/x-www-form-urlencoded; charset=UTF-8", body.toString(),
            { "X-Requested-With": "XMLHttpRequest" },
          ]);
          if (answer.status < 200 || answer.status >= 300 || !answer.json || answer.json.passed === false) {
            failed += group.length;
            const reason = answer.json?.msg ? `: ${String(answer.json.msg).slice(0, 120)}` : "";
            warnings.push(`${spec.label}이 판매상태 변경을 받지 않았습니다(HTTP ${answer.status})${reason}.`);
            continue;
          }
          sent += group.length;
          accepted.push(...group);
          await sleep(PACE_MS);
        }
        if (sent === 0) return null;
        const after = await readCafe24Rows(spec, run);
        // 받아들여진 것만 확인으로 센다 — 거절된 묶음이 다른 까닭으로 원하는 상태여도 보낸 수를 넘기지 않는다.
        if (after.rows) confirmed += accepted.filter((no) => after.rows.get(no)?.selling === resume).length;
        else warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 상품목록에서 확인하세요.`);
        return null;
      });
      if (halted) return halted;
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /**
     * 꼬망세 재고. 상품마다 설정 화면을 검색해 지금 값을 읽고, [개별수정]과 같은 요청으로 재고만 바꿔 보낸 뒤 다시
     * 읽어 확인한다.
     */
    async function sendByKkomangseDirect(spec, codes, resume) {
      const api = spec.directChange;
      const wanted = resume ? String(api.resumeStock) : "0";
      const warnings = [];
      let sent = 0;
      let failed = 0;
      let confirmed = 0;
      let already = 0;
      let missing = 0;
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        for (let index = 0; index < codes.length; index += 1) {
          const code = codes[index];
          if (index > 0) await sleep(PACE_MS);
          const row = await run(kkomangseRowOnPage, [api.viewPath, code]);
          if (row?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = codes.length - index;
            return null;
          }
          if (!row?.found) {
            if (row?.error) {
              failed += 1;
              warnings.push(`${code}: ${spec.label} 설정 화면을 읽지 못했습니다(${row.error}).`);
            } else {
              missing += 1;
            }
            continue;
          }
          // 빈 칸은 0 이 아니다 — 모르는 재고를 품절로 읽지 않는다.
          const soldOut = String(row.stock).trim() !== "" && Number(row.stock) === 0;
          if (resume ? !soldOut : soldOut) {
            already += 1;
            continue;
          }
          // 노출 · 재고관리 칸을 못 읽었으면 보내지 않는다 — 빈 값을 실으면 노출이 꺼지거나 KC 정보가 지워질 수 있다.
          if (!["Y", "N"].includes(row.view) || !["Y", "N"].includes(row.stockControl)) {
            failed += 1;
            warnings.push(`${code}: ${spec.label} 설정 화면에서 노출 · 재고관리 값을 읽지 못해 보내지 않았습니다.`);
            continue;
          }
          // [개별수정]이 모으는 모양 그대로 — 지금 값을 싣고 재고만 바꾼다.
          const body = new URLSearchParams([
            ["_mode", "view_direct_change"],
            ["pcode", code],
            ["_view", row.view],
            ["_stock", wanted],
            ["_stock_control", row.stockControl],
            ["_kc_yn", row.kcYn],
            ["_kc_num", row.kcNum],
            ["_kc_date", row.kcDate],
          ]);
          const answer = await run(requestOnPage, [
            api.changePath, "POST", "application/x-www-form-urlencoded; charset=UTF-8", body.toString(),
            { "X-Requested-With": "XMLHttpRequest" },
          ]);
          if (answer.status < 200 || answer.status >= 300 || answer.json?.res !== "success") {
            failed += 1;
            warnings.push(`${code}: ${spec.label}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
            continue;
          }
          sent += 1;
          const after = await run(kkomangseRowOnPage, [api.viewPath, code]);
          if (after?.found && String(Number(after.stock)) === wanted) confirmed += 1;
        }
        return null;
      });
      if (halted) return halted;
      if (missing > 0) {
        failed += missing;
        warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다.`);
      }
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /**
     * 티쳐몰 재고. 상품마다 [실물] 일괄 업데이트 화면을 상품번호로 검색해 폼 값을 모으고, [업데이트하기]와 같은 요청으로
     * 재고만 바꿔 보낸 뒤 재고와 상품목록 상태(승인 품절 · 승인 정상)를 다시 읽어 확인한다.
     */
    async function sendByTeacherBatchStock(spec, codes, resume) {
      const api = spec.batchStock;
      const wanted = resume ? String(api.resumeStock) : "0";
      const expectedState = resume ? "정상" : "품절";
      const warnings = [];
      let sent = 0;
      let failed = 0;
      let confirmed = 0;
      let already = 0;
      let missing = 0;
      let withOptions = 0;
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        for (let index = 0; index < codes.length; index += 1) {
          const code = codes[index];
          if (index > 0) await sleep(PACE_MS);
          const form = await run(teacherBatchFormOnPage, [api.batchPath, code]);
          if (form?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = codes.length - index;
            return null;
          }
          if (!form?.found) {
            if (form?.error) {
              failed += 1;
              warnings.push(`${code}: ${spec.label} 일괄 업데이트 화면을 읽지 못했습니다(${form.error}).`);
            } else {
              missing += 1;
            }
            continue;
          }
          if (form.stocks.length !== 1) {
            withOptions += 1;
            failed += 1;
            continue;
          }
          const [[option, stock]] = form.stocks;
          const soldOut = String(stock).trim() !== "" && Number(stock) === 0;
          if (resume ? !soldOut : soldOut) {
            already += 1;
            continue;
          }
          // [업데이트하기]가 보내는 모양 그대로 — 폼 값에서 이 상품의 재고만 바꾸고 검색 조건을 덧붙인다.
          const pairs = form.pairs.map(([name, value]) => [name, name === `stock[${option}]` ? wanted : value]);
          for (const pair of form.search) pairs.push(pair);
          const answer = await run(requestOnPage, [
            api.savePath, "POST", "application/x-www-form-urlencoded; charset=UTF-8", new URLSearchParams(pairs).toString(),
          ]);
          if (answer.status < 200 || answer.status >= 400 || /login|로그인/i.test(`${answer.url || ""}`)) {
            failed += 1;
            warnings.push(`${code}: ${spec.label}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
            continue;
          }
          sent += 1;
          const after = await run(teacherBatchFormOnPage, [api.batchPath, code]);
          const status = await run(teacherCatalogStatusOnPage, [api.catalogPath, code]);
          const stockChanged = after?.found && after.stocks.length === 1 && String(Number(after.stocks[0][1])) === wanted;
          if (status?.approval === "미승인") {
            warnings.push(`${code}: ${spec.label} 승인이 풀렸습니다(미승인) — 티쳐몰에서 확인하세요.`);
          } else if (stockChanged) {
            confirmed += 1;
            if (status?.found && status.state && status.state !== expectedState) {
              warnings.push(`${code}: 재고는 바뀌었는데 ${spec.label} 상품목록 상태가 아직 '${status.approval || ""}${status.state}'입니다.`);
            }
          }
        }
        return null;
      });
      if (halted) return halted;
      if (missing > 0) {
        failed += missing;
        warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다.`);
      }
      if (withOptions > 0) {
        warnings.push(`옵션이 여럿인 상품 ${withOptions}개는 옵션마다 재고라 보내지 않았습니다 — ${spec.label}에서 옵션 재고를 고쳐 주세요.`);
      }
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 티쳐몰 지금 재고. 상품마다 일괄 업데이트 화면 검색 한 번. 재고 0 이면 품절(0), 아니면 판매 가능(모름). 읽기만 한다. */
    async function readByTeacherBatchStock(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,12}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withSellerPage(spec, spec.batchStock.pageUrl, async (run) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const form = await run(teacherBatchFormOnPage, [spec.batchStock.batchPath, products[index]]);
          if (form?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          // 화면을 못 읽은 것(HTTP 오류)은 "없음"이 아니다 — 칸이 "찾지 못했습니다"로 거짓말하지 않게 실패로 돌려준다.
          if (form?.error) return { success: false, error: `${spec.label} 화면을 읽지 못했습니다(${form.error}).` };
          if (!form?.found || form.stocks.length === 0) {
            missing.push(products[index]);
            continue;
          }
          found.push({
            code: products[index],
            options: form.stocks.map(([option, stock]) => ({
              optionCode: option,
              stock: String(stock).trim() !== "" && Number(stock) === 0 ? 0 : null,
              rocket: false,
            })),
          });
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 꼬망세 지금 재고. 상품마다 설정 화면 검색 한 번. 재고 0 이면 품절(0), 아니면 판매 가능(모름). 읽기만 한다. */
    async function readByKkomangseDirect(spec, codes) {
      const products = [...new Set(codes)].slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품코드가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withSellerPage(spec, spec.directChange.pageUrl, async (run) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const row = await run(kkomangseRowOnPage, [spec.directChange.viewPath, products[index]]);
          if (row?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (row?.error) return { success: false, error: `${spec.label} 설정 화면을 읽지 못했습니다(${row.error}).` };
          if (!row?.found) {
            missing.push(products[index]);
            continue;
          }
          found.push({
            code: products[index],
            options: [{
              optionCode: products[index],
              stock: String(row.stock).trim() !== "" && Number(row.stock) === 0 ? 0 : null,
              rocket: false,
            }],
          });
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 롯데ON 상품 조회. 판매자상품번호로 묶음마다 한 번. 로그인이 풀렸으면 { loggedOut }, 못 읽었으면 { error }. */
    async function readLotteonRows(spec, run, codes) {
      const api = spec.saleStatus;
      const rows = new Map();
      for (let start = 0; start < codes.length; start += api.batchSize) {
        if (start > 0) await sleep(PACE_MS);
        const group = codes.slice(start, start + api.batchSize);
        const answer = await run(lotteonPostOnPage, [
          `${api.api}${api.listPath}`,
          { spdNo: group.join("\n"), pageNo: 1, rowsPerPage: api.batchSize },
          true,
        ], "MAIN");
        if (answer?.loggedOut) return { loggedOut: true };
        if (answer?.status !== 200 || answer.returnCode !== "SUCCESS" || !Array.isArray(answer.rows)) {
          return { error: `HTTP ${answer?.status ?? 0}${answer?.returnCode ? ` ${answer.returnCode}` : ""}` };
        }
        for (const row of answer.rows) if (row?.spdNo) rows.set(String(row.spdNo), row);
      }
      return { rows };
    }

    /**
     * 롯데ON 저장 답 — `data` 는 JSON 글자들의 배열이고 마지막 것이 {successCnt, failCnt} 다(팝업이 그렇게 읽는다).
     * 못 읽으면 null.
     */
    function lotteonBatchCounts(json) {
      const data = Array.isArray(json?.data) ? json.data : null;
      if (!data || data.length === 0) return null;
      try {
        const last = typeof data[data.length - 1] === "string" ? JSON.parse(data[data.length - 1]) : data[data.length - 1];
        const successCnt = Number(last?.successCnt);
        const failCnt = Number(last?.failCnt);
        return Number.isFinite(successCnt) || Number.isFinite(failCnt)
          ? { successCnt: Number.isFinite(successCnt) ? successCnt : null, failCnt: Number.isFinite(failCnt) ? failCnt : 0 }
          : null;
      } catch {
        return null;
      }
    }

    /**
     * 롯데ON 상품 판매상태. 상품 조회로 지금 상태와 거래처 칸을 읽고, 일괄수정항목 팝업의 [저장]과 같은 요청을 묶음마다
     * 보낸 뒤 다시 읽어 확인한다.
     */
    async function sendByLotteonStatus(spec, codes, resume) {
      const api = spec.saleStatus;
      const wanted = resume ? "SALE" : "SOUT";
      const from = resume ? "SOUT" : "SALE";
      const warnings = [];
      const products = codes.filter((code) => /^LO\d{4,20}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 판매자상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readLotteonRows(spec, run, products);
        if (before.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${before.error}).` };
        const found = products.filter((no) => before.rows.has(no));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다.`);
        }
        // 판매중지(STP) · 판매종료(END)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 풀지 않는다.
        const locked = found.filter((no) => !["SALE", "SOUT"].includes(before.rows.get(no).slStatCd));
        if (resume && locked.length > 0) {
          failed += locked.length;
          warnings.push(`${locked.length}건은 ${spec.label}이 판매중지 · 판매종료한 상품이라 풀지 않았습니다.`);
        }
        if (!resume) already += locked.length;
        let targets = found.filter((no) => before.rows.get(no).slStatCd === from);
        // 상품 조회는 바꾼 직후 옛 판매상태를 섞어 준다 — "이미 원하는 상태"로 보인 것은 잠시 뒤 다시 읽어, 사실은 아직
        // 옛 상태면 보낼 대상에 넣는다(방금 품절한 상품을 바로 재개할 때 옛 SALE 을 보고 건너뛰지 않게).
        let settled = found.filter((no) => before.rows.get(no).slStatCd === wanted);
        for (let attempt = 0; attempt < LOTTEON_SETTLE_TIMES && settled.length > 0; attempt += 1) {
          await sleep(LOTTEON_RECHECK_MS);
          const again = await readLotteonRows(spec, run, settled);
          if (!again.rows) break;
          const flipped = settled.filter((no) => again.rows.get(no)?.slStatCd === from);
          targets = [...targets, ...flipped];
          settled = settled.filter((no) => !flipped.includes(no));
        }
        already += settled.length;
        for (let start = 0; start < targets.length; start += api.batchSize) {
          const group = targets.slice(start, start + api.batchSize);
          // 팝업이 만드는 모양 그대로 — 상품정보일괄수정이 넘긴 줄 값에 팝업이 고른 판매상태를 얹는다.
          const params = group.map((no) => {
            const row = before.rows.get(no);
            return {
              spdNo: no,
              trNo: row.trNo,
              lrtrNo: row.lrtrNo,
              trGrpCd: row.trGrpCd,
              dvPdTypCd: row.dvPdTypCd,
              code: "07",
              ctrtTypCd: "all",
              dvProcTypCd: "all",
              dmstOvsDvDvsCd: "all",
              reqTxt: "spdSlStatCd",
              spdSlStatCd: wanted,
            };
          });
          const answer = await run(lotteonPostOnPage, [`${api.api}${api.updatePath}`, params, false], "MAIN");
          if (answer?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = targets.length - start;
            return null;
          }
          if (answer?.status !== 200 || (answer.json?.returnCode && answer.json.returnCode !== "SUCCESS")) {
            failed += group.length;
            const reason = answer?.json?.message ? `: ${String(answer.json.message).slice(0, 120)}` : "";
            warnings.push(`${spec.label}이 판매상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0})${reason}.`);
            continue;
          }
          // 받은 수는 몰이 말한 성공 수, 나머지는 전부 실패다 — 성공 · 실패 수의 합이 묶음과 달라도 빠지는 상품이 없다.
          const counts = lotteonBatchCounts(answer.json);
          const ok = Math.max(0, Math.min(counts?.successCnt ?? group.length - (counts?.failCnt ?? 0), group.length));
          sent += ok;
          if (ok < group.length) {
            failed += group.length - ok;
            warnings.push(`${spec.label}이 ${group.length}건 중 ${group.length - ok}건을 바꾸지 않았다고 답했습니다.`);
          }
          await sleep(PACE_MS);
        }
        if (sent === 0) return null;
        // 상품 조회가 늦게 따라온다 — 바뀐 상태가 보일 때까지 몇 번 더 읽는다.
        let seen = null;
        for (let attempt = 0; attempt <= LOTTEON_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(LOTTEON_RECHECK_MS);
          const after = await readLotteonRows(spec, run, targets);
          if (!after.rows) continue;
          seen = targets.filter((no) => after.rows.get(no)?.slStatCd === wanted).length;
          if (seen >= sent) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 조회/수정에서 확인하세요.`);
        } else {
          // 몰이 받았다고 한 수를 넘겨 확인으로 세지 않는다.
          confirmed += Math.min(seen, sent);
          if (seen < sent) warnings.push(`${spec.label} 상품 조회가 아직 옛 상태를 보여 줍니다 — 잠시 뒤 다시 확인하세요.`);
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 아이스크림몰 상품 정보 관리 목록을 상품번호 여럿으로 읽는다(묶음마다 한 번). 로그인이 풀렸으면 { loggedOut }. */
    async function readIcecreamRows(spec, run, codes) {
      const api = spec.goodsSaleState;
      const rows = new Map();
      for (let start = 0; start < codes.length; start += api.batchSize) {
        if (start > 0) await sleep(PACE_MS);
        const answer = await run(icecreamRowsOnPage, [api.viewPath, api.listPath, codes.slice(start, start + api.batchSize)]);
        if (answer?.loggedOut) return { loggedOut: true };
        if (!Array.isArray(answer?.rows)) return { error: answer?.error || "목록 조회 실패" };
        for (const row of answer.rows) if (row?.goodsNo) rows.set(row.goodsNo, row);
      }
      return { rows };
    }

    /**
     * 아이스크림몰 판매상태. 목록 조회로 지금 상태와 판매방식을 읽고, "단품 판매상태 일괄 변경" 창의 [적용]과 같은 요청을
     * 판매방식마다 보낸 뒤 다시 읽어 확인한다.
     */
    async function sendByIcecreamSaleState(spec, codes, resume) {
      const api = spec.goodsSaleState;
      const wanted = resume ? "10" : "20";
      const from = resume ? "20" : "10";
      const warnings = [];
      const products = codes.filter((code) => /^\d{5,15}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readIcecreamRows(spec, run, products);
        if (before.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${before.error}).` };
        const found = products.filter((no) => before.rows.has(no));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다.`);
        }
        // 판매종료(40)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 되살리지 않는다.
        const ended = found.filter((no) => !["10", "20"].includes(before.rows.get(no).saleStatCd)).length;
        if (resume && ended > 0) {
          failed += ended;
          warnings.push(`${ended}건은 ${spec.label}에서 판매종료된 상품이라 되살리지 않았습니다.`);
        }
        if (!resume) already += ended;
        const movable = found.filter((no) => before.rows.get(no).saleStatCd === from);
        already += found.filter((no) => before.rows.get(no).saleStatCd === wanted).length;
        // 예약상품이 품절이면 창이 판매중을 고르지 못하게 숨긴다 — 화면이 못 하는 것은 하지 않는다.
        const reserved = resume ? movable.filter((no) => before.rows.get(no).saleMethCd === "20") : [];
        if (reserved.length > 0) {
          failed += reserved.length;
          warnings.push(`${reserved.length}건은 예약상품이라 ${spec.label} 화면도 판매중으로 되돌리지 못합니다.`);
        }
        const targets = movable.filter((no) => !reserved.includes(no));
        // 목록은 판매방식이 다른 상품을 한 번에 넘기지 못한다 — 판매방식마다 나눠 보낸다.
        const groups = new Map();
        for (const no of targets) {
          const method = String(before.rows.get(no).saleMethCd ?? "");
          if (!groups.has(method)) groups.set(method, []);
          groups.get(method).push(no);
        }
        const accepted = [];
        let processed = 0;
        for (const group of groups.values()) {
          for (let start = 0; start < group.length; start += api.batchSize) {
            const slice = group.slice(start, start + api.batchSize);
            // 창이 만드는 모양 그대로 — 목록 줄의 상품번호 · 지금 상태에 창이 고른 상태와 사유 칸을 얹는다.
            const list = slice.map((no) => ({
              goodsNo: no,
              saleStatCd: before.rows.get(no).saleStatCd,
              itmSaleStatCd: wanted,
              soutCausCd: "12",
              saleStatChgCausCd: null,
            }));
            const answer = await run(icecreamSaveOnPage, [api.savePath, list]);
            if (answer?.loggedOut) {
              halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
              left = targets.length - processed;
              return null;
            }
            processed += slice.length;
            if (answer?.status !== 200 || answer.succeeded !== true) {
              failed += slice.length;
              const reason = answer?.message ? `: ${answer.message}` : "";
              warnings.push(`${spec.label}이 판매상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0})${reason}.`);
            } else {
              sent += slice.length;
              accepted.push(...slice);
            }
            await sleep(PACE_MS);
          }
        }
        if (accepted.length === 0) return null;
        let seen = null;
        for (let attempt = 0; attempt <= ICECREAM_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(ICECREAM_RECHECK_MS);
          const after = await readIcecreamRows(spec, run, accepted);
          if (!after.rows) continue;
          seen = accepted.filter((no) => after.rows.get(no)?.saleStatCd === wanted).length;
          if (seen >= accepted.length) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 정보 관리에서 확인하세요.`);
        } else {
          confirmed += seen;
          if (seen < accepted.length) {
            warnings.push(`${spec.label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품 정보 관리에서 확인하세요.`);
          }
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /**
     * 키즈노트 판매 상품 내역을 100개씩 넘기며 찾는 상품의 상태를 모은다. 다 찾았거나 마지막 쪽이면 멈춘다.
     * `withForm` 이면 첫 쪽에서 [상태/노출일괄수정] 폼 값도 받아 온다.
     */
    async function readKidsnoteRows(spec, run, codes, withForm) {
      const api = spec.stateBatch;
      const wanted = new Set(codes);
      const rows = new Map();
      let form = null;
      for (let page = 1; page <= api.maxPages; page += 1) {
        if (page > 1) await sleep(KIDSNOTE_PAGE_PACE_MS);
        const answer = await run(kidsnoteListOnPage, [api.listPath, page, api.pageSize, Boolean(withForm && page === 1)]);
        if (answer?.loggedOut) return { loggedOut: true };
        if (!Array.isArray(answer?.rows)) return { error: answer?.error || "목록 조회 실패" };
        if (withForm && page === 1) form = answer.form;
        for (const row of answer.rows) if (wanted.has(row.pno)) rows.set(row.pno, row);
        if (answer.rows.length < api.pageSize || rows.size >= wanted.size) break;
      }
      return { rows, form };
    }

    /**
     * 키즈노트 상태. 목록을 넘기며 지금 상태를 읽고, [상태/노출일괄수정] 폼을 "선택한 상품의" 로 보낸 것과 같은 요청을
     * 100개씩 보낸 뒤 목록을 다시 읽어 확인한다.
     */
    async function sendByKidsnoteState(spec, codes, resume) {
      const api = spec.stateBatch;
      const wanted = resume ? "정상" : "품절";
      const from = resume ? "품절" : "정상";
      const value = resume ? "2" : "3";
      const warnings = [];
      const products = codes.filter((code) => /^\d{1,10}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readKidsnoteRows(spec, run, products, true);
        if (before.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품목록을 읽지 못했습니다(${before.error}).` };
        const names = new Set((before.form || []).map(([name]) => name));
        if (!["body", "nums", "exec", "where", "change_stat"].every((name) => names.has(name))) {
          return { success: false, error: `${spec.label} 상태/노출일괄수정 화면이 바뀌어 보내지 않았습니다.` };
        }
        const found = products.filter((no) => before.rows.has(no));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label} 상품목록에서 찾지 못했습니다.`);
        }
        // 숨김은 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 풀지 않는다(사장님이 숨긴 상품).
        const hidden = found.filter((no) => ![from, wanted].includes(before.rows.get(no).stat)).length;
        if (resume && hidden > 0) {
          failed += hidden;
          warnings.push(`${hidden}건은 ${spec.label}에서 숨김(또는 다른 상태)이라 풀지 않았습니다.`);
        }
        if (!resume) already += hidden;
        const targets = found.filter((no) => before.rows.get(no).stat === from);
        already += found.filter((no) => before.rows.get(no).stat === wanted).length;
        const accepted = [];
        let answered = null;
        for (let start = 0; start < targets.length; start += api.pageSize) {
          const group = targets.slice(start, start + api.pageSize);
          // 화면 폼 그대로 — 고른 상품(nums), "선택한 상품의"(where=1), 바꿀 상태(change_stat)만 채운다.
          const pairs = before.form.map(([name, current]) => {
            if (name === "nums") return [name, group.map((no) => `@${no}`).join("")];
            if (name === "where") return [name, "1"];
            if (name === "change_stat") return [name, value];
            return [name, current];
          });
          const answer = await run(kidsnoteSaveOnPage, [api.savePath, pairs]);
          if (answer?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = targets.length - start;
            return null;
          }
          if (answer?.alert) answered = answer.alert;
          if (answer?.status !== 200) {
            failed += group.length;
            warnings.push(`${spec.label}이 상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0}).`);
          } else {
            sent += group.length;
            accepted.push(...group);
          }
          await sleep(PACE_MS);
        }
        if (accepted.length === 0) return null;
        let seen = null;
        for (let attempt = 0; attempt <= KIDSNOTE_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(KIDSNOTE_RECHECK_MS);
          const after = await readKidsnoteRows(spec, run, accepted, false);
          if (!after.rows) continue;
          seen = accepted.filter((no) => after.rows.get(no)?.stat === wanted).length;
          if (seen >= accepted.length) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 판매 상품 내역에서 확인하세요.`);
        } else {
          confirmed += seen;
          if (seen < accepted.length) {
            const said = answered ? ` 몰 답: "${answered}"` : "";
            warnings.push(`${spec.label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다.${said}`);
          }
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** ESM 상품코드(사방넷: `{사이트상품번호}_{마스터상품번호}`)에서 사이트상품번호. 모양이 틀리면 null. */
    function esmSiteNo(spec, code) {
      const siteNo = String(code || "").split("_")[0];
      const pattern = spec.esmSellStatus.site === "gmkt" ? /^\d{6,12}$/ : /^[A-Z]\d{6,12}$/;
      return pattern.test(siteNo) ? siteNo : null;
    }

    /** ESM 목록을 사이트상품번호로 찾는다(묶음마다 한 번). 이 사이트 번호로 모은다. 로그인이 풀렸으면 { loggedOut }. */
    async function readEsmItems(spec, run, siteNos) {
      const api = spec.esmSellStatus;
      const items = new Map();
      for (let start = 0; start < siteNos.length; start += api.batchSize) {
        if (start > 0) await sleep(PACE_MS);
        const answer = await run(esmSearchOnPage, [api.searchPath, siteNos.slice(start, start + api.batchSize)]);
        if (answer?.loggedOut) return { loggedOut: true };
        if (!Array.isArray(answer?.items)) return { error: answer?.error || "목록 검색 실패" };
        for (const item of answer.items) {
          const siteNo = item?.siteGoodsNo?.[api.site];
          if (siteNo) items.set(String(siteNo), item);
        }
      }
      return { items };
    }

    /**
     * 지마켓 · 옥션 판매상태. 목록 검색으로 지금 상태를 읽고, [판매 상태 변경] 창과 같은 요청을 상품마다 보낸 뒤 다시 읽어
     * 확인한다.
     */
    async function sendByEsmSellStatus(spec, codes, resume) {
      const api = spec.esmSellStatus;
      const site = api.site;
      const wanted = resume ? "11" : "21";
      const from = resume ? "21" : "11";
      const warnings = [];
      const bySite = new Map();
      for (const code of codes) {
        const siteNo = esmSiteNo(spec, code);
        if (siteNo) bySite.set(siteNo, code);
      }
      let failed = codes.length - bySite.size;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        const siteNos = [...bySite.keys()];
        if (siteNos.length === 0) return null;
        const before = await readEsmItems(spec, run, siteNos);
        if (before.loggedOut) return { success: false, error: `${spec.label}(ESM) 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.items) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${before.error}).` };
        const found = siteNos.filter((no) => before.items.has(no));
        const missing = siteNos.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label}(ESM)에서 찾지 못했습니다.`);
        }
        const combined = found.filter((no) => before.items.get(no).siteGoodsNo.gmkt && before.items.get(no).siteGoodsNo.iac);
        if (combined.length > 0) {
          failed += combined.length;
          warnings.push(`${combined.length}건은 지마켓 · 옥션 통합상품이라 보내지 않았습니다 — ESM 에서 사이트를 골라 바꾸세요.`);
        }
        const single = found.filter((no) => !combined.includes(no));
        // 판매불가(22) · SKU품절(31) · 등록대기(01)는 이미 못 산다 — 품절로는 이미 된 것이고, 판매 재개로는 화면도 못 바꾼다.
        const locked = single.filter((no) => ![from, wanted].includes(before.items.get(no).sellStatus[site])).length;
        if (resume && locked > 0) {
          failed += locked;
          warnings.push(`${locked}건은 판매불가 · SKU품절 · 등록대기라 ${spec.label} 화면도 판매가능으로 못 바꿉니다.`);
        }
        if (!resume) already += locked;
        const targets = single.filter((no) => before.items.get(no).sellStatus[site] === from);
        already += single.filter((no) => before.items.get(no).sellStatus[site] === wanted).length;
        const accepted = [];
        for (let index = 0; index < targets.length; index += 1) {
          const no = targets[index];
          const item = before.items.get(no);
          // 창이 만드는 모양 그대로 — 그 사이트 판매 여부 하나, 머리에는 사이트별 판매자 아이디(없으면 빈 값).
          const answer = await run(esmSellStatusOnPage, [
            api.goodsPath,
            item.goodsNo,
            { isSell: { [site]: resume } },
            { gmkt: encodeURIComponent(item.siteSellerId.gmkt ?? ""), iac: encodeURIComponent(item.siteSellerId.iac ?? "") },
          ]);
          if (answer?.loggedOut) {
            halt = `${spec.label}(ESM) 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = targets.length - index;
            return null;
          }
          // 화면(createResultModel)처럼 사이트 결과 0 · 5300 이 성공이고, 최상위 5300(노출 제한 안내)도 성공이다.
          const siteResult = answer?.[site];
          const ok = answer?.status === 200
            && (answer.resultCode === 5300 || siteResult?.resultCode === 0 || siteResult?.resultCode === 5300);
          if (ok) {
            sent += 1;
            accepted.push(no);
          } else {
            failed += 1;
            const said = siteResult?.message || answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}`;
            warnings.push(`${spec.label}이 ${no} 판매상태 변경을 받지 않았습니다: ${said}`);
          }
          await sleep(ESM_PACE_MS);
        }
        if (accepted.length === 0) return null;
        let seen = null;
        for (let attempt = 0; attempt <= MARKET_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(MARKET_RECHECK_MS);
          const after = await readEsmItems(spec, run, accepted);
          if (!after.items) continue;
          seen = accepted.filter((no) => after.items.get(no)?.sellStatus?.[site] === wanted).length;
          if (seen >= accepted.length) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. ESM 상품 조회/수정에서 확인하세요.`);
        } else {
          confirmed += seen;
          if (seen < accepted.length) {
            warnings.push(`${spec.label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — ESM 에서 확인하세요.`);
          }
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 11번가 목록을 상품번호로 읽는다(묶음마다 한 번). 로그인이 풀렸으면 { loggedOut }. */
    async function readSt11Rows(spec, run, prdNos) {
      const api = spec.st11SellStatus;
      const rows = new Map();
      for (let start = 0; start < prdNos.length; start += api.batchSize) {
        if (start > 0) await sleep(PACE_MS);
        const answer = await run(st11ListOnPage, [api.listPath, prdNos.slice(start, start + api.batchSize)]);
        if (answer?.loggedOut) return { loggedOut: true };
        if (!Array.isArray(answer?.rows)) return { error: answer?.error || "목록 조회 실패" };
        for (const row of answer.rows) if (row?.prdNo) rows.set(row.prdNo, row);
      }
      return { rows };
    }

    /**
     * 11번가 판매중지 / 해제. 목록으로 지금 상태 · 재고를 읽고, 확인 창의 [적용]과 같은 요청을 묶음마다 보낸 뒤 다시 읽어
     * 확인한다.
     */
    async function sendBySt11SellStatus(spec, codes, resume) {
      const api = spec.st11SellStatus;
      const mode = resume ? "SELL_RELEASE" : "SELL_STOP";
      const wanted = resume ? "103" : "105";
      const warnings = [];
      const products = codes.filter((code) => /^\d{6,12}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readSt11Rows(spec, run, products);
        if (before.loggedOut) return { success: false, error: `${spec.label} 셀러오피스 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${before.error}).` };
        const found = products.filter((no) => before.rows.has(no));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다(지운 상품일 수 있습니다).`);
        }
        const stat = (no) => before.rows.get(no).selStatCd;
        let targets;
        if (resume) {
          // 해제는 판매중지이면서 재고가 있는 상품만 — 화면도 재고 0 이면 "재고수량 등록 후" 라며 막는다.
          const stopped = found.filter((no) => stat(no) === "105");
          const empty = stopped.filter((no) => !(before.rows.get(no).stckQty > 0) && before.rows.get(no).setTypCd !== "02");
          if (empty.length > 0) {
            failed += empty.length;
            warnings.push(`${empty.length}건은 ${spec.label} 재고가 0 이라 판매중지를 풀지 못합니다 — 재고를 넣은 뒤 다시 보내세요.`);
          }
          targets = stopped.filter((no) => !empty.includes(no));
          already += found.filter((no) => stat(no) === "103").length;
          const other = found.filter((no) => !["103", "105"].includes(stat(no))).length;
          if (other > 0) {
            failed += other;
            warnings.push(`${other}건은 ${spec.label}에서 판매중지가 아니라(품절 · 전시전 등) 풀 것이 없습니다.`);
          }
        } else {
          // 판매중(103)만 멈춘다. 품절(104, 재고 0) · 판매중지(105) · 전시전(102) · 승인대기(101)는 이미 못 산다.
          targets = found.filter((no) => stat(no) === "103");
          already += found.length - targets.length;
        }
        const accepted = [];
        for (let start = 0; start < targets.length; start += api.batchSize) {
          const group = targets.slice(start, start + api.batchSize);
          const answer = await run(st11SaveOnPage, [api.savePath, mode, group]);
          if (answer?.loggedOut) {
            halt = `${spec.label} 셀러오피스 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = targets.length - start;
            return null;
          }
          if (answer?.status !== 200 || answer.msg !== "SAVE_OK") {
            failed += group.length;
            const said = answer?.alert || answer?.msg || answer?.error || `HTTP ${answer?.status ?? 0}`;
            warnings.push(`${spec.label}이 ${resume ? "판매중지 해제" : "판매중지"}를 받지 않았습니다: ${said}`);
          } else {
            sent += group.length;
            accepted.push(...group);
            if (answer.total !== null && answer.done !== null && answer.done < answer.total) {
              warnings.push(`${spec.label}이 ${answer.total}건 중 ${answer.done}건만 처리했다고 답했습니다.`);
            }
          }
          await sleep(PACE_MS);
        }
        if (accepted.length === 0) return null;
        let seen = null;
        for (let attempt = 0; attempt <= MARKET_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(MARKET_RECHECK_MS);
          const after = await readSt11Rows(spec, run, accepted);
          if (!after.rows) continue;
          seen = accepted.filter((no) => after.rows.get(no)?.selStatCd === wanted).length;
          if (seen >= accepted.length) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 상품조회/수정에서 확인하세요.`);
        } else {
          confirmed += seen;
          if (seen < accepted.length) {
            warnings.push(`${spec.label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품조회/수정에서 확인하세요.`);
          }
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /**
     * 스마트스토어 목록을 상품번호로 찾는다 — 채널상품번호로 먼저, 못 찾은 것은 원상품번호로. 우리 코드마다 그 원상품 줄을
     * 모은다. 로그인이 풀렸으면 { loggedOut }.
     */
    async function readSmartstoreRows(spec, run, codes) {
      const api = spec.naverStatus;
      const rows = new Map();
      for (const keywordType of ["CHANNEL_PRODUCT_NO", "PRODUCT_NO"]) {
        const left = codes.filter((code) => !rows.has(code));
        for (let start = 0; start < left.length; start += api.batchSize) {
          const group = left.slice(start, start + api.batchSize);
          const answer = await run(smartstoreApiOnPage, ["search", api.searchPath, {
            searchKeywordType: keywordType,
            searchKeyword: group.join(","),
            searchOrderType: "REG_DATE",
            page: 0,
            size: Math.max(20, group.length),
          }], "MAIN");
          if (answer?.loggedOut) return { loggedOut: true };
          if (!Array.isArray(answer?.rows)) return { error: answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}` };
          for (const row of answer.rows) {
            for (const code of group) {
              if (row.id === code || row.channelProductNos.includes(code)) rows.set(code, row);
            }
          }
          await sleep(PACE_MS);
        }
      }
      return { rows };
    }

    /**
     * 스마트스토어 판매중지 / 판매중. 목록으로 지금 상태를 읽고, 판매상태 변경과 같은 요청을 묶음마다 보내 비동기 결과를
     * 기다린 뒤 다시 읽어 확인한다.
     */
    async function sendBySmartstoreStatus(spec, codes, resume) {
      const api = spec.naverStatus;
      const wanted = resume ? "SALE" : "SUSPENSION";
      const warnings = [];
      const products = [...new Set(codes)].filter((code) => /^\d{6,15}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품번호 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      // 보내는 도중 로그인이 풀리면 멈춘 까닭과 못 보낸 건수(이미 보낸 것은 버리지 않는다).
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        if (products.length === 0) return null;
        const before = await readSmartstoreRows(spec, run, products);
        if (before.loggedOut) return { success: false, error: `${spec.label}센터 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!before.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${before.error}).` };
        const found = products.filter((code) => before.rows.has(code));
        const missing = products.length - found.length;
        if (missing > 0) {
          failed += missing;
          warnings.push(`${missing}건은 ${spec.label}에서 찾지 못했습니다.`);
        }
        const stat = (code) => before.rows.get(code).productStatusType;
        let targets;
        if (resume) {
          targets = found.filter((code) => stat(code) === "SUSPENSION");
          already += found.filter((code) => stat(code) === "SALE").length;
          const other = found.filter((code) => !["SALE", "SUSPENSION"].includes(stat(code))).length;
          if (other > 0) {
            failed += other;
            warnings.push(`${other}건은 ${spec.label}에서 판매중지가 아니라(품절 · 판매대기 · 판매종료 등) 풀 것이 없습니다.`);
          }
        } else {
          // 판매중(SALE)만 멈춘다. 품절(재고 0) · 판매중지 · 판매대기 · 판매종료 · 판매금지는 이미 못 산다.
          targets = found.filter((code) => stat(code) === "SALE");
          already += found.length - targets.length;
        }
        // 원상품번호로 보낸다. 같은 원상품을 가리키는 코드가 여럿이면 한 번만.
        const origin = new Map();
        for (const code of targets) origin.set(before.rows.get(code).id, code);
        const originNos = [...origin.keys()];
        const accepted = [];
        for (let start = 0; start < originNos.length; start += api.batchSize) {
          const group = originNos.slice(start, start + api.batchSize);
          // 화면 목록의 번호처럼 숫자로 싣는다(원상품번호는 안전한 정수 범위다).
          const answer = await run(smartstoreApiOnPage, ["status", api.updatePath, {
            productNos: group.map((no) => (/^\d{1,15}$/.test(no) ? Number(no) : no)),
            productStatusType: wanted,
            productBulkUpdateType: wanted,
          }], "MAIN");
          if (answer?.loggedOut) {
            halt = `${spec.label}센터 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = originNos.length - start;
            return null;
          }
          if (answer?.state !== "STARTED") {
            failed += group.length;
            const said = answer?.state === "ALREADY_PROGRESS"
              ? "이미 수정중인 상품이 있습니다. 잠시 후 다시 보내세요."
              : answer?.state === "BUSY"
                ? "스마트스토어에 진행중 작업이 많습니다. 잠시 후 다시 보내세요."
                : answer?.message || answer?.error || `HTTP ${answer?.status ?? 0}`;
            warnings.push(`${spec.label}이 판매상태 변경을 받지 않았습니다: ${said}`);
            continue;
          }
          // 비동기 결과 — 화면처럼 끝날 때까지 묻는다.
          let result = null;
          for (const waitMs of SMARTSTORE_PROGRESS_WAITS_MS) {
            await sleep(waitMs);
            const progress = await run(smartstoreApiOnPage, ["progress", api.progressPath, null], "MAIN");
            if (progress?.loggedOut) {
              // 일괄변경은 이미 시작됐다 — 이 묶음은 보낸 것으로 두고(확인은 못 함) 멈춘다.
              sent += group.length;
              accepted.push(...group.map((no) => origin.get(no)));
              halt = `${spec.label}센터 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
              left = originNos.length - start - group.length;
              return null;
            }
            if (progress?.completed === true) {
              result = progress;
              break;
            }
            if (progress?.completed === null || progress?.state === "ALREADY_PROGRESS") break;
          }
          if (!result) {
            warnings.push(`${spec.label} 일괄변경 결과를 끝까지 받지 못했습니다 — 목록을 다시 읽어 확인합니다.`);
            accepted.push(...group.map((no) => origin.get(no)));
            sent += group.length;
            continue;
          }
          if (result.errorMessage) {
            failed += group.length;
            warnings.push(`${spec.label}: ${result.errorMessage}`);
            continue;
          }
          // 결과에는 작업 번호가 없다 — 우리 묶음 번호가 하나도 없으면 다른 작업의 결과로 보고 목록으로 확인한다.
          const successIds = Array.isArray(result.successIds) ? result.successIds.map(String) : null;
          if (successIds && !group.some((no) => successIds.includes(String(no)))) {
            warnings.push(`${spec.label} 일괄변경 결과가 이 묶음과 맞지 않아 목록을 다시 읽어 확인합니다.`);
            accepted.push(...group.map((no) => origin.get(no)));
            sent += group.length;
            continue;
          }
          const ok = successIds ? group.filter((no) => successIds.includes(String(no))) : group;
          sent += ok.length;
          accepted.push(...ok.map((no) => origin.get(no)));
          if (ok.length < group.length) {
            failed += group.length - ok.length;
            const said = result.failures?.length ? ` — ${result.failures.join(" / ")}` : "";
            warnings.push(`${spec.label}이 ${group.length}건 중 ${group.length - ok.length}건을 바꾸지 않았습니다${said}.`);
          }
        }
        if (accepted.length === 0) return null;
        let seen = null;
        for (let attempt = 0; attempt <= MARKET_RECHECK_TIMES; attempt += 1) {
          if (attempt > 0) await sleep(MARKET_RECHECK_MS);
          const after = await readSmartstoreRows(spec, run, accepted);
          if (!after.rows) continue;
          seen = accepted.filter((code) => after.rows.get(code)?.productStatusType === wanted).length;
          if (resume) {
            const outOfStock = accepted.filter((code) => after.rows.get(code)?.productStatusType === "OUTOFSTOCK").length;
            if (outOfStock > 0 && attempt === MARKET_RECHECK_TIMES) {
              warnings.push(`${outOfStock}건은 재고가 없어 ${spec.label}이 판매중 대신 품절로 두었습니다.`);
            }
          }
          if (seen >= accepted.length) break;
        }
        if (seen === null) {
          warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 상품 조회/수정에서 확인하세요.`);
        } else {
          confirmed += seen;
          if (seen < accepted.length) {
            warnings.push(`${spec.label} 목록이 ${accepted.length - seen}건을 아직 옛 상태로 보여 줍니다 — 상품 조회/수정에서 확인하세요.`);
          }
        }
        return null;
      });
      if (halted) return halted;
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 키드키즈 한 줄을 상품코드 검색으로 읽는다. 로그인이 풀렸으면 { loggedOut }. */
    async function readKidkidsRow(spec, run, code) {
      return run(kidkidsRowOnPage, [spec.useFlag.listPath, code]);
    }

    /**
     * 키드키즈 일시품절 / 품절해제. 상품마다 코드로 검색해 그 줄의 "품절상품" 칸을 읽고, [일시품절] · [품절해제]처럼 목록 폼을
     * 보낸 뒤 같은 검색으로 다시 읽어 확인한다.
     */
    async function sendByKidkidsUseFlag(spec, codes, resume) {
      const api = spec.useFlag;
      const wanted = resume ? "판매" : "품절";
      const from = resume ? "품절" : "판매";
      const warnings = [];
      const products = [...new Set(codes)].filter((code) => /^\d{3,10}$/.test(code));
      let failed = codes.length - products.length;
      if (failed > 0) warnings.push(`${failed}건은 ${spec.label} 상품코드 모양이 아니라 보내지 않았습니다.`);
      let sent = 0;
      let confirmed = 0;
      let already = 0;
      const notFound = [];
      const other = [];
      const noTax = [];
      const accepted = [];
      let halt = null;
      let left = 0;
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        for (let index = 0; index < products.length; index += 1) {
          const code = products[index];
          if (index > 0) await sleep(PACE_MS);
          const row = await readKidkidsRow(spec, run, code);
          if (row?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = products.length - index;
            return null;
          }
          if (row?.error) {
            failed += 1;
            warnings.push(`${code}: ${spec.label} 목록을 읽지 못했습니다(${row.error}).`);
            continue;
          }
          if (!row?.found) {
            failed += 1;
            notFound.push(code);
            continue;
          }
          // 판매 재개는 품절 → 판매, 품절은 판매 → 품절. 품절이면 이미 못 사고, 그 밖의 글자는 건드리지 않는다.
          if (row.word === wanted) {
            already += 1;
            continue;
          }
          if (row.word !== from) {
            failed += 1;
            other.push(`${code}(${row.word || "?"})`);
            continue;
          }
          if (!row.taxType) {
            // 화면도 막는다(chkTaxFlag: "세금 구분이 미 등록된 상품이 있습니다").
            failed += 1;
            noTax.push(code);
            continue;
          }
          const pairs = row.pairs.map(([name, value]) => {
            if (name === "commitType") return [name, "change_use_flag"];
            if (name === "use_flag") return [name, resume ? "Y" : "N"];
            return [name, value];
          });
          const answer = await run(kidkidsSaveOnPage, [api.savePath, pairs]);
          if (answer?.loggedOut) {
            halt = `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.`;
            left = products.length - index;
            return null;
          }
          if (answer?.status !== 200) {
            failed += 1;
            warnings.push(`${code}: ${spec.label}이 받지 않았습니다(${answer?.error || `HTTP ${answer?.status ?? 0}`}).`);
            continue;
          }
          sent += 1;
          accepted.push(code);
          if (answer.alert && /실패|오류|권한|불가|없습니다/.test(answer.alert)) warnings.push(`${code}: ${spec.label} 답 "${answer.alert}"`);
        }
        // 다시 검색해 확인한다(같은 탭에서).
        let pending = [...accepted];
        for (let attempt = 0; attempt <= MARKET_RECHECK_TIMES && pending.length > 0; attempt += 1) {
          if (attempt > 0) await sleep(MARKET_RECHECK_MS);
          const still = [];
          for (const code of pending) {
            const row = await readKidkidsRow(spec, run, code);
            if (row?.found && row.word === wanted) confirmed += 1;
            else still.push(code);
          }
          pending = still;
        }
        if (pending.length > 0) {
          warnings.push(`${spec.label} 목록이 ${pending.length}건을 아직 옛 상태로 보여 줍니다 — 상품관리에서 확인하세요.`);
        }
        return null;
      });
      if (halted) return halted;
      if (notFound.length > 0) warnings.push(`${notFound.length}건은 ${spec.label}에서 찾지 못했습니다.`);
      if (other.length > 0) warnings.push(`${other.length}건은 ${spec.label}에서 ${from}이 아니라 바꾸지 않았습니다: ${other.slice(0, 5).join(", ")}`);
      if (noTax.length > 0) warnings.push(`${noTax.length}건은 ${spec.label} 세금 구분이 미등록이라 화면도 바꾸지 못합니다: ${noTax.slice(0, 5).join(", ")}`);
      if (halt) return stoppedMidway(halt, { sent, failed, confirmed, already, warnings, left });
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
    }

    /** 키드키즈 지금 상태 — 상품마다 코드 검색. 품절이면 0, 판매면 모름(null). 읽기만 한다. */
    async function readByKidkidsUseFlag(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{3,10}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품코드가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withSellerPage(spec, spec.useFlag.pageUrl, async (run) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(KIDSNOTE_PAGE_PACE_MS);
          const code = products[index];
          const row = await readKidkidsRow(spec, run, code);
          if (row?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (row?.error) return { success: false, error: `${spec.label} 목록을 읽지 못했습니다(${row.error}).` };
          if (!row?.found) {
            missing.push(code);
            continue;
          }
          const selling = row.word === "판매";
          found.push({ code, options: [{ optionCode: code, stock: selling ? null : 0, rocket: false, ...(selling ? {} : { state: row.word || "품절" }) }] });
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 한 몰에 품절(또는 해제)을 보낸다.
     *
     * 돌려주는 것은 개수와 상품코드뿐이다. 사람 이름도 주문번호도 담지 않는다.
     */
    async function send(msg) {
      const mallKey = String(msg?.mallKey || "");
      if (PENDING[mallKey]) return { success: false, error: PENDING[mallKey] };
      const spec = SPECS[mallKey];
      if (!spec) return { success: false, error: `품절 경로를 아는 몰이 아닙니다: ${mallKey || "(없음)"}` };

      const codes = [...new Set((Array.isArray(msg?.codes) ? msg.codes : [])
        .map((code) => String(code || "").trim()).filter(Boolean))];
      if (codes.length === 0) return { success: false, error: "품절로 보낼 상품코드가 없습니다." };
      const resume = msg?.resume === true;

      // 쿠팡 윙은 윙 화면 하나를 열어 옵션 재고를 바꾼다(옵션 단위).
      if (spec.optionStock) {
        try {
          const options = msg?.options && typeof msg.options === "object" ? msg.options : null;
          return await sendByOptionStock(spec, codes, options, resume, msg?.show === true);
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }

      // 카카오 톡스토어는 [선택 수정]의 재고 칸, 올웨이즈는 [품절] · [판매재개] 버튼, 아트공구는 상품목록의
      // [판매안함] · [판매함] 버튼, 롯데ON 은 상품정보일괄수정 팝업의 [저장], 꼬망세는 줄마다 있는 [개별수정],
      // 티쳐몰은 [실물] 일괄 업데이트의 [업데이트하기], 아이스크림몰은 단품 판매상태 일괄 변경 창의 [적용], 키즈노트는
      // [상태/노출일괄수정]의 [확인], 지마켓 · 옥션은 ESM [판매 상태 변경], 11번가는 [판매중지] · [판매중지 해제] 확인 창,
      // 스마트스토어는 판매상태 변경과 같은 요청이다.
      if (spec.gridStock || spec.itemApi || spec.sellingState || spec.saleStatus || spec.directChange || spec.batchStock
        || spec.goodsSaleState || spec.stateBatch || spec.esmSellStatus || spec.st11SellStatus || spec.naverStatus
        || spec.useFlag) {
        try {
          if (spec.gridStock) return await sendByKakaoGrid(spec, codes, resume);
          if (spec.itemApi) return await sendByAlwayzItems(spec, codes, resume);
          if (spec.saleStatus) return await sendByLotteonStatus(spec, codes, resume);
          if (spec.directChange) return await sendByKkomangseDirect(spec, codes, resume);
          if (spec.batchStock) return await sendByTeacherBatchStock(spec, codes, resume);
          if (spec.goodsSaleState) return await sendByIcecreamSaleState(spec, codes, resume);
          if (spec.stateBatch) return await sendByKidsnoteState(spec, codes, resume);
          if (spec.esmSellStatus) return await sendByEsmSellStatus(spec, codes, resume);
          if (spec.st11SellStatus) return await sendBySt11SellStatus(spec, codes, resume);
          if (spec.naverStatus) return await sendBySmartstoreStatus(spec, codes, resume);
          if (spec.useFlag) return await sendByKidkidsUseFlag(spec, codes, resume);
          return await sendBySellingState(spec, codes, resume);
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }

      // 도매꾹은 화면을 열 필요가 없다. 목록 조회로 줄을 읽고 목록 수정 한 방으로 보낸다.
      if (spec.listEdit) {
        try {
          return await sendByListEdit(spec, codes, resume);
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }

      const sent = [];
      const failed = [];
      const warnings = [];

      // 온채널은 화면을 열 필요가 없다. 코드만으로 한 번에 보낸다.
      if (spec.post) {
        const body = resume ? spec.post.resumeBody(codes) : spec.post.body(codes);
        const answer = await postForm(spec.origin, spec.post.path, Object.entries(body));
        if (answer.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (answer.accepted) sent.push(...codes);
        else failed.push(...codes);
        if (spec.requestOnly) {
          warnings.push(`${spec.label}은 관리자 승인을 거칩니다 — 보낸 것이 곧 반영은 아닙니다.`);
        }
        return {
          success: true,
          sent: sent.length,
          failed: failed.length,
          requestOnly: Boolean(spec.requestOnly),
          warnings,
        };
      }

      return { success: false, error: `품절 경로를 아는 몰이 아닙니다: ${mallKey}` };
    }

    /**
     * 쿠팡 윙 지금 재고를 **읽기만** 한다. 보내지 않는다. 등록현황 칸의 창이 "지금 품절인가"를 보여 줄 때 쓴다 —
     * 매트릭스의 상태는 어젯밤 가져온 판매상태(ON_SALE)라 품절(재고 0)을 모른다.
     *
     * 돌려주는 것은 상품코드 · 옵션코드 · 재고 수뿐이다.
     */
    async function readByOptionStock(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,15}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 등록상품ID가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withWingPage(spec, async ({ readItems }) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const read = await readItems(products[index]);
          if (!read.items) {
            if (read.loggedOut) {
              return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
            }
            if (read.rateLimited) {
              return { success: false, error: `${spec.label}이 요청을 잠시 막았습니다(HTTP 429). 몇 분 뒤 다시 확인하세요.` };
            }
            missing.push(products[index]);
            continue;
          }
          // 옵션 목록이 비어 오면 모른다 — 빈 목록을 돌려주면 칸이 로켓그로스로 읽는다.
          if (read.items.length === 0) {
            missing.push(products[index]);
            continue;
          }
          found.push({
            code: products[index],
            options: read.items.map((item) => ({
              optionCode: String(item.vendorItemId),
              stock: Number(item.stockQuantity),
              rocket: item.registrationType === "RFM",
            })),
          });
        }
        return null;
      }, { reuseOpen: true });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 톡스토어 지금 재고. 상품마다 목록 API 한 번. 읽기만 한다. */
    async function readByKakaoList(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,15}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withSellerPage(spec, spec.gridStock.pageUrl, async (run) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const read = await readKakaoProduct(spec, run, products[index]);
          if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (!read.product) {
            missing.push(products[index]);
            continue;
          }
          found.push({
            code: products[index],
            options: [{ optionCode: String(read.product.id), stock: Number(read.product.stockQuantity), rocket: false }],
          });
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 올웨이즈 지금 상태. 재고 수는 주지 않고 품절 여부만 준다 — 품절이면 0, 아니면 모름(null). 읽기만 한다. */
    async function readByAlwayzItems(spec, codes) {
      const ids = [...new Set(codes)].filter((code) => /^[0-9a-f]{24}$/i.test(code)).slice(0, READ_LIMIT);
      if (ids.length === 0) return { success: false, error: `읽을 ${spec.label} 상품 고유번호가 없습니다.` };
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, spec.itemApi.pageUrl, async (run) => {
        const read = await readAlwayzItems(spec, run, ids);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.items) return { success: false, error: `${spec.label} 상품 상태를 읽지 못했습니다(${read.error}).` };
        const byId = new Map(read.items.map((item) => [String(item._id), item]));
        found = ids.filter((id) => byId.has(id)).map((id) => ({
          code: id,
          options: [{ optionCode: id, stock: byId.get(id).soldOut ? 0 : null, rocket: false }],
        }));
        missing = ids.filter((id) => !byId.has(id));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 아트공구 지금 판매상태. 상품목록을 한 번 끝까지 읽는다. 재고 수는 주지 않고 판매안함(품절)이면 0, 판매함이면
     * 모름(null)이다. 읽기만 한다.
     */
    async function readBySellingState(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,12}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, spec.sellingState.pageUrl, async (run) => {
        const read = await readCafe24Rows(spec, run);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.rows) return { success: false, error: `${spec.label} 상품목록을 읽지 못했습니다(${read.error}).` };
        found = products.filter((no) => read.rows.has(no)).map((no) => ({
          code: no,
          // 판매안함만 품절(0)이다. 판매 상태를 못 읽었으면(null) 모른다 — 품절로 단정하지 않는다.
          options: [{ optionCode: no, stock: read.rows.get(no).selling === false ? 0 : null, rocket: false }],
        }));
        missing = products.filter((no) => !read.rows.has(no));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 롯데ON 지금 판매상태. 상품 조회 한 번(판매자상품번호 여럿). 재고 수는 주지 않고, 판매중이 아니면(품절 · 판매중지 ·
     * 판매종료) 살 수 없으니 0, 판매중이면 모름(null)이다. 읽기만 한다.
     */
    async function readByLotteonStatus(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^LO\d{4,20}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 판매자상품번호가 없습니다.` };
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, spec.saleStatus.pageUrl, async (run) => {
        const read = await readLotteonRows(spec, run, products);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${read.error}).` };
        found = products.filter((no) => read.rows.has(no)).map((no) => ({
          code: no,
          options: [lotteonOption(no, read.rows.get(no).slStatCd)],
        }));
        missing = products.filter((no) => !read.rows.has(no));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 아이스크림몰 지금 판매상태. 목록 조회 한 번(상품번호 여럿). 재고 수는 주지 않고, 판매중(10)이 아니면(품절 · 판매종료)
     * 살 수 없으니 0, 판매중이면 모름(null)이다. 읽기만 한다.
     */
    async function readByIcecreamSaleState(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{5,15}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, spec.goodsSaleState.pageUrl, async (run) => {
        const read = await readIcecreamRows(spec, run, products);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${read.error}).` };
        found = products.filter((no) => read.rows.has(no)).map((no) => ({
          code: no,
          options: [flagOption(no, read.rows.get(no).saleStatCd === "10", { 20: "품절", 40: "판매종료" }[read.rows.get(no).saleStatCd])],
        }));
        missing = products.filter((no) => !read.rows.has(no));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 키즈노트 지금 상태. 목록을 넘기며 찾는다. 재고 수는 주지 않고, 정상이 아니면(품절 · 숨김) 살 수 없으니 0, 정상이면
     * 모름(null)이다. 읽기만 한다.
     */
    async function readByKidsnoteState(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,10}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, spec.stateBatch.pageUrl, async (run) => {
        const read = await readKidsnoteRows(spec, run, products, false);
        if (read.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
        if (!read.rows) return { success: false, error: `${spec.label} 상품목록을 읽지 못했습니다(${read.error}).` };
        found = products.filter((no) => read.rows.has(no)).map((no) => ({
          code: no,
          options: [flagOption(no, read.rows.get(no).stat === "정상", read.rows.get(no).stat)],
        }));
        missing = products.filter((no) => !read.rows.has(no));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /**
     * 지마켓 · 옥션 · 11번가 · 스마트스토어 지금 판매상태. 재고 수는 주지 않고, 판매중이 아니면(판매중지 · 품절 등) 살 수
     * 없으니 0, 판매중이면 모름(null)이다. 읽기만 한다.
     */
    async function readByMarketStatus(spec, codes) {
      const valid = [...new Set(codes)].filter((code) => {
        if (spec.esmSellStatus) return Boolean(esmSiteNo(spec, code));
        if (spec.st11SellStatus) return /^\d{6,12}$/.test(code);
        return /^\d{6,15}$/.test(code);
      }).slice(0, READ_LIMIT);
      if (valid.length === 0) return { success: false, error: `읽을 ${spec.label} 상품번호가 없습니다.` };
      const pageUrl = (spec.esmSellStatus || spec.st11SellStatus || spec.naverStatus).pageUrl;
      let found = [];
      let missing = [];
      const halted = await withSellerPage(spec, pageUrl, async (run) => {
        let selling;
        if (spec.esmSellStatus) {
          const bySite = new Map(valid.map((code) => [esmSiteNo(spec, code), code]));
          const read = await readEsmItems(spec, run, [...bySite.keys()]);
          if (read.loggedOut) return { success: false, error: `${spec.label}(ESM) 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (!read.items) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${read.error}).` };
          const esmWords = { 21: "판매중지", 22: "판매불가", 31: "SKU품절", "01": "등록대기" };
          selling = new Map([...bySite].filter(([siteNo]) => read.items.has(siteNo)).map(([siteNo, code]) => {
            const stat = read.items.get(siteNo).sellStatus[spec.esmSellStatus.site];
            return [code, stat === "11" ? true : esmWords[stat] || "판매중지"];
          }));
        } else if (spec.st11SellStatus) {
          const read = await readSt11Rows(spec, run, valid);
          if (read.loggedOut) return { success: false, error: `${spec.label} 셀러오피스 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (!read.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${read.error}).` };
          const st11Words = { 101: "승인대기", 102: "전시전", 104: "품절", 105: "판매중지" };
          selling = new Map(valid.filter((code) => read.rows.has(code)).map((code) => {
            const stat = read.rows.get(code).selStatCd;
            return [code, stat === "103" ? true : st11Words[stat] || "판매중지"];
          }));
        } else {
          const read = await readSmartstoreRows(spec, run, valid);
          if (read.loggedOut) return { success: false, error: `${spec.label}센터 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (!read.rows) return { success: false, error: `${spec.label} 상품을 읽지 못했습니다(${read.error}).` };
          const naverWords = { OUTOFSTOCK: "품절", SUSPENSION: "판매중지", WAIT: "판매대기", CLOSE: "판매종료", PROHIBITION: "판매금지" };
          selling = new Map(valid.filter((code) => read.rows.has(code)).map((code) => {
            const stat = read.rows.get(code).productStatusType;
            return [code, stat === "SALE" ? true : naverWords[stat] || "판매중지"];
          }));
        }
        // 판매중이면 true, 아니면 그 몰의 상태 글자(판매중지 · 품절 · 판매종료 …) — 칸이 몰의 말 그대로 적는다.
        found = valid.filter((code) => selling.has(code)).map((code) => ({
          code,
          options: [flagOption(code, selling.get(code) === true, selling.get(code) === true ? null : selling.get(code))],
        }));
        missing = valid.filter((code) => !selling.has(code));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 한 몰의 지금 재고를 읽는다(쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON · 꼬망세 · 티쳐몰 · 아이스크림몰 · 키즈노트 · 지마켓 · 옥션 · 11번가 · 스마트스토어). 읽기만 한다. */
    async function read(msg) {
      const mallKey = String(msg?.mallKey || "");
      const spec = SPECS[mallKey];
      if (!spec?.optionStock && !spec?.gridStock && !spec?.itemApi && !spec?.sellingState && !spec?.saleStatus
        && !spec?.directChange && !spec?.batchStock && !spec?.goodsSaleState && !spec?.stateBatch && !spec?.esmSellStatus
        && !spec?.st11SellStatus && !spec?.naverStatus && !spec?.useFlag) {
        return { success: false, error: `지금 재고를 읽을 수 있는 몰이 아닙니다: ${mallKey || "(없음)"}` };
      }
      const codes = (Array.isArray(msg?.codes) ? msg.codes : [])
        .map((code) => String(code || "").trim())
        .filter(Boolean);
      try {
        if (spec.gridStock) return await readByKakaoList(spec, codes);
        if (spec.itemApi) return await readByAlwayzItems(spec, codes);
        if (spec.sellingState) return await readBySellingState(spec, codes);
        if (spec.saleStatus) return await readByLotteonStatus(spec, codes);
        if (spec.directChange) return await readByKkomangseDirect(spec, codes);
        if (spec.batchStock) return await readByTeacherBatchStock(spec, codes);
        if (spec.goodsSaleState) return await readByIcecreamSaleState(spec, codes);
        if (spec.stateBatch) return await readByKidsnoteState(spec, codes);
        if (spec.esmSellStatus || spec.st11SellStatus || spec.naverStatus) return await readByMarketStatus(spec, codes);
        if (spec.useFlag) return await readByKidkidsUseFlag(spec, codes);
        return await readByOptionStock(spec, codes);
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    }

    return { send, read };
  }

  root.KidItemMallAvailabilitySend = {
    create,
    SPECS,
    PENDING,
    MALL_KEYS: Object.keys(SPECS),
    // 지금 재고(품절 여부)를 몰에서 바로 읽을 수 있는 몰.
    READ_MALL_KEYS: Object.keys(SPECS).filter((key) => Boolean(
      SPECS[key].optionStock || SPECS[key].gridStock || SPECS[key].itemApi || SPECS[key].sellingState
        || SPECS[key].saleStatus || SPECS[key].directChange || SPECS[key].batchStock || SPECS[key].goodsSaleState
        || SPECS[key].stateBatch || SPECS[key].esmSellStatus || SPECS[key].st11SellStatus || SPECS[key].naverStatus
        || SPECS[key].useFlag,
    )),
    SEND_TIMEOUT_MS,
  };
})(typeof self !== "undefined" ? self : globalThis);
