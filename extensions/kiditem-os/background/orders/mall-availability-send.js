(function initializeMallAvailabilitySend(root) {
  "use strict";

  // 몰 품절 송신 — 키드키즈·꼬망세·온채널·도매꾹·쿠팡 윙(옵션 재고 0)·카카오 톡스토어(재고 0)·올웨이즈·
  // 아트공구(판매안함)·롯데ON(판매상태 품절)·티쳐몰(재고 0). 아이스크림몰은 경로 대기.
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
    kidkids: {
      label: "키드키즈",
      origin: "https://partner.kidkids.net",
      listPath: () => "/sales/goods_list_renewal.htm?pNum=1",
      perCode: false,
      form: "frmGoodsList",
      action: "/sales/proc_logis.htm",
      // changeUseFlag('N') 이 채우는 값. 해제는 같은 칸에 'Y'.
      hidden: { commitType: "use_flag", use_flag: "N" },
      resumeHidden: { commitType: "use_flag", use_flag: "Y" },
      rowKey: { selector: 'input[name="goods_code[]"]', attr: "value" },
      encoding: "euc-kr",
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
  };

  /** 이 몰은 아직 경로가 없다. 화면이 버튼을 세우지 않게 이름만 남긴다. */
  const PENDING = {
    "icecream-mall": "판매상태 일괄변경이 별도 창(goodsSaleStateModifyView.do)에서 저장돼 창 사이를 잇는 경로가 더 필요합니다.",
  };

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
          const counted = Number(String(doc.querySelector(".total strong")?.textContent || "").replace(/[^\d]/g, ""));
          if (!Number.isSafeInteger(counted)) return { error: "상품 수를 읽지 못했습니다" };
          total = counted;
        }
        const boxes = [...doc.querySelectorAll("input._product_no")];
        for (const box of boxes) {
          const no = String(box.value || "").trim();
          if (!/^\d{1,12}$/.test(no) || seen.has(no)) continue;
          seen.add(no);
          rows.push({
            no,
            display: box.getAttribute("is_display") === "T",
            selling: box.getAttribute("is_selling") === "T",
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

  /**
   * 화면에서 값을 세우고 **그 폼이 보낼 것을 그대로 모아 돌려준다.**
   *
   * 보내지는 않는다 — 보내는 것은 워커가 한다. 페이지 안에서 fetch 하면 응답을
   * 워커가 못 보고, 페이지가 이동하면 결과를 잃는다.
   */
  function collectFormOnPage(payload) {
    const { formName, set, hidden, rowKey, codes } = payload;
    const form = document.forms[formName];
    if (!form) return { ok: false, error: "품절 화면의 폼을 찾지 못했습니다." };

    const wanted = new Set(codes);
    const matched = [];
    const rows = [...document.querySelectorAll(rowKey.selector)];
    for (const anchor of rows) {
      const code = rowKey.attr === "value"
        ? (anchor.value || "")
        : (anchor.getAttribute(rowKey.attr) || "");
      if (!wanted.has(code)) continue;
      matched.push(code);
      if (anchor.type === "checkbox") {
        anchor.checked = true;
        anchor.dispatchEvent(new Event("change", { bubbles: true }));
      }
      // 값 칸은 **그 줄 안에서만** 찾는다. 화면 전체에서 찾으면 고르지 않은 줄까지
      // 고쳐 놓고 폼을 통째로 보낼 때 같이 나간다.
      const row = anchor.closest("tr") || anchor.parentElement;
      for (const rule of set || []) {
        const field = row && row.querySelector(rule.selector);
        if (!field) continue;
        if (rule.check) {
          field.checked = true;
          field.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          field.value = rule.value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }

    if (matched.length === 0) {
      return { ok: false, error: "이 화면에서 대상 상품을 찾지 못했습니다.", matched: [] };
    }

    for (const [name, value] of Object.entries(hidden || {})) {
      let field = form.elements[name];
      if (field && field.length && field.tagName === undefined) field = field[0];
      if (field) field.value = value;
      else {
        const made = document.createElement("input");
        made.type = "hidden";
        made.name = name;
        made.value = value;
        form.appendChild(made);
      }
    }

    // 폼이 보낼 것을 그대로. 버튼을 눌렀을 때와 같은 바이트다.
    const pairs = [];
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === "string") pairs.push([name, value]);
    }
    return { ok: true, matched, pairs, rowsOnPage: rows.length };
  }

  function create({ chrome: chromeApi, fetch: fetchApi, interactiveTabs, tabReason, sleep: sleepOverride }) {
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
            const ok = Number.isFinite(Number(json.success)) ? Math.min(Number(json.success), targets.length) : targets.length;
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
      const wantedOf = (product) => (Array.isArray(options?.[product])
        ? new Set(options[product].map((code) => String(code)).filter((code) => /^\d{1,15}$/.test(code)))
        : null);
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
          const read = await readItems(product);
          if (!read.items) {
            if (read.loggedOut) {
              return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.` };
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
        ...(stoppedAt !== null ? { stopped: "rate_limited" } : {}),
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
        const reusable = (open || []).find((tab) => tab && tab.status === "complete"
          && String(tab.url || "").startsWith(spec.origin)
          && !/login|signin|auth/i.test(String(tab.url || "")));
        if (reusable) {
          tabId = reusable.id;
        } else {
          const tab = await chromeApi.tabs.create({ url: pageUrl, active: false });
          tabId = tab.id;
          created = true;
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
        if (created && tabId !== null) await chromeApi.tabs.remove(tabId).catch(() => undefined);
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
        sent += targets.length;
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
        const targets = found.filter((no) => !before.rows.get(no).set && before.rows.get(no).selling !== resume);
        already += found.length - sets - targets.length;
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
          await sleep(PACE_MS);
        }
        if (sent === 0) return null;
        const after = await readCafe24Rows(spec, run);
        if (after.rows) confirmed += targets.filter((no) => after.rows.get(no)?.selling === resume).length;
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
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        for (let index = 0; index < codes.length; index += 1) {
          const code = codes[index];
          if (index > 0) await sleep(PACE_MS);
          const row = await run(kkomangseRowOnPage, [api.viewPath, code]);
          if (row?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
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
      const halted = await withSellerPage(spec, api.pageUrl, async (run) => {
        for (let index = 0; index < codes.length; index += 1) {
          const code = codes[index];
          if (index > 0) await sleep(PACE_MS);
          const form = await run(teacherBatchFormOnPage, [api.batchPath, code]);
          if (form?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
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
        const locked = found.filter((no) => !["SALE", "SOUT"].includes(before.rows.get(no).slStatCd)).length;
        if (locked > 0) {
          failed += locked;
          warnings.push(`${locked}건은 ${spec.label}이 판매중지 · 판매종료한 상품이라 바꾸지 않았습니다.`);
        }
        const targets = found.filter((no) => before.rows.get(no).slStatCd === from);
        already += found.length - locked - targets.length;
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
          if (answer?.loggedOut) return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
          if (answer?.status !== 200 || (answer.json?.returnCode && answer.json.returnCode !== "SUCCESS")) {
            failed += group.length;
            const reason = answer?.json?.message ? `: ${String(answer.json.message).slice(0, 120)}` : "";
            warnings.push(`${spec.label}이 판매상태 변경을 받지 않았습니다(HTTP ${answer?.status ?? 0})${reason}.`);
            continue;
          }
          const counts = lotteonBatchCounts(answer.json);
          const ok = counts?.successCnt ?? group.length - (counts?.failCnt ?? 0);
          sent += Math.max(0, Math.min(ok, group.length));
          if (counts && counts.failCnt > 0) {
            failed += Math.min(counts.failCnt, group.length);
            warnings.push(`${spec.label}이 ${group.length}건 중 ${counts.failCnt}건을 바꾸지 않았다고 답했습니다.`);
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
          confirmed += seen;
          if (seen < sent) warnings.push(`${spec.label} 상품 조회가 아직 옛 상태를 보여 줍니다 — 잠시 뒤 다시 확인하세요.`);
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, sent: sent + already, failed, confirmed: confirmed + already, already, rocket: 0, requestOnly: false, warnings };
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
      // 티쳐몰은 [실물] 일괄 업데이트의 [업데이트하기]와 같은 요청이다.
      if (spec.gridStock || spec.itemApi || spec.sellingState || spec.saleStatus || spec.directChange || spec.batchStock) {
        try {
          if (spec.gridStock) return await sendByKakaoGrid(spec, codes, resume);
          if (spec.itemApi) return await sendByAlwayzItems(spec, codes, resume);
          if (spec.saleStatus) return await sendByLotteonStatus(spec, codes, resume);
          if (spec.directChange) return await sendByKkomangseDirect(spec, codes, resume);
          if (spec.batchStock) return await sendByTeacherBatchStock(spec, codes, resume);
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

      const targets = spec.perCode ? codes.map((code) => [code]) : [codes];
      let tabId = null;
      try {
        for (const group of targets) {
          const url = `${spec.origin}${spec.listPath(group[0])}`;
          if (tabId === null) {
            const tab = await interactiveTabs.createTab({ url, reason: tabReason });
            tabId = tab.id;
          } else {
            await chromeApi.tabs.update(tabId, { url });
          }
          const waited = await waitForTabComplete(tabId).catch(() => undefined);
          await sleep(waited ? 900 : 2200);

          const injected = await chromeApi.scripting.executeScript({
            target: { tabId },
            func: collectFormOnPage,
            args: [{
              formName: spec.form,
              set: resume ? spec.resumeSet || [] : spec.set || [],
              hidden: (resume ? spec.resumeHidden : spec.hidden) || {},
              rowKey: spec.rowKey,
              codes: group,
            }],
          });
          const outcome = (injected || []).map((entry) => entry?.result).find(Boolean);
          if (!outcome?.ok) {
            failed.push(...group);
            if (outcome?.error) warnings.push(`${group[0]}: ${outcome.error}`);
            continue;
          }

          const answer = await postForm(spec.origin, spec.action, outcome.pairs, spec.encoding);
          if (answer.accepted) sent.push(...outcome.matched);
          else failed.push(...outcome.matched);
          await sleep(PACE_MS);
        }
      } finally {
        // 우리가 연 탭은 우리가 닫는다. 한 몰에 한 탭이고, 실패해도 닫는다.
        if (tabId !== null) await chromeApi.tabs.remove(tabId).catch(() => undefined);
      }

      const notFound = codes.filter((code) => !sent.includes(code) && !failed.includes(code));
      if (notFound.length > 0) {
        warnings.push(`${notFound.length}건은 그 몰 화면에 없었습니다.`);
      }
      return {
        success: true,
        sent: sent.length,
        failed: failed.length + notFound.length,
        requestOnly: false,
        warnings,
      };
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
          options: [{ optionCode: no, stock: read.rows.get(no).selling ? null : 0, rocket: false }],
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
          options: [{ optionCode: no, stock: read.rows.get(no).slStatCd === "SALE" ? null : 0, rocket: false }],
        }));
        missing = products.filter((no) => !read.rows.has(no));
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 한 몰의 지금 재고를 읽는다(쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON · 꼬망세). 읽기만 한다. */
    async function read(msg) {
      const mallKey = String(msg?.mallKey || "");
      const spec = SPECS[mallKey];
      if (!spec?.optionStock && !spec?.gridStock && !spec?.itemApi && !spec?.sellingState && !spec?.saleStatus
        && !spec?.directChange && !spec?.batchStock) {
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
        || SPECS[key].saleStatus || SPECS[key].directChange || SPECS[key].batchStock,
    )),
    SEND_TIMEOUT_MS,
  };
})(typeof self !== "undefined" ? self : globalThis);
