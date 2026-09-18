(function initializeMallFormRegister(root) {
  "use strict";

  // 몰 상품등록 폼 자동 채움 — 도매꾹·온채널 공용.
  //
  // 키즈노트가 자기 파일을 따로 갖는 이유는 그 몰만 두 가지가 특별해서다.
  //  · 분류가 AJAX 계단식이라 단계마다 옵션 로드를 기다려야 한다
  //  · 상세설명을 `up_fdisk` 호스팅에 먼저 올려야 한다
  // 여기 두 몰은 그 둘이 없어서 한 구현으로 충분하다. 몰마다 다른 것은 아래 SPECS
  // 한 덩어리뿐이고, 채우는 절차는 같다.
  //
  // ⚠️ 제출하지 않는다. 두 몰 다 승인이 붙는 등록이라 되돌리기 어렵다. 폼만 채우고
  //    사람이 화면에서 확인한 뒤 누른다.

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const FILL_TIMEOUT_MS = 120000;

  /**
   * 몰별로 다른 것 전부.
   *
   * `dynamic` 은 "이 칸을 고르면 다른 칸들이 생긴다"는 뜻이다. 도매꾹 상품정보고시가
   * 그렇다 — 상품군을 고르기 전에 `infoDuty[...]` 를 넣으면 조용히 사라진다.
   */
  const SPECS = {
    domeggook: {
      label: "도매꾹",
      origin: "https://www.domeggook.com",
      pathPrefix: "/sc/item/regFrm",
      formSelector: "#lFormRegItem",
      // 대표이미지 칸. 전문가용업로드(`imageResize=0`)에서 보이는 것은 `image1~4`
      // 이고 순서대로 760·330·150·75 픽셀 이상이다. `image0` 은 일반업로드 전용이라
      // 그 방식에서는 숨는다(라이브 실측 2026-09-10).
      imageSlots: ["image0", "image1", "image2", "image3", "image4"],
      dynamic: { trigger: "infoDutyType", waitPrefix: "infoDuty[" },
      // 키워드 10칸은 **이름이 없다**(class 만 `lKeywordTmp`). `form.elements[name]`
      // 로는 닿지 않아서, 숨은 `itemKeyword` 만 채우면 화면은 빈 채로 남고 페이지가
      // 그 칸들로 숨은 값을 다시 만들어 덮는다(라이브 확인 2026-09-10).
      // 그러니 보이는 칸을 채워야 한다. 채우면 숨은 값이 저절로 따라온다.
      groupInputs: [{ key: "keywords", selector: "input.lKeywordTmp" }],
      // `이미지 사용허용`(도매매 판매시 필수옵션)도 `name` 이 없다. 누르면 숨은
      // `imageArrow` 가 `1` 이 된다(라이브 확인 2026-09-10). 숨은 칸을 직접 쓰지 않고
      // 사람처럼 누른다 — 키워드 칸에서 배운 것과 같다.
      selectorChecks: [{ key: "imageAllow", selector: "#lImageAllow", label: "이미지 사용허용" }],
      /**
       * 이름 없는 입력칸들. 폼으로는 못 닿아 선택자로 찾는다.
       *
       * 원산지 세 칸은 계단식이라 앞 칸을 고른 뒤 다음 목록이 채워지기를 기다려야
       * 한다. 안전인증 칸은 상품군(`infoDutyType`)을 고르면 통째로 다시 그려지므로
       * 그 뒤에 와야 한다(라이브 실측 2026-09-10).
       *
       * 이 칸들의 값은 화면에만 보이고, `itemCountry`·`itemSafetyCertCat[1]`·
       * `itemCertNumber[1]` 은 도매꾹이 제출할 때 여기서 만든다.
       */
      selectorFields: [
        { key: "originType", selector: "#lItemCountrySelect1", label: "원산지 구분", waitMs: 1300 },
        { key: "originArea", selector: "#lItemCountrySelect2", label: "원산지 대륙", waitMs: 1300 },
        { key: "originNation", selector: "#lItemCountrySelect3", label: "원산지 국가", waitMs: 600 },
        { key: "certExempt", selector: ".lCertItem select.lKC", label: "면제대상여부", waitMs: 600 },
        { key: "certType", selector: ".lCertItem select.lCert", label: "안전인증 분류", waitMs: 600 },
        { key: "certNumber", selector: ".lCertItem input.lInputCertNo", label: "안전인증번호" },
      ],
      /**
       * 저장된 주소 중 첫 번째를 고르는 칸.
       *
       * 값이 계정마다 다른 내부 번호라 적어두지 않는다. 사람이 화면에서 고르는 것도
       * '내 출고지'뿐이다.
       */
      selectFirstOptions: ["deliShippingArea", "returnShippingArea"],
      // 이미지를 넣으면 도매꾹이 '꾹AI:렌즈'로 유사 상품을 찾아 분류를 추천한다.
      // 우리는 6단 코드를 지어낼 수 없으니 그 추천을 받는다 — 몰이 자기 분류 체계로
      // 판단한 값이라 우리 추측보다 낫다.
      //
      // 고정 선택자가 없다(런타임에 만들어진다). 사람이 알아보는 방식 그대로
      // 문구로 찾는다: '추천 카테고리'가 들어간 대화상자 안의 '변경하기' 버튼.
      // 두 조건을 모두 요구해서 엉뚱한 버튼을 누르지 않게 한다.
      acceptRecommendation: {
        containerText: "추천 카테고리",
        acceptText: "변경하기",
        timeoutMs: 40000,
      },
      // 상세내용은 사람이 하는 그대로 '상품상세내용 작성하기' 버튼을 눌러서 넣는다.
      // 버튼이 팝업 에디터(`my_sellInfoFormEditor.php`)를 새 탭으로 열고, 거기서
      // 등록을 누르면 에디터가 opener 콜백으로 `itemMemo[Item]` 을 채운다.
      //
      // 그 칸에 값을 직접 써넣을 수도 있지만 그러면 버튼이 '작성하기'로 남아 사람이
      // "안 들어갔나" 하고 다시 열어 덮어쓴다. 에디터를 거치면 라벨('수정')과
      // `data-mode="edit"` 를 페이지가 스스로 바꾼다(라이브 확인 2026-09-10).
      //
      // ⚠️ 이 에디터는 켜져 있는 항목이 비면 `alert()` 를 띄운다. 등록폼이 열어주는
      //    기본값은 네 항목 전부 켜짐이고 상품정보 말고는 비어 있다. 네이티브
      //    대화상자는 자동화에서 렌더러를 통째로 멈춰 아무것도 읽지 못하게 만든다
      //    (라이브 확인 2026-09-10). 그래서 비어 있는 항목은 미리 끄고, alert 은
      //    삼켜서 경고로 돌려준다 — 몰의 말을 버리지 않으면서 화면은 살려둔다.
      detailEditor: {
        buttonId: "lBtnWriteItemMemo",
        urlPattern: "https://www.domeggook.com/main/mySell/register/my_sellInfoFormEditor.php*",
        editorKey: "Item",
        toggleSelector: "input.lBtnContentType",
        framePrefix: "easyWebEditor_lTextarea",
        frameSuffix: "_iframe",
        submitId: "lBtnSubmit",
        // `내 다른 판매상품 홍보`. 켜면 도매꾹이 내용을 요구하므로, 넣을 값이 있을
        // 때만 켠 채로 채우고 없으면 끈다.
        promoKey: "OtherItem",
        openTimeoutMs: 20000,
        submitTimeoutMs: 20000,
      },
      // 상세설명 이미지는 **몰이 읽을 수 있는 주소**여야 한다. 우리 렌더 산출물은
      // `http://localhost:9000/...`(로컬 MinIO)라 도매꾹도 구매자도 못 읽는다.
      //
      // 도매꾹 자체 호스팅(`my_sellImageCacheAjax.php`)은 못 쓴다. 파일을 보내면
      // 서버가 `{"res":false,"dmsg":"API token 정보가 없습니다"}` 로 거절한다 —
      // iwinv 유료 서비스 토큰이 있어야 열린다(라이브 확인 2026-09-10).
      //
      // 그래서 우리 상점 첨부 저장소에 올려서 공개 주소를 받는다. 탭을 열지 않고
      // fetch 세 번으로 끝난다(`DETAIL_HOSTS` 참고). 예전엔 키즈노트 등록화면을
      // 탭으로 열었는데, 도매꾹을 누른 사람에게 키즈노트가 열리는 건 설명되지 않는
      // 동작이었다. 이제 아무 창도 열리지 않으므로 사람이 켜고 끌 이유도 없다.
      detailHost: "kidsnote",
    },
    artgonggu: {
      label: "아트공구",
      origin: "https://zzogzzog1.cafe24.com",
      pathPrefix: "/disp/admin/shop1/product/ProductRegister",
      formSelector: "#eProductRegisterForm",
      /**
       * 대표이미지는 **파일로 올린다.**
       *
       * 주소로 넣는 길(`이미지 URL등록`)도 있지만 그러면 Cafe24 서버가 그 주소를
       * 가지러 와야 한다. 우리 산출물은 로컬 MinIO 라 못 읽고, 남의 호스팅을 거치면
       * 핫링크 차단에 걸린다(라이브 실측 2026-09-10: 카카오 CDN 은 리퍼러가 있으면
       * Cafe24 관리자에서 BLOCKED). 파일을 올리면 Cafe24 가 자기 서버에 네 크기를
       * 만들어 준다 — 주소 문제가 통째로 사라진다.
       *
       * 이 칸은 폼 **밖에** 있어서 이름으로는 못 닿는다.
       */
      imageSlots: [],
      imageFileInput: { selector: "#imageFiles", label: "대표이미지", waitMs: 4500 },
      /**
       * 상세설명도 Cafe24 가 자기 서버에 받아 준다.
       *
       * 편집기의 파일매니저 업로드에 올리면 `/web/upload/NNEditor/...` 주소가 나온다
       * (라이브 확인 2026-09-10). 그 주소를 Froala 에 넣는다 — 남의 호스팅이 필요 없다.
       *
       * 주소는 화면이 알고 있으므로(`$Editor[이름].opts`) 업로드도 화면에서 한다.
       * 서비스워커는 우리 이미지를 읽어 data URL 로 건네주기만 한다.
       */
      detailSelfUpload: {
        editors: ["product_description", "product_description_mobile"],
        /**
         * 상세설명 칸은 탭 두 개다 — `에디봇 작성`(기본) / `직접 작성`.
         * 기본 탭에서는 편집기가 숨어 있어 값을 넣어도 사람 눈에는 빈 칸으로 보인다.
         * 넣기 전에 `직접 작성` 으로 넘긴다(라이브 확인 2026-09-10).
         */
        tabSelector: "a#nnedit",
      },
      dynamic: null,
      categoryPicker: {
        tableId: "selectCategoryTable",
        itemSelector: "li.category-item",
        applyText: "적용",
        stepWaitMs: 1200,
        applyWaitMs: 1500,
      },
    },
    alwayz: {
      label: "올웨이즈",
      origin: "https://alwayzseller.ilevit.com",
      pathPrefix: "/items/registrations",
      /**
       * 이 화면에는 `<form>` 이 없다. React 트리에 입력칸이 흩어져 있고 이름 있는
       * 칸은 `keyword` 하나뿐이라 전부 선택자로 잡는다(라이브 실측 2026-09-10).
       */
      formSelector: "body",
      imageSlots: [],
      dynamic: null,
      /**
       * 분류는 검색해서 고른다.
       *
       * 목록을 미리 들고 있어 타이핑하면 화면에서 걸러진다 — 네트워크 요청이 없다.
       * 결과는 `대분류 > 중분류 > 소분류` 글자를 가진 버튼이고, 누르면 입력칸이
       * 그 전체 경로로 바뀐다. 코드가 아니라 이름이다.
       */
      categorySearch: {
        inputSelector: "#category-search-input",
        optionSelector: "button",
        waitMs: 2200,
      },
      selectorFields: [
        { key: "productName", selector: "#register-productName", label: "상품명" },
        { key: "optionName", selector: 'input[placeholder^="1번째 옵션명"]', label: "옵션명" },
        { key: "optionDetail", selector: 'input[placeholder^="1번째 세부옵션"]', label: "세부옵션" },
        { key: "individualPrice", selector: "#register-individualPrice", label: "개별구매가" },
        { key: "teamPrice", selector: "#register-teamPrice", label: "팀구매가" },
        { key: "keyword", selector: 'input[name="keyword"]', label: "키워드" },
        // 택배사는 **이름이 곧 값**이다. 수정 화면의 숫자 코드(`04`)와 다르다.
        { key: "shippingCompany", selector: "#shipping_company_item", label: "택배사" },
      ],
      /**
       * 이미지 칸 셋. 전부 숨어 있고 이름이 없어 화면 순서로 잡는다.
       * 위지윅 에디터가 없다 — 상세설명도 이미지 파일이다.
       */
      imageFileInputs: [
        { key: "representative", label: "대표이미지" },
        { key: "additional", label: "추가이미지" },
        { key: "detail", label: "상세이미지" },
      ],
    },
    onch: {
      label: "온채널",
      origin: "https://www.onch3.co.kr",
      pathPrefix: "/regist_pending_products.php",
      formSelector: "#registProductForm",
      // 대표이미지 한 칸. 550·300·130 은 온채널이 알아서 만든다.
      imageSlots: ["product_img"],
      /**
       * 같은 이름을 쓰는 여러 칸. 키워드 10칸과 배송안내 3칸이 그렇다.
       *
       * 이름이 `product_subject[]` 하나라서 `product_subject[0]` 같은 번호 이름으로는
       * 한 칸도 못 찾는다(라이브 실측 2026-09-10: 번호 이름 0개 / 배열 이름 10개).
       * 순서대로 나눠 넣어야 한다.
       */
      groupInputs: [
        { key: "keywords", selector: '[name="product_subject[]"]' },
        { key: "transInfo", selector: '[name="product_trans_info[]"]' },
      ],
      /**
       * 상품정보고시 분류가 방아쇠다. 고르면 고시 17칸이 생긴다.
       *
       * 도매꾹처럼 이름에 공통 접두어가 없어서 생겨야 할 칸을 직접 센다.
       * 고를 때 안내 `alert` 이 뜨는데, 그건 채움 함수가 삼킨다.
       */
      dynamic: {
        trigger: "notification_cate_num",
        waitNames: [
          "prd_model", "make_ymd", "note_bene", "warr_prov", "as_phone", "deliver_time",
          "kc_type", "kc_gov", "kc_sec", "kc_name", "size_weight", "prd_color",
          "prd_quality", "use_age", "same_model", "make_import", "make_con",
        ],
      },
      /**
       * 분류 네 칸은 계단식이다. 값은 코드가 아니라 이름 그대로(`생활/건강`)이고,
       * 앞 칸을 고른 뒤 다음 목록이 채워지기를 기다려야 한다(라이브 실측 2026-09-10).
       * 한꺼번에 넣으면 뒤 세 칸이 빈 채로 남는다.
       */
      selectorFields: [
        { key: "categoryFirst", selector: '#registProductForm [name="category_cate_first"]', label: "분류 1단", waitMs: 1600 },
        { key: "categorySecond", selector: '#registProductForm [name="category_cate_second"]', label: "분류 2단", waitMs: 1600 },
        { key: "categoryThird", selector: '#registProductForm [name="category_cate_third"]', label: "분류 3단", waitMs: 1600 },
        { key: "categoryFourth", selector: '#registProductForm [name="category_cate_fourth"]', label: "분류 4단", waitMs: 600 },
      ],
      /**
       * 등록 화면이 세 단계(약관동의 → 기본 정보 → 가격/옵션)로 나뉘어 있다.
       *
       * 칸 자체는 처음부터 문서에 있어서 값은 어느 단계에서든 들어가지만, 사람이
       * 열었을 때 첫 화면이 약관동의면 "아무것도 안 채워졌다"로 보인다. 그래서
       * 동의까지 하고 기본 정보 화면으로 넘겨 둔다.
       */
      wizardSteps: [{
        text: "상품 기본 정보 입력",
        label: "약관동의 통과",
        waitMs: 1500,
        needs: ["product_supp_sec", "product_prd_channel"],
        needsChecks: ["agree_terms"],
      }],
      /**
       * 분류 목록을 몰에서 그때그때 가져온다.
       *
       * 4단 전체를 미리 받아 두려면 요청이 3,600건이고 마디가 3만 개가 넘는다
       * (라이브 실측 2026-09-10: 1단 11 · 2단 242 · 3단 약 3,400). 그걸 파일로
       * 들고 다니느니, 사람이 한 단 고를 때마다 그 단만 물어본다 — 한 상품에 네 번이다.
       */
      categorySource: {
        path: "/access/ajax_pending_product_access.php",
        fixed: { ubr: "getCategory" },
        depthParam: "depth",
        levelParams: ["cate_first", "cate_second", "cate_third"],
        itemsKey: "datas",
        nameKey: "name",
        levels: 4,
      },
      /** 상세설명은 온채널 자기 서버에 올린다. 남의 호스팅이 필요 없다. */
      detailHost: "onch",
      /** 실제 등록물이 `<center><p><img ...></p></center>` 를 들고 있다. */
      detailParagraph: true,
      /**
       * 상품상세정보는 CKEditor 다. `product_contents` 는 그 뒤에 숨은 textarea 라
       * 값을 써도 제출할 때 에디터 내용으로 덮인다 — 상세페이지가 통째로 빈다
       * (라이브 확인 2026-09-10). 에디터에 넣으면 textarea 는 저절로 따라온다.
       */
      detailRich: { selector: ".ck-editor__editable" },
    },
    /**
     * 아이스크림몰(아이스크림 PO/BO).
     *
     * 이 몰만 다른 것 셋(실측 2026-09-11, 등록물 `goodsNo=11411122`):
     *  1. `<form>` 이 섹션마다 하나씩 **열한 개**다 → `multiForm`.
     *  2. 고시가 분류로 열리지 않는다. `announcementInfo.eventhandler
     *     .getAnnoucementItemInfo(품목코드, 안전인증대상YN)` 을 불러야 행이 그려진다.
     *     ⚠️ 몰 코드의 오타(`Annoucement`, n 하나 빠짐)를 그대로 쓴다.
     *  3. 상세설명이 네이버 SmartEditor 2 다. 뒷단 textarea 에 넣는다.
     */
    /**
     * 꼬망세몰(EduPre 임대몰, `nstore.edupre.co.kr`).
     *
     * 실측 2026-09-11, 등록물 `_code=H7984-C3488-G2602`. 평범한 PHP 폼(`frm`)이라 칸
     * 이름이 다 있다. 다른 몰과 다른 것 셋:
     *
     *  1. **분류는 고른 뒤 `선택 카테고리 추가` 를 눌러야 붙는다.** 1·2·3단은 계단식
     *     (`category_select2` → `/program/categorysearch.pro.php`)이라 앞 단을 고르면
     *     다음 단 목록이 AJAX 로 온다. 그 버튼은 이 화면이 발급한 상품코드(`_code`)로
     *     분류를 서버에 붙이는 AJAX 다 — 상품을 저장하는 것이 아니다.
     *  2. **KC 번호 칸은 `인증` 을 누르기 전까지 잠겨 있다**(실측 `disabled`). 라디오를
     *     칸보다 먼저 누른다(`preRadios`).
     *  3. **상세설명은 SmartEditor 2 이고 사진 업로더가 몰에 있다.** 표준 샘플
     *     (`file_uploader_html5.php`)이라 파일 바이트를 본문으로 보내고 `sFileURL=` 이
     *     든 글자로 돌려받는다(실측 `attach_photo.js`). 남의 호스팅에 기대지 않는다.
     */
    kkomangse: {
      label: "꼬망세몰",
      origin: "https://nstore.edupre.co.kr",
      pathPrefix: "/subAdmin/_product.form.php",
      formSelector: 'form[name="frm"]',
      preRadios: ["_kc_yn"],
      /**
       * 계단식이라 **다음 단 목록이 올 때까지** 기다린다. 고정 시간으로 자르면 AJAX 가
       * 늦는 날 `목록에 없습니다` 로 끝난다.
       */
      selectorFields: [
        { key: "category1", selector: 'select[name="pass_cate01"]', label: "분류 1단", waitMs: 600, waitForOption: true },
        { key: "category2", selector: 'select[name="pass_cate02"]', label: "분류 2단", waitMs: 600, waitForOption: true },
        { key: "category3", selector: 'select[name="pass_cate03"]', label: "분류 3단", waitMs: 600, waitForOption: true },
      ],
      /**
       * 고르기만 하면 붙지 않는다. 누르면 목록에 `삭제` 줄(`category_delete(…)`)이 생긴다 —
       * 그게 반영의 증거다. 세 단이 다 골라진 때만 누른다(반쯤 고른 분류를 붙이지 않는다).
       */
      afterSelectorClicks: [
        {
          text: "선택 카테고리 추가",
          label: "선택 카테고리 추가",
          waitMs: 1200,
          expectSelector: '[onclick*="category_delete"]',
          requireFilled: true,
        },
      ],
      // 칸 이름이 텍스트 칸(외부 주소용)과 파일 칸이 같다. 반드시 파일 칸을 집는다.
      imageFileInputs: [
        { key: "square", label: "목록 기본 이미지", selector: 'input[type="file"][name="_img_list_square"]' },
        { key: "over", label: "오버 이미지", selector: 'input[type="file"][name="_img_list_over"]' },
        { key: "swipe", label: "상세 이미지 1", selector: 'input[type="file"][name="_img_b1"]' },
      ],
      /**
       * 상세 이미지 2~5. 처음엔 1번 칸 하나뿐이고 `추가`(`a.js_addimg_btn`)를 누를 때마다
       * 한 줄씩 붙는다. 붙을 때마다 화면이 `rename_img()` 로 파일 칸 이름을 순서대로
       * `_img_b1~5` 로 다시 매긴다(실측). 다섯 칸을 넘기려 하면 alert 가 뜨므로 넷까지다.
       */
      imageRepeat: {
        anchorSelector: 'input[type="file"][name="_img_b1"]',
        sectionClosest: ".in_option_list",
        addSelector: "a.js_addimg_btn",
        slotSelector: 'input[type="file"].realFile',
        namePattern: "_img_b{n}",
        firstIndex: 2,
        groupKey: "gallery",
        max: 4,
        label: "상세 이미지 2~5",
      },
      detailSmartEditor: {
        // 구역 id 가 없다. textarea 자체의 id(`ir1`)에서 칸(부모 td)을 찾는다.
        // 같은 화면에 이용안내용 에디터가 하나 더 있어 문서 전체에서 찾으면 안 된다.
        anchorId: "ir1",
        target: "_content",
        toSourceSelector: "button.se2_to_html",
        sourceSelector: "textarea.se2_input_htmlsrc",
        toEditorSelector: "button.se2_to_editor",
        upload: {
          endpoint: "/include/smarteditor2/plugin/photo_uploader/file_uploader_html5.php",
          mode: "html5",
        },
      },
      // 상세 이미지를 File 로 받아 와야 몰 업로더에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 키드키즈 스토어 파트너센터(`partner.kidkids.net`, euc-kr PHP).
     *
     * 실측 2026-09-14, 목록 3,478개 + 최근 등록물 60개(2026-06~08). 겉 주소
     * `/new/pages/sales/goods_register.htm` 은 껍데기고 폼은 iframe 의
     * `/sales/goods_reg_renewal.htm` 이다 — 그 주소를 바로 열어도 폼이 온전히 그려진다.
     *
     * 칸 이름은 다 있다. 다른 몰과 다른 것 셋:
     *
     *  1. 분류는 대·중·소 계단식이다. 앞 단을 고르면 jQuery 가 `get_category_data.php` 로
     *     다음 단을 채운다(라이브 확인: 네이티브 change 이벤트로도 돈다).
     *  2. ⭐ 공정위 고시는 `gs_id` 를 골라야 칸이 **그려진다**(`goods_spec_proc.php`).
     *     칸은 전부 `name="spec_contents"` 로 이름이 같고 `info` 속성(고시 항목 번호)만
     *     다르다. 제출할 때 화면이 그 칸들을 `info|값//` 로 묶어 `my_gs_data` 에 담는다.
     *  3. 상세설명은 TinyMCE 3.5.8 이다. textarea 에만 쓰면 제출 때 에디터 내용으로
     *     덮이므로 에디터에 넣는다. 등록물 60개 전부 `<center><img …></center>` 한 장.
     *  4. ⭐ 상세 이미지는 **키드키즈 자체 업로드**에 올린다. 에디터 `이미지 삽입/편집` 창의
     *     [...] 이 여는 `galery_ftp.htm` 이다 — 파일을 올리면 응답 HTML 의 `insertimg()` 에
     *     `https://img.kidkids.net/upimage/<시각>_<난수>.<확장자>` 가 실린다(라이브 확인
     *     2026-09-14: 올린 바이트 그대로 공개로 읽히고 다른 사이트 리퍼러도 통과). 이름이 바뀌어
     *     저장되므로 올린 파일명으로 찾으면 못 찾는다. 남의 저장소(키즈노트)가 필요 없다 —
     *     예전엔 키즈노트 관리자 세션이 없으면 키드키즈 상세가 통째로 빠졌다.
     *     그 창의 파일 목록은 서버 쪽 오류(opendir)로 깨져 있지만 업로드는 된다.
     */
    kidkids: {
      label: "키드키즈",
      origin: "https://partner.kidkids.net",
      pathPrefix: "/sales/goods_reg_renewal.htm",
      formSelector: 'form[name="goods_form"]',
      preRadios: ["kc_view"],
      selectorFields: [
        { key: "category1", selector: 'select[name="large_cat_id"]', label: "대분류", waitMs: 600, waitForOption: true },
        { key: "category2", selector: 'select[name="middle_cat_id"]', label: "중분류", waitMs: 600, waitForOption: true },
        { key: "category3", selector: 'select[name="small_cat_id"]', label: "소분류", waitMs: 300, waitForOption: true },
        // 목록은 화면이 열리자마자 AJAX 로 채운다(처음엔 `선택` 한 줄).
        { key: "noticeGroup", selector: "#gs_id", label: "공정위 고시 분류", waitMs: 300, waitForOption: true },
      ],
      infoRows: { itemSelector: "textarea.spec_contents", attr: "info", label: "공정위 고시", timeoutMs: 10000 },
      fireKeyup: true,
      // 목록 이미지 + 추가 이미지 4칸. 칸마다 한 장.
      imageFileInputs: [
        { key: "main", label: "대표 이미지", selector: 'input[type="file"][name="goods_photo_new"]' },
        { key: "img2", label: "추가 이미지 2", selector: 'input[type="file"][name="goods_img_2"]' },
        { key: "img3", label: "추가 이미지 3", selector: 'input[type="file"][name="goods_img_3"]' },
        { key: "img4", label: "추가 이미지 4", selector: 'input[type="file"][name="goods_img_4"]' },
        { key: "img5", label: "추가 이미지 5", selector: 'input[type="file"][name="goods_img_5"]' },
      ],
      /**
       * TinyMCE 3 는 모르는 속성을 저장할 때 지운다. 몰 업로드가 실패해 이미 읽히는 남의
       * 주소(카카오 CDN)로 넣게 되면 핫링크를 통과시키는 `referrerpolicy` 가 필요하므로 그
       * 속성을 허용한다(라이브 확인: 허용 후 `triggerSave` 결과에 속성이 남는다).
       */
      detailRich: {
        kind: "tinymce",
        editorId: "goods_desc",
        validElements: "img[src|alt|width|height|style|referrerpolicy]",
        // 에디터 [...] 업로드 창의 폼 그대로다(`imgupload`: 파일 `upload` + `act=upload` + `fname`).
        upload: {
          endpoint: "/sales/js/tiny_mce/plugins/advimage/galery_ftp.htm?dirname=https://img.kidkids.net/upimage/",
          field: "upload",
          fields: { act: "upload", fname: "" },
          // 응답에는 파일명 없는 기본 주소(`…/upimage/'`)와 `…/upimage//' + img.alt` 도 있다.
          // 파일명과 확장자까지 붙은 것만 올린 결과다.
          hostedPattern: "https://img\\.kidkids\\.net/upimage/[^'\"\\s<>/]+\\.(?:jpe?g|png|gif)",
        },
      },
      // 상세 이미지를 File 로 받아 와야 몰 업로드에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 신세계 파트너오피스(`po.ssgadm.com`) 상품 등록.
     *
     * 실측 2026-09-14. 메인(`main.ssg`)은 탭 껍데기고 폼은 `/cp/item/item/itemNew.ssg` 다 —
     * 바로 열어도 온전하다. Vue 2 + jQuery + dhtmlx 로 된 한 화면이라 다른 몰과 모양이 달라
     * 전용 페이지 함수(`fillSsgProductForm`)로 채운다.
     *
     *  1. `<form>` 이 없다. 섹션 id(`itemNm`)가 입력칸 id 와 겹쳐서 `#itemNm` 은 섹션을 집는다.
     *  2. 검증을 `alert` 으로 띄운다. 뜨면 페이지가 멈춰 그 뒤를 못 채운다 — 먼저 삼킨다.
     *  3. 판매사이트 → 전시카테고리 → 표준분류를 골라야 가격·판매정보 칸이 그려진다.
     *  4. 가격은 dhtmlx 그리드다. 셀 편집기를 거쳐야 공급가를 화면이 계산한다.
     *  5. 전시 시작일이 지금보다 과거면 저장이 막힌다(초 단위). 기본값은 화면을 연 시각이라
     *     채우고 나서 저장하면 늘 막힌다 → 몇 시간 뒤 정각으로 넣는다.
     *
     * 이미지·상세는 몰 서버에 올린다. 사람이 하는 길 그대로다 — 이미지 칸 파일 선택
     * (`/upload/0/file.ssg`), 상세는 SSG Editor 이미지 업로드(`/upload/0/synapEditorUpload.ssg`).
     * 저장(`goSave`)은 부르지 않는다. 확인창은 거절로 막아 둔다.
     */
    ssg: {
      label: "신세계",
      origin: "https://po.ssgadm.com",
      pathPrefix: "/cp/item/item/itemNew.ssg",
      // ⚠️ 같은 주소에 `?srcItemId=`·`?itemId=` 가 붙으면 **기존 상품 수정 화면**이다.
      // 거기에 값을 넣으면 사람이 저장하는 순간 판매중 상품이 덮인다 — 쿼리는 받지 않는다.
      noQuery: true,
      formSelector: "#content",
      imageSlots: [],
      ssgForm: {
        imageGroupKey: "ssg",
        maxImages: 10,
        // 채운 시각 + 이만큼 뒤 정각을 전시 시작으로 넣는다. 사람이 그 전에 저장해야 한다.
        displayStartDelayHours: 3,
        formWaitMs: 30000,
        // 칸 하나가 화면에 반응(서제스트 목록·다음 셀렉트·업로드)할 때까지 기다리는 시간.
        stepWaitMs: 8000,
        // 에디터 이미지 업로드. 응답 `{uploadPath}` 가 이미지 주소다(Synap 규약).
        detailUpload: { endpoint: "/upload/0/synapEditorUpload.ssg", field: "file" },
      },
      // 상세 이미지를 File 로 받아 와야 몰 업로드에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 네이버 스마트스토어센터(`sell.smartstore.naver.com`) 상품 등록.
     *
     * 실측 2026-09-14. AngularJS 1.6 한 화면이라 전용 페이지 함수(`fillSmartstoreProductForm`)로 채운다.
     *
     *  1. 해시 라우트다. `#/products/create` 가 새 등록, `#/products/edit/<번호>` 는 판매중 상품 수정이다.
     *  2. 카테고리·브랜드·제조사·원산지·인증·고시 분류·태그가 전부 selectize 다. 글자를 넣으면 모델에
     *     안 닿아서 selectize API 로 고른다.
     *  3. `상품 주요정보`·`상품정보제공고시`·`검색설정` 은 접혀 있고, 펼쳐야 칸이 그려진다.
     *  4. 화면을 열면 `이전에 작성하던 내용` 확인창이 뜰 수 있다. 확인하면 옛 내용이 새 값을 덮는다 → 취소.
     *
     * 사진은 사람이 하는 길 그대로 `이미지 등록 → 내 사진` 에 파일을 넣는다(네이버 사진 서버로 올라간다).
     * 상세설명 이미지도 화면이 쓰는 네이버 사진 업로드 서비스로 올리고 `HTML 작성` 에 넣는다.
     * 배송·반품/교환·A/S 는 계정 기본값이 이미 채워져 있어 건드리지 않는다. `저장하기`·`임시저장` 은 누르지 않는다.
     */
    smartstore: {
      label: "스마트스토어",
      origin: "https://sell.smartstore.naver.com",
      pathPrefix: "/",
      // 등록과 수정이 같은 문서의 해시만 다르다. 해시까지 똑같아야 받는다.
      hash: "#/products/create",
      noQuery: true,
      formSelector: 'form[name="vm.productForm"]',
      imageSlots: [],
      smartstoreForm: {
        // 첫 장이 대표이미지, 나머지가 추가이미지(최대 9장)다.
        imageGroupKey: "smartstore",
        maxExtraImages: 9,
        formWaitMs: 40000,
        // 칸 하나가 반응(검색 목록·다음 selectize·창 열림)할 때까지 기다리는 시간.
        stepWaitMs: 10000,
        // 사진을 넣은 뒤 화면이 네이버 사진 서버에 다 올리고 창을 닫을 때까지.
        imageWaitMs: 60000,
      },
      // 상세 이미지를 File 로 받아 와야 네이버 사진 서버에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * GS SHOP 파트너스(`partners.gsshop.com`) 상품 등록.
     *
     * 실측 2026-09-14. React + MUI 화면이고 폼 상태는 zustand 저장소 하나(`product-store`)에 있다.
     * 칸마다 화면이 부르는 처리 함수가 저장소 `actions` 에 섹션별로 있어서(`baseInfo.onChangePrdNm` 등),
     * 글자를 치는 대신 **그 함수를 사람이 누른 것처럼 부른다** — 분류를 고르면 고시·과세·안전인증이 따라
     * 바뀌는 연쇄도 화면이 스스로 돈다. 저장소는 화면이 미리 받아 둔 모듈(`modulepreload`)에서 찾는다.
     *
     * 사진은 화면의 사진 칸 처리(`imgInfo.uploadPrdImg`)로, 기술서 사진은 편집기가 쓰는 임시 업로드로 GS 서버에
     * 올린다. `임시저장`·`전체저장` 은 부르지 않는다. 확인창은 거절한다.
     */
    gsshop: {
      label: "GS샵",
      origin: "https://partners.gsshop.com",
      pathPrefix: "/product/products/create",
      // 같은 화면이 `/update/<번호>`·`/copy/<번호>` 로도 열린다. 등록 주소와 정확히 같아야 받는다.
      exactPath: true,
      noQuery: true,
      formSelector: "body",
      imageSlots: [],
      gsshopForm: {
        // 대표 1 + 추가 7.
        imageGroupKey: "gsshop",
        maxImages: 8,
        formWaitMs: 40000,
        // 처리 함수 하나(분류 연쇄·담당MD 수수료 조회 등)가 끝날 때까지 기다리는 시간.
        stepWaitMs: 15000,
      },
      // 상세 이미지를 File 로 받아 와야 GS 편집기 업로드에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 롯데ON 판매자센터(`store.lotteon.com`) 상품 등록.
     *
     * 실측 2026-09-14. 화면은 WebSquare 한 페이지(`index_SO.wsp`)이고 상품등록은 그 안의 탭
     * (`/ui/product/registration/productInsert.xml`)이다. 주소로 바로 열 수 없어서 페이지 함수가 화면의
     * `com.openTab` 으로 연다. 칸마다 화면의 데이터(`dat_productInfo` 등)와 섹션 함수(`scwin.*`)가 있어,
     * 사람이 고른 것처럼 그 함수를 부른다 — 표준카테고리를 고르면 전시카테고리·수수료·단품 줄이 따라온다.
     *
     * 사진은 화면의 단품이미지 창이 쓰는 업로드(티켓 → 파일)로 롯데ON 에 올리고, 창이 닫힐 때 부르는
     * 콜백을 그대로 부른다. 상세 이미지는 편집기(CKEditor)의 사진 업로드 — 편집기 안내대로 사진을 끌어다
     * 놓을 때 도는 그 길 — 로 넣는다. `저장`·`임시저장` 은 부르지 않고, 확인창은 거절한다.
     */
    lotteon: {
      label: "롯데ON",
      origin: "https://store.lotteon.com",
      pathPrefix: "/cm/main/index_SO.wsp",
      exactPath: true,
      noQuery: true,
      formSelector: "body",
      imageSlots: [],
      lotteonForm: {
        // 단품 이미지 창이 받는 최대 장수.
        imageGroupKey: "lotteon",
        maxImages: 10,
        // 로그인 확인 → 탭 열기 → 화면 초기화(공통코드 1.5초 대기 포함)까지.
        formWaitMs: 60000,
        // 섹션 하나(분류 연관정보·고시 항목·배송비 정책 조회 등)가 끝날 때까지 기다리는 시간.
        stepWaitMs: 20000,
      },
      // 상세 이미지는 사람이 편집기에 끌어다 놓는 것과 같은 편집기 업로드로 넣는다. File 로 받아 와야 한다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 카카오 톡스토어 판매자센터(`shopping-seller.kakao.com`) 상품 등록.
     *
     * 실측 2026-09-18. 기존 등록물 `793407891`(포도 설기 말랑이)의 상품 JSON 을 읽고, 새 등록 화면을 저장 없이
     * 채워 폼이 스스로 매긴 칸 상태가 전부 `ng-valid` 가 되는 것까지 봤다. Angular 20 운영 빌드라 폼 객체에
     * 닿지 않는다 — 칸마다 컴포넌트가 하나씩 있어(`formcontrolname`) 사람처럼 채운다. 글자는 치고, 목록
     * (`cu-dropdown`)은 펼쳐 고르고, 사진은 파일 칸에 넣는다(화면이 `/api/tstore/images` 로 올린다).
     *
     *  1. 카테고리를 골라야 원산지·부가세·인증 칸이 생긴다. 코드가 있으면 카테고리 API 이름으로 단계를
     *     누르고, 없으면 상품명을 치면 뜨는 AI 추천 카테고리의 [선택] 을 누른다.
     *  2. 상품정보고시는 설정 창에서 상품군을 고르고 칸마다 값을 치거나 `상품상세설명 참조` 를 체크한 뒤
     *     그 창의 [확인] 으로 폼에 넣는다 — 창 안에서만 쓰는 적용 단추다. 상품 [저장하기] 가 아니다.
     *  3. KC 인증번호는 [인증번호확인] 으로 KC 조회만 돌린다(모델명이 채워진다).
     *  4. 상세설명은 CKEditor 4 다. 편집기 사진 업로드와 같은 요청(`type=EDITOR`)으로 올려 그 주소로 넣는다.
     *  5. 배송은 판매자 배송비 템플릿을 고른다 — 조건부 무료 · A/S 안내문구가 따라온다.
     *
     * 같은 화면이 `/modify/<번호>` 로 판매중 상품을 연다. 등록 주소와 정확히 같아야 받는다.
     * [저장하기]·[상품정보 임시저장] 은 누르지 않는다. 확인창은 거절한다.
     */
    kakao: {
      label: "카카오 톡스토어",
      origin: "https://shopping-seller.kakao.com",
      pathPrefix: "/product/store-seller/insert",
      exactPath: true,
      noQuery: true,
      formSelector: "form",
      imageSlots: [],
      kakaoForm: {
        // 대표 1 + 추가 5.
        imageGroupKey: "kakao",
        maxImages: 6,
        formWaitMs: 40000,
        // 칸 하나(추천 카테고리·다음 목록·사진 업로드·KC 조회)가 반응할 때까지 기다리는 시간.
        stepWaitMs: 12000,
      },
      // 상세 이미지를 File 로 받아 와야 편집기 업로드로 톡스토어에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 떠리몰(샵바이 파트너어드민 · `partner.shopby.co.kr`).
     *
     * 실측 2026-09-11, 등록물 `132154869` 외 둘 + 목록 479개. 이 몰만 다른 것 넷:
     *
     *  1. ⭐ 폼이 **다른 도메인 iframe** 안의 React 앱이다
     *     (`partner-remote.shopby.co.kr/product/management/single/add`). 겉 주소는 껍데기다.
     *     원격 주소를 바로 열면 칸이 하나도 안 그려진다(라이브 실측 — 인증을 겉이 넘겨준다).
     *     그래서 겉을 열고 모든 프레임에 넣되, 일은 그 프레임에서만 한다(`frameUrlIncludes`).
     *     iframe 은 겉 로딩이 끝난 뒤에 붙으므로 서비스워커가 그 프레임부터 기다린다.
     *  2. 칸에 `name` 이 없다. 표의 줄 제목(`th`)이 유일한 손잡이다(`tableForm`).
     *  3. 분류·담당자·브랜드는 검색칸에 넣으면 뜨는 목록(`li`)에서 고른다.
     *  4. 상세설명은 Summernote 다. 그림 버튼 → 파일을 넣으면 몰이 자기 서버에 올리고 그
     *     주소로 그림을 넣는다. 남의 호스팅(diskn)을 쓰지 않는다 — ESM 에서 그 의존 때문에
     *     등록이 막혔다.
     *
     * 상품정보제공고시는 `등록` 을 누르면 **새 창**이 떠서 확장이 채우지 않는다.
     */
    thirtymall: {
      label: "떠리몰",
      origin: "https://partner.shopby.co.kr",
      pathPrefix: "/product/add",
      allFrames: true,
      frameUrlIncludes: "/product/management/single/add",
      frameWaitMs: 30000,
      formSelector: "body",
      // 칸이 생겨야 준비된 것이다. 이 앱은 로딩이 끝나고도 몇 초 뒤에 칸을 그린다.
      readySelector: 'input[data-cy="productName"]',
      formWaitMs: 30000,
      tableForm: {
        pickWaitMs: 6000,
        images: [
          { key: "main", row: "대표이미지" },
          // 칸이 처음엔 없다. `이미지 추가` 를 누를 때마다 파일 칸이 하나씩 생긴다(실측).
          { key: "additional", row: "추가이미지", addLabel: "이미지 추가", max: 9 },
          { key: "list", row: "리스트 이미지" },
        ],
        summernote: { row: "상품 상세", radio: "USE_CONFIG_VALUE", uploadWaitMs: 15000 },
      },
      // 상세 이미지를 File 로 받아 와야 편집기에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
    },
    /**
     * 보리보리(셀러클럽 · TRICYCLE).
     *
     * 실측 2026-09-11, 등록물 `435316017`. 이 몰만 다른 것 셋:
     *
     *  1. **한 백오피스에 몰이 둘이다** — 하프클럽(`1`) · 보리보리(`2`). 화면이
     *     **하프클럽으로 열린다.**
     *  2. ⭐⭐ **사이트가 분류의 방아쇠다.** 하프클럽이면 1단이 패션 17개, 보리보리면
     *     유아동·완구·문구 39개로 통째로 바뀐다. `siteCd` 를 먼저 넣지 않으면 우리 분류
     *     (`241 문구/팬시`)가 목록에 **아예 없다.**
     *  3. **`<form>` 밖에 칸이 있다.** `name` 은 다 있어 선택자로 닿는다. 그래서
     *     `formSelector` 는 `body` 로 두고 화면이 그려졌는지는 `readySelector` 로 본다.
     *
     * 등록은 네 단계(코드생성 → 상품정보생성 → 상세정보 → 승인요청)다. 상세설명·고시·
     * 원산지는 **저장 뒤에야** 칸이 생긴다 — 확장은 1단계까지만 채운다.
     */
    boribori: {
      label: "보리보리",
      origin: "https://seller-club.co.kr",
      pathPrefix: "/product/productRegister",
      // 칸이 폼 밖에 있다. 라디오를 문서 전체에서 찾게 넓은 표식을 쓴다.
      formSelector: "body",
      // 화면이 그려졌는지는 이걸로 본다. 백오피스가 느려서 넉넉히 기다린다.
      readySelector: '[name="siteCd"]',
      formWaitMs: 20000,
      /**
       * ⚠️ **순서가 곧 실행 순서다.** 사이트 → 분류 1·2·3단이 먼저다.
       * 계단식이라 앞 단을 고르기 전에 뒤 단을 건드리면 목록이 비어 아무것도 안 들어간다.
       */
      selectorFields: [
        { key: "site", selector: '[name="siteCd"]', label: "사이트(보리보리)", waitMs: 2500 },
        { key: "category1", selector: '[name="stdCtgrNo1"]', label: "분류 1단", waitMs: 2500 },
        { key: "category2", selector: '[name="stdCtgrNo2"]', label: "분류 2단", waitMs: 2500 },
        { key: "category3", selector: '[name="stdCtgrNo3"]', label: "분류 3단", waitMs: 1500 },
        // 필수이고 **우리가 정하는 코드**다. 옆에 중복체크 버튼이 있다.
        { key: "sellerCode", selector: '[name="prdCd"]', label: "업체상품코드" },
        // ⚠️ 신규 화면에서는 잠겨 있는 때가 있다. 그러면 경고가 남고 사람이 고른다.
        { key: "md", selector: '[name="mdNo"]', label: "담당MD" },
        { key: "name", selector: '[name="prdNm"]', label: "상품명" },
        { key: "brandGroup", selector: '[name="prdGroupNm"]', label: "상세브랜드" },
        { key: "brand", selector: '[name="brandNm"]', label: "브랜드" },
        { key: "listPrice", selector: '[name="normPrc"]', label: "정상가" },
        { key: "salePrice", selector: '[name="selPrc"]', label: "판매가" },
        { key: "marginRate", selector: '[name="mrgnRt"]', label: "마진율" },
        { key: "optionName", selector: '[name="optItemNm1"]', label: "옵션 이름" },
        { key: "optionValue", selector: '[name="optItemVal1"]', label: "옵션 값" },
        { key: "decoWord", selector: '[name="decoWord"]', label: "수식어" },
        { key: "tags", selector: '[name="prdTag"]', label: "상품태그" },
      ],
      imageFileInputs: [
        { key: "representative", label: "대표이미지", selector: 'input[name="uploadImgMain"]' },
        { key: "additional", label: "추가이미지", selector: 'input[name="uploadImgAdd"]' },
      ],
      // ⚠️ `detailHost` 를 두지 않는다. 상세설명 칸은 저장 뒤에야 생겨서 이번 회차에
      // 넣을 곳이 없다 — 남의 몰 호스팅에 미리 올려 둘 이유도 없다(ESM 에서 배운 것).
    },
    /**
     * ESM Plus — **G마켓과 옥션을 한 번에** 등록한다.
     *
     * 실측 2026-09-11(빈 폼 `item.esmplus.com/goods/new`). 지금까지 붙인 몰과
     * 근본이 다르다:
     *
     *  1. **`<form>` 도 `name` 도 `id` 도 없다.** Next.js + React 라 `id` 는 React
     *     `useId` 가 만든 `:r0:` 이고 렌더마다 바뀐다. 네이티브 `<select>` 도 0개다.
     *     유일한 손잡이가 화면에 찍힌 **섹션 제목**이라 `sectionForm` 을 쓴다.
     *  2. **고시가 일반 칸과 같은 블록이다.** `상품군` 을 고르면 15줄이 같은
     *     `div.box__filter-item` 으로 그려진다 — `noticeSection` 이 필요 없다.
     *  3. **상세설명이 그냥 textarea 다.** SmartEditor 도 iframe 도 없다. `HTML 작성`
     *     탭을 누르면 `textarea.box__board-textarea` 가 나온다.
     *
     * 판매사이트(G마켓·옥션) 체크박스는 둘 다 켜진 채로 열린다 — 건드리지 않는다.
     * 배송(택배사·발송정책·출고지·배송비·반품지)도 계정 템플릿으로 이미 차 있다.
     */
    esmplus: {
      label: "ESM Plus(G마켓·옥션)",
      origin: "https://item.esmplus.com",
      pathPrefix: "/goods/new",
      // `<form>` 이 없다. 화면이 그려졌는지만 보는 표식으로 쓴다.
      formSelector: "main.box__wrap",
      /**
       * ⚠️ 이 화면은 `load` 뒤에도 **8~10초** 더 지나야 칸이 그려진다(라이브 실측).
       * 껍데기(`main.box__wrap`)만 보고 진행하면 칸이 하나도 없어 전부 실패한다.
       * 그래서 칸 하나가 실제로 생길 때까지 기다린다.
       */
      readySelector: "div.box__filter-item",
      formWaitMs: 25000,
      sectionForm: {
        itemSelector: "div.box__filter-item",
        headSelector: ".box__filter-head",
        contentSelector: ".box__filter-content",
        inputSelector: "input.form__input, textarea",
        dropdownSelector: "div.box__dropdown",
        openerSelector: "button.button__opener",
        // ⚠️ `li` 가 아니라 이 버튼을 눌러야 한다. li 클릭은 아무 일도 안 일어난다.
        optionSelector: "button.button__option",
        labelSelector: "label.form__label",
      },
      sectionCategory: {
        section: "카테고리",
        queryInput: 'input.form__input[placeholder*="카테고리"]',
        searchButton: "button.button__search",
        waitMs: 2500,
      },
      /**
       * 상세설명.
       *
       * ⭐ **ESM 자체 업로드가 주 경로다.** 예전엔 키즈노트(diskn)에 먼저 올려 주소를
       * 받아 HTML 로 넣었는데, 키즈노트 로그인이 풀리면 ESM 등록이 통째로 막혔다
       * (사장님 지적 2026-09-11: "esm 인데 왜 키즈노트를 쓰냐"). 남의 몰 세션이 우리
       * 등록을 막는 구조라 버렸다.
       *
       * `이미지 업로드` 탭 안에 전용 파일 칸이 있다(라이브 실증: 넣으니 안내 문구가
       * "등록된 이미지가 없습니다" → "등록된 이미지가 있습니다"로 바뀌었다).
       * ⚠️ 파일 칸 이름이 상품이미지와 똑같은 `btnSelectFile` 이라 문서 전체에서 찾으면
       * 대표이미지 칸을 집는다. 반드시 `div.box__board` 안에서 찾는다.
       */
      sectionDetail: {
        tabSelector: "ul.list__tab-board button.button__tab",
        /** 주 경로 — 파일을 직접 올린다. */
        uploadTabLabel: "이미지 업로드",
        uploadBoardSelector: "div.box__board",
        uploadFileSelector: "input.form__file",
        uploadDoneText: "등록된 이미지가 있습니다",
        /** 대비 경로 — 이미 몰이 읽을 수 있는 주소일 때만 쓴다. */
        tabLabel: "HTML 작성",
        textareaSelector: "textarea.box__board-textarea",
      },
      /** 상세 이미지를 File 로 받아 와야 몰에 올릴 수 있다. */
      detailSelfUpload: { editorTab: null },
      // 칸이 하나뿐인데 `multiple` 이다. 대표·추가를 한 번에 넣고 첫 장이 대표가 된다.
      sectionImages: {
        groupKey: "esmplus",
        label: "상품이미지",
        fileInputSelector: "input.form__file",
        max: 15,
      },
      /**
       * 화면을 덮는 안내 팝업을 닫는다(사장님 요청 2026-09-11).
       *
       * 실물 예: "[G kiditem / A kiditem] 이벤트에 참여중입니다 … [확인]".
       * 덮여 있는 동안에는 우리 클릭이 전부 그 창으로 먹어서 폼이 안 채워진다.
       *
       * ⚠️ 판단은 **버튼 글자로만** 한다. 글자 있는 버튼이 하나뿐이고 그게 `확인`·`닫기`
       * 일 때만 누른다 — 확인/취소가 같이 있는 '되묻는 창' 은 사람의 결정이라 건드리지
       * 않는다. 이 안내창은 본문에 '등록' 이 들어 있어서(신규로 등록되는 상품은 …)
       * 본문으로 거르면 오히려 못 닫는다.
       */
      dismissDialogs: {
        label: "안내 팝업",
        /** 이 글자를 누른다. */
        closeLabels: ["확인", "닫기"],
        /**
         * 창 안에서 '고르라는 자리' 인지 판단할 낱말들.
         *
         * 여기 있는 낱말 중 닫기류가 아닌 것이 하나라도 창에 있으면 손대지 않는다 —
         * `취소` 가 같이 있으면 되묻는 창이고, 그건 사람의 결정이다.
         */
        actionWords: [
          "확인", "닫기", "취소", "등록", "저장", "삭제", "전송", "제출",
          "계속", "다음", "이전", "예", "아니오", "등록하기", "저장하기",
        ],
        /** 묻는 말로 끝나는 창은 닫기류만 있어도 사람의 결정이다. */
        questionPattern: "하시겠습니까|하시겠어요|계속할까요|진행할까요",
        /** 안내 문구가 이만큼은 있어야 '읽으라고 띄운 창' 이다. */
        minMessageLength: 10,
        retries: 4,
        waitMs: 700,
      },
      // ⚠️ `detailHost` 를 두지 않는다. 두면 키즈노트에 먼저 올리려다 그 몰 로그인이
      // 풀렸을 때 ESM 등록까지 막힌다 — 실제로 그렇게 막혔다(라이브 2026-09-11).
    },
    icecream: {
      label: "아이스크림몰",
      origin: "https://po.i-screammall.co.kr",
      pathPrefix: "/goods/temporaryGeneralGoods",
      // 폼이 여럿이라 '이 화면이 맞나' 를 볼 대표 폼만 지정한다.
      formSelector: "#goodsInfo",
      multiForm: true,
      categoryFields: { code: "stdCtgNo", path: "stdCtgHierarchy" },
      noticeSection: {
        owner: "announcementInfo",
        open: "getAnnoucementItemInfo",
        tableId: "announcementInfoTable",
      },
      // 대표 한 장. 추가 이미지 칸(`imgInfo[N][img]`)은 `+` 로 늘려야 해서 사람에게 넘긴다.
      //
      // ⚠️ `imageFileInput`(단수)은 `form.imageUrls` 를 보는데 이 몰 빌더는
      // `imageGroups` 로 보낸다. 그래서 그룹 방식을 쓴다 — 단수로 뒀다가 이미지가
      // 통째로 안 들어갔다(라이브 확인 2026-09-11).
      imageFileInputs: [
        { key: "representative", label: "대표이미지", selector: "input[name='baseImageFile']" },
      ],
      /**
       * 추가 이미지. 칸이 처음엔 없고 `+` 를 눌러야 하나씩 생긴다.
       *
       * 한 번 누르면 `imgInfo[N][img]`(파일)과 `imgInfo[N][seq]`(전시 순서, 자동 1·2·3)
       * 가 함께 생긴다. 몰 안내대로 아홉 장까지다(실측 2026-09-11).
       */
      imageRepeat: {
        section: "imageInfo",
        addLabel: "+",
        namePattern: "imgInfo[{i}][img]",
        groupKey: "additional",
        max: 9,
        label: "추가이미지",
      },
      /**
       * 상세설명이 네이버 SmartEditor 2 다.
       *
       * 뒷단 textarea 에만 쓰면 제출할 때 에디터 내용으로 덮인다. 편집면은
       * `iframe(스킨) > iframe#se2_iframe` 이고 same-origin 이라 직접 쓸 수 있다.
       *
       * ⭐ 스킨 iframe 이 **두 개**다(본문·예스24 전용). 라이브 확인 2026-09-11 기준
       * 본문이 **두 번째**라, 순서로 집으면 예스24 쪽에 들어간다. 반드시 상세설명
       * 구역(`#detailInfo`) 안에서 찾는다.
       */
      detailSmartEditor: {
        section: "detailInfo",
        target: "detailHtmlEditor",
        toSourceSelector: "button.se2_to_html",
        sourceSelector: "textarea.se2_input_htmlsrc",
        toEditorSelector: "button.se2_to_editor",
        upload: { endpoint: "/common/file/uploadImgEditor.do", field: "UPLOAD_FILE", imgWidth: 900 },
      },
      // 상세 이미지를 File 로 받아 와야 몰에 올릴 수 있다.
      detailSelfUpload: { editorTab: null },
      detailHtmlTarget: "detailHtmlEditor",
      /**
       * 상세설명 이미지를 올릴 곳.
       *
       * 우리 산출물은 로컬 MinIO 주소라 몰이 못 읽는다. 도매꾹·티처몰·11번가와 같은
       * 저장소를 쓴다 — 실측 등록물도 `kiditem.diskn.com` 주소였다.
       * ⚠️ 이걸 빼먹었더니 `detailHtml` 이 빈 채로 상세설명이 통째로 건너뛰어졌다
       * (라이브 2026-09-11).
       */
      detailHost: "kidsnote",
    },

    teacherville: {
      label: "티처몰",
      origin: "https://shop.teacherville.co.kr",
      pathPrefix: "/selleradmin/goods/regist",
      formSelector: "#goodsRegist",
      /**
       * 사진 칸에 이름이 없다. 몰 서버에 먼저 올리고 그 주소를 표에 넣는다.
       *
       * 화면의 두 버튼이 서로 다르게 동작한다(`admin-goodsReady.js` 실측 2026-09-10):
       *  · 줄별 `일괄등록`(`.batchImageRegist`)은 상품번호를 요구한다 —
       *    `if (gl_goods_seq == null) alert('이미지를 삭제 후 재 등록 …')`.
       *    ⚠️ 네이티브 alert 이라 뜨는 순간 렌더러가 통째로 멈춘다. 누르지 않는다.
       *  · `여러 컷 일괄등록`(`.batchImageMultiRegist`)은 **상품번호 없이 열린다.**
       *    팝업이 `uploadImg[]` 를 모아 두었다가 저장할 때 `done()` 으로 등록화면
       *    표에 채운다("이미지가 임시저장 되었습니다").
       *
       * 팝업을 열지 않는다. 확장이 여는 `window.open` 은 팝업 차단에 걸리고
       * (라이브 확인: 클릭해도 핸들이 null), 팝업이 하는 일은 결국 셋뿐이다 —
       * 파일 올리기, 줄 추가, 숨은 칸 채우기. 그 셋을 여기서 직접 한다.
       *
       * 올리는 곳은 팝업이 쓰는 그 엔드포인트다. 한 번 올리면 서버가 일곱 크기를
       * 다 만들어 둔다(라이브 확인: `…large/view/list1/list2/thumbView/thumbCart/
       * thumbScroll.jpg` 전부 200). 크기 이름은 칸 이름(`largeGoodsImage[]`)에서
       * 그대로 읽으므로 목록을 적어두지 않는다.
       */
      imageSlots: [],
      imageUpload: {
        endpoint: "/selleradmin/goods_process/upload_file_multi",
        field: "Filedata",
        groupKey: "photos",
        label: "상품 사진",
        tableId: "goodsImageTable",
        addButtonId: "goodsImageAdd",
        emptyRowSelector: "tr.no_goods_image",
        slotSuffix: "GoodsImage[]",
      },
      /**
       * 상품정보고시 품목이 방아쇠다. 고르면 그 품목의 칸이 생긴다.
       *
       * 실측 등록물 둘 다 `(40)기타 재화` 였는데, 그 품목이 만들어 주는 줄은
       * 다섯뿐이고 등록물은 서른아홉 줄을 들고 있다. 나머지는 아래 `grow` 가
       * '+' 를 눌러 만든다 — 제목 칸도 자유 입력이라 우리가 이름을 써넣는다.
       */
      dynamic: { trigger: "goodsSubInfo", waitPrefix: "subInfoTitle[" },
      groupInputs: [
        {
          key: "noticeTitles",
          selector: '[name="subInfoTitle[]"]',
          grow: { buttonId: "goodsSubInfoAdd", maxClicks: 60 },
        },
        { key: "noticeDescs", selector: '[name="subInfoDesc[]"]' },
      ],
      /**
       * 분류는 레이어를 열어 7단 목록에서 고르고 '카테고리 연결'을 누른다.
       *
       * 값이 코드(`00010003`)라 보이는 이름으로 찾는다. 코드에 상위 코드가 그대로
       * 들어 있어서, 마지막 단 하나만 골라도 몰이 상위까지 함께 연결한다
       * (라이브 확인 2026-09-10: 학급운영만 골랐는데 `0001` 과 `00010003` 둘이 붙었다).
       * 실측 등록물 둘 다 이 두 줄이었다.
       */
      categoryConnect: {
        openButtonId: "categoryConnectPopup",
        formName: "categoryConnectFrm",
        levelPrefix: "category",
        levels: 7,
        connectButtonId: "categoryConnect",
        stepWaitMs: 1400,
        connectWaitMs: 2500,
      },
      /**
       * 상세설명은 위지윅을 거치지 않아도 된다.
       *
       * `등록` 버튼이 다음 에디터 팝업을 열지만, 제출할 때 값을 옮기는
       * `readyEditorForm()` 은 **폼 안의 `.daumeditor` 만** 찾는다. 등록화면에는
       * 그런 요소가 없다(라이브 확인 2026-09-10: 문서 전체에 0개). 그래서 숨은
       * `contents` 를 직접 쓰면 그대로 제출된다.
       *
       * 다만 화면에 보이는 것은 옆의 미리보기 칸이라 그것도 같이 맞춰 준다.
       * 안 그러면 값은 들어갔는데 비어 보여 사람이 에디터를 열어 덮어쓴다.
       */
      detailPreviewSelector: "#goodscontents_view",
      /**
       * 상세설명 이미지를 올릴 곳.
       *
       * 우리 렌더 산출물은 `localhost:9000`(로컬 MinIO)이라 몰도 구매자도 못 읽는다.
       * 이걸 빼면 넣을 주소가 없어 상세설명 단계가 통째로 건너뛰어지고, 상품 설명이
       * 빈 채로 남는다. 실측 등록물 둘 다 `kiditem.diskn.com` 주소를 쓰고 있어서
       * 도매꾹과 같은 저장소를 그대로 쓴다 — 탭을 열지 않고 fetch 로 끝난다.
       */
      detailHost: "kidsnote",
    },
    "11st": {
      label: "11번가",
      origin: "https://soffice.11st.co.kr",
      /**
       * 셀러오피스는 메뉴를 번호로 연다. `123124025` 가 '신규상품 등록'이다.
       * 접두어를 `/view/` 로만 두면 아무 메뉴에나 값을 넣을 수 있으니 번호까지 건다.
       */
      pathPrefix: "/view/123124025",
      /**
       * ⭐ 폼이 **iframe 안**에 있다. 겉은 셀러오피스 껍데기고, 실제 등록 화면은
       * `/pages/product-reg/index.html`(Vue 앱)이다. 바깥 문서에 값을 넣으면 아무
       * 칸도 못 찾는다(라이브 확인 2026-09-10).
       */
      allFrames: true,
      formSelector: "#app.l-content--product",
      imageSlots: [],
      dynamic: null,
      /**
       * ⭐ 카테고리가 방아쇠다. 고르기 전에는 상품정보 제공고시 블록이
       * `display:none` 이라 유형을 못 넣는다(라이브 확인: 고른 직후 나타났다).
       * 그래서 이 몰만 분류를 맨 앞에서 끝낸다.
       */
      categoryFirst: true,
      /**
       * 분류는 검색해서 고른다. 올웨이즈와 비슷하지만 두 가지가 다르다.
       *  1. 경로 구분자가 **공백 없는 `>`** 다 — `문구/사무용품>디자인/팬시용품>기능성 팬시`.
       *  2. **띄어쓴 이름으로 검색하면 0건**이다(`기능성 팬시` → 없음, `팬시` → 20건).
       *     그래서 마지막 단의 첫 낱말만 넣고, 결과에서 전체 경로가 똑같은 것을 누른다.
       */
      categorySearch: {
        inputSelector: '#section-category input[placeholder="카테고리명을 입력해주세요"]',
        optionSelector: "#section-category .c-dropdown li button",
        joiner: ">",
        queryFirstWord: true,
        waitMs: 2200,
      },
      /**
       * 이 화면은 이름도 id도 거의 없다. 라디오 이름이 `nameRadio17207` 처럼 **런타임
       * 해시**라 그대로 쓰면 다음 배포에 통째로 깨진다(라이브 실측 2026-09-10).
       *
       * 대신 마크업이 `블록(#section-*) > .b-box__row > .b-box__title | .b-box__cont`
       * 로 규칙적이다. **블록 id + 행 제목**으로 잡으면 해시에 걸리지 않는다.
       */
      rowFields: [
        { key: "productName", section: "section-name", row: "상품명", label: "상품명" },
        { key: "promoText", section: "section-name", row: "홍보문구", label: "홍보문구" },
        { key: "salePrice", section: "section-option", row: "판매가", label: "판매가" },
        { key: "consumerPrice", section: "section-option", row: "권장 소비자가", label: "권장 소비자가" },
        { key: "stock", section: "section-option", row: "재고수량", label: "재고수량" },
        { key: "sellerPrdCd", section: "section-primary-info", row: "판매자 상품코드", label: "판매자 상품코드" },
      ],
      /** 값이 계정마다 다른 번호라 **보이는 글자**로 고른다(배송 템플릿이 그렇다). */
      rowOptions: [
        { key: "salePeriod", section: "section-sales-info", row: "판매기간", label: "판매기간" },
        { key: "deliveryTemplate", section: "section-delivery", row: "템플릿 목록", label: "배송정보 템플릿" },
      ],
      /** 고시 유형만 진짜 id 를 갖고 있다. 분류를 고른 뒤라야 보인다. */
      selectorFields: [
        { key: "noticeType", selector: "#prdInfoTypeOpt", label: "상품정보 제공고시 유형", waitMs: 1500 },
      ],
      /** 브랜드는 필수인데 우리 상품은 브랜드가 없다. '브랜드 없음'으로 통과시킨다. */
      selectorChecks: [
        { key: "noBrand", selector: "#lbCheckNobrand01", label: "브랜드 없음" },
      ],
      /**
       * 이미지는 **창을 열어서** 넣는다.
       *
       * 파일 칸이 화면에 붙어 있지 않다. `+` 를 누르면 '이미지 불러오기' 창이 뜨고
       * 파일 칸은 그 창 안에 있는데, 창 id 가 `dialog-8c1a040468632` 처럼 매번 다르다
       * (라이브 실측 2026-09-10). 그래서 열린 창에서 찾는다.
       *
       * ⚠️ 같은 이름으로 시작하는 줄이 둘이다 — `추가이미지` 라디오 줄과 사진 줄.
       *    제목만 보면 라디오 줄을 집어서 `+` 를 못 찾는다. `+` 가 있는 줄만 고른다.
       */
      imageDialogs: [
        { key: "representative", section: "section-image", row: "대표 이미지", label: "대표 이미지" },
        { key: "additional", section: "section-image", row: "추가이미지", label: "추가 이미지" },
      ],
      /**
       * 상세설명은 `HTML` / `11에디터` 라디오인데 **HTML 이 기본 선택**이라 그대로
       * textarea 에 넣으면 된다(라이브 확인 2026-09-10). 이름이 없어 선택자로 잡는다.
       */
      detailSelector: "#section-description textarea",
      detailHost: "kidsnote",
      /**
       * ⚠️ 광고 블록(`#section-advertisement`)에는 포커스클릭·리스팅광고가 있고
       * 켜지면 셀러캐시에서 돈이 나간다. 이 몰의 어떤 단계도 그 블록을 건드리지 않는다.
       * 규칙은 시험(`mall-form-11st.test.mjs`)이 지킨다.
       */
      forbiddenSelector: "#section-advertisement",
    },
  };

  /**
   * 상세 이미지를 올릴 곳.
   *
   * 우리 키즈노트 상점의 상품 첨부 저장소다. 등록화면 안에서는 `up_fdisk` iframe
   * 으로 보이지만, 화면 없이도 된다 — 라이브로 확인한 절차(2026-09-10):
   *
   *  1. 등록화면을 GET 하면 새 상품번호(`pno`)가 HTML 안에 실려 온다.
   *  2. 그 `pno` 로 멀티파트를 POST 하면 파일이 붙는다.
   *  3. 첨부 목록을 GET 하면 공개 CDN 주소가 나온다.
   *
   * 나오는 주소는 `kids-wi.kakaocdn.net/dn/...` 이고 CORS 까지 열려 있어 어느
   * 몰에서나 읽힌다(올린 파일과 크기·바이트가 일치하는 것으로 확인).
   *
   * 상품은 만들어지지 않는다. `pno` 는 등록화면이 발급하는 빈 번호일 뿐이고
   * 우리는 저장만 하고 상품 등록은 하지 않는다.
   */
  const DETAIL_HOSTS = {
    /**
     * 온채널은 자기 서버에 올린다. 남의 호스팅도, 유료 서비스도 필요 없다.
     *
     * 상품등록 화면 안의 `img_form` 이 쏘는 곳이고, 응답이 곧 공개 주소다
     * (라이브 확인 2026-09-10). 실제 등록물의 `contents` 도 이 주소를 쓴다.
     */
    onch: {
      origin: "https://www.onch3.co.kr",
      uploadPath: "/access/img_upload_access.php",
      uploadField: "img",
      label: "온채널 이미지 서버",
    },
    kidsnote: {
      origin: "https://shop.kidsnote.com",
      registerPath: "/_manage/?body=product@product_register",
      uploadPath: "/_manage/",
      // 첨부 목록. `pno` 만 붙이면 된다.
      listPath: "/_manage/?body=product@product_file.frm&filetype=3&stat=1&content_id=content2",
      filetype: "3",
      label: "키즈노트 첨부 저장소",
      // 이 저장소는 키즈노트 관리자 세션으로만 열린다. 로그아웃이면 어느 몰 상세도 못 올린다.
      loginLabel: "키즈노트 관리자",
    },
  };

  /** 첨부 목록에서 올라간 파일 주소를 집는 자리. */
  const HOSTED_URL = /https?:\/\/[A-Za-z0-9.-]*kakaocdn\.net\/dn\/[^"'\s<>()]+/g;

  /** 올릴 때 쓸 파일명. 저장소가 확장자를 보므로 없으면 붙여 준다. */
  function detailFileName(sourceUrl, mime) {
    let base = "detail";
    try { base = new URL(sourceUrl).pathname.split("/").pop() || base; } catch { /* 주소가 아니면 기본값 */ }
    if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
    const extension = String(mime || "").includes("png") ? "png" : "jpg";
    return `${base}.${extension}`;
  }

  /**
   * 상세설명에 넣을 이미지 한 줄.
   *
   * `referrerpolicy="no-referrer"` 가 핵심이다. 우리 첨부 저장소가 쓰는 카카오 CDN
   * 은 리퍼러로 핫링크를 막는다 — 키즈노트 화면에서는 보이고 도매꾹 화면에서는
   * 깨진다(라이브 확인 2026-09-10: 같은 주소가 referrer 있으면 BLOCKED, 없으면 OK).
   * 리퍼러를 보내지 않으면 통과하고, 이 속성은 에디터 제출을 거쳐 `itemMemo[Item]`
   * 까지 그대로 남는다.
   *
   * 이미 읽히는 주소(디스크엔 등)에도 붙여서 나쁠 것이 없다. 리퍼러를 요구하는
   * 호스트는 없다.
   */
  function detailImageHtml(url, paragraph) {
    const img = `<img referrerpolicy="no-referrer" src="${url}">`;
    return paragraph ? `<center><p>${img}</p></center>` : `<center>${img}</center>`;
  }

  /** 이미 몰이 읽을 수 있는 주소인가. */
  function isMallReadable(url) {
    return /kakaocdn\.net|diskn\.com|onch3\.co\.kr|coupangcdn\.com/.test(String(url || ""));
  }

  function specFor(mall) {
    const spec = SPECS[mall];
    if (!spec) throw new Error(`지원하지 않는 몰입니다 — ${mall}`);
    return spec;
  }

  /** 폼 지시가 그 몰의 등록 주소를 가리키는지 본다. 임의 페이지에 값을 넣지 않게 하는 문지기다. */
  function assertRegisterUrl(spec, value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch {
      throw new Error(`${spec.label} 상품등록 주소가 아닙니다.`);
    }
    if (url.origin !== spec.origin || !url.pathname.startsWith(spec.pathPrefix)) {
      throw new Error(`${spec.label} 상품등록 주소가 아닙니다.`);
    }
    if (spec.exactPath && url.pathname.replace(/\/+$/, "") !== spec.pathPrefix) {
      throw new Error(`${spec.label} 상품등록 주소가 아닙니다.`);
    }
    // 등록과 수정이 같은 주소를 쓰는 몰(신세계)은 쿼리가 붙은 주소를 수정 화면으로 본다.
    if (spec.noQuery && url.search) {
      throw new Error(`${spec.label} 상품등록 주소가 아닙니다. 기존 상품 수정 화면에는 채우지 않습니다.`);
    }
    // 해시 라우트 몰(스마트스토어)은 문서가 하나다. 해시가 등록 화면이 아니면 수정·목록 화면이다.
    if (spec.hash && (url.pathname !== spec.pathPrefix || url.hash !== spec.hash)) {
      throw new Error(`${spec.label} 상품등록 주소가 아닙니다. 기존 상품 수정 화면에는 채우지 않습니다.`);
    }
    return url.toString();
  }

  function normalizeForm(spec, value) {
    if (!value || typeof value !== "object") throw new Error("폼 데이터가 없습니다.");
    const url = assertRegisterUrl(spec, value.url);

    const fields = {};
    for (const [name, fieldValue] of Object.entries(value.fields || {})) {
      if (typeof name !== "string" || !name) continue;
      fields[name] = fieldValue === null || fieldValue === undefined ? "" : String(fieldValue);
    }
    const radios = {};
    for (const [name, radioValue] of Object.entries(value.radios || {})) {
      if (typeof name === "string" && name) radios[name] = String(radioValue);
    }
    // 체크박스는 두 모양을 받는다. 키즈노트는 이름 배열, 도매꾹은 이름→불리언 맵이다.
    const checks = {};
    const rawChecks = value.checks;
    if (Array.isArray(rawChecks)) {
      for (const name of rawChecks) if (typeof name === "string") checks[name] = true;
    } else if (rawChecks && typeof rawChecks === "object") {
      for (const [name, on] of Object.entries(rawChecks)) checks[name] = Boolean(on);
    }

    // 폼이 여럿인 몰(아이스크림몰)은 폼 id 까지 받는다.
    const multiFormFields = {};
    if (spec.multiForm && value.formFields && typeof value.formFields === "object") {
      for (const [formId, values] of Object.entries(value.formFields)) {
        if (!values || typeof values !== "object") continue;
        const box = {};
        for (const [name, raw] of Object.entries(values)) {
          if (typeof name === "string" && name) box[name] = raw == null ? "" : String(raw);
        }
        if (Object.keys(box).length > 0) multiFormFields[formId] = box;
      }
    }
    const multiFormRadios = {};
    const multiFormChecks = {};
    if (spec.multiForm) {
      for (const [formId, values] of Object.entries(value.formRadios || {})) {
        if (values && typeof values === "object") multiFormRadios[formId] = { ...values };
      }
      for (const [formId, values] of Object.entries(value.formChecks || {})) {
        if (values && typeof values === "object") multiFormChecks[formId] = { ...values };
      }
    }
    const category = value.category && typeof value.category === "object"
      ? { code: String(value.category.code || ""), path: String(value.category.path || "") }
      : null;
    const notice = value.notice && typeof value.notice === "object"
      ? {
        itemCode: String(value.notice.itemCode || ""),
        safeYn: value.notice.safeCertiTgtYn === "Y" ? "Y" : "N",
        rows: (Array.isArray(value.notice.rows) ? value.notice.rows : [])
          .filter((row) => row && typeof row.title === "string" && row.title)
          .map((row) => ({ title: row.title, value: row.value == null ? "" : String(row.value) })),
        radios: {
          ...(value.notice.kcCertified ? { "072": String(value.notice.kcCertified) } : {}),
          ...(value.notice.safeCertiTgtYn
            ? { safeCertiTgtYn: String(value.notice.safeCertiTgtYn) }
            : {}),
        },
      }
      : null;

    const slots = new Set(spec.imageSlots);
    const fileUploads = (Array.isArray(value.fileUploads) ? value.fileUploads : [])
      .filter((entry) => entry && slots.has(entry.name) && typeof entry.url === "string");
    const imageUploads = (Array.isArray(value.imageUploads) ? value.imageUploads : [])
      .filter((entry) => entry && typeof entry.url === "string")
      .map((entry, index) => ({ name: spec.imageSlots[index], url: entry.url }))
      .filter((entry) => entry.name);

    return {
      url,
      fields,
      radios,
      checks,
      multiFormFields,
      multiFormRadios,
      multiFormChecks,
      category,
      notice,
      fileUploads: fileUploads.length > 0 ? fileUploads : imageUploads,
      detailHtmlTarget: typeof value.detailHtmlTarget === "string" ? value.detailHtmlTarget : "",
      promoHtml: typeof value.promoHtml === "string" ? value.promoHtml : "",
      selectorChecks: (() => {
        const out = {};
        for (const [key, on] of Object.entries(value.selectorChecks || {})) out[key] = Boolean(on);
        return out;
      })(),
      /** 분류 경로들. `['*완구/선물/행사용품','완구/선물','팬시/놀이완구']` 모양. */
      categoryPaths: (Array.isArray(value.categoryPaths) ? value.categoryPaths : [])
        .filter((path) => Array.isArray(path) && path.length > 0)
        .map((path) => path.map((part) => String(part))),
      /** 주소로 넣는 대표이미지. 칸 순서대로. */
      imageUrls: (Array.isArray(value.imageUrls) ? value.imageUrls : [])
        .map((url) => (typeof url === "string" ? url : "")),
      /** 파일 칸이 여럿인 몰용. 칸 키 → 이미지 주소들. */
      imageGroups: (() => {
        const out = {};
        for (const [key, list] of Object.entries(value.imageGroups || {})) {
          if (Array.isArray(list)) out[key] = list.filter((url) => typeof url === "string" && url);
        }
        // 칸 하나(`multiple`)에 대표·추가를 한 번에 넣는 몰(ESM Plus). 빌더는 `images`
        // 한 줄로 보낸다.
        //
        // ⚠️ 여기서 그룹으로 옮겨 두지 않으면 `imageSlotSpecs` 가 못 봐서 이미지를
        // 아예 내려받지 않는다 — 아이스크림몰에서 같은 실수로 이미지가 통째로 빠졌다.
        if (spec.sectionImages && Array.isArray(value.images)) {
          const list = value.images.filter((url) => typeof url === "string" && url);
          if (list.length > 0) out[spec.sectionImages.groupKey] = list;
        }
        return out;
      })(),
      selectorFields: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.selectorFields || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /** 블록 id + 행 제목으로 찾는 칸들(11번가). */
      rowFields: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.rowFields || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /**
       * 섹션 제목 → 값(ESM Plus).
       *
       * 이 몰은 `<form>` 도 `name` 도 `id` 도 없다. `id` 는 React `useId` 가 만든
       * `:r0:` 라 렌더마다 바뀐다 — 화면에 찍힌 **제목**이 유일한 손잡이다.
       * 같은 섹션에 칸이 여럿이면 `제목#순번` 으로 적는다.
       */
      sectionFields: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.sectionFields || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /** 섹션 제목 → 누를 라디오의 라벨 글자. */
      sectionRadios: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.sectionRadios || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /** 섹션 제목 → 고를 커스텀 드롭다운 항목의 보이는 글자. */
      sectionDropdowns: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.sectionDropdowns || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /**
       * 없어도 경고하지 않을 섹션(ESM Plus).
       *
       * 분류가 어느 인증 블록을 그릴지 정한다. 안 그려진 칸을 못 찾았다고 경고하면
       * 매번 거짓 경보가 떠서 진짜 경고가 묻힌다.
       */
      optionalSections: (Array.isArray(value.optionalSections) ? value.optionalSections : [])
        .filter((title) => typeof title === "string" && title),
      /** 검색해서 고르는 분류(ESM Plus). `{query, path}` 다. */
      sectionCategory: (value.category && typeof value.category === "object"
        && typeof value.category.path === "string" && value.category.path)
        ? { query: String(value.category.query || ""), path: String(value.category.path) }
        : null,
      /** 같은 방식인데 목록에서 **보이는 글자**로 고르는 것들. */
      rowOptions: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.rowOptions || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /**
       * 표의 줄 제목 → 값(떠리몰). 칸에 이름이 없어서 화면에 찍힌 줄 제목이 손잡이다.
       * 글자칸 · 라디오 값 · 목록(select)에서 고를 보이는 글자.
       */
      tableFields: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.tableFields || {})) {
          if (!key || entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      tableRadios: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.tableRadios || {})) {
          if (!key || entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      tableSelects: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.tableSelects || {})) {
          if (!key || entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      /** 검색해서 목록에서 고르는 칸들. 순서가 있다 — 분류가 다른 칸을 다시 그릴 수 있다. */
      tablePicks: (Array.isArray(value.tablePicks) ? value.tablePicks : [])
        .filter((entry) => entry && typeof entry.row === "string" && entry.row
          && typeof entry.pick === "string" && entry.pick)
        .map((entry) => ({
          row: entry.row,
          query: typeof entry.query === "string" && entry.query ? entry.query : entry.pick,
          pick: entry.pick,
        })),
      groups: (() => {
        const out = {};
        for (const [key, list] of Object.entries(value.groups || {})) {
          if (Array.isArray(list)) out[key] = list.map((entry) => String(entry ?? "")).filter(Boolean);
        }
        return out;
      })(),
      /** 같은 이름의 칸을 속성 값으로 가려 넣는 줄들(키드키즈 고시 `info`). 속성 값 → 값. */
      infoRows: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.infoRows || {})) {
          if (!key || entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
      detailUploads: (Array.isArray(value.detailUploads) ? value.detailUploads : [])
        .filter((entry) => entry && typeof entry.url === "string"),
      manualSteps: (Array.isArray(value.manualSteps) ? value.manualSteps : [])
        .filter((step) => typeof step === "string"),
      // 전용 페이지 함수로 채우는 몰(신세계·스마트스토어)의 값 묶음.
      ssg: spec.ssgForm ? normalizeSsgForm(value.ssg) : null,
      smartstore: spec.smartstoreForm ? normalizeSmartstoreForm(value.smartstore) : null,
      gsshop: spec.gsshopForm ? normalizeGsshopForm(value.gsshop) : null,
      lotteon: spec.lotteonForm ? normalizeLotteonForm(value.lotteon) : null,
      kakao: spec.kakaoForm ? normalizeKakaoForm(value.kakao) : null,
    };
  }

  /**
   * 카카오 톡스토어 폼 값. 페이지 함수에 그대로 넘어가므로 모양을 여기서 굳힌다.
   *
   * 상품명은 화면이 70자(글자 수)에서 자른다. 카테고리 코드는 세 자리씩 단계가 붙는 숫자다
   * (`102106101109` = 식품/유아동 › 완구/장난감/교구 › 교육/학습완구 › 클레이). 비면 AI 추천을 고른다.
   * 고시 값은 화면 줄 제목(앞부분) → 값이다. 값이 없는 줄은 `상품상세설명 참조` 로 둔다.
   */
  function normalizeKakaoForm(raw) {
    if (!raw || typeof raw !== "object") throw new Error("카카오 톡스토어 폼 데이터가 없습니다.");
    const text = (entry, max = 1000) => (entry === null || entry === undefined ? "" : String(entry))
      .replace(/\s+/g, " ").trim().slice(0, max);
    const amount = (entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    };

    const productName = [...text(raw.productName, 400).replace(/[<>]/g, "")].slice(0, 70).join("").trim();
    if (!productName) throw new Error("카카오 톡스토어 상품명이 없습니다.");
    const salePrice = amount(raw.salePrice);
    if (salePrice <= 0) throw new Error("카카오 톡스토어 판매가가 없습니다.");
    const categoryText = String(raw.categoryId ?? "").trim();
    const categoryId = /^\d{9,15}$/.test(categoryText) && categoryText.length % 3 === 0 ? categoryText : "";
    const stock = amount(raw.stock);

    const originTypes = ["국내산", "수입산", "혼합", "기타"];
    const origin = raw.origin || {};
    const originType = originTypes.includes(text(origin.type, 10)) ? text(origin.type, 10) : "수입산";

    const certNumber = text(raw.cert?.number, 60);
    const noticeValues = {};
    for (const [label, entry] of Object.entries(raw.notice?.values || {})) {
      const key = text(label, 60);
      const value = text(entry, 500);
      if (key && value) noticeValues[key] = value;
    }
    return {
      productName,
      categoryId,
      salePrice,
      stock: stock >= 1 ? Math.min(stock, 99999) : 999,
      origin: {
        type: originType,
        region: originType === "수입산" ? text(origin.region, 20) : "",
        country: originType === "수입산" ? text(origin.country, 30) : "",
      },
      cert: /^[A-Za-z0-9-]{4,40}$/.test(certNumber)
        ? { type: text(raw.cert?.type, 40) || "[어린이제품] 안전확인", number: certNumber }
        : null,
      notice: { group: text(raw.notice?.group, 40) || "어린이제품", values: noticeValues },
      deliveryTemplate: text(raw.deliveryTemplate, 60),
      brand: text(raw.brand, 30),
      manufacturer: text(raw.manufacturer, 30),
      sellerCode: text(raw.sellerCode, 50),
      affiliate: raw.affiliate === true,
    };
  }

  /**
   * 롯데ON 폼 값. 페이지 함수에 그대로 넘어가므로 모양을 여기서 굳힌다.
   *
   * 글자 수는 화면(`WebSquare.util.getStringByteSize`)과 같이 UTF-8 **바이트**로 센다(한글 3). 상품명 150,
   * 판매자내부상품번호 30. 모델명은 화면이 영문·숫자·`-_+/.` 만 받는다.
   */
  function normalizeLotteonForm(raw) {
    if (!raw || typeof raw !== "object") throw new Error("롯데ON 폼 데이터가 없습니다.");
    const text = (entry, max = 1000) => (entry === null || entry === undefined ? "" : String(entry)).trim().slice(0, max);
    const digits = (entry) => (/^\d+$/.test(String(entry ?? "")) ? String(entry) : "");
    const code = (entry, pattern) => (pattern.test(String(entry ?? "")) ? String(entry) : "");
    const amount = (entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    };
    const encoder = new TextEncoder();
    const cut = (entry, maxBytes) => {
      let out = "";
      for (const char of entry) {
        if (encoder.encode(out + char).length > maxBytes) break;
        out += char;
      }
      return out.trim();
    };

    const category = code(String(raw.category ?? "").trim().toUpperCase(), /^BC\d{8}$/);
    if (!category) throw new Error("롯데ON 표준카테고리 코드(예: BC55031100)가 없습니다.");
    const productName = cut(text(raw.productName, 400).replace(/[<>]/g, "").replace(/\s+/g, " "), 150);
    if (!productName) throw new Error("롯데ON 판매자상품명이 없습니다.");
    const salePrice = amount(raw.salePrice);
    if (salePrice <= 0) throw new Error("롯데ON 판매가가 없습니다.");
    const domestic = raw.origin?.typeCode === "DMST";

    const delivery = raw.delivery || {};
    const noticeValues = {};
    for (const [itemCode, entry] of Object.entries(raw.notice?.values || {})) {
      if (/^\d{4}$/.test(itemCode) && entry !== null && entry !== undefined) noticeValues[itemCode] = text(entry, 1000);
    }
    const purchase = raw.purchase || {};
    const maxQty = amount(purchase.maxQty);
    const periodDays = amount(purchase.periodDays);
    return {
      category,
      productName,
      salePrice,
      stockManaged: raw.stockManaged === true,
      stock: amount(raw.stock),
      modelNo: code(String(raw.modelNo ?? "").replace(/\s/g, ""), /^[A-Za-z0-9\-_+/.]{1,40}$/),
      maker: text(raw.maker, 30),
      origin: domestic
        ? { typeCode: "DMST", code: "KR" }
        : { typeCode: "OVS", code: code(String(raw.origin?.code ?? "").toUpperCase(), /^[A-Z]{2}$/) || "CN" },
      notice: { groupCode: code(raw.notice?.groupCode, /^\d{1,3}$/), values: noticeValues },
      delivery: {
        costPolicy: digits(delivery.costPolicy),
        extraCostPolicy: digits(delivery.extraCostPolicy),
        shipPlace: code(delivery.shipPlace, /^[A-Z0-9]{3,20}$/),
        returnPlace: code(delivery.returnPlace, /^[A-Z0-9]{3,20}$/),
        courier: code(delivery.courier, /^\d{4}$/),
        returnCourier: code(delivery.returnCourier, /^\d{4}$/),
        sameDay: delivery.sameDay === true,
        closeTime: code(delivery.closeTime, /^([01]\d|2[0-3])[0-5]\d$/),
        saturday: delivery.saturday === "Y" ? "Y" : "N",
        retrieveType: code(delivery.retrieveType, /^[A-Z]+_RTRV$/),
      },
      purchase: {
        maxQty: maxQty >= 1 ? Math.min(maxQty, 99999) : 0,
        periodDays: periodDays >= 1 && periodDays <= 31 ? periodDays : 1,
      },
      asText: text(raw.asText, 1000),
      sellerCode: cut(text(raw.sellerCode, 60), 30),
    };
  }

  /**
   * GS샵 폼 값. 페이지 함수에 그대로 넘어가므로 모양을 여기서 굳힌다.
   *
   * 글자 수는 화면과 같이 **바이트**로 센다(한글 2 · 영숫자 1). 노출상품명 160, 송장상품명 30, 모델명 60 —
   * 넘으면 저장할 때 화면이 막고, 어떤 칸은 값을 지운다.
   */
  function normalizeGsshopForm(raw) {
    if (!raw || typeof raw !== "object") throw new Error("GS샵 폼 데이터가 없습니다.");
    const text = (entry, max = 1000) => (entry === null || entry === undefined ? "" : String(entry)).trim().slice(0, max);
    const digits = (entry) => (/^\d+$/.test(String(entry ?? "")) ? String(entry) : "");
    const code = (entry, pattern) => (pattern.test(String(entry ?? "")) ? String(entry) : "");
    const amount = (entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    };
    const bytes = (entry) => [...entry].reduce((sum, char) => sum + (/^[\x00-\x7f]$/.test(char) ? 1 : 2), 0);
    const cut = (entry, maxBytes) => {
      let out = "";
      for (const char of entry) {
        if (bytes(out + char) > maxBytes) break;
        out += char;
      }
      return out.trim();
    };

    const category = code(raw.category, /^[A-Z]\d{8}$/);
    if (!category) throw new Error("GS샵 상품분류 코드(예: B35012701)가 없습니다.");
    const sectionId = digits(raw.sectionId);
    if (!sectionId) throw new Error("GS샵 전시 카테고리 번호가 없습니다.");
    const supplierProductCode = code(raw.supplierProductCode, /^[A-Za-z0-9\-_()]{1,20}$/);
    if (!supplierProductCode) throw new Error("GS샵 협력사 상품코드는 영문·숫자·-_() 20자 이내여야 합니다.");
    // 화면이 막는 글자: 노출상품명 `" < > | \ ? *`, 송장상품명 `: " < > | \ '`(? * 는 공백으로 바뀐다).
    const exposureName = cut(text(raw.exposureName, 400).replace(/["<>|\\?*]/g, "").replace(/\s+/g, " "), 160);
    const invoiceName = cut(text(raw.invoiceName, 200).replace(/[:"<>|\\']/g, "").replace(/[?*]/g, " ").replace(/\s+/g, " "), 30);
    if (!exposureName || !invoiceName) throw new Error("GS샵 노출상품명·송장상품명이 없습니다.");
    const salePrice = amount(raw.salePrice);
    if (salePrice <= 0) throw new Error("GS샵 판매가가 없습니다.");
    const marginRate = amount(raw.marginRate);
    const brandCode = digits(raw.brand?.code);
    if (!brandCode) throw new Error("GS샵 브랜드 코드가 없습니다.");

    const delivery = raw.delivery || {};
    const remote = delivery.remote || {};
    const noticeValues = {};
    for (const [itemCode, entry] of Object.entries(raw.notice?.values || {})) {
      if (digits(itemCode) && entry !== null && entry !== undefined) noticeValues[itemCode] = text(entry, 1000);
    }
    return {
      category,
      sectionId,
      supplierProductCode,
      mdId: digits(raw.mdId),
      employeeNo: digits(raw.employeeNo),
      exposureName,
      invoiceName,
      brand: { code: brandCode, name: text(raw.brand?.name, 60) },
      modelName: cut(text(raw.modelName, 200), 60),
      composition: {
        content: text(raw.composition?.content, 200),
        packageCount: Math.max(1, amount(raw.composition?.packageCount)),
        maker: text(raw.composition?.maker, 60),
        origin: text(raw.composition?.origin, 40),
      },
      salePrice,
      marginRate: marginRate > 0 && marginRate < 100 ? marginRate : 0,
      delivery: {
        courier: code(delivery.courier, /^[A-Z0-9]{2,4}$/),
        convenienceReturn: delivery.convenienceReturn === "Y" ? "Y" : "N",
        fee: amount(delivery.fee),
        freeOver: amount(delivery.freeOver),
        returnFee: amount(delivery.returnFee),
        exchangeFee: amount(delivery.exchangeFee),
        remote: {
          fee: amount(remote.fee),
          returnFee: amount(remote.returnFee),
          exchangeFee: amount(remote.exchangeFee),
        },
        refundType: delivery.refundType === "20" ? "20" : "10",
        shipAddress: code(delivery.shipAddress, /^\d{4}$/),
        returnAddress: code(delivery.returnAddress, /^\d{4}$/),
        bundle: code(delivery.bundle, /^[A-Z]\d{2}$/),
        weight: code(delivery.weight, /^A\d{2}$/),
        length: code(delivery.length, /^B\d{2}$/),
      },
      stock: amount(raw.stock),
      safeStock: amount(raw.safeStock),
      notice: { groupCode: digits(raw.notice?.groupCode), values: noticeValues },
    };
  }

  /**
   * 스마트스토어 폼 값. 페이지 함수에 그대로 넘어가므로 모양을 여기서 굳힌다.
   *
   * 번호(카테고리·원산지·인증)는 숫자만, 코드(원산지 구분·고시 분류)는 대문자만 받는다. 페이지 함수가
   * 그 값으로 selectize 옵션을 찾기 때문이다.
   */
  function normalizeSmartstoreForm(raw) {
    if (!raw || typeof raw !== "object") throw new Error("스마트스토어 폼 데이터가 없습니다.");
    const text = (entry, max = 1000) => (entry === null || entry === undefined ? "" : String(entry)).trim().slice(0, max);
    const digits = (entry) => (/^\d+$/.test(String(entry ?? "")) ? String(entry) : "");
    const code = (entry) => (/^[A-Z_]+$/.test(String(entry ?? "")) ? String(entry) : "");
    const amount = (entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    };
    // 네이버가 상품명·모델명·태그에서 막는 글자(`\ * ? " < >`). 들어가면 저장이 거절된다.
    const clean = (entry, max) => text(entry, 1000).replace(/[\\*?"<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
    // 태그 상한은 UTF-8 30바이트다(한글 10자 · 영문 30자). 넘으면 화면이 안내창을 띄우고 버린다.
    const utf8Length = (entry) => new TextEncoder().encode(entry).length;

    const categoryId = digits(raw.category?.id);
    const categoryKeyword = text(raw.category?.keyword, 60);
    if (!categoryId || !categoryKeyword) throw new Error("스마트스토어 카테고리(번호·검색어)가 없습니다.");
    const productName = clean(raw.productName, 100);
    if (!productName) throw new Error("스마트스토어 상품명이 없습니다.");
    const salePrice = amount(raw.salePrice);
    if (salePrice <= 0) throw new Error("스마트스토어 판매가가 없습니다.");
    const discountWon = amount(raw.discountWon);

    // 인증기관·인증일자는 우리가 모른다(번호만 안다). 사람이 제품안전정보센터에서 보고 넣는다.
    const cert = raw.childCert;
    const childCert = cert && digits(cert.certId) && clean(cert.number, 60)
      ? { certId: digits(cert.certId), number: clean(cert.number, 60), companyName: text(cert.companyName, 60) }
      : null;
    const origin = raw.origin && code(raw.origin.exposureType)
      ? {
        exposureType: code(raw.origin.exposureType),
        firstSub: digits(raw.origin.firstSub),
        secondSub: digits(raw.origin.secondSub),
        importer: text(raw.origin.importer, 60),
      }
      : null;
    const tags = [];
    for (const entry of Array.isArray(raw.tags) ? raw.tags : []) {
      const tag = clean(entry, 30).replace(/\s+/g, "");
      if (!tag || tags.includes(tag) || utf8Length(tag) > 30) continue;
      tags.push(tag);
      if (tags.length >= 10) break;
    }

    return {
      category: { id: categoryId, keyword: categoryKeyword },
      productName,
      salePrice,
      // 즉시할인은 판매가보다 작아야 한다. 아니면 할인 없이 넣는다.
      discountWon: discountWon > 0 && discountWon < salePrice ? discountWon : 0,
      stock: amount(raw.stock),
      modelName: clean(raw.modelName, 100),
      brandName: clean(raw.brandName, 50),
      manufacturerName: clean(raw.manufacturerName, 50),
      origin,
      childCert,
      notice: {
        type: code(raw.notice?.type) || "ETC",
        itemName: text(raw.notice?.itemName, 200),
        modelName: text(raw.notice?.modelName, 200),
        certificateDetails: text(raw.notice?.certificateDetails, 500),
        manufacturer: text(raw.notice?.manufacturer, 100),
        afterServiceDirector: text(raw.notice?.afterServiceDirector, 100),
      },
      tags,
    };
  }

  /**
   * 신세계 폼 값. 페이지 함수에 그대로 넘어가므로 모양을 여기서 굳힌다.
   *
   * 번호(카테고리·배송비·주소지·고시 속성)는 숫자만 받는다. 페이지 함수가 그 번호로
   * 선택자를 만들기 때문이다 — 글자가 섞이면 엉뚱한 요소를 집는다.
   */
  function normalizeSsgForm(raw) {
    if (!raw || typeof raw !== "object") throw new Error("신세계 폼 데이터가 없습니다.");
    const text = (entry, max = 1000) => (entry === null || entry === undefined ? "" : String(entry)).slice(0, max);
    const digits = (entry) => (/^\d+$/.test(String(entry ?? "")) ? String(entry) : "");
    const amount = (entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    };
    const category = (entry, label) => {
      const id = digits(entry?.id);
      const keyword = text(entry?.keyword, 60).trim();
      if (!id || !keyword) throw new Error(`신세계 ${label}(번호·검색어)가 없습니다.`);
      return { id, keyword };
    };
    const fee = (entry) => (entry && typeof entry === "object"
      ? {
        divCd: digits(entry.divCd),
        typeCd: digits(entry.typeCd),
        prepayCd: digits(entry.prepayCd),
        unitCd: digits(entry.unitCd),
        feeId: digits(entry.feeId),
      }
      : null);
    const noticeValues = {};
    for (const [propId, entry] of Object.entries(raw.notice?.values || {})) {
      if (digits(propId) && entry !== null && entry !== undefined) noticeValues[propId] = text(entry, 1000);
    }
    const itemName = text(raw.itemName, 300).trim();
    if (!itemName) throw new Error("신세계 상품명이 없습니다.");
    const salePrice = amount(raw.salePrice);
    if (salePrice <= 0) throw new Error("신세계 판매가가 없습니다.");
    const shipping = raw.shipping || {};
    return {
      itemName,
      brandName: text(raw.brandName, 60).trim(),
      siteNo: digits(raw.siteNo),
      displayCategory: category(raw.displayCategory, "전시카테고리"),
      standardCategory: category(raw.standardCategory, "표준분류"),
      salePrice,
      marginRate: amount(raw.marginRate),
      stock: amount(raw.stock),
      modelName: text(raw.modelName, 100).trim(),
      searchKeywords: text(raw.searchKeywords, 500).trim(),
      adultTypeCode: digits(raw.adultTypeCode) || "90",
      returnExchangeButton: raw.returnExchangeButton === "N" ? "N" : "Y",
      notice: {
        classId: digits(raw.notice?.classId),
        values: noticeValues,
        importPropId: digits(raw.notice?.importPropId),
        importYn: raw.notice?.importYn === "N" ? "N" : "Y",
      },
      manufacturer: text(raw.manufacturer, 100).trim(),
      originCountry: text(raw.originCountry, 40).trim(),
      shipping: {
        leadDays: amount(shipping.leadDays),
        outboundAddrId: digits(shipping.outboundAddrId),
        returnAddrId: digits(shipping.returnAddrId),
        fees: (Array.isArray(shipping.fees) ? shipping.fees : []).map(fee).filter((entry) => entry && entry.feeId),
      },
    };
  }

  /**
   * 페이지 안에서 도는 채움 함수.
   *
   * 클로저를 못 쓰므로 필요한 것은 전부 인자로 받는다.
   */
  function fillMallProductForm(payload) {
    const steps = [];
    const warnings = [];

    // 몰이 띄우는 대화상자를 삼킨다.
    //
    // 온채널은 상품정보고시 분류를 고르는 순간 안내 `alert` 을 띄우고, 그게 뜨면
    // 페이지가 통째로 멈춰 아무것도 더 못 넣는다(라이브 확인 2026-09-10). 도매꾹도
    // 같은 성질이다. 버리지는 않고 경고로 올린다.
    //
    // MAIN 월드여야 뜻이 있다 — 격리 월드에서 갈아끼워도 페이지는 원래 것을 쓴다.
    const said = [];
    const nativeAlert = window.alert;
    window.alert = (message) => { said.push(String(message)); };

    /**
     * 고시 한 줄의 입력칸.
     *
     * 이 몰의 고시 칸에는 `name` 이 없다. 행 제목으로 찾는 수밖에 없고, 제목에는
     * 툴팁 글("설명", "- …")이 섞여 있어 앞부분만 맞춰 본다.
     */
    function findNoticeInput(tableId, title) {
      const table = document.getElementById(tableId);
      if (!table) return null;
      const want = title.replace(/\s+/g, "");
      const row = [...table.querySelectorAll("tr")].find((tr) => {
        const label = tr.querySelector("td.label, th");
        if (!label) return false;
        const text = (label.textContent || "").replace(/\s+/g, "").replace(/설명|닫기/g, "");
        return text.startsWith(want);
      });
      if (!row) return null;
      return row.querySelector("td:not(.label) input[type='text'], td:not(.label) textarea");
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * 폼이 그려질 때까지 **페이지 안에서** 기다린다.
     *
     * ⚠️ 회귀(라이브 2026-09-11, 사장님 화면의 `G마켓 · 옥션 → 실패`):
     * ESM Plus 는 Next.js SPA 라 `load` 가 끝난 **뒤에도 8~10초** 더 지나야 폼이
     * 그려진다. 서비스워커는 로딩 완료 + 1.2초만 기다리고 주입하므로 그때는
     * `main.box__wrap` 이 아직 없어서 `폼이 없습니다` 로 끝났다 — 로그인은 멀쩡했다.
     *
     * 밖에서 더 오래 자는 것으로는 못 맞춘다(탭을 여러 개 열수록 느려진다).
     * **화면이 준비될 때까지 여기서 지켜본다.** 준비되면 바로 진행하니 빠른 몰은 손해가 없다.
     */
    async function waitForForm() {
      // ⚠️ 껍데기(`body` 같은 넓은 표식)는 언제나 있다. 칸이 생겼는지까지 봐야 한다 —
      // 안 그러면 기다림이 첫 줄에서 끝나고 빈 화면에 쓰게 된다.
      const ready = () => {
        const hit = document.querySelector(payload.formSelector);
        if (!hit) return null;
        if (payload.readySelector && !document.querySelector(payload.readySelector)) return null;
        return hit;
      };
      const found = ready();
      if (found) return found;
      const budget = payload.formWaitMs || 0;
      if (budget <= 0) return null;
      const until = Date.now() + budget;
      while (Date.now() < until) {
        await sleep(400);
        // 껍데기만 있고 칸이 아직 없는 화면도 '아직' 으로 본다.
        const hit = ready();
        if (hit) return hit;
      }
      return ready();
    }

    // 기다림은 async 블록 안에서 한다. 여기서는 있으면 잡아 두기만 한다.
    let form = document.querySelector(payload.formSelector);

    /** 폼을 못 찾았을 때 돌려줄 답. 로그인이 풀린 경우를 따로 말해 준다. */
    function noFormOutcome() {
      const redirected = /signin\.|\/login|\/redirect\?/.test(location.href);
      return {
        ok: false,
        // 모든 프레임에 넣는 몰(11번가)은 폼이 없는 프레임에서도 여기로 온다.
        // 진짜 실패와 구분하려고 표시를 남긴다.
        noForm: true,
        error: redirected
          ? "몰에 로그인되어 있지 않습니다. 열린 탭에서 직접 로그인한 뒤 다시 누르세요."
          : `상품등록 폼(${payload.formSelector})이 없습니다. 로그인 상태와 화면을 확인하세요.`,
      };
    }
    const field = (name) => form.querySelector(`[name="${CSS.escape(name)}"]`);
    const fire = (el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      // 글자 수 표시를 keyup 으로만 고치는 화면(키드키즈 `limitInputText`). 안 주면 값이
      // 들어갔는데 `0/100` 으로 남아 사람이 빈 칸으로 읽는다.
      if (payload.fireKeyup) el.dispatchEvent(new Event("keyup", { bubbles: true }));
    };

    /**
     * 값을 넣는다. React 화면에서도 먹게.
     *
     * React 는 input 의 `value` 를 자기 프로퍼티로 덮어써서 상태를 추적한다.
     * 그냥 `el.value = v` 하면 화면에는 글자가 보여도 React 는 모르고, 제출하면
     * 빈 값이 간다. 프로토타입의 원래 setter 로 넣어야 React 가 알아챈다.
     *
     * 이름 있는 폼(도매꾹·온채널·Cafe24)에도 해가 없다 — 같은 결과다.
     */
    function assign(el, value) {
      try {
        const tag = String(el.tagName || "").toUpperCase();
        const proto = tag === "TEXTAREA" ? globalThis.HTMLTextAreaElement?.prototype
          : tag === "SELECT" ? globalThis.HTMLSelectElement?.prototype
            : globalThis.HTMLInputElement?.prototype;
        const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
      } catch {
        el.value = value;
      }
      fire(el);
    }

    function setValue(name, value) {
      const el = field(name);
      if (!el) return false;
      assign(el, value);
      return true;
    }

    /**
     * 추천 분류 모달의 '변경하기' 버튼.
     *
     * 문구 두 개가 모두 맞는 것만 집는다 — 대화상자에 '추천 카테고리'가 있고,
     * 그 안의 버튼 글자가 정확히 '변경하기'인 것. 하나만 보고 누르면 다른 팝업의
     * 같은 이름 버튼을 누를 수 있다.
     */
    async function waitForRecommendation(config) {
      const deadline = Date.now() + config.timeoutMs;
      while (Date.now() < deadline) {
        const boxes = [...document.querySelectorAll("div,section,dialog,form")]
          .filter((el) => {
            if (el.offsetParent === null && el.tagName !== "DIALOG") return false;
            const text = el.textContent || "";
            return text.includes(config.containerText) && text.includes(config.acceptText);
          })
          // 가장 안쪽 것이 실제 모달이다. 바깥은 body 까지 전부 걸린다.
          .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
        for (const box of boxes) {
          const button = [...box.querySelectorAll("button,a,input[type=button]")]
            .find((el) => ((el.textContent || el.value || "").trim() === config.acceptText));
          if (button) return button;
        }
        await sleep(700);
      }
      return null;
    }

    function toFile(image) {
      const [head, base64] = String(image.dataUrl).split(",");
      const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], image.fileName, { type: mime });
    }

    /**
     * 분류 검색 — 검색어를 치고 나온 경로 버튼을 누른다.
     *
     * 목록이 미리 실려 있어 요청이 나가지 않는다. 결과 버튼의 글자가 곧 경로다.
     * 구분자와 검색어 만드는 법이 몰마다 다르다: 올웨이즈는 `대 > 중 > 소` 를 그대로
     * 검색해도 걸리지만, 11번가는 띄어쓴 이름으로 검색하면 0건이라 첫 낱말만 넣는다.
     */
    async function runCategorySearch() {
      const search = payload.categorySearch;
      if (!search) return;
      for (const path of payload.categoryPaths || []) {
        const wanted = path.join(search.joiner || " > ");
        const box = document.querySelector(search.inputSelector);
        if (!box) { warnings.push("분류 검색칸을 찾지 못했습니다."); return; }
        // 결과 목록은 **칸에 포커스가 있어야 펼쳐진다.** 값만 넣으면 결과가 만들어져도
        // 목록이 접힌 채라 `offsetParent` 가 null 이고, 우리 가시성 검사에 걸러진다
        // (라이브 실측 2026-09-10: 포커스 없음 → null / 포커스 후 → ok, `active` 클래스).
        try { box.focus(); box.click(); } catch { /* 포커스를 못 줘도 계속 간다 */ }
        const leaf = path[path.length - 1];
        // 검색어는 낱말 하나여야 한다. 11번가는 `기능성 팬시` 로 치면 0건이고
        // `기능성` 으로 쳐야 40건이 나온다(라이브 실측 2026-09-10).
        assign(box, search.queryFirstWord ? leaf.split(/\s+/)[0] : leaf);
        // 결과를 기다린다. 고정 대기로는 막 열린 화면에서 놓친다 — 같은 검색어가
        // 데워진 화면에서는 걸리고 갓 로드된 화면에서는 안 걸렸다(라이브 확인).
        const deadline = Date.now() + (search.timeoutMs || 12000);
        let hit = null;
        while (Date.now() < deadline) {
          await sleep(500);
          hit = [...document.querySelectorAll(search.optionSelector)]
            .filter((el) => el.offsetParent !== null)
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === wanted);
          if (hit) break;
        }
        if (!hit) {
          warnings.push(`분류 '${wanted}' 를 찾지 못했습니다. 이름이 정확한지 확인하세요.`);
          continue;
        }
        hit.click();
        await sleep(search.waitMs);
        steps.push(`분류 ${leaf}`);
      }
    }

    /**
     * 블록 id + 행 제목으로 칸을 찾는다.
     *
     * 이름도 id 도 없는 화면(11번가 신규등록)용이다. 제목에는 `필수입력`·`도움말`
     * 같은 꼬리가 붙으므로 공백과 그 꼬리를 떼고 앞부분만 맞춘다.
     */
    function findRowInput(section, row) {
      const body = document.getElementById(section);
      if (!body) return null;
      const want = row.replace(/\s+/g, "");
      const hit = [...body.querySelectorAll(".b-box__row")].find((el) => {
        const title = el.querySelector(".b-box__title");
        if (!title) return false;
        const text = (title.textContent || "").replace(/\s+/g, "").replace(/필수입력|도움말/g, "");
        return text.startsWith(want);
      });
      return hit ? hit.querySelector(".b-box__cont") : null;
    }

    /**
     * 섹션 제목으로 칸 블록을 찾는다(ESM Plus).
     *
     * 11번가와 사정은 같은데 DOM 이 다르다. 이 몰은
     * `div.box__filter-item > (.box__filter-head 제목 + .box__filter-content 값)` 이고,
     * 제목에 `필수`·`도움말` 이 꼬리로 붙는다. 공백과 그 꼬리를 떼고 앞부분만 맞춘다.
     *
     * 실측 2026-09-11: 고시 15줄도 상품군을 고르고 나면 **같은 블록**으로 그려진다 —
     * 그래서 고시에 별도 손잡이가 필요 없다.
     */
    function findSectionContent(title) {
      const layout = payload.sectionLayout;
      if (!layout) return null;
      const want = String(title).replace(/\s+/g, "");
      const hit = [...document.querySelectorAll(layout.itemSelector)].find((el) => {
        const head = el.querySelector(layout.headSelector);
        if (!head) return false;
        const text = (head.textContent || "").replace(/\s+/g, "").replace(/필수|도움말/g, "");
        return text === want || text.startsWith(want);
      });
      if (!hit) return null;
      return hit.querySelector(layout.contentSelector) || hit;
    }

    /**
     * 안내 팝업을 닫는다.
     *
     * ESM Plus 는 등록 화면에 안내창을 띄운다(실물: "[G kiditem / A kiditem] 이벤트에
     * 참여중입니다 … [확인]"). 덮여 있는 동안에는 우리 클릭이 전부 그 창으로 먹어서
     * 폼이 안 채워지고, 사람이 매번 손으로 닫아야 한다.
     *
     * ⚠️ **되묻는 창을 대신 눌러 주지 않는다.** 그건 사람의 결정을 가로채는 일이다.
     * 판단 규칙:
     *
     *  1. 창 안의 버튼을 **닫기류**(`확인`·`닫기`·모서리 `✕`)와 **그 외**로 가른다.
     *  2. **'그 외' 가 하나라도 있으면 손대지 않는다** — `취소`·`등록하기` 가 있다는 건
     *     고르라는 뜻이다.
     *  3. 본문이 **묻는 말**로 끝나면(`…하시겠습니까?`) 닫기류만 있어도 손대지 않는다.
     *
     * 본문에 무슨 낱말이 있는지로는 거르지 않는다 — 이 안내창도 본문에 '등록' 이
     * 들어 있다("신규로 등록되는 상품은 … 제외됩니다"). 낱말로 걸렀다면 못 닫는다.
     */
    async function dismissNoticeDialogs(rule) {
      if (!rule) return 0;
      const closeLabels = rule.closeLabels || [];
      const actionWords = rule.actionWords || [];
      const question = rule.questionPattern ? new RegExp(rule.questionPattern) : null;
      const labelOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

      /**
       * ⚠️ 태그를 믿지 않는다.
       *
       * 처음엔 `<button>` 만 봤는데, 이 안내창이 떠 있는 동안 글자가 `확인` 인 버튼이
       * **하나도 없었다**(라이브 2026-09-11). 누르는 자리가 `<a>` 나 `<div>` 라는 뜻이다.
       * 그래서 **글자가 행동 낱말인 잎 요소**를 찾는다 — 태그가 무엇이든 걸린다.
       *
       * 스타일 조회는 걸린 몇 개에만 한다. 문서 전체에 `getComputedStyle` 을 돌렸다가
       * 이 화면(요소 2,200개)에서 렌더러가 45초 넘게 멈춘 적이 있다.
       */
      const actionLeaves = () => [...document.querySelectorAll("*")]
        .filter((el) => el.children.length === 0 && actionWords.includes(labelOf(el)));

      const dialogFor = (el) => {
        let box = el.parentElement;
        for (let depth = 0; depth < 10 && box && box !== document.body; depth += 1) {
          const style = getComputedStyle(box);
          if (/fixed|absolute/.test(style.position)) {
            const rect = box.getBoundingClientRect();
            if (rect.width >= 180 && rect.height >= 60) return box;
          }
          box = box.parentElement;
        }
        return null;
      };

      // 한 번 누른 자리는 다시 누르지 않는다. 같은 것을 두 번 누르면 그 다음 화면의
      // 버튼을 누르게 된다 — 그게 등록 버튼일 수도 있다.
      const pressed = new Set();
      let closed = 0;
      for (let round = 0; round < (rule.retries || 1); round += 1) {
        let hit = null;
        for (const leaf of actionLeaves()) {
          if (pressed.has(leaf)) continue;
          if (!closeLabels.includes(labelOf(leaf))) continue;
          const box = dialogFor(leaf);
          if (!box) continue;
          const style = getComputedStyle(box);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // 창 안의 행동 낱말을 전부 센다. 고르라는 것이 섞여 있으면 사람의 몫이다.
          const words = [...box.querySelectorAll("*")]
            .filter((el) => el.children.length === 0 && actionWords.includes(labelOf(el)))
            .map(labelOf);
          if (words.some((word) => !closeLabels.includes(word))) continue;
          if (question && question.test((box.textContent || "").replace(/\s+/g, " "))) continue;
          /**
           * 안내창에는 **읽으라고 쓴 글**이 있다.
           *
           * 버튼만 덩그러니 있는 상자는 화면의 부품이지 안내창이 아니다. 그런 것을
           * 눌렀다가는 폼의 진짜 버튼을 누르게 된다. 낱말을 뺀 본문이 짧으면 넘긴다.
           */
          const body = (box.textContent || "").replace(/\s+/g, " ").trim();
          const message = words.reduce((text, word) => text.split(word).join(""), body).trim();
          if (message.length < (rule.minMessageLength || 10)) continue;
          hit = leaf;
          break;
        }
        if (!hit) {
          if (closed > 0) break;
          await sleep(rule.waitMs || 600);
          continue;
        }
        // 잎이 아니라 실제로 누르는 자리를 누른다(버튼 안 span 인 경우).
        pressed.add(hit);
        const target = hit.closest('button,a,[role="button"]') || hit;
        target.click();
        closed += 1;
        await sleep(rule.waitMs || 600);
      }
      return closed;
    }

    /**
     * 커스텀 드롭다운에서 **보이는 글자**로 고른다(ESM Plus).
     *
     * 네이티브 `<select>` 가 하나도 없는 화면이다(실측: `document.querySelectorAll('select')`
     * 가 0개). 항목은 열지 않아도 DOM 에 이미 있지만, 여는 버튼을 눌러 줘야 React 가
     * 고른 값을 받는다.
     *
     * ⚠️ `li` 를 누르면 아무 일도 안 일어난다. 그 안의 `button` 을 눌러야 한다(실측).
     */
    async function pickSectionOption(content, wanted, layout) {
      const dropdown = content.querySelector(layout.dropdownSelector) || content;
      const opener = dropdown.querySelector(layout.openerSelector);
      if (opener) {
        opener.click();
        await sleep(350);
      }
      const want = String(wanted).replace(/\s+/g, " ").trim();
      const option = [...dropdown.querySelectorAll(layout.optionSelector)]
        .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
      if (!option) {
        // 못 고르면 열어 둔 채로 두지 않는다. 다음 칸을 가릴 수 있다.
        if (opener) opener.click();
        return false;
      }
      option.click();
      await sleep(500);
      return true;
    }

    return (async () => {
      // 0-00) 폼이 다른 도메인 iframe 에 있는 몰(떠리몰)은 모든 프레임에 들어가지만 일은 그
      //       프레임에서만 한다. 겉·숨은 프레임은 바로 비킨다 — 안 비키면 폼을 기다리느라
      //       전체 주입이 30초씩 붙잡힌다.
      if (payload.frameUrlIncludes && !location.href.includes(payload.frameUrlIncludes)) {
        return { ok: false, noForm: true, error: `상품등록 화면(${payload.frameUrlIncludes})을 찾지 못했습니다.` };
      }

      // 0-0) 느리게 그려지는 SPA(ESM Plus)는 칸이 생길 때까지 여기서 기다린다.
      //
      // ⚠️ 껍데기(`body`)는 처음부터 있어서 `form` 만 보면 기다림을 건너뛴다. 준비 표식
      // (`readySelector`)이 아직 없으면 그것도 '아직' 이다 — 떠리몰 라이브 시험에서 칸이
      // 그려지기 전에 들어가 줄 제목을 하나도 못 찾았다(2026-09-11).
      if (!form || (payload.readySelector && !document.querySelector(payload.readySelector))) {
        form = await waitForForm();
        if (!form) return noFormOutcome();
      }

      // 0) 분류가 방아쇠인 몰은 분류부터 끝낸다.
      //
      // 11번가는 분류를 고르기 전에 상품정보 제공고시 블록이 숨어 있어서, 순서를
      // 지키지 않으면 그 단계가 통째로 실패한다(라이브 확인 2026-09-10).
      if (payload.categoryFirst) await runCategorySearch();

      // 0-1) 폼이 섹션마다 따로 있는 몰(아이스크림몰)은 폼 id 까지 보고 채운다.
      //
      // 같은 이름의 칸이 여러 폼에 있어서(`deliFcstDt` 등) 문서 전체에서 찾으면
      // 엉뚱한 폼의 칸에 들어간다.
      for (const [formId, values] of Object.entries(payload.multiFormFields || {})) {
        const section = document.getElementById(formId);
        if (!section) { warnings.push(`${formId} 칸을 찾지 못했습니다.`); continue; }
        let filled = 0;
        for (const [name, value] of Object.entries(values)) {
          const box = section.querySelector(`[name="${name}"]`);
          if (!box) { warnings.push(`${formId}.${name} 칸이 없습니다.`); continue; }
          box.readOnly = false;
          assign(box, value);
          filled += 1;
        }
        for (const [name, value] of Object.entries((payload.multiFormRadios || {})[formId] || {})) {
          const hit = section.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
          if (!hit) { warnings.push(`${formId}.${name}=${value} 를 찾지 못했습니다.`); continue; }
          if (!hit.checked) hit.click();
          filled += 1;
        }
        for (const [name, on] of Object.entries((payload.multiFormChecks || {})[formId] || {})) {
          // `payWayCd[]` 처럼 같은 이름이 여럿인 칸은 값으로 가려낸다.
          const list = [...section.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
          const targets = Array.isArray(on)
            ? list.filter((el) => on.includes(el.value))
            : list;
          for (const el of targets) {
            if (el.checked !== (Array.isArray(on) ? true : Boolean(on))) el.click();
            filled += 1;
          }
        }
        if (filled > 0) steps.push(`${formId} ${filled}칸`);
      }

      // 0-2) 분류. 팝업으로만 고르는 칸이라 값을 직접 넣는다.
      //
      // 코드와 경로를 함께 넣는다 — 몰은 저장할 때 코드를 본다. 경로만 맞춰 두면
      // 화면은 맞아 보이는데 저장이 빈 분류로 들어간다.
      if (payload.categoryFields && payload.categoryCode) {
        const codeBox = document.querySelector(`[name="${payload.categoryFields.code}"]`);
        const pathBox = document.querySelector(`[name="${payload.categoryFields.path}"]`);
        if (codeBox) { codeBox.readOnly = false; assign(codeBox, payload.categoryCode); }
        if (pathBox) { pathBox.readOnly = false; assign(pathBox, payload.categoryPath || ""); }
        if (codeBox) steps.push("분류");
        else warnings.push("분류 칸을 찾지 못했습니다. 화면에서 직접 고르세요.");
      }

      // 0-3) 고시. 이 몰은 **분류로 열리지 않는다** — 품목코드를 주고 몰의 함수를
      // 불러야 행이 그려진다(라이브 확인 2026-09-11: 1줄 → 16줄).
      // 그려진 칸들은 `name` 이 없어 행 제목으로 찾는다.
      if (payload.noticeSection && payload.noticeItemCode) {
        const spec = payload.noticeSection;
        const handler = window[spec.owner]?.eventhandler;
        if (typeof handler?.[spec.open] === "function") {
          try {
            handler[spec.open](payload.noticeItemCode, payload.noticeSafeYn || "N");
          } catch (error) {
            warnings.push(`고시를 열지 못했습니다: ${error?.message || error}`);
          }
          // ajax 로 항목을 받아 그리므로 기다린다.
          const deadline = Date.now() + 8000;
          while (Date.now() < deadline) {
            await sleep(400);
            if (document.querySelectorAll(`#${spec.tableId} tr`).length > 2) break;
          }
          let noticeFilled = 0;
          for (const row of payload.noticeRows || []) {
            const target = findNoticeInput(spec.tableId, row.title);
            if (!target) { warnings.push(`고시 '${row.title}' 줄을 찾지 못했습니다.`); continue; }
            assign(target, row.value);
            noticeFilled += 1;
          }
          if (noticeFilled > 0) steps.push(`고시 ${noticeFilled}줄`);
          // KC/안전인증 라디오는 이름이 있다.
          for (const [name, value] of Object.entries(payload.noticeRadios || {})) {
            const hit = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
            if (hit && !hit.checked) { hit.click(); steps.push(`${name}=${value}`); }
          }
        } else {
          warnings.push("고시를 여는 몰 함수를 찾지 못했습니다. 화면에서 분류를 고른 뒤 다시 시도하세요.");
        }
      }

      // 1) 단계형 화면이면 먼저 넘긴다.
      //
      // 이게 맨 앞이어야 한다. 온채널은 단계를 넘길 때 뒤 화면을 다시 그리는데,
      // 그 전에 채운 상품정보고시 열일곱 칸이 통째로 비워진다(라이브 확인
      // 2026-09-10: 넘긴 뒤 17칸 전부 빈 값). 넘기고 나서 채워야 남는다.
      for (const step of payload.wizardSteps || []) {
        const button = [...document.querySelectorAll("button,a,input[type=button]")]
          .find((el) => ((el.textContent || el.value || "").replace(/\s+/g, " ").trim() === step.text));
        if (!button) { warnings.push(`'${step.text}' 버튼을 찾지 못했습니다.`); continue; }
        // 단계를 넘기려면 그 화면의 선택이 먼저 끝나 있어야 한다.
        for (const [name, value] of Object.entries(payload.radios)) {
          if (!(step.needs || []).includes(name)) continue;
          const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
            .find((el) => el.value === value);
          if (hit && !hit.checked) hit.click();
        }
        for (const name of step.needsChecks || []) {
          const box = form.elements[name];
          if (box && !box.checked) box.click();
        }
        button.click();
        steps.push(step.label || step.text);
        if (step.waitMs) await sleep(step.waitMs);
      }

      // 2) 동적 칸을 만드는 방아쇠를 당긴다.
      //    도매꾹 고시가 그렇다 — 상품군을 고르기 전에 값을 넣으면 조용히 사라진다.
      const dynamic = payload.dynamic;
      if (dynamic && payload.fields[dynamic.trigger] !== undefined) {
        if (setValue(dynamic.trigger, payload.fields[dynamic.trigger])) {
          const deadline = Date.now() + 15000;
          let created = 0;
          while (Date.now() < deadline) {
            await sleep(300);
            created = [...form.elements].filter((el) => {
              if (typeof el.name !== "string" || !el.name) return false;
              if (dynamic.waitPrefix) return el.name.startsWith(dynamic.waitPrefix);
              // 접두어가 없는 몰(온채널)은 생겨야 할 칸 이름을 직접 센다.
              return (dynamic.waitNames || []).includes(el.name);
            }).length;
            if (created > 0) break;
          }
          if (created > 0) steps.push(`${dynamic.trigger} 선택 후 항목 ${created}칸 생성`);
          else warnings.push(`${dynamic.trigger} 를 골랐지만 항목이 생기지 않았습니다.`);
        }
      }

      // 2-9) 칸을 여는 라디오를 먼저 누른다.
      //
      // 꼬망세 KC 번호 칸은 `인증` 을 누르기 전까지 `disabled` 다. 라디오는 원래 6) 에서
      // 누르는데, 그러면 번호가 잠긴 칸에 들어가 제출되지 않는다.
      for (const name of payload.preRadios || []) {
        const value = payload.radios[name];
        if (value === undefined) continue;
        const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
          .find((el) => el.value === value);
        if (!hit) { warnings.push(`라디오 ${name}=${value} 를 찾지 못했습니다.`); continue; }
        if (!hit.checked) hit.click();
        fire(hit);
        await sleep(300);
      }

      // 3) 나머지 값.
      let filled = 0;
      const missing = [];
      for (const [name, value] of Object.entries(payload.fields)) {
        if (dynamic && name === dynamic.trigger) continue;
        if (setValue(name, value)) filled += 1;
        else missing.push(name);
      }
      steps.push(`입력 ${filled}칸`);
      if (missing.length > 0) {
        warnings.push(`화면에 없는 칸 ${missing.length}개: ${missing.slice(0, 6).join(", ")}`);
      }

      // 4) 같은 이름을 쓰는 묶음 입력. 순서대로 나눠 넣는다.
      for (const group of payload.groupInputs || []) {
        const values = (payload.groups && payload.groups[group.key]) || [];
        if (values.length === 0) continue;
        // 칸이 모자라면 늘린다. 티처몰 상품정보고시가 그렇다 — 품목을 고르면 다섯
        // 줄만 생기는데 등록물은 서른아홉 줄이라 '+' 를 그만큼 눌러야 한다.
        //
        // ⚠️ 클릭 사이에 기다리지 않는다. 줄은 동기로 붙고(실측: 여섯 번 8ms),
        //    `setTimeout` 은 배경 탭에서 1초로 늘어난다. 한 번씩 재면 서른네 줄에
        //    34초가 걸려 채움이 통째로 시간 초과된다(라이브 확인 2026-09-10).
        if (group.grow) {
          const add = document.getElementById(group.grow.buttonId);
          if (!add) {
            warnings.push(`${group.key} 줄 추가 버튼(#${group.grow.buttonId})을 찾지 못했습니다.`);
          } else {
            const limit = group.grow.maxClicks || 60;
            let clicks = 0;
            // 한 번에 다 누르고, 그래도 모자라면(줄이 늦게 붙는 몰) 한 번 더 돈다.
            for (let round = 0; round < 3; round += 1) {
              const need = Math.min(limit - clicks, values.length - form.querySelectorAll(group.selector).length);
              if (need <= 0) break;
              for (let i = 0; i < need; i += 1) { add.click(); clicks += 1; }
              await sleep(400);
            }
            if (clicks > 0) steps.push(`${group.key} ${clicks}줄 추가`);
          }
        }
        const boxes = [...form.querySelectorAll(group.selector)];
        if (boxes.length === 0) {
          warnings.push(`${group.key} 입력칸(${group.selector})을 찾지 못했습니다.`);
          continue;
        }
        let placed = 0;
        values.slice(0, boxes.length).forEach((value, index) => {
          const box = boxes[index];
          assign(box, value);
          // 이 몰은 keyup 으로 숨은 필드를 다시 만든다. 두 이벤트를 다 준다.
          box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
          placed += 1;
        });
        const last = boxes[Math.min(values.length, boxes.length) - 1];
        if (last) last.dispatchEvent(new Event("blur", { bubbles: true }));
        steps.push(`${group.key} ${placed}칸`);
        if (values.length > boxes.length) {
          warnings.push(`${group.key} ${values.length - boxes.length}개는 칸이 모자라 넣지 못했습니다.`);
        }
      }

      // 4-1) 블록 id + 행 제목으로 찾는 칸들(11번가).
      for (const entry of payload.rowFields || []) {
        const want = payload.rowFieldValues[entry.key];
        if (want === undefined || want === "") continue;
        const cont = findRowInput(entry.section, entry.row);
        const box = cont && cont.querySelector("input,textarea");
        if (!box) { warnings.push(`${entry.label} 칸을 찾지 못했습니다.`); continue; }
        assign(box, want);
        steps.push(entry.label);
      }

      // 4-2) 같은 방식인데 **보이는 글자**로 고르는 목록. 값이 계정마다 다른 번호라
      //      숫자를 적어둘 수 없다(배송 템플릿).
      for (const entry of payload.rowOptions || []) {
        const want = payload.rowOptionValues[entry.key];
        if (want === undefined || want === "") continue;
        const cont = findRowInput(entry.section, entry.row);
        const select = cont && cont.querySelector("select");
        if (!select) { warnings.push(`${entry.label} 목록을 찾지 못했습니다.`); continue; }
        const option = [...select.options]
          .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
        if (!option) { warnings.push(`${entry.label} 에 '${want}' 가 없습니다.`); continue; }
        assign(select, option.value);
        steps.push(`${entry.label} ${want}`);
        await sleep(600);
      }

      // 4-3) 섹션 제목으로 찾는 몰(ESM Plus — G마켓·옥션).
      //
      // ⭐⭐ 순서가 전부다(라이브 실측 2026-09-11):
      //   (a) **분류 먼저.** 분류를 고르면 `인증정보` 패널이 어린이제품·G마켓 인증정보·
      //       G마켓 영업허가증으로 **다시 그려지고 기본값이 `인증대상` 으로 되돌아간다.**
      //       인증을 먼저 누르면 눌러 둔 값이 지워진다.
      //   (b) 인증 라디오 — 그대로 두면 `인증 유형`·`업종` 이 필수로 따라 열려 막힌다.
      //   (c) 드롭다운 — `상품군` 을 골라야 고시 15줄이 **그려진다**. 나중에 하면
      //       고시 칸을 찾을 수가 없다.
      //   (d) 칸(고시 포함) → (e) 이미지 → (f) 상세설명.
      if (payload.sectionLayout) {
        const layout = payload.sectionLayout;
        // 분류에 따라 있을 수도 없을 수도 있는 칸. 없다고 경고하면 거짓 경보가 된다.
        const optional = new Set(payload.optionalSections || []);

        // 안내 팝업이 화면을 덮고 있으면 클릭이 전부 그 창으로 먹는다. 먼저 치운다.
        const dismissed = await dismissNoticeDialogs(payload.dismissDialogs);
        if (dismissed > 0) steps.push(`안내 팝업 ${dismissed}개 닫음`);

        const wantCategory = payload.sectionCategory;
        const categorySpec = layout.category;
        if (wantCategory && categorySpec) {
          const content = findSectionContent(categorySpec.section);
          const box = content && content.querySelector(categorySpec.queryInput);
          if (!box) warnings.push("분류 검색칸을 찾지 못했습니다.");
          else {
            assign(box, wantCategory.query);
            await sleep(300);
            content.querySelector(categorySpec.searchButton)?.click();
            await sleep(categorySpec.waitMs);
            const want = wantCategory.path.replace(/\s+/g, "");
            const hit = [...content.querySelectorAll(layout.optionSelector)]
              .find((el) => (el.textContent || "").replace(/\s+/g, "") === want);
            if (!hit) warnings.push(`분류 '${wantCategory.path}' 를 찾지 못했습니다.`);
            else {
              hit.click();
              await sleep(1500);
              steps.push(`분류 ${wantCategory.path}`);
            }
          }
        }

        // 분류를 고르면 또 안내창이 뜨는 화면이 있다. 인증을 누르기 전에 한 번 더 치운다.
        await dismissNoticeDialogs(payload.dismissDialogs);

        for (const [title, wanted] of Object.entries(payload.sectionRadios || {})) {
          const content = findSectionContent(title);
          if (!content) {
            if (!optional.has(title)) warnings.push(`${title} 칸을 찾지 못했습니다.`);
            continue;
          }
          const want = String(wanted).replace(/\s+/g, " ").trim();
          const label = [...content.querySelectorAll(layout.labelSelector)]
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
          if (!label) {
            if (!optional.has(title)) warnings.push(`${title} 에 '${want}' 가 없습니다.`);
            continue;
          }
          label.click();
          await sleep(400);
          steps.push(`${title} ${want}`);
        }

        for (const [title, wanted] of Object.entries(payload.sectionDropdowns || {})) {
          const content = findSectionContent(title);
          if (!content) {
            if (!optional.has(title)) warnings.push(`${title} 목록을 찾지 못했습니다.`);
            continue;
          }
          const picked = await pickSectionOption(content, wanted, layout);
          if (!picked) {
            if (!optional.has(title)) warnings.push(`${title} 에 '${wanted}' 가 없습니다.`);
            continue;
          }
          steps.push(`${title} ${wanted}`);
          // 상품군을 고르면 고시 줄이 그려진다. 그릴 틈을 준다.
          await sleep(900);
        }

        for (const [key, value] of Object.entries(payload.sectionFields || {})) {
          if (value === undefined || value === "") continue;
          // `제목#순번` — 한 섹션에 칸이 여럿인 경우.
          const [title, rawIndex] = key.split("#");
          const index = Number(rawIndex || 0) || 0;
          const content = findSectionContent(title);
          const box = content && [...content.querySelectorAll(layout.inputSelector)][index];
          if (!box) {
            if (!optional.has(title)) warnings.push(`${title} 칸을 찾지 못했습니다.`);
            continue;
          }
          box.readOnly = false;
          assign(box, value);
          steps.push(title);
        }

        const imageSpec = layout.images;
        const imageFiles = imageSpec ? (payload.imageGroups || {})[imageSpec.groupKey] || [] : [];
        if (imageSpec && imageFiles.length > 0) {
          const box = document.querySelector(imageSpec.fileInputSelector);
          if (!box) warnings.push("상품이미지 칸을 찾지 못했습니다.");
          else {
            try {
              // 칸 하나가 `multiple` 이라 대표·추가를 한 번에 넣는다. 첫 장이 대표다.
              const transfer = new DataTransfer();
              for (const image of imageFiles.slice(0, imageSpec.max)) transfer.items.add(toFile(image));
              box.files = transfer.files;
              box.dispatchEvent(new Event("change", { bubbles: true }));
              await sleep(3000);
              steps.push(`상품이미지 ${transfer.files.length}장`);
            } catch (error) {
              warnings.push(`상품이미지 실패: ${error?.message || error}`);
            }
          }
        }

        const detailSpec = layout.detail;
        const pickTab = async (label) => {
          const tab = [...document.querySelectorAll(detailSpec.tabSelector)]
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === label);
          if (!tab) return false;
          tab.click();
          await sleep(900);
          return true;
        };
        /**
         * ⭐ 상세설명은 **ESM 에 직접 올린다.**
         *
         * 예전엔 키즈노트(diskn)에 먼저 올려 주소를 받아 HTML 로 넣었는데, 그 몰
         * 로그인이 풀리자 ESM 등록이 통째로 막혔다(라이브 2026-09-11:
         * "상품번호를 받지 못했습니다"). 남의 몰 세션에 우리 등록을 걸어 두지 않는다.
         *
         * 주소가 이미 몰이 읽을 수 있는 것이면 HTML 탭으로 넣는 길도 남겨 둔다 —
         * 단, **주 경로의 산출물로 대비 경로를 막지 않는다**(아이스크림몰에서 배운 것).
         */
        if (detailSpec && payload.detailImage && detailSpec.uploadTabLabel) {
          if (!await pickTab(detailSpec.uploadTabLabel)) {
            warnings.push("상세설명 이미지 업로드 탭을 찾지 못했습니다.");
          } else {
            // ⚠️ 파일 칸 이름이 상품이미지와 같은 `btnSelectFile` 이다. 보드 안에서 찾는다.
            const board = document.querySelector(detailSpec.uploadBoardSelector);
            const box = board && board.querySelector(detailSpec.uploadFileSelector);
            if (!box) warnings.push("상세설명 파일 칸을 찾지 못했습니다.");
            else {
              try {
                const transfer = new DataTransfer();
                transfer.items.add(toFile(payload.detailImage));
                box.files = transfer.files;
                box.dispatchEvent(new Event("change", { bubbles: true }));
                // 올라갈 때까지 지켜본다. 고정 시간으로 자르면 큰 이미지에서 놓친다.
                const until = Date.now() + 20000;
                let done = false;
                while (Date.now() < until) {
                  await sleep(500);
                  const text = (document.querySelector(detailSpec.uploadBoardSelector)?.textContent || "");
                  if (text.includes(detailSpec.uploadDoneText)) { done = true; break; }
                }
                if (done) steps.push("상세설명(이미지 업로드)");
                else warnings.push("상세설명 이미지가 올라갔는지 확인하지 못했습니다. 화면에서 보세요.");
              } catch (error) {
                warnings.push(`상세설명 실패: ${error?.message || error}`);
              }
            }
          }
        } else if (detailSpec && payload.detailHtml) {
          // 편집기가 아니라 **HTML 탭**이다. 에디터 탭에 쓰면 저장할 때 덮인다.
          await pickTab(detailSpec.tabLabel);
          const box = document.querySelector(detailSpec.textareaSelector);
          if (!box) warnings.push("상세설명 칸을 찾지 못했습니다.");
          else {
            assign(box, payload.detailHtml);
            await sleep(400);
            steps.push("상세설명(HTML 작성)");
          }
        } else if (detailSpec) {
          warnings.push("상세설명 이미지를 받지 못했습니다. 화면에서 직접 올리세요.");
        }
      }

      // 4-4) 표의 줄 제목(`th`)이 유일한 손잡이인 몰(떠리몰 · 샵바이 파트너어드민).
      //
      // 칸에 `name` 도 `id` 도 없는 React 폼이다. 줄 제목이 **정확히 같은** 줄만 집는다 —
      // `상품 상세` 와 `상품 상세(상단)` 처럼 앞이 같은 줄이 있어서 앞부분 비교는 틀린다.
      // 순서: 검색해서 고르는 칸(분류가 다른 칸을 다시 그릴 수 있다) → 목록 → 라디오 →
      // 글자칸 → 이미지 → 상세설명.
      if (payload.tableForm) {
        const table = payload.tableForm;
        const tableNorm = (text) => String(text || "").replace(/[*•]/g, "").replace(/\s+/g, " ").trim();
        const squash = (text) => tableNorm(text).replace(/\s+/g, "");
        const rowOf = (label) => [...document.querySelectorAll("th")]
          .find((th) => tableNorm(th.textContent) === label)?.closest("tr") || null;
        const shown = (el) => Boolean(el) && el.offsetParent !== null && !el.disabled;
        const firstTextBox = (row) => [...row.querySelectorAll('input[type="text"]')].find(shown) || null;

        // (a) 검색해서 고르는 칸(담당자·분류·브랜드). 목록(`li`)은 그 줄 안에 뜬다.
        for (const entry of payload.tablePicks || []) {
          const row = rowOf(entry.row);
          const box = row && firstTextBox(row);
          if (!box) { warnings.push(`${entry.row} 검색칸을 찾지 못했습니다.`); continue; }
          box.focus();
          assign(box, entry.query);
          const want = squash(entry.pick);
          const findItem = () => [...row.querySelectorAll("li")]
            .find((li) => shown(li) && squash(li.textContent) === want) || null;
          let item = null;
          const until = Date.now() + (table.pickWaitMs || 6000);
          while (!item && Date.now() < until) {
            await sleep(400);
            item = findItem();
          }
          if (!item) { warnings.push(`${entry.row} 목록에 '${entry.pick}' 가 없습니다.`); continue; }
          const listBox = item.closest("ul");
          item.click();
          await sleep(800);
          // 골라진 값은 목록 **밖**에 나타난다 — 칩(표준분류·브랜드), 표 줄(전시분류), 글자칸
          // (담당자 `노영우(nogoon92)`). 목록은 닫히기도 하고 그대로 떠 있기도 해서(분류·브랜드,
          // 라이브 실측) 목록이 닫혔는지로는 못 본다. 검색어와 고를 글자가 같으면(브랜드)
          // 글자칸 값은 우리가 친 글자일 뿐이라 증거가 안 된다.
          const picked = [...row.querySelectorAll("li, td, span")]
            .some((el) => !(listBox && listBox.contains(el)) && squash(el.textContent).includes(want))
            || (squash(entry.query) !== want
              && [...row.querySelectorAll("input")].some((el) => squash(el.value) === want));
          if (picked) steps.push(`${entry.row} ${entry.pick}`);
          else warnings.push(`${entry.row} 에서 '${entry.pick}' 를 눌렀는데 골라지지 않았습니다.`);
        }

        // (b) 목록(select). 번호는 계정마다 달라서 보이는 글자(label)로 고른다.
        //     목록은 화면이 서버에서 받아 늦게 채운다(처음엔 '등록된 템플릿이 없습니다' 한 줄).
        for (const [label, want] of Object.entries(payload.tableSelects || {})) {
          const select = rowOf(label)?.querySelector("select");
          const pickOption = () => select && [...select.options]
            .find((option) => tableNorm(option.label || option.textContent) === want);
          let option = pickOption();
          for (let waited = 0; select && !option && waited < 8000; waited += 400) {
            await sleep(400);
            option = pickOption();
          }
          if (!option) { warnings.push(`${label} 에 '${want}' 가 없습니다.`); continue; }
          assign(select, option.value);
          steps.push(`${label} ${want}`);
          await sleep(400);
        }

        // (c) 라디오.
        for (const [label, value] of Object.entries(payload.tableRadios || {})) {
          const radio = rowOf(label)?.querySelector(`input[type="radio"][value="${CSS.escape(value)}"]`);
          if (!radio) { warnings.push(`${label} '${value}' 를 찾지 못했습니다.`); continue; }
          if (!radio.checked) radio.click();
          steps.push(`${label} ${value}`);
          await sleep(300);
        }

        // (d) 글자칸 — 그 줄의 첫 번째 보이는 글자칸.
        for (const [label, value] of Object.entries(payload.tableFields || {})) {
          const row = rowOf(label);
          const box = row && firstTextBox(row);
          if (!box) { warnings.push(`${label} 칸을 찾지 못했습니다.`); continue; }
          assign(box, value);
          box.dispatchEvent(new Event("blur", { bubbles: true }));
          steps.push(label);
        }

        // (e) 이미지. 칸이 처음엔 없는 줄(추가이미지)은 `이미지 추가` 를 눌러 늘린다.
        //     파일 칸은 `파일찾기` 버튼 안에 숨어 있다. 올릴 때마다 화면이 줄을 다시 그릴 수
        //     있어 칸은 매번 새로 찾는다.
        for (const slot of table.images || []) {
          const files = ((payload.imageGroups || {})[slot.key] || []).slice(0, slot.max || 1);
          if (files.length === 0) continue;
          const row = rowOf(slot.row);
          if (!row) { warnings.push(`${slot.row} 줄을 찾지 못했습니다.`); continue; }
          const boxes = () => [...row.querySelectorAll('input[type="file"]')];
          if (slot.addLabel) {
            const add = [...row.querySelectorAll("button")]
              .find((el) => tableNorm(el.textContent) === slot.addLabel);
            if (!add) { warnings.push(`${slot.row} '${slot.addLabel}' 버튼을 찾지 못했습니다.`); continue; }
            for (let i = boxes().length; i < files.length; i += 1) {
              add.click();
              await sleep(400);
            }
          }
          let placed = 0;
          for (const [index, image] of files.entries()) {
            const box = boxes()[index];
            if (!box) { warnings.push(`${slot.row} ${index + 1}번 칸이 없습니다.`); break; }
            try {
              const transfer = new DataTransfer();
              transfer.items.add(toFile(image));
              box.files = transfer.files;
              box.dispatchEvent(new Event("change", { bubbles: true }));
              await sleep(2500);
              placed += 1;
            } catch (error) {
              warnings.push(`${slot.row} ${index + 1}번 실패: ${error?.message || error}`);
            }
          }
          if (placed > 0) steps.push(`${slot.row} ${placed}장`);
        }

        // (f) 상세설명 — Summernote. 그림 버튼으로 파일을 넣으면 몰이 자기 서버에 올리고
        //     그 주소로 그림을 넣는다. 그림 창을 열 때마다 파일 칸이 새로 생겨서 연 뒤에 찾는다.
        //     `data:` 로 박히면 몰 서버에 올라간 것이 아니다 — 성공으로 치지 않는다.
        const note = table.summernote;
        if (note && payload.detailImage?.dataUrl) {
          const row = rowOf(note.row);
          const radio = row?.querySelector(`input[type="radio"][value="${CSS.escape(note.radio)}"]`);
          if (radio && !radio.checked) {
            radio.click();
            await sleep(1200);
          }
          const editor = row?.querySelector(".note-editor");
          const picture = editor && [...editor.querySelectorAll(".note-toolbar button")].find((button) =>
            /그림|picture/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`)
            || Boolean(button.querySelector(".note-icon-picture")));
          if (!picture) {
            warnings.push("상세설명 편집기의 그림 버튼을 찾지 못했습니다. 화면에서 직접 올리세요.");
          } else {
            picture.click();
            await sleep(800);
            const input = document.querySelector(".note-modal.open input.note-image-input")
              || document.querySelector("input.note-image-input");
            if (!input) {
              warnings.push("상세설명 그림 창의 파일 칸을 찾지 못했습니다. 화면에서 직접 올리세요.");
            } else {
              const transfer = new DataTransfer();
              transfer.items.add(toFile(payload.detailImage));
              input.files = transfer.files;
              input.dispatchEvent(new Event("change", { bubbles: true }));
              // 몰은 `//shopby-images.cdn-nhncommerce.com/…` 처럼 스킴 없는 주소로 넣는다(라이브 실측).
              const uploaded = () => [...editor.querySelectorAll(".note-editable img")]
                .find((el) => /^(https?:)?\/\//.test(el.getAttribute("src") || "")) || null;
              const until = Date.now() + (note.uploadWaitMs || 15000);
              while (!uploaded() && Date.now() < until) await sleep(500);
              if (uploaded()) steps.push("상세설명 이미지(몰 편집기에 올림)");
              else warnings.push("상세설명 이미지를 편집기에 올렸는데 들어가지 않았습니다. 화면에서 확인하세요.");
            }
          }
        }
      }

      // 5) 이름 없는 칸들. 폼으로 못 닿아 선택자로 찾는다.
      //
      // 계단식(원산지)이라 순서와 기다림이 중요하다. 앞 칸을 고르기 전에 뒤 칸을
      // 건드리면 목록이 비어 있어 아무것도 안 들어간다.
      for (const entry of payload.selectorFields || []) {
        const want = payload.selectorFieldValues[entry.key];
        if (want === undefined || want === "") continue;
        const el = document.querySelector(entry.selector);
        if (!el) { warnings.push(`${entry.label || entry.key} 칸을 찾지 못했습니다.`); continue; }
        /**
         * ⚠️ 잠긴 칸은 **조용히 지나가면 안 된다**(라이브 2026-09-11, 보리보리 담당MD).
         *
         * `disabled` 인 칸에 값을 넣으면 아무 일도 안 일어나는데 우리는 '채웠다' 고
         * 보고했다. 사장님 화면에서는 필수 칸이 빈 채로 남아 **거기서 멈춘 것처럼**
         * 보였다. 못 넣었으면 못 넣었다고 말해야 사람이 손댈 곳을 안다.
         */
        if (el.disabled) {
          warnings.push(`${entry.label || entry.key} 칸이 잠겨 있어 넣지 못했습니다. 화면에서 직접 고르세요.`);
          continue;
        }
        // 계단식 목록은 앞 단을 고른 뒤 AJAX 로 채워진다. 고를 항목이 생길 때까지 본다.
        if (el.tagName === "SELECT" && entry.waitForOption) {
          const until = Date.now() + 8000;
          while (![...el.options].some((option) => option.value === want) && Date.now() < until) {
            await sleep(250);
          }
        }
        assign(el, want);
        // 고른 값이 목록에 없으면 브라우저가 조용히 빈 값으로 되돌린다. 그냥 넘기지 않는다.
        if (el.tagName === "SELECT" && el.value !== want) {
          warnings.push(`${entry.label || entry.key} 에 '${want}' 가 목록에 없습니다.`);
          continue;
        }
        steps.push(entry.label || entry.key);
        if (entry.waitMs) await sleep(entry.waitMs);
      }

      // 5-1) 다 고른 뒤 눌러야 반영되는 버튼(꼬망세 `선택 카테고리 추가`).
      //
      // 누르고 끝내지 않는다 — 반영의 증거(`expectSelector`)가 늘어나는지 본다. 고른 값이
      // 하나라도 빠졌으면 누르지 않는다. 반쯤 고른 분류를 붙이면 엉뚱한 자리에 걸린다.
      for (const entry of payload.afterSelectorClicks || []) {
        if (entry.requireFilled) {
          const complete = (payload.selectorFields || []).every((field) => {
            const want = payload.selectorFieldValues[field.key];
            if (want === undefined || want === "") return true;
            const box = document.querySelector(field.selector);
            return Boolean(box) && box.value === want;
          });
          if (!complete) {
            warnings.push(`고를 칸이 다 채워지지 않아 '${entry.text}' 를 누르지 않았습니다.`);
            continue;
          }
        }
        const button = [...document.querySelectorAll("a,button,input[type=button]")]
          .find((el) => (el.textContent || el.value || "").replace(/\s+/g, " ").trim() === entry.text);
        if (!button) { warnings.push(`'${entry.text}' 버튼을 찾지 못했습니다.`); continue; }
        const before = entry.expectSelector ? document.querySelectorAll(entry.expectSelector).length : 0;
        button.click();
        await sleep(entry.waitMs || 1000);
        if (entry.expectSelector) {
          const until = Date.now() + 8000;
          let after = document.querySelectorAll(entry.expectSelector).length;
          while (after <= before && Date.now() < until) {
            await sleep(400);
            after = document.querySelectorAll(entry.expectSelector).length;
          }
          if (after <= before) {
            warnings.push(`'${entry.text}' 를 눌렀는데 반영되지 않았습니다. 화면에서 확인하세요.`);
            continue;
          }
        }
        steps.push(entry.label || entry.text);
      }

      // 5-2) 고른 분류가 그려 주는 줄들. 이름이 같아 속성 값(키드키즈 `info`)으로 가린다.
      //
      // 줄은 AJAX 로 온다. 기다리지 않으면 0줄을 보고 지나간다. 없는 줄은 경고한다 —
      // 몰이 고시 항목을 바꾸면 그 칸이 빈 채로 제출되기 때문이다.
      const infoSpec = payload.infoRows;
      const infoValues = payload.infoRowValues || {};
      if (infoSpec && Object.keys(infoValues).length > 0) {
        const until = Date.now() + (infoSpec.timeoutMs || 8000);
        let boxes = [...document.querySelectorAll(infoSpec.itemSelector)];
        while (boxes.length === 0 && Date.now() < until) {
          await sleep(300);
          boxes = [...document.querySelectorAll(infoSpec.itemSelector)];
        }
        let placed = 0;
        const absent = [];
        for (const [key, value] of Object.entries(infoValues)) {
          const box = boxes.find((el) => el.getAttribute(infoSpec.attr) === key);
          if (!box) { absent.push(key); continue; }
          assign(box, value);
          placed += 1;
        }
        if (placed > 0) steps.push(`${infoSpec.label} ${placed}줄`);
        if (absent.length > 0) {
          warnings.push(`${infoSpec.label} 칸 ${absent.length}개가 화면에 없습니다: ${absent.join(", ")}`);
        }
      }

      // 저장된 주소는 하나뿐인 경우가 많다. 내부 번호를 적어두지 않고 첫 항목을 고른다.
      for (const name of payload.selectFirstOptions || []) {
        const el = field(name);
        if (!el || el.tagName !== "SELECT") { warnings.push(`${name} 칸이 없습니다.`); continue; }
        const option = [...el.options].find((entry) => entry.value);
        if (!option) { warnings.push(`${name} 에 고를 항목이 없습니다. 화면에서 먼저 등록하세요.`); continue; }
        if (el.value !== option.value) { el.value = option.value; fire(el); }
      }

      // 6) 라디오 · 체크박스 — **누른다**. 값만 바꾸지 않는다.
      //
      // `checked = true` 에 change 이벤트를 얹는 것으로는 부족하다. 도매꾹은 라디오에
      // click 을 걸어 두어서, 이벤트만 쏘면 값은 바뀌어도 화면이 그대로다. 대표이미지
      // 방식이 전문가용으로 넘어가지 않아 `image1~4` 가 숨은 칸으로 남고, 거기 넣은
      // 사진이 통째로 사라진다(라이브 확인 2026-09-10: 이벤트=모드 그대로, 클릭=전환).
      for (const [name, value] of Object.entries(payload.radios)) {
        const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
          .find((el) => el.value === value);
        if (!hit) { warnings.push(`라디오 ${name}=${value} 를 찾지 못했습니다.`); continue; }
        if (!hit.checked) hit.click();
        fire(hit);
      }
      for (const [name, on] of Object.entries(payload.checks)) {
        // `market[]:dome` 처럼 값까지 지정한 형태를 받는다.
        const [rawName, wantValue] = name.split(":");
        const list = [...form.querySelectorAll(`[name="${CSS.escape(rawName)}"]`)];
        const hit = wantValue ? list.find((el) => el.value === wantValue) : list[0];
        if (!hit) { warnings.push(`체크박스 ${name} 를 찾지 못했습니다.`); continue; }
        if (hit.checked !== Boolean(on)) hit.click();
        fire(hit);
      }

      // 이름이 없어 폼으로는 못 닿는 체크박스. 키워드 칸과 같은 사정이다.
      for (const entry of payload.selectorChecks || []) {
        const want = payload.selectorCheckValues[entry.key];
        if (want === undefined) continue;
        const box = form.querySelector(entry.selector);
        if (!box) { warnings.push(`${entry.label || entry.key} 칸을 찾지 못했습니다.`); continue; }
        if (box.checked !== Boolean(want)) box.click();
        steps.push(`${entry.label || entry.key} ${want ? "켬" : "끔"}`);
      }

      // 라디오가 화면을 갈아끼우는 경우가 있다(대표이미지 방식). 다시 그려질 시간을
      // 준 뒤에 이미지를 넣는다 — 바뀌기 전 칸에 넣으면 그대로 버려진다.
      await sleep(900);

      // 7) 상품분류 — 이름으로 한 단씩 눌러 들어간 뒤 '적용'.
      //
      // 값이 코드가 아니라 이름이라 보이는 글자로 찾는다. 한 단을 누르면 다음 칸이
      // 채워지므로 순서와 기다림이 중요하다. 한 상품에 여러 분류를 붙일 수 있다.
      const picker = payload.categoryPicker;
      for (const path of (picker ? payload.categoryPaths || [] : [])) {
        const table = document.getElementById(picker.tableId);
        if (!table) { warnings.push("상품분류 표를 찾지 못했습니다."); break; }
        let walked = 0;
        for (const name of path) {
          const columns = [...table.querySelectorAll("ul")];
          const column = columns[walked];
          const item = column
            ? [...column.querySelectorAll(picker.itemSelector)]
              .find((el) => (el.textContent || "").includes(name))
            : null;
          if (!item) break;
          item.click();
          walked += 1;
          await sleep(picker.stepWaitMs);
        }
        if (walked < path.length) {
          warnings.push(`상품분류 '${path.join(" > ")}' 에서 '${path[walked]}' 를 찾지 못했습니다.`);
          continue;
        }
        const apply = [...document.querySelectorAll("a,button")]
          .find((el) => ((el.textContent || "").replace(/\s+/g, " ").trim() === picker.applyText));
        if (!apply) { warnings.push("상품분류 적용 버튼을 찾지 못했습니다."); break; }
        apply.click();
        await sleep(picker.applyWaitMs);
        steps.push(`분류 ${path[path.length - 1]}`);
      }

      // 7-1) 분류 검색 — 이 몰이 '분류 먼저'가 아니면 여기서 한다.
      if (!payload.categoryFirst) await runCategorySearch();

      // 7-2) 분류 연결 — 레이어를 열어 단계 목록에서 이름으로 고르고 '연결'을 누른다.
      //
      // 앞의 두 방식과 다른 점은 **고른 뒤 따로 연결 버튼을 눌러야** 폼에 붙는다는
      // 것이다. 누르면 몰이 숨은 `connectCategory[]` 를 만들고 화면의 '연결된
      // 카테고리' 표에도 줄을 더한다. 끝나면 창은 닫아 준다 — 열린 채로 두면
      // 사람이 폼을 못 본다.
      const connect = payload.categoryConnect;
      if (connect && (payload.categoryPaths || []).length > 0) {
        const opener = document.getElementById(connect.openButtonId);
        if (!opener) {
          warnings.push("분류 연결 버튼을 찾지 못했습니다.");
        } else {
          opener.click();
          await sleep(connect.stepWaitMs);
          const layer = document.forms[connect.formName];
          if (!layer) {
            warnings.push("분류 연결 창이 열리지 않았습니다.");
          } else {
            for (const path of payload.categoryPaths) {
              let walked = 0;
              for (const name of path.slice(0, connect.levels)) {
                const select = layer.elements[`${connect.levelPrefix}${walked + 1}`];
                const option = select
                  ? [...select.options].find((el) => (el.textContent || "").trim() === name)
                  : null;
                if (!option) break;
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                walked += 1;
                await sleep(connect.stepWaitMs);
              }
              if (walked < path.length) {
                warnings.push(`분류 '${path.join(" > ")}' 에서 '${path[walked]}' 를 찾지 못했습니다.`);
                continue;
              }
              const button = document.getElementById(connect.connectButtonId);
              if (!button) { warnings.push("'카테고리 연결' 버튼을 찾지 못했습니다."); break; }
              button.click();
              await sleep(connect.connectWaitMs);
              steps.push(`분류 ${path[path.length - 1]}`);
            }
            layer.closest(".ui-dialog")?.querySelector(".ui-dialog-titlebar-close")?.click();
            await sleep(400);
          }
        }
      }

      // 8) 대표이미지 — 폼 밖의 파일 칸에 넣는다. Cafe24 가 네 크기를 만든다.
      const repInput = payload.imageFileInput;
      if (repInput && payload.repImage?.dataUrl) {
        const box = document.querySelector(repInput.selector);
        if (!box) {
          warnings.push(`${repInput.label} 칸을 찾지 못했습니다.`);
        } else {
          try {
            const transfer = new DataTransfer();
            transfer.items.add(toFile(payload.repImage));
            box.files = transfer.files;
            box.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(repInput.waitMs);
            steps.push(repInput.label);
          } catch (error) {
            warnings.push(`${repInput.label} 실패: ${error?.message || error}`);
          }
        }
      }

      // 8-1) 숨은 파일 칸 여러 개(올웨이즈). 화면 순서로 잡는다.
      const fileInputs = payload.imageFileInputs;
      if (fileInputs && fileInputs.length > 0) {
        const boxes = [...document.querySelectorAll('input[type="file"]')];
        for (const [index, slot] of fileInputs.entries()) {
          const files = (payload.imageGroups || {})[slot.key] || [];
          if (files.length === 0) continue;
          // 선택자가 있으면 그걸 쓴다. 11번가는 같은 id 가 옵션 이미지 쪽에도 있어서
          // 화면 순서로 세면 엉뚱한 칸을 집는다.
          const box = slot.selector ? document.querySelector(slot.selector) : boxes[index];
          if (!box) { warnings.push(`${slot.label} 칸을 찾지 못했습니다.`); continue; }
          try {
            const transfer = new DataTransfer();
            for (const image of files) transfer.items.add(toFile(image));
            box.files = transfer.files;
            box.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(3500);
            steps.push(`${slot.label} ${files.length}장`);
          } catch (error) {
            warnings.push(`${slot.label} 실패: ${error?.message || error}`);
          }
        }
      }

      // 8-1-0) 칸을 늘려 가며 넣는 이미지(아이스크림몰 추가 이미지 · 꼬망세 상세 2~5).
      //
      // 구역은 id(`section`)로 찾는다. id 가 없는 몰(꼬망세)은 기준 칸(`anchorSelector`)
      // 에서 올라가 찾는다(`sectionClosest`). 누를 버튼도 글자(`addLabel`) 대신
      // 선택자(`addSelector`)로 줄 수 있다.
      const repeat = payload.imageRepeat;
      if (repeat) {
        const files = (payload.imageGroups || {})[repeat.groupKey] || [];
        const want = Math.min(files.length, repeat.max);
        const section = repeat.anchorSelector
          ? document.querySelector(repeat.anchorSelector)?.closest(repeat.sectionClosest) || null
          : document.getElementById(repeat.section);
        if (want > 0 && !section) {
          warnings.push(`${repeat.label} 구역을 찾지 못했습니다.`);
        } else if (want > 0) {
          const add = repeat.addSelector
            ? section.querySelector(repeat.addSelector)
            : [...section.querySelectorAll("button")]
              .find((el) => (el.textContent || "").trim() === repeat.addLabel);
          const slotSelector = repeat.slotSelector || 'input[type="file"][name^="imgInfo"]';
          const slots = () => section.querySelectorAll(slotSelector).length;
          // 번호가 2 부터면(꼬망세) 1번 칸은 이미 있는 다른 칸이다. 그만큼 더 있어야
          // 우리 칸이 다 생긴다.
          const first = repeat.firstIndex || 0;
          const base = first > 1 ? first - 1 : 0;
          if (!add) {
            warnings.push(`${repeat.label} 추가 버튼을 찾지 못했습니다.`);
          } else {
            // 배경 탭은 `setTimeout` 이 1초에 한 번으로 묶인다. 사이에 기다리면 한 장에
            // 1초씩 걸리므로 모자란 만큼 연속으로 누르고 한 번만 가라앉힌다(티처몰과 같다).
            for (let i = slots(); i < base + want; i += 1) add.click();
            await sleep(1200);
            let placed = 0;
            for (let i = 0; i < want; i += 1) {
              const name = repeat.namePattern
                .replace("{i}", String(i))
                .replace("{n}", String(first + i));
              // 같은 이름의 글자 칸(외부 주소용)이 있는 몰이 있다(꼬망세). 파일 칸만 집는다.
              const box = section.querySelector(`input[type="file"][name="${name}"]`);
              if (!box) { warnings.push(`${repeat.label} ${i + 1}번 칸이 없습니다.`); continue; }
              try {
                const transfer = new DataTransfer();
                transfer.items.add(toFile(files[i]));
                box.files = transfer.files;
                box.dispatchEvent(new Event("change", { bubbles: true }));
                await sleep(2500);
                placed += 1;
              } catch (error) {
                warnings.push(`${repeat.label} ${i + 1}번 실패: ${error?.message || error}`);
              }
            }
            if (placed > 0) steps.push(`${repeat.label} ${placed}장`);
          }
        }
        if (files.length > repeat.max) {
          warnings.push(`${repeat.label}는 ${repeat.max}장까지라 앞의 ${repeat.max}장만 넣었습니다.`);
        }
      }

      // 8-1-1) 창을 열어 넣는 이미지(11번가).
      //
      // 넣으면 몰이 자기 CDN 으로 올리고 창을 스스로 닫는다(라이브 확인: 넣은 뒤
      // `cdn.011st.com/tmp_pd/...` 썸네일이 붙고 창이 사라졌다).
      for (const slot of payload.imageDialogs || []) {
        const files = (payload.imageGroups || {})[slot.key] || [];
        if (files.length === 0) continue;
        const body = document.getElementById(slot.section);
        const want = slot.row.replace(/\s+/g, "");
        const row = body && [...body.querySelectorAll(".b-box__row")].find((el) => {
          const title = el.querySelector(".b-box__title");
          if (!title) return false;
          const text = (title.textContent || "").replace(/\s+/g, "").replace(/필수입력|도움말/g, "");
          // 제목이 같은 줄이 여럿이라 '+' 가 있는 줄만 고른다.
          return text.startsWith(want) && el.querySelector("button.c-addimg__btn-add");
        });
        const add = row && row.querySelector("button.c-addimg__btn-add");
        if (!add) { warnings.push(`${slot.label} 등록 버튼을 찾지 못했습니다.`); continue; }
        add.click();
        let box = null;
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await sleep(400);
          const open = [...document.querySelectorAll('[id^="dialog-"]')]
            .filter((el) => el.offsetParent !== null)
            .find((el) => el.querySelector('input[type="file"]'));
          if (open) { box = open.querySelector('input[type="file"]'); break; }
        }
        if (!box) { warnings.push(`${slot.label} 창이 열리지 않았습니다.`); continue; }
        try {
          const transfer = new DataTransfer();
          for (const image of files) transfer.items.add(toFile(image));
          box.files = transfer.files;
          box.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(slot.waitMs || 6000);
          steps.push(`${slot.label} ${files.length}장`);
        } catch (error) {
          warnings.push(`${slot.label} 실패: ${error?.message || error}`);
        }
      }

      // 8-2) 몰 서버에 올린 뒤 칸을 채운다(티처몰).
      //
      // 파일 칸이 없는 몰이다. 사진 하나를 올리면 서버가 일곱 크기를 만들어 두고,
      // 우리는 '+' 로 줄을 만들어 그 줄의 숨은 칸 일곱 개에 주소를 넣는다.
      // 크기 이름은 칸 이름에서 읽는다 — 목록을 우리가 들고 있지 않는다.
      const upload = payload.imageUpload;
      const photos = upload ? (payload.imageGroups || {})[upload.groupKey] || [] : [];
      if (upload && photos.length > 0) {
        const table = document.getElementById(upload.tableId);
        if (!table) {
          warnings.push(`${upload.label} 표(#${upload.tableId})를 찾지 못했습니다.`);
        } else {
          let placed = 0;
          for (const [index, image] of photos.entries()) {
            try {
              const body = new FormData();
              body.append(upload.field, toFile(image));
              const response = await fetch(upload.endpoint, {
                method: "POST", body, credentials: "include",
              });
              const parsed = await response.json();
              const result = Array.isArray(parsed) ? parsed[0] : parsed;
              if (!result || result.status !== 1) {
                throw new Error(result?.msg || `응답 ${response.status}`);
              }
              // '등록된 사진이 없습니다' 줄은 비워야 첫 줄이 제자리에 들어간다.
              table.querySelectorAll(upload.emptyRowSelector).forEach((row) => row.remove());
              const add = document.getElementById(upload.addButtonId);
              if (!add) throw new Error(`줄 추가 버튼(#${upload.addButtonId})이 없습니다.`);
              add.click();
              await sleep(300);
              const rows = [...table.querySelectorAll("tbody tr")];
              const row = rows[rows.length - 1];
              const slots = row ? [...row.querySelectorAll(`input[name$="${upload.slotSuffix}"]`)] : [];
              if (slots.length === 0) throw new Error("사진 줄이 만들어지지 않았습니다.");
              for (const slot of slots) {
                const size = slot.name.slice(0, -upload.slotSuffix.length);
                slot.value = `${result.newFile}${size}${result.ext}`;
                // 몰이 하는 그대로 '보기'를 눌러 볼 수 있게 바꾼다. 안 하면 주소는
                // 들어갔는데 회색 글씨로 남아 사람이 안 들어간 줄 안다.
                const view = slot.closest("td")?.querySelector("span.view");
                if (view) { view.classList.remove("desc"); view.classList.add("hand", "blue"); }
              }
              // 사진을 보여 준다.
              //
              // 이 몰은 사진 칸을 '보기' 라는 **글자**로만 그린다. 저장된 상품도
              // 마찬가지라 눌러 보기 전에는 뭐가 들어갔는지 알 수 없다. 그러면 사람이
              // 채워진 폼을 보고도 "사진이 안 들어갔다"고 판단한다(실제로 그랬다).
              // 몰의 업로드 팝업이 하는 그대로 작은 그림을 붙여 눈으로 확인하게 한다.
              // 폼 값이 아니라 화면일 뿐이라 제출에는 영향이 없다.
              const previewSlot = slots.find((slot) => slot.name.startsWith("view"));
              const previewCell = previewSlot?.closest("td");
              if (previewCell && !previewCell.querySelector("img.kiditem-shot")) {
                const shot = document.createElement("img");
                shot.className = "kiditem-shot";
                shot.src = previewSlot.value;
                shot.height = 64;
                shot.title = `${upload.label} ${index + 1} — 키드아이템이 넣었습니다`;
                shot.style.cssText = "display:block;margin:4px auto 0;border:1px solid #ddd";
                previewCell.appendChild(shot);
              }
              placed += 1;
            } catch (error) {
              warnings.push(`${upload.label} ${index + 1}번째 실패: ${error?.message || error}`);
            }
          }
          if (placed > 0) steps.push(`${upload.label} ${placed}장`);
        }
      }

      // 9) 이미지 — data URL 을 File 로 되돌려 DataTransfer 로 넣는다.
      for (const image of payload.images || []) {
        const input = field(image.name);
        if (!input) { warnings.push(`이미지 칸 ${image.name} 이 없습니다.`); continue; }
        try {
          const transfer = new DataTransfer();
          transfer.items.add(toFile(image));
          input.files = transfer.files;
          fire(input);
          steps.push(`이미지 ${image.name}`);
        } catch (error) {
          warnings.push(`이미지 ${image.name} 실패: ${error?.message || error}`);
        }
      }

      // 10) 분류 추천 받기. 이미지 분석이 끝나야 뜨므로 이미지 뒤에 온다.
      const accept = payload.acceptRecommendation;
      if (accept && (payload.images || []).length > 0) {
        const found = await waitForRecommendation(accept);
        if (found) {
          found.click();
          await sleep(1200);
          steps.push("추천 분류 적용");
        } else {
          warnings.push("분류 추천이 뜨지 않았습니다. 화면에서 직접 고르세요.");
        }
      }

      // 11) 상세설명 — 팝업 에디터가 없는 몰만 여기서 넣는다.
      //    도매꾹은 '상품상세내용 작성하기' 버튼을 눌러 에디터로 넣으므로 여기 오지
      //    않는다(`register()` 가 폼 채움 뒤에 따로 몰고 간다).
      //
      // ⚠️ 넣을 것이 **HTML 이거나 올릴 이미지**면 들어온다. 몰이 자기 서버에 받아
      //    주는 경우(아트공구)는 주소를 미리 만들지 않아 `detailHtml` 이 비어 있다.
      //    HTML 만 보고 막으면 그 몰은 이 단계가 통째로 건너뛰어져 상세설명도,
      //    편집기 탭 전환도 일어나지 않는다(라이브 확인 2026-09-10).
      const hasDetailWork = Boolean(payload.detailHtml) || Boolean(payload.detailImage?.dataUrl);

      // 11-0) SmartEditor 2(아이스크림몰). 편집면 iframe 과 뒷단 textarea 를 함께 채운다.
      //       둘 다 해야 한다 — 화면에도 보이고 제출값도 맞는다.
      const se2 = payload.detailSmartEditor;
      if (se2 && !hasDetailWork) {
        // 조용히 건너뛰면 상품 설명이 빈 채로 등록된다. 반드시 말한다.
        warnings.push("상세설명에 넣을 것이 없습니다. 상세페이지를 먼저 확정하세요.");
      }
      // ⚠️ `detailHtml` 로 막지 않는다.
      //
      // 그 값은 남의 호스팅(diskn)이 성공해야 생기는데, **몰 업로드는 바로 그게 없을
      // 때 쓰라고 만든 길**이다. `detailHtml` 뒤에 가뒀더니 호스팅이 실패한 순간
      // 업로드까지 통째로 건너뛰어져 상세설명이 세 번 연속 빈 채로 남았다
      // (라이브 2026-09-11). 올릴 이미지가 있으면 들어온다.
      if (se2 && hasDetailWork) {
        // 구역 id 안에 칸이 있는 몰(아이스크림)과, textarea 자체에 id 가 있는 몰(꼬망세)이 있다.
        // 꼬망세는 같은 화면에 에디터가 둘이라 textarea 의 부모 칸으로 좁혀야 한다.
        const area = se2.section
          ? document.getElementById(se2.section)
          : (document.getElementById(se2.anchorId)?.parentElement || null);
        const box = area?.querySelector(`textarea[name="${se2.target}"]`);

        /**
         * SmartEditor 2 에 HTML 을 넣는 길은 **HTML 탭뿐**이다.
         *
         * 편집면(`iframe#se2_iframe`)의 `body.innerHTML` 에 직접 써 봐야 소용없다 —
         * 에디터가 제 모델로 다시 그리면서 1초쯤 뒤 `<p><br></p>` 로 되돌린다
         * (라이브 실측 2026-09-11: 쓰기 직후 77자 → 1초 뒤 11자). 그래서 두 번이나
         * 빈 채로 등록될 뻔했다.
         *
         * 사람이 하는 것과 같은 순서로 간다 —
         *   `HTML` 탭 → 소스 textarea 에 붙여넣기 → `Editor` 탭으로 복귀.
         * 그러면 에디터가 그 HTML 을 제 모델로 읽어 들여 7초 뒤에도 남는다.
         */
        const skin = area
          ? [...document.querySelectorAll("iframe")].find((el) => area.contains(el))
          : null;

        /**
         * 이미지를 **몰 서버에 먼저 올린다.**
         *
         * 에디터의 `사진` 버튼이 여는 팝업이 쓰는 그 엔드포인트다(라이브 실측
         * 2026-09-11: `attach_photo.js` → `POST /common/file/uploadImgEditor.do`,
         * 칸 이름 `UPLOAD_FILE`, 응답 `{Val:"sFileURL=/files/editor/…"}`).
         * 팝업을 열지 않는다 — 확장이 여는 창은 팝업 차단에 걸린다.
         *
         * 남의 호스팅 주소를 그대로 두면 몰이 "이미지가 출력되는지 확인하세요"
         * 라고 경고하는 그 상태가 된다. 몰 주소로 바꿔 두면 그 걱정이 사라진다.
         */
        let detailHtml = payload.detailHtml;
        const upload = se2.upload;
        if (upload && payload.detailImage?.dataUrl) {
          try {
            const file = toFile(payload.detailImage);
            let hosted = "";
            if (upload.mode === "html5") {
              /**
               * SmartEditor 2 표준 샘플(`file_uploader_html5.php`, 꼬망세).
               *
               * 파일 바이트를 **본문 그대로** 보내고 이름·크기·형식은 헤더로 준다 — 에디터의
               * `callAjaxForHTML5` 가 그렇게 한다(실측 `attach_photo.js`). 답은 JSON 이 아니라
               * `sFileInfo=…&sFileName=…&sFileURL=…` 글자다. 형식을 거절하면 `NOTALLOW_` 다.
               */
              const response = await fetch(upload.endpoint, {
                method: "POST",
                body: file,
                credentials: "include",
                headers: {
                  contentType: "multipart/form-data",
                  "file-name": encodeURIComponent(file.name),
                  "file-size": String(file.size),
                  "file-Type": file.type,
                },
              });
              // ⚠️ 꼬망세 서버는 PHP Notice 경고문(HTML)을 **응답 앞에** 찍고 그 뒤에
              // `&bNewLine=true&sFileName=…&sFileURL=https://nfile.edupre.co.kr/…` 를 붙인다
              // (라이브 실측 2026-09-11, 747자 중 뒤 220자). 앞부분만 잘라 보면 주소가 없다 —
              // 반드시 **전체 응답**을 `&` 로 쪼개 본다.
              const text = await response.text();
              if (text.includes("NOTALLOW_")) throw new Error("몰이 이 이미지 형식을 받지 않습니다.");
              for (const part of text.split("&")) {
                const at = part.indexOf("=");
                if (at > 0 && part.slice(0, at) === "sFileURL") hosted = part.slice(at + 1).trim();
              }
            } else {
              const body = new FormData();
              body.append(upload.field, file);
              const sig = document.querySelector('input[name="csSignature"]')?.value;
              if (sig) body.append("csSignature", sig);
              const response = await fetch(upload.endpoint, {
                method: "POST", body, credentials: "include",
              });
              const parsed = await response.json();
              hosted = new URLSearchParams(parsed?.Val || "").get("sFileURL") || "";
            }
            if (!hosted) throw new Error("응답에 주소가 없습니다.");
            // 상대 주소면 몰 주소로 굳힌다. 구매자 화면이 다른 도메인일 수 있다.
            hosted = new URL(hosted, location.origin).href;
            // 실측 등록물이 폭을 적은 몰(아이스크림 900)만 적는다.
            const width = upload.imgWidth ? ` width="${upload.imgWidth}"` : "";
            detailHtml = `<center><img src="${hosted}"${width}></center>`;
            steps.push("상세이미지 몰 업로드");
          } catch (error) {
            warnings.push(
              `상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`,
            );
          }
        }
        if (!detailHtml) {
          // 올리지도 못했고 읽을 수 있는 주소도 없다. 넣을 것이 없다는 사실을 말한다.
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }
        let wrote = false;
        const deadline = detailHtml ? Date.now() + 15000 : 0;
        while (Date.now() < deadline) {
          let doc = null;
          try { doc = skin?.contentDocument || null; } catch { doc = null; }
          const source = doc?.querySelector(se2.sourceSelector);
          const toSource = doc?.querySelector(se2.toSourceSelector);
          const toEditor = doc?.querySelector(se2.toEditorSelector);
          if (!source || !toSource || !toEditor) { await sleep(500); continue; }
          try {
            toSource.click();
            await sleep(600);
            assign(source, detailHtml);
            await sleep(400);
            toEditor.click();
            await sleep(1500);
            const inner = doc.querySelector("iframe#se2_iframe");
            const written = inner?.contentDocument?.body?.innerHTML || "";
            // 빈 문단만 남았으면 들어간 것이 아니다. 길이로 보지 말고 내용으로 본다.
            wrote = written.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "").trim().length > 0;
          } catch (error) {
            warnings.push(`상세설명을 넣지 못했습니다: ${error?.message || error}`);
          }
          break;
        }
        // 제출값은 뒷단 textarea 가 들고 간다. 에디터가 제출 때 맞추지만 함께 채워 둔다.
        if (box) assign(box, detailHtml);
        if (wrote) steps.push("상세설명");
        else warnings.push("상세설명 편집기에 넣지 못했습니다. 화면에서 직접 넣으세요.");
      }

      if (!se2 && (payload.detailHtmlTarget || payload.detailSelector) && hasDetailWork) {
        // 위지윅 에디터가 붙은 칸은 에디터에 넣어야 한다. 숨은 textarea 에 써 봐야
        // 제출할 때 에디터 내용으로 덮인다.
        const spec = payload.detailRich;
        let rich = null;
        const self = payload.detailSelfUpload;
        // 편집기 파일매니저로 올리는 몰(아트공구 Froala)만 여기서 올린다. 자기 에디터 업로드를
        // 따로 가진 몰(키드키즈 TinyMCE)은 아래 그 에디터 갈래에서 올린다.
        if (Array.isArray(self?.editors) && payload.detailImage?.dataUrl) {
          // 편집기 탭을 먼저 연다. 기본 탭에서는 편집기가 숨어 있어 값을 넣어도
          // 사람 눈에는 빈 칸으로 보인다.
          if (self.tabSelector) {
            const tab = document.querySelector(self.tabSelector);
            if (tab) { tab.click(); await sleep(1200); }
            else warnings.push("상세설명 '직접 작성' 탭을 찾지 못했습니다.");
          }
          // 편집기의 파일매니저에 올려 Cafe24 주소를 받는다. 남의 호스팅을 거치면
          // 핫링크 차단에 걸려 구매자에게 깨진 이미지가 보인다.
          const editors = window.$Editor || {};
          const first = editors[(self.editors || [])[0]];
          const endpoint = first?.opts?.filesManagerUploadURL;
          if (!endpoint) {
            warnings.push("상세설명 업로드 주소를 찾지 못했습니다. 화면에서 직접 넣으세요.");
          } else {
            try {
              const body = new FormData();
              body.append(first.opts.fileUploadParam || "file", toFile(payload.detailImage));
              const response = await fetch(endpoint, { method: "POST", body, credentials: "include" });
              const result = await response.json();
              const link = String(result?.link || "").trim();
              if (!link) throw new Error(result?.error || "업로드 결과에 주소가 없습니다.");
              const html = `<center><img src="${link}"></center>`;
              const applied = [];
              for (const name of self.editors || []) {
                const editor = editors[name];
                if (!editor?.html?.set) continue;
                editor.html.set(html);
                try { editor.$oel.val(editor.html.get()); } catch { /* 원본 요소 없음 */ }
                applied.push(name);
              }
              if (applied.length > 0) { rich = true; steps.push(`상세설명(업로드 후 ${applied.length}곳)`); }
            } catch (error) {
              warnings.push(`상세설명을 올리지 못했습니다: ${error?.message || error}. 화면에서 직접 넣으세요.`);
            }
          }
        } else if (spec && spec.kind === "tinymce") {
          // TinyMCE 3(키드키즈). 제출할 때 에디터가 textarea 를 덮으므로 에디터에 넣는다.
          const editor = window.tinyMCE?.get?.(spec.editorId);
          if (editor) {
            rich = true;
            let html = payload.detailHtml;
            // 몰 서버에 먼저 올린다 — 사람이 `이미지 삽입/편집` 창의 [...] 으로 올리는 곳과 같다.
            // 실패하면 이미 읽히는 주소(`detailHtml`)가 있을 때만 그것으로 넣는다.
            const upload = spec.upload;
            if (upload && payload.detailImage?.dataUrl) {
              try {
                let file = toFile(payload.detailImage);
                // 서버가 확장자를 보고 이름을 새로 붙인다. 확장자 없는 이름이면 붙여 보낸다.
                if (!/\.(jpe?g|png|gif)$/i.test(file.name)) {
                  file = new File([file], `detail.${/png/i.test(file.type) ? "png" : "jpg"}`, { type: file.type });
                }
                const body = new FormData();
                body.append(upload.field, file);
                for (const [name, value] of Object.entries(upload.fields || {})) body.append(name, value);
                const response = await fetch(upload.endpoint, { method: "POST", body, credentials: "include" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                // 응답은 업로드 창 화면 그대로다. 올린 파일 주소가 그 안 스크립트에 실린다.
                const text = await response.text();
                const hosted = (text.match(new RegExp(upload.hostedPattern)) || [])[0] || "";
                if (!hosted) throw new Error("응답에 올린 이미지 주소가 없습니다");
                html = `<center><img src="${hosted}"></center>`;
                steps.push("상세이미지 몰 업로드");
              } catch (error) {
                warnings.push(`상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`);
              }
            }
            if (html) {
              try { if (spec.validElements) editor.schema?.addValidElements?.(spec.validElements); } catch { /* 옛 에디터 */ }
              editor.setContent(html);
              try { window.tinyMCE.triggerSave(); } catch { /* 제출 때 다시 옮긴다 */ }
              steps.push("상세설명(에디터)");
            } else {
              // 에디터는 있는데 넣을 것이 없다. 조용히 넘기면 상세가 빈 채로 등록된다.
              warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
            }
          }
        } else if (spec && spec.kind === "froala") {
          // `$Editor[이름]` 이 편집기, `$oel` 이 그 뒤의 숨은 textarea 다.
          // 둘 다 맞춰야 화면과 제출값이 같아진다.
          const editors = window.$Editor || {};
          const applied = [];
          for (const name of spec.editors || []) {
            const editor = editors[name];
            if (!editor?.html?.set) continue;
            editor.html.set(payload.detailHtml);
            try { editor.$oel.val(editor.html.get()); } catch { /* 원본 요소 없음 */ }
            applied.push(name);
          }
          if (applied.length > 0) { rich = true; steps.push(`상세설명(에디터 ${applied.length}곳)`); }
        } else if (spec) {
          rich = [...document.querySelectorAll(spec.selector)]
            .map((el) => el.ckeditorInstance).find(Boolean) || null;
          if (rich) {
            rich.setData(payload.detailHtml);
            steps.push("상세설명(에디터)");
          }
        }
        if (rich) {
          // 위에서 이미 넣었다.
        } else if (payload.detailRich) {
          warnings.push("상세설명 에디터를 찾지 못했습니다. 화면에서 직접 넣으세요.");
        } else if (payload.detailSelector) {
          // 이름이 없는 화면(11번가). 편집기 방식이 'HTML' 로 기본 선택돼 있어
          // 뒤의 textarea 에 그대로 넣으면 된다.
          const box = document.querySelector(payload.detailSelector);
          if (box) { assign(box, payload.detailHtml); steps.push("상세설명"); }
          else warnings.push("상세설명 칸을 찾지 못했습니다.");
        } else if (setValue(payload.detailHtmlTarget, payload.detailHtml)) {
          // 값을 넣는 칸과 사람이 보는 칸이 다른 몰(티처몰)은 미리보기도 맞춘다.
          // 안 그러면 제출값은 맞는데 화면이 비어 보여 사람이 에디터를 열어 덮는다.
          if (payload.detailPreviewSelector) {
            const preview = document.querySelector(payload.detailPreviewSelector);
            if (preview) preview.innerHTML = payload.detailHtml;
          }
          steps.push("상세설명");
        } else {
          warnings.push(`상세설명 칸 ${payload.detailHtmlTarget} 이 없습니다.`);
        }
      }

      window.alert = nativeAlert;
      // 몰이 한 말은 사람에게 넘긴다. 같은 문장이 여러 번 오면 한 번만.
      for (const message of [...new Set(said)]) warnings.push(`몰 안내: ${message}`);
      return { ok: true, steps, warnings, submitted: false };
    })();
  }

  /**
   * 등록화면에서 '상품상세내용 작성하기' 를 눌러 상세설명을 넣는다.
   *
   * 전부 등록화면 안에서 한다. 에디터 팝업은 같은 오리진이라 `window.open` 이
   * 돌려주는 창을 그대로 만질 수 있다 — 그러면 창을 주소로 찾을 이유가 없다.
   * 주소로 찾으면 예전에 열어둔 에디터를 잡고, 값은 그 창을 통해 남의 등록화면으로
   * 들어가고 이 화면은 빈 채로 남는다. 몰이 아무 말도 안 하니 원인도 안 보인다
   * (라이브에서 실제로 이렇게 깨졌다, 2026-09-10).
   *
   * MAIN 월드여야 한다. 격리 월드에서는 페이지의 `window.open` 을 갈아끼울 수 없다.
   */
  function driveDetailEditor(payload) {
    return (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const alerts = [];

      const button = document.getElementById(payload.buttonId);
      if (!button) return { ok: false, error: "'상품상세내용 작성하기' 버튼이 없습니다." };

      let popup = null;
      const nativeOpen = window.open;
      window.open = function capturePopup(...args) {
        const win = nativeOpen.apply(window, args);
        if (win) popup = win;
        return win;
      };
      try { button.click(); } finally { window.open = nativeOpen; }
      if (!popup) return { ok: false, error: "상세내용 에디터 창이 열리지 않았습니다." };

      const elementIn = (id) => { try { return popup.document.getElementById(id); } catch { return null; } };
      const bodyOf = (key) => {
        const frame = elementIn(payload.framePrefix + key + payload.frameSuffix);
        try { return frame && frame.contentDocument ? frame.contentDocument.body.innerHTML : null; }
        catch { return null; }
      };

      // 에디터는 opener 콜백을 받은 뒤에 만들어진다. 생길 때까지 기다린다.
      const deadline = Date.now() + payload.openTimeoutMs;
      while (Date.now() < deadline) {
        if (bodyOf(payload.editorKey) !== null && elementIn(payload.submitId)) break;
        await sleep(300);
      }
      const target = elementIn(payload.framePrefix + payload.editorKey + payload.frameSuffix);
      const submit = elementIn(payload.submitId);
      if (!target || !target.contentDocument || !submit) {
        return { ok: false, error: "상세내용 에디터가 열리지 않았습니다." };
      }

      target.contentDocument.body.innerHTML = payload.html;

      // `내 다른 판매상품 홍보`. 넣을 값이 있으면 채운다 — 그래야 켠 채로 둘 수 있다.
      // 켜고 비워두면 도매꾹이 "내용을 입력해주세요" 로 제출을 막는다.
      if (payload.promoKey && payload.promoHtml) {
        const promo = elementIn(payload.framePrefix + payload.promoKey + payload.frameSuffix);
        if (promo && promo.contentDocument) promo.contentDocument.body.innerHTML = payload.promoHtml;
      }

      // 켜져 있는데 비어 있는 항목을 끈다. 도매꾹이 그 항목을 채우라고 대화상자를
      // 띄우는데, 그게 뜨면 등록화면까지 같이 얼어붙는다(같은 렌더러다).
      const turnedOff = [];
      let boxes = [];
      try { boxes = [...popup.document.querySelectorAll(payload.toggleSelector)]; } catch { boxes = []; }
      for (const box of boxes) {
        if (box.disabled || !box.checked || box.value === payload.editorKey) continue;
        // 도매꾹이 쓰는 판정과 같게 본다: 글자가 있거나 img 가 있으면 내용이 있는 것.
        // 태그만 남은 빈 껍데기(`<p><br></p>` 같은)를 내용으로 세면 그 항목이 켜진 채
        // 남고, 제출할 때 몰이 대화상자를 띄운다.
        const html = bodyOf(box.value) || "";
        const hasImage = /<img\b/i.test(html);
        const hasText = html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/gi, "").length > 0;
        if (hasImage || hasText) continue;
        box.click();
        turnedOff.push(box.value);
      }
      await sleep(400);

      // 그래도 몰이 할 말이 있으면 삼켜서 가져온다. 버리지 않고 경고로 올린다.
      // 교체가 제출보다 먼저다 — 대화상자가 뜨면 이 화면도 같이 멈춘다.
      try { popup.alert = (message) => { alerts.push(String(message)); }; } catch { /* 이미 닫힘 */ }
      try { submit.click(); } catch { /* 이미 닫힘 */ }

      // 값은 이 화면으로 돌아온다. 에디터가 opener 콜백으로 채운다.
      const form = document.querySelector(payload.formSelector);
      const field = form ? form.elements[payload.target] : null;
      const until = Date.now() + payload.submitTimeoutMs;
      while (Date.now() < until) {
        if ((field && field.value) || alerts.length > 0) break;
        await sleep(200);
      }

      const filled = Boolean(field && field.value);
      // 실패했으면 반쯤 열린 창을 남기지 않는다.
      if (!filled) { try { popup.close(); } catch { /* 이미 닫힘 */ } }
      return {
        ok: true,
        filled,
        alerts,
        turnedOff,
        length: field && field.value ? field.value.length : 0,
      };
    })();
  }

  /**
   * 신세계 파트너오피스 상품등록 화면을 채운다(MAIN 월드).
   *
   * 사람이 누르는 순서를 그대로 밟는다 — 화면이 앞 칸을 골라야 뒤 칸을 그리기 때문이다
   * (판매사이트 → 전시카테고리 → 표준분류 → 가격·판매정보). 칸마다 이벤트 연결 방식이
   * 달라서(Vue `v-model`, jQuery 서제스트, 인라인 `onchange`) 각각 그 방식으로 건드린다.
   *
   * ⚠️ 인라인 `onchange` 칸(출고지·반송지)은 네이티브 `change` 한 번만 쏜다. jQuery 로 한 번
   * 더 쏘면 그 핸들러가 셀렉트를 첫 줄로 되돌린 뒤라 빈 값으로 다시 불려 고른 주소가
   * 지워진다(라이브 실측 2026-09-14).
   *
   * 저장은 하지 않는다. 끝에 화면 자체 검증(`ItemValidator` · `saveValidModules`)만 돌려
   * 막히는 칸을 경고로 돌려준다 — 둘 다 네트워크를 타지 않는다.
   */
  function fillSsgProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const nativeAlert = window.alert;
      const nativeConfirm = window.confirm;
      // 검증을 alert 으로 띄우는 화면이다. 뜨면 페이지가 멈춰 나머지를 못 채운다.
      // 확인창은 거절한다 — 무엇이 물어도 저장에 '예' 가 눌리는 일이 없게.
      window.alert = (message) => { said.push(String(message)); };
      window.confirm = (message) => { said.push(String(message)); return false; };

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 8000;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const q = (selector) => document.querySelector(selector);
      const byId = (id) => document.getElementById(id);
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const fire = (el, types) => {
        for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
      };
      const setText = (el, entry) => {
        el.value = entry;
        fire(el, ["input", "change"]);
      };
      const keyup = (el) => el.dispatchEvent(new KeyboardEvent("keyup", { key: "a", keyCode: 65, which: 65, bubbles: true }));
      const clickRadio = (el) => {
        if (!el) return false;
        if (!el.checked) el.click();
        return el.checked;
      };
      const base = () => window.itemMainDto?.itemDto?.itemBaseDto || {};
      const lastSaid = () => (said.length > 0 ? `: ${said[said.length - 1]}` : "");
      const pad = (n) => String(n).padStart(2, "0");

      /** data URL → File. 화면이 파일 이름의 확장자로 형식을 가른다(jpg·jpeg·png). */
      const toImageFile = (image, fallbackName) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        let name = String(image.fileName || fallbackName);
        if (!/\.(jpe?g|png)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
        return new File([bytes], name, { type: mime });
      };

      /** 서제스트 셀렉트(브랜드·제조국). 옵션 값이 `번호|이름` 이다. */
      const pickSuggestOption = async (input, comboId, name) => {
        input.focus();
        input.value = name;
        keyup(input);
        const combo = await waitFor(() => {
          const select = byId(comboId);
          return select && [...select.options].some((option) => option.value.split("|")[1] === name) ? select : null;
        }, stepWait);
        if (!combo) return false;
        combo.selectedIndex = [...combo.options].findIndex((option) => option.value.split("|")[1] === name);
        combo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      };

      /** 검색해서 고르는 카테고리. 결과 줄의 `data-value` 가 `번호|…` 로 시작한다. */
      const pickCategory = async (input, listId, target) => {
        input.focus();
        input.value = target.keyword;
        keyup(input);
        const link = await waitFor(() => {
          const row = document.querySelector(`#${listId} li[data-value^="${target.id}|"]`);
          return row ? (row.querySelector("a") || row) : null;
        }, stepWait);
        if (!link) return false;
        link.click();
        return true;
      };

      /** dhtmlx 셀을 사람이 고치는 것처럼 편집기를 열고 닫는다. 그래야 `onEditCell` 계산이 돈다. */
      const editGridCell = async (grid, rowId, columnId, entry) => {
        const column = grid.getColIndexById(columnId);
        if (column === undefined || column === null || column < 0) return false;
        grid.selectCell(grid.getRowIndex(rowId), column);
        grid.editCell();
        if (grid.editor && grid.editor.obj) grid.editor.obj.value = String(entry);
        grid.editStop();
        await sleep(300);
        return true;
      };

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 모듈이 없다 → 확장이 로그인 후 다시 부른다.
        const ready = await waitFor(() => {
          if ([...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          return window.ItemMain && window.itemMainDto && window.ItemPrcInv
            && q("input#itemNm") && byId(`siteNo${form.siteNo}`) ? "form" : null;
        }, payload.formWaitMs || 30000);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "신세계 상품등록 화면을 찾지 못했습니다." };
        }
        await waitFor(() => !visible(byId("loadingBox")), stepWait * 2);
        // 상품번호가 실려 있으면 기존 상품 수정 화면이다. 저장하면 판매중 상품이 덮이므로 손대지 않는다.
        if (base().itemId) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }

        // 1) 판매사이트.
        clickRadio(byId(`siteNo${form.siteNo}`));
        const dispInput = await waitFor(() => [...document.querySelectorAll("#categoryInfo input[type=text]")]
          .find((input) => visible(input) && /카테고리명/.test(input.placeholder || "")), stepWait);

        // 2) 전시카테고리(SSG.COM몰). 신세계몰은 화면이 매핑으로 채운다.
        const dispPicked = dispInput
          && await pickCategory(dispInput, "suggestCombo_suggestMainDispCtgId", form.displayCategory);
        if (dispPicked) steps.push(`전시카테고리 ${form.displayCategory.keyword}`);
        else warnings.push(`전시카테고리 ${form.displayCategory.keyword}(${form.displayCategory.id})를 찾지 못했습니다. 화면에서 고르세요.`);

        // 3) 표준분류. 이걸 골라야 판매정보·가격 칸이 그려진다.
        const stdInput = await waitFor(() => (visible(byId("suggestStdCtgTxt")) ? byId("suggestStdCtgTxt") : null), stepWait);
        const stdPicked = stdInput && await pickCategory(stdInput, "suggestCombo_suggestStdCtgId", form.standardCategory);
        const stdApplied = stdPicked && await waitFor(() => base().stdCtgId === form.standardCategory.id, stepWait);
        if (stdApplied) steps.push(`표준분류 ${form.standardCategory.keyword}`);
        else warnings.push(`표준분류 ${form.standardCategory.keyword}(${form.standardCategory.id})를 고르지 못했습니다. 화면에서 고르세요.`);
        document.body.click();

        // 4) 브랜드 → 상품명. 고객 노출 상품명을 화면이 브랜드 + 상품명으로 만든다.
        if (form.brandName) {
          const brandPicked = await pickSuggestOption(q("input#brandNm"), "suggestCombo_brandId", form.brandName);
          if (brandPicked && byId("brandId")?.value) steps.push(`브랜드 ${form.brandName}`);
          else warnings.push(`브랜드 ${form.brandName}을(를) 찾지 못했습니다. 화면에서 고르세요.`);
        }
        setText(q("input#itemNm"), form.itemName);
        if (base().itemNm === form.itemName) steps.push("상품명");
        else warnings.push("상품명을 넣지 못했습니다.");

        // 5) 판매정보 기본값 중 화면이 비워 두는 필수 라디오.
        clickRadio(q(`#itemAddInfo input[name="adultItemTypeCd"][value="${form.adultTypeCode}"]`));
        clickRadio(q(`#itemRetExch input[name="retExchPsblYn"][value="${form.returnExchangeButton}"]`));

        // 6) 가격(판매가 + 마진 → 공급가 자동) · 재고.
        const grid = await waitFor(() => {
          const candidate = window.ItemPrcInv?.gridRepPrc;
          return candidate && candidate.getRowsNum() > 0 ? candidate : null;
        }, stepWait);
        if (grid) {
          clickRadio(byId("autoAccount_1"));
          const rowId = grid.getRowId(0);
          await editGridCell(grid, rowId, "sellprc", form.salePrice);
          if (form.marginRate > 0) await editGridCell(grid, rowId, "mrgrt", form.marginRate);
          const supply = String(grid.cells(rowId, grid.getColIndexById("splprc")).getValue() || "");
          if (supply) steps.push(`가격 판매가 ${form.salePrice} · 마진 ${form.marginRate}% · 공급가 ${supply}`);
          else warnings.push(`공급가가 계산되지 않았습니다${lastSaid()}. 가격 칸을 확인하세요.`);
        } else {
          warnings.push("가격 칸이 그려지지 않았습니다. 표준분류를 고른 뒤 가격을 넣으세요.");
        }
        const stock = q("input#usablInvQty");
        if (stock && form.stock > 0) setText(stock, String(form.stock));

        // 7) 모델명 · 검색어 · 전시기간. 시작이 지금보다 과거면 저장이 막히므로 몇 시간 뒤 정각으로.
        if (form.modelName && q("input#mdlNm")) setText(q("input#mdlNm"), form.modelName);
        if (form.searchKeywords && q("input#itemSrchwdNm")) setText(q("input#itemSrchwdNm"), form.searchKeywords);
        byId("dispDt99_btn")?.click();
        const start = new Date(Date.now() + (payload.displayStartDelayHours || 3) * 3600000);
        if (start.getMinutes() > 0 || start.getSeconds() > 0) start.setHours(start.getHours() + 1);
        start.setMinutes(0, 0, 0);
        const startText = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:00`;
        const startInput = q("input#dispStrtDts");
        if (startInput) setText(startInput, startText);
        if (base().dispStrtDt === startText) steps.push(`전시 시작 ${startText}`);
        else warnings.push("전시 시작일을 넣지 못했습니다. 저장 전에 지금 이후로 고치세요.");

        // 8) 상품고시. 분류를 바꾸면 그 분류의 줄이 새로 그려진다.
        const noticeClass = q("select#itemMngPropClsId");
        if (noticeClass && form.notice.classId) {
          if (noticeClass.value !== form.notice.classId) {
            noticeClass.value = form.notice.classId;
            fire(noticeClass, ["change"]);
          }
          const propIds = Object.keys(form.notice.values);
          await waitFor(() => propIds.every((propId) => visible(byId(propId))), stepWait);
          const missing = [];
          for (const [propId, entry] of Object.entries(form.notice.values)) {
            const el = byId(propId);
            if (!visible(el)) { missing.push(propId); continue; }
            setText(el, entry);
          }
          if (form.notice.importPropId) clickRadio(byId(`${form.notice.importPropId}_${form.notice.importYn}`));
          if (missing.length > 0) warnings.push(`상품고시 칸 ${missing.join(", ")} 이(가) 화면에 없습니다.`);
          else steps.push(`상품고시 ${propIds.length}줄`);
        }
        if (form.manufacturer && q("input#manufcoNm")) setText(q("input#manufcoNm"), form.manufacturer);
        if (form.originCountry) {
          const originPicked = await pickSuggestOption(q("input#orplcNm0"), "suggestCombo_prodManufCntryId0", form.originCountry);
          if (!originPicked || !byId("prodManufCntryId0")?.value) {
            warnings.push(`제조국 ${form.originCountry}을(를) 고르지 못했습니다. 화면에서 고르세요.`);
          }
        }

        // 9) 배송 — 소요일 · 출고지/반송지 · 출고/반품 배송비.
        const shipping = form.shipping;
        if (shipping.leadDays > 0 && q("input#shppRqrmDcnt")) setText(q("input#shppRqrmDcnt"), String(shipping.leadDays));
        for (const [selectId, addrId, label] of [
          ["whoutAddrId", shipping.outboundAddrId, "출고지"],
          ["snbkAddrId", shipping.returnAddrId, "반송지"],
        ]) {
          if (!addrId) continue;
          const select = q(`select#${selectId}`);
          if (!select || ![...select.options].some((option) => option.value === addrId)) {
            warnings.push(`${label} ${addrId} 가 목록에 없습니다. 화면에서 고르세요.`);
            continue;
          }
          select.value = addrId;
          fire(select, ["change"]);
          if (base()[selectId] !== addrId) warnings.push(`${label}를 고르지 못했습니다.`);
        }
        for (const fee of shipping.fees) {
          const chain = [
            ["gnrlShppcstPlcyDivCd", fee.divCd],
            ["gnrlShppcstPlcyTypeCd", fee.typeCd],
            ["gnrlPrpayCodDivCd", fee.prepayCd],
            ["gnrlShppcstAplUnitCd", fee.unitCd],
            ["gnrlShppcstId", fee.feeId],
          ];
          let reached = true;
          for (const [selectId, code] of chain) {
            const select = await waitFor(() => {
              const candidate = q(`select#${selectId}`);
              return candidate && [...candidate.options].some((option) => option.value === code) ? candidate : null;
            }, stepWait);
            if (!select) { reached = false; break; }
            select.value = code;
            fire(select, ["change"]);
            await sleep(300);
          }
          if (!reached || !byId("addGnrlShppcstPlcyBtn")) {
            warnings.push(`배송비 ${fee.feeId} 를 고르지 못했습니다. 화면에서 추가하세요.`);
            continue;
          }
          byId("addGnrlShppcstPlcyBtn").click();
          await sleep(500);
          steps.push(`배송비 ${fee.feeId}`);
        }

        // 10) 상품이미지. 칸의 파일 선택과 같다 — 화면이 바로 몰 서버에 올리고(동기) 주소를 적는다.
        const images = (payload.images || []).slice(0, payload.maxImages || 10);
        let uploadedImages = 0;
        for (let index = 0; index < images.length; index += 1) {
          const slot = index + 1;
          const input = byId(`uitemImgVod10_${slot}_file`);
          if (!input) break;
          const transfer = new DataTransfer();
          transfer.items.add(toImageFile(images[index], `image${slot}`));
          input.files = transfer.files;
          fire(input, ["change"]);
          const path = await waitFor(() => byId(`uitemImgVod10_${slot}_dataFileNm`)?.value, stepWait);
          if (!path) {
            warnings.push(`상품이미지 ${slot}을(를) 올리지 못했습니다${lastSaid()}`);
            continue;
          }
          const alt = byId(`uitemImgVod10_${slot}_rplcTextNm`);
          if (alt && !alt.value) setText(alt, slot === 1 ? "대표이미지" : `상품이미지${slot}`);
          uploadedImages += 1;
        }
        if (uploadedImages > 0) steps.push(`상품이미지 ${uploadedImages}장`);

        // 11) 상세설명. SSG Editor 이미지 업로드로 몰 주소를 받고, 에디터 저장 콜백으로 넣는다.
        let detailHtml = payload.detailHtml || "";
        const upload = payload.detailUpload;
        if (upload && payload.detailImage?.dataUrl) {
          try {
            const body = new FormData();
            body.append(upload.field, toImageFile(payload.detailImage, "detail"));
            const response = await fetch(upload.endpoint, { method: "POST", body, credentials: "include" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            const hosted = String(result?.uploadPath || "").trim();
            if (!hosted) throw new Error("응답에 이미지 주소가 없습니다");
            detailHtml = `<center><img src="${new URL(hosted, location.origin).href}"></center>`;
            steps.push("상세이미지 몰 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        if (detailHtml && typeof window.ItemDtl?.popupItemDtlSynapEditorCallBack === "function") {
          window.ItemDtl.popupItemDtlSynapEditorCallBack(detailHtml);
          steps.push("상세설명");
        } else {
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 12) 저장 전 검증만 돌린다. 막히는 첫 칸을 사람에게 알린다.
        said.length = 0;
        let valid = null;
        try {
          window.ItemMain.savePreProcess();
          valid = Boolean(window.ItemValidator.validate(window.jQuery("#content")))
            && Boolean(window.ItemMain.saveValidModules());
        } catch {
          valid = null;
        }
        if (valid === true) steps.push("저장 전 검증 통과");
        else if (valid === false) warnings.push(`저장 전 확인: ${[...new Set(said)].join(" / ") || "화면이 막는 칸이 있습니다"}`);
        said.length = 0;
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        // 사람이 이어서 쓸 화면이다. 대화상자는 원래대로 돌려준다 — 저장 확인창도 떠야 한다.
        window.alert = nativeAlert;
        window.confirm = nativeConfirm;
      }
    })();
  }

  /**
   * 스마트스토어 새 상품등록 화면을 사람이 누르는 순서대로 채운다.
   *
   * AngularJS 화면이라 넣은 값이 **모델에 닿았는지** 칸마다 모델을 읽어 확인한다. debugInfo 가 꺼져
   * `.scope()` 는 못 쓰니 `$rootScope` 에서 `vm.productFormSubmitVO` 를 찾는다.
   * 마지막에 폼 검증(`$error`)만 읽어 막히는 칸을 사람에게 알린다. 저장·임시저장은 누르지 않는다.
   */
  function fillSmartstoreProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const nativeAlert = window.alert;
      const nativeConfirm = window.confirm;
      window.alert = (message) => { said.push(String(message)); };
      window.confirm = (message) => { said.push(String(message)); return false; };

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 10000;
      // 창이 뜨는지·값이 모델에 닿는지 짧게 보는 기다림. 칸 반응 기다림보다 길 이유가 없다.
      const brief = Math.min(3000, stepWait);
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const q = (selector, scope = document) => (scope ? scope.querySelector(selector) : null);
      const all = (selector, scope = document) => (scope ? [...scope.querySelectorAll(selector)] : []);
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const textOf = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      const fire = (el, types) => {
        for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
      };
      /**
       * 사람이 치는 것과 같다 — 포커스 → 값 → 포커스 해제 **한 번**.
       *
       * ⚠️ 금액 칸(`ncp-number-format`)은 blur 마다 값을 `6,000` 으로 바꿔 다시 읽는다. 포커스가 남은 채로
       * 가짜 blur 를 쏘면, 나중에 진짜 blur 가 한 번 더 와서 `6,000` 을 숫자로 못 읽고 칸을 비운다
       * (라이브 실측 2026-09-14: 판매가·즉시할인이 채운 뒤 1초 안에 사라짐). 진짜 포커스면 진짜로 푼다.
       */
      const typeInto = (el, entry) => {
        if (!el) return false;
        el.focus?.();
        el.value = String(entry);
        fire(el, ["input", "change"]);
        if (document.activeElement === el && typeof el.blur === "function") el.blur();
        else fire(el, ["blur"]);
        return true;
      };

      /** 화면 모델. 컴포넌트마다 같은 객체를 나눠 쓰므로 처음 만난 것을 쓴다. */
      const submitVO = () => {
        const root = window.angular?.element(document.body).injector?.()?.get("$rootScope");
        const stack = root ? [root] : [];
        for (let guard = 0; stack.length > 0 && guard < 50000; guard += 1) {
          const scope = stack.pop();
          if (scope.vm?.productFormSubmitVO?.product) return scope.vm.productFormSubmitVO;
          for (let child = scope.$$childHead; child; child = child.$$nextSibling) stack.push(child);
        }
        return null;
      };
      const product = () => submitVO()?.product || {};
      const detail = () => product().detailAttribute || {};

      const openModals = () => all(".modal").filter(visible);
      // 우리가 여닫는 창의 글은 사람에게 넘기지 않는다(할 일을 이미 알고 채운다).
      const quiet = /유의사항 안내|내 사진 불러오기/;
      /**
       * 떠 있는 안내·확인창을 치운다.
       *
       * 확인창(취소가 있는 창)은 **거절**한다 — 무엇을 묻든 '예' 가 눌리는 일이 없게. 안내는 닫는다.
       * 몰이 한 말은 버리지 않고 사람에게 넘긴다.
       */
      const clearDialogs = () => {
        for (const modal of openModals()) {
          const buttons = all("button", modal);
          const button = buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => entry.classList.contains("close"))
            || buttons.find((entry) => textOf(entry) === "확인");
          const message = textOf(modal).replace(/^×\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          if (message && !quiet.test(message)) said.push(message.slice(0, 200));
          button?.click();
        }
      };

      /** 접힌 섹션을 펼친다. 펼쳐야 칸이 그려지는 섹션이 있다(`상품 주요정보`·`상품정보제공고시`·`검색설정`). */
      const openSection = async (title) => {
        const section = all(".form-section").find((candidate) => textOf(q(".title-line", candidate)).startsWith(title));
        const line = q(".title-line", section);
        if (!line) return null;
        const toggle = q("a.btn", line);
        if (toggle && !toggle.classList.contains("active")) {
          line.click();
          await waitFor(() => toggle.classList.contains("active"), brief);
          await sleep(300);
        }
        return section;
      };

      const selectizeIn = (scope, selector) => all(selector, scope).map((el) => el.selectize).find(Boolean) || null;
      /** 목록에서 옵션 키로 고른다. 뒷 단 목록은 앞 단을 고른 뒤에 채워지므로 기다린다. */
      const pickOption = async (selectize, key) => {
        if (!selectize) return false;
        const ready = await waitFor(() => Object.prototype.hasOwnProperty.call(selectize.options, key), stepWait);
        if (!ready) return false;
        if (selectize.getValue() !== key) selectize.setValue(key);
        return selectize.getValue() === key;
      };
      /** 검색해서 고르는 목록(카테고리). 화면이 쓰는 검색을 그대로 부른다. */
      const loadOptions = (selectize, keyword) => new Promise((resolve) => {
        let settled = false;
        const finish = (items) => {
          if (settled) return;
          settled = true;
          resolve(Array.isArray(items) ? items : []);
        };
        setTimeout(() => finish([]), stepWait);
        try { selectize.settings.load.call(selectize, keyword, finish); } catch { finish([]); }
      });

      /** data URL → File. 사진 칸은 jpg·gif·png·bmp 만 받는다. */
      const toImageFile = (image, fallbackName) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        let name = String(image.fileName || fallbackName);
        if (!/\.(jpe?g|png|gif|bmp)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
        return new File([bytes], name, { type: mime });
      };

      const uploadModal = () => openModals().find((modal) => /내 사진 불러오기/.test(textOf(modal)));
      // 화면이 제 박자로 늦게 띄우는 안내. 카테고리를 고르면 '유의사항 안내', 여는 순간엔 '이전에 작성하던 내용'.
      const incidental = /유의사항 안내|이전에 작성하던 내용/;
      /** 늦게 뜬 안내만 닫는다. 떠 있는 사진 창은 건드리지 않는다. 옛 내용 불러오기는 취소한다. */
      const closeIncidental = () => {
        for (const modal of openModals()) {
          if (!incidental.test(textOf(modal))) continue;
          const buttons = all("button", modal);
          (buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => entry.classList.contains("close")))?.click();
        }
      };
      const uploadedCount = (containerId, imageType) => {
        const inModel = (Array.isArray(product().images) ? product().images : [])
          .filter((image) => image?.imageType === imageType).length;
        const names = q(`#${containerId} input[name="_hidden_uploaded_names"]`)?.value || "";
        return Math.max(inModel, names ? names.split(",").filter(Boolean).length : 0);
      };
      /**
       * `이미지 등록 → 내 사진` 과 같다. 창이 열리면 ng-file-upload 가 숨은 파일 칸을 만들고, 거기 파일을
       * 넣으면 화면이 네이버 사진 서버에 올린 뒤 창을 닫고, 다음 틱에 사진을 칸에 붙인다.
       *
       * ⚠️ 사진 창 위에 다른 창이 보인다고 곧 거절이 아니다. 늦게 뜬 '유의사항 안내' 가 겹친 것을 거절로 보고
       *    사진 창까지 닫아 올리던 사진이 버려졌다(라이브 2026-09-14, 대표이미지 빈 칸). 그런 안내는 닫고 계속
       *    기다리고, 형식·크기·개수 안내처럼 사진 창이 띄운 것만 거절로 본다.
       *
       * 돌려주는 `stage` 로 어디서 멈췄는지 가른다 — `open`(창이 안 열림)만 다시 해 볼 만하다.
       */
      const uploadThroughModal = async (button, files, containerId, imageType) => {
        const before = uploadedCount(containerId, imageType);
        clearDialogs();
        await waitFor(() => openModals().length === 0, brief);
        const fileInputs = () => all('input[type="file"][ngf-select^="vm.uploadImagesFromDevice"]');
        const existing = new Set(fileInputs());
        button.click();
        const input = await waitFor(() => {
          closeIncidental();
          return uploadModal()
            ? fileInputs().find((candidate) => !existing.has(candidate)) || fileInputs().pop()
            : null;
        }, stepWait);
        if (!input) {
          // 카테고리가 안 골라졌으면 창 대신 칸 아래 빨간 글(`먼저 카테고리를 선택해 주세요.`)이 뜬다.
          const hint = all('[class*="danger"]', q(`#${containerId}`)).map(textOf).find(Boolean);
          clearDialogs();
          return { ok: false, stage: "open", reason: hint || "사진 창이 열리지 않았습니다" };
        }
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        input.files = transfer.files;
        fire(input, ["change"]);
        let refusal = "";
        const settled = await waitFor(() => {
          closeIncidental();
          if (!uploadModal()) return "closed";
          const other = openModals()
            .find((modal) => !/내 사진 불러오기/.test(textOf(modal)) && !incidental.test(textOf(modal)));
          if (!other) return null;
          refusal = textOf(other).replace(/^×\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          return "refused";
        }, payload.imageWaitMs || 60000);
        if (settled === "closed") {
          const attached = await waitFor(() => uploadedCount(containerId, imageType) > before, stepWait);
          return attached
            ? { ok: true, added: uploadedCount(containerId, imageType) - before }
            : { ok: false, stage: "attach", reason: "올린 사진이 칸에 붙지 않았습니다" };
        }
        clearDialogs();
        return settled === "refused"
          ? { ok: false, stage: "refused", reason: refusal || "사진 창이 사진을 받지 않았습니다" }
          : { ok: false, stage: "timeout", reason: "네이버 사진 서버 응답을 기다리다 멈췄습니다" };
      };
      /** 칸 하나에 사진을 올린다. 창이 안 열린 경우만 한 번 더 한다 — 올라가던 것을 다시 올리면 겹친다. */
      const uploadImages = async (containerId, imageType, files) => {
        const button = () => q(`#${containerId} a[ng-click="vm.openUploadModal()"]`);
        if (!button()) return { ok: false, reason: "사진 칸을 찾지 못했습니다" };
        let result = await uploadThroughModal(button(), files, containerId, imageType);
        if (!result.ok && result.stage === "open" && button()) {
          result = await uploadThroughModal(button(), files, containerId, imageType);
        }
        return { ...result, reason: String(result.reason || "").replace(/[.\s]+$/, "") };
      };

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 폼이 없다.
        const ready = await waitFor(() => {
          if (/^#\/(login|signin)/i.test(location.hash)
            || all('input[type="password"]').some(visible)) return "login";
          return window.angular && q('form[name="vm.productForm"]')
            && q('input[ng-model="vm.category"]')?.selectize && submitVO() ? "form" : null;
        }, payload.formWaitMs || 40000);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "스마트스토어 상품등록 화면을 찾지 못했습니다." };
        }
        // 상품번호가 실린 화면은 판매중 상품 수정이다. 사람이 저장하면 그 상품이 덮이므로 손대지 않는다.
        if (location.hash !== "#/products/create" || product().id) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }

        // 1) 여는 순간 뜨는 창. `이전에 작성하던 내용` 을 확인하면 옛 내용이 새 값을 덮는다 → 취소.
        const resume = await waitFor(() => openModals().find((modal) => /이전에 작성하던 내용/.test(textOf(modal))), brief);
        if (resume) {
          all("button", resume).find((button) => textOf(button) === "취소")?.click();
          await waitFor(() => !visible(resume), brief);
          steps.push("이전 작성 내용은 불러오지 않음");
        }
        q(".seller-notice button.close")?.click();

        // 2) 카테고리. 이걸 골라야 인증·고시·사진 칸이 그 카테고리에 맞게 그려진다.
        const categorySelect = q('input[ng-model="vm.category"]').selectize;
        const categoryId = () => String(product().category?.id || "");
        if (categoryId() !== form.category.id) {
          const valueField = categorySelect.settings.valueField || "id";
          const found = (await loadOptions(categorySelect, form.category.keyword))
            .find((item) => String(item?.[valueField]) === form.category.id);
          if (found) {
            categorySelect.addOption(found);
            categorySelect.setValue(String(found[valueField]));
            await waitFor(() => categoryId() === form.category.id, stepWait);
          }
        }
        if (categoryId() === form.category.id) {
          steps.push(`카테고리 ${product().category?.wholeCategoryName || form.category.keyword}`);
        } else {
          warnings.push(`카테고리 ${form.category.keyword}(${form.category.id})를 찾지 못했습니다. 화면에서 고르세요.`);
        }
        // 어린이제품 인증 카테고리면 '유의사항 안내'(모델명·인증 필수)가 뜬다. 둘 다 아래에서 채운다.
        await waitFor(() => openModals().find((modal) => /유의사항 안내/.test(textOf(modal))), Math.min(2000, stepWait));
        clearDialogs();

        // 3) 상품명 · 판매가 · 즉시할인 · 재고.
        typeInto(q('input[name="product.name"]'), form.productName);
        if (product().name === form.productName) steps.push("상품명");
        else warnings.push("상품명을 넣지 못했습니다.");

        typeInto(q("#prd_price2"), form.salePrice);
        const priceOk = Number(product().salePrice) === form.salePrice;
        let discountOk = true;
        if (form.discountWon > 0) {
          const on = q("#r3_1_total");
          if (on && !on.checked) on.click();
          // 켜야 칸이 새로 그려진다. 켜기 전에 찾아 둔 요소에 쓰면 모델에 안 닿는다.
          const discount = await waitFor(() => (visible(q("#prd_sale")) ? q("#prd_sale") : null), stepWait);
          typeInto(discount, form.discountWon);
          const policy = product().customerBenefit?.immediateDiscountPolicy?.discountMethod;
          discountOk = Boolean(discount) && (policy ? Number(policy.value) === form.discountWon : discount.value.replace(/,/g, "") === String(form.discountWon));
        } else {
          const off = q("#r3_2_total");
          if (off && !off.checked) off.click();
        }
        if (priceOk && discountOk) {
          steps.push(form.discountWon > 0
            ? `판매가 ${form.salePrice} · 즉시할인 ${form.discountWon} → ${form.salePrice - form.discountWon}원`
            : `판매가 ${form.salePrice}`);
        } else {
          warnings.push(`${priceOk ? "즉시할인" : "판매가"}을 넣지 못했습니다. 가격 칸을 확인하세요.`);
        }
        if (form.stock > 0) {
          typeInto(q("#stock"), form.stock);
          if (Number(product().stockQuantity) === form.stock) steps.push(`재고 ${form.stock}`);
          else warnings.push("재고수량을 넣지 못했습니다.");
        }

        // 4) 사진. 대표 1장 → 추가 최대 9장. 카테고리를 고른 뒤라야 사진 창이 열린다.
        const images = (payload.images || []).filter((image) => image && image.dataUrl);
        if (images.length > 0) {
          const represent = await uploadImages("representImage", "REPRESENTATIVE", [toImageFile(images[0], "image1")]);
          if (represent.ok) steps.push("대표이미지");
          else warnings.push(`대표이미지를 올리지 못했습니다: ${represent.reason}. 화면에서 올리세요.`);
          const extras = images.slice(1, 1 + (payload.maxExtraImages || 9));
          if (extras.length > 0) {
            const extra = await uploadImages(
              "optionalImages",
              "OPTIONAL",
              extras.map((image, index) => toImageFile(image, `image${index + 2}`)),
            );
            if (extra.ok) steps.push(`추가이미지 ${extra.added}장`);
            if (extra.ok && extra.added < extras.length) {
              warnings.push(`추가이미지 ${extras.length}장 중 ${extra.added}장만 올라갔습니다. 화면에서 확인하세요.`);
            }
            if (!extra.ok) warnings.push(`추가이미지 ${extras.length}장을 올리지 못했습니다: ${extra.reason}. 화면에서 올리세요.`);
          }
        }

        // 5) 상세설명. 화면이 쓰는 네이버 사진 업로드로 주소를 받아 `HTML 작성` 에 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const uploader = window.angular.element(document.body).injector().get("photoInfraImageUploadService");
            const uploaded = await uploader.uploadImages([toImageFile(payload.detailImage, "detail")], {});
            const url = String((Array.isArray(uploaded) ? uploaded[0]?.imageUrl : "") || "");
            if (!/^https?:\/\//.test(url)) throw new Error("응답에 이미지 주소가 없습니다");
            // 응답은 http 주소다. 같은 사진이 https CDN 에도 있다(바이트 동일 실측).
            const hosted = url.replace(/^https?:\/\/shop1\.phinf\.naver\.net\//, "https://shop-phinf.pstatic.net/");
            detailHtml = `<center><img src="${hosted}"></center>`;
            steps.push("상세이미지 네이버 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 네이버에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        if (detailHtml) {
          const htmlTab = all('a[ng-click*="changeEditorType"]').find((link) => /HTML 작성/.test(textOf(link)));
          if (htmlTab && product().detailContent?.editorType !== "NONE") htmlTab.click();
          const editor = await waitFor(() => {
            const candidate = q('textarea[ng-model="vm.editorContent"]');
            return visible(candidate) ? candidate : null;
          }, stepWait);
          typeInto(editor, detailHtml);
          const content = product().detailContent || {};
          if (content.editorType === "NONE" && content.productDetailInfoContent === detailHtml) steps.push("상세설명(HTML)");
          else warnings.push("상세설명을 넣지 못했습니다. [HTML 작성] 에 직접 넣으세요.");
        } else {
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }

        // 6) 상품 주요정보 — 모델명 · 브랜드 · 제조사 · 원산지 · 어린이제품인증.
        const mainInfo = await openSection("상품 주요정보");
        const searchInfo = () => detail().naverShoppingSearchInfo || {};
        if (form.modelName) {
          // 모델명은 `찾기` 창의 `텍스트로 직접입력` 으로만 넣을 수 있다. 창의 [저장] 은 창을 닫으며 이 폼에만
          // 반영한다(서버에 보내지 않는다). 입력칸은 직접입력을 고른 뒤에야 그려진다.
          q('button[ng-click^="vm.func.openModelSearchModal"]', mainInfo)?.click();
          const modal = await waitFor(() => openModals()
            .find((candidate) => q('input[ng-model="vm.inputType"]', candidate)), stepWait);
          if (modal) {
            const direct = q('input[ng-model="vm.inputType"][value="TEXT"]', modal);
            if (direct && !direct.checked) direct.click();
            const input = await waitFor(() => {
              const candidate = q('input[ng-model="vm.modelText"]', modal);
              return visible(candidate) ? candidate : null;
            }, brief);
            typeInto(input, form.modelName);
            await sleep(200);
            q('[ng-click="vm.func.save()"]', modal)?.click();
            await waitFor(() => !visible(modal), brief);
            if (visible(modal)) q("button.close", modal)?.click();
          }
          if (await waitFor(() => searchInfo().modelName === form.modelName, brief)) steps.push(`모델명 ${form.modelName}`);
          else warnings.push(`모델명 ${form.modelName}을(를) 넣지 못했습니다. 상품 주요정보 [찾기] 에서 직접 입력하세요.`);
        }
        // 브랜드·제조사는 목록에 없는 이름이라 직접입력으로 만든다(`{id:'', name}`).
        const nameSelects = all('[ng-model="vm.searchKeyword"]', mainInfo).map((el) => el.selectize).filter(Boolean);
        for (const [index, name, key, label] of [
          [0, form.brandName, "brandName", "브랜드"],
          [1, form.manufacturerName, "manufacturerName", "제조사"],
        ]) {
          if (!name) continue;
          if (nameSelects[index] && searchInfo()[key] !== name) nameSelects[index].createItem(name, false);
          if (await waitFor(() => searchInfo()[key] === name, brief)) steps.push(`${label} ${name}`);
          else warnings.push(`${label} ${name}을(를) 넣지 못했습니다. 화면에서 직접 입력하세요.`);
        }
        clearDialogs();

        if (form.origin) {
          const origin = form.origin;
          let reached = await pickOption(
            selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.originAreaExposureType"]'),
            origin.exposureType,
          );
          if (reached && origin.firstSub) {
            reached = await pickOption(selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.firstSubOriginAreaType"]'), origin.firstSub);
          }
          if (reached && origin.secondSub) {
            reached = await pickOption(selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.secondSubOriginAreaType"]'), origin.secondSub);
          }
          if (reached && origin.importer) {
            const importer = await waitFor(() => {
              const candidate = q('input[ng-model="vm.viewData.originAreaInfo.importer"]', mainInfo);
              return visible(candidate) ? candidate : null;
            }, stepWait);
            reached = typeInto(importer, origin.importer);
          }
          const area = detail().originAreaInfo || {};
          const code = origin.secondSub || origin.firstSub;
          const applied = reached
            && (!code || (area.originArea?.code || area.originAreaCode) === code)
            && (!origin.importer || area.importer === origin.importer);
          if (applied) steps.push(`원산지 ${origin.exposureType}${code ? ` ${code}` : ""}${origin.importer ? ` · 수입사 ${origin.importer}` : ""}`);
          else warnings.push("원산지를 고르지 못했습니다. 상품 주요정보에서 고르세요.");
        }

        if (form.childCert) {
          const cert = form.childCert;
          const target = q("#childYn_false");
          if (target && !target.checked) target.click();
          const numberInput = () => q('input[name="certNumberCHILD_CERTIFICATION0"]');
          await waitFor(numberInput, stepWait);
          // 인증 한 줄(종류 selectize · 기관 · 번호 · 상호 · 일자)을 번호 칸에서 거슬러 올라가 찾는다.
          let row = numberInput();
          while (row && !q('select[ng-model$=".certificationInfo"]', row)) row = row.parentElement;
          const picked = row && await pickOption(q('select[ng-model$=".certificationInfo"]', row).selectize, `${cert.certId}_CHILD_CERTIFICATION`);
          let filled = false;
          if (picked) {
            await sleep(300);
            typeInto(numberInput(), cert.number);
            // 인증상호는 필수다. 종류를 고른 뒤에야 칸이 보인다.
            const company = await waitFor(() => {
              const candidate = q('input[ng-model$=".companyName"]', row);
              return visible(candidate) ? candidate : null;
            }, brief);
            if (cert.companyName && company) typeInto(company, cert.companyName);
            filled = numberInput()?.value === cert.number && (!cert.companyName || company?.value === cert.companyName);
          }
          if (filled) steps.push(`어린이제품인증 ${cert.number}`);
          else warnings.push(`어린이제품인증 ${cert.number}을(를) 넣지 못했습니다. 상품 주요정보에서 직접 넣으세요.`);
        } else if (q("#childYn_false")) {
          // 어린이제품인데 번호를 모른다. '대상 아님' 을 대신 고르면 거짓 신고라 비워 두고 사람에게 넘긴다.
          warnings.push("KC 인증번호가 없어 어린이제품인증을 비워 뒀습니다. 번호를 넣거나, 인증대상이 아니면 직접 '대상 아님' 을 고르세요.");
        }
        clearDialogs();

        // 7) 상품정보제공고시. 새 화면은 **직전 등록물 값**으로 미리 채워져 온다 → 전부 덮어쓴다.
        const noticeSection = await openSection("상품정보제공고시");
        if (noticeSection) {
          const notice = form.notice;
          const typePicked = await pickOption(selectizeIn(noticeSection, 'select[ng-model="vm.selectizeType"]'), notice.type);
          const directRadio = (model) => all(`input[ng-model="${model}"]`, noticeSection).find((radio) => radio.value === "false");
          for (const radio of [directRadio("vm.viewData.nullable.certificateDetails"), directRadio("vm.viewData.selectedCustomerService")]) {
            if (radio && !radio.checked) radio.click();
          }
          await sleep(200);
          for (const [selector, value] of [
            ['input[ng-model="vm.content.itemName"]', notice.itemName],
            ['input[ng-model="vm.content.modelName"]', notice.modelName],
            ['textarea[ng-model="vm.content.certificateDetails"]', notice.certificateDetails],
            ['input[ng-model="vm.content.afterServiceDirector"]', notice.afterServiceDirector],
          ]) {
            if (value) typeInto(q(selector, noticeSection), value);
          }
          const maker = selectizeIn(noticeSection, '[ng-model="vm.searchKeyword"]');
          const content = () => detail().productInfoProvidedNotice?.productInfoProvidedNoticeContent || {};
          if (notice.manufacturer && maker && content().manufacturer !== notice.manufacturer) maker.createItem(notice.manufacturer, false);
          await waitFor(() => !notice.manufacturer || content().manufacturer === notice.manufacturer, brief);
          const wrong = ["itemName", "modelName", "certificateDetails", "manufacturer", "afterServiceDirector"]
            .filter((key) => notice[key] && content()[key] !== notice[key]);
          if (typePicked && wrong.length === 0) steps.push(`상품정보제공고시 ${notice.type}`);
          else warnings.push(`상품정보제공고시 ${[...(typePicked ? [] : ["분류"]), ...wrong].join(", ")} 을(를) 넣지 못했습니다. 직전 등록물 값이 남아 있을 수 있습니다.`);
        } else {
          warnings.push("상품정보제공고시 칸을 찾지 못했습니다. 직전 등록물 값이 그대로일 수 있으니 확인하세요.");
        }
        clearDialogs();

        // 8) 검색설정 태그. 넣을 때마다 화면이 사용 불가 태그인지 네이버에 묻는다.
        if (form.tags.length > 0) {
          const searchSection = await openSection("검색설정");
          const direct = q('input[ng-model="vm.viewData.isDirectInput"]', searchSection);
          if (direct && !direct.checked) direct.click();
          const tagSelect = await waitFor(() => q('select[ng-model="vm.directInputTag"]', searchSection)?.selectize, stepWait);
          const current = () => (detail().seoInfo?.sellerTags || []).map((tag) => tag?.text);
          for (const tag of form.tags) {
            if (!tagSelect || current().includes(tag)) continue;
            tagSelect.createItem(tag, false);
            await waitFor(() => current().includes(tag) || openModals().length > 0, brief);
            clearDialogs();
          }
          const added = form.tags.filter((tag) => current().includes(tag));
          const missed = form.tags.filter((tag) => !current().includes(tag));
          if (added.length > 0) steps.push(`태그 ${added.length}개`);
          if (missed.length > 0) warnings.push(`태그 ${missed.join(", ")} 은(는) 넣지 못했습니다(사용 불가 태그일 수 있습니다).`);
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        clearDialogs();
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 9) 저장 전 검증만 읽는다. 막히는 칸이 있는 섹션을 사람에게 알린다.
        //    ⚠️ 꺼진 칸(고시 소비자상담 전화 등)도 required 로 남는다 — 사람이 채울 수 없는 칸이라 뺀다.
        const formController = window.angular.element(q('form[name="vm.productForm"]')).controller("form");
        const blocked = new Set();
        const seen = new Set();
        const sectionTitle = (el) => {
          const label = q(".title-line label", el?.closest?.(".form-section"));
          return label
            ? [...label.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").trim()
            : "";
        };
        const walk = (controller, depth) => {
          for (const entries of Object.values(controller?.$error || {})) {
            for (const entry of entries || []) {
              if (!entry || seen.has(entry)) continue;
              seen.add(entry);
              if (typeof entry.$setViewValue !== "function") {
                if (depth < 8) walk(entry, depth + 1);
                continue;
              }
              const el = entry.$$element?.[0];
              if (el && (el.disabled || el.closest?.("fieldset[disabled]"))) continue;
              // 칸 이름은 placeholder 가 가장 사람 말에 가깝다(`인증기관`). 숨은 검증 칸은 섹션 이름만 쓴다.
              const hint = el?.getAttribute?.("placeholder") || "";
              blocked.add([sectionTitle(el), hint].filter(Boolean).join(" ") || entry.$name || "이름 없는 칸");
            }
          }
        };
        walk(formController, 0);
        if (formController && blocked.size === 0) steps.push("저장 전 검증 통과");
        else if (blocked.size > 0) warnings.push(`저장 전 확인: ${[...blocked].join(" · ")}`);
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        // 사람이 이어서 쓸 화면이다. 대화상자는 원래대로 돌려준다.
        window.alert = nativeAlert;
        window.confirm = nativeConfirm;
      }
    })();
  }

  /**
   * GS샵 새 상품등록 화면을 채운다.
   *
   * 칸마다 화면이 부르는 처리 함수(zustand `product-store` 의 `actions`)를 사람이 고른 순서대로 부른다.
   * 처리 함수는 도중에 안내창을 띄우고 닫힐 때까지 기다리기도 해서, 부르는 동안 안내창을 계속 치운다.
   * 넣은 값은 저장소 `schemas[칸].value` 로 확인한다. 저장(`common.create.save`·`imsiSave`)은 부르지 않는다.
   */
  function fillGsshopProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const nativeAlert = window.alert;
      const nativeConfirm = window.confirm;
      window.alert = (message) => { said.push(String(message)); };
      window.confirm = (message) => { said.push(String(message)); return false; };

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 15000;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = await probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const textOf = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      const getJson = async (url) => {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      };

      /**
       * 화면이 띄운 안내·확인창을 치운다. 확인창(취소가 있는 창)은 거절하고, 안내는 확인으로 닫는다.
       * 몰이 한 말은 사람에게 넘긴다.
       */
      const clearDialogs = () => {
        for (const dialog of [...document.querySelectorAll('[role="dialog"]')].filter(visible)) {
          const buttons = [...dialog.querySelectorAll("button")];
          const button = buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => textOf(entry) === "확인")
            || buttons.find((entry) => textOf(entry) === "닫기");
          const message = textOf(dialog).replace(/^확인\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          if (message) said.push(message.slice(0, 200));
          button?.click();
        }
      };
      /** 처리 함수를 부르고, 끝날 때까지 안내창을 치운다. 안내창이 닫혀야 끝나는 함수가 있다. */
      const act = async (run) => {
        let settled = false;
        let failure = null;
        const promise = Promise.resolve().then(run).catch((error) => { failure = error; }).finally(() => { settled = true; });
        const until = Date.now() + stepWait;
        while (!settled && Date.now() < until) {
          clearDialogs();
          await Promise.race([promise, sleep(200)]);
        }
        clearDialogs();
        if (failure) throw failure;
        return settled;
      };

      /** 화면이 받아 둔 모듈에서 폼 저장소를 찾는다. 이미 실행된 모듈이라 import 는 같은 인스턴스를 준다. */
      let storeModule = null;
      const findStore = async () => {
        const hrefs = [...document.querySelectorAll('link[rel="modulepreload"]')]
          .map((link) => link.getAttribute("href") || "")
          .filter((href) => /\/chunks\/[^/]+\.js$/.test(href));
        for (const href of hrefs) {
          let mod;
          try { mod = await import(href); } catch { continue; }
          const store = Object.values(mod).find((entry) => entry && typeof entry.getState === "function"
            && entry.getState()?.actions?.baseInfo && entry.getState()?.schemas);
          if (store) {
            storeModule = mod;
            return store;
          }
        }
        return null;
      };

      let store = null;
      const state = () => store.getState();
      const actions = () => state().actions;
      const value = (key) => state().schemas?.[key]?.value;
      const same = (left, right) => String(left ?? "") === String(right ?? "");

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 저장소가 없다.
        const ready = await waitFor(async () => {
          if (/^\/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          store = store || await findStore();
          return store && state().meta?.isReady ? "form" : null;
        }, payload.formWaitMs || 40000, 500);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "GS샵 상품등록 화면을 찾지 못했습니다." };
        }
        // 수정·복사 화면은 같은 저장소를 쓴다. 저장하면 판매중 상품이 바뀌므로 손대지 않는다.
        if (state().meta.mode !== "create" || value("base.prdCd")) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }
        clearDialogs();

        // 1) 상품분류. 고르면 과세·안전인증 대상·정보고시 상품군이 이 분류에 맞게 바뀐다.
        try {
          const code = form.category;
          const [top, mids, smalls, leaves] = await Promise.all([
            getJson("/bff/product/classifications/top"),
            getJson(`/bff/product/classifications/subs?upperCode=${code.slice(0, 3)}&level=1`),
            getJson(`/bff/product/classifications/subs?upperCode=${code.slice(0, 5)}&level=2`),
            getJson(`/bff/product/classifications/leaf?upperCode=${code.slice(0, 7)}`),
          ]);
          const nameOf = (list, part, key = "code") => (Array.isArray(list) ? list : []).find((entry) => same(entry?.[key], part));
          const leaf = nameOf(leaves, code, "prdClsCd");
          if (!leaf) throw new Error("분류 목록에 없습니다");
          await act(() => actions().baseInfo.setPrdClsLayerSelected({
            class1: code.slice(0, 3),
            class2: code.slice(3, 5),
            class3: code.slice(5, 7),
            class4: code.slice(7, 9),
            class1Nm: nameOf(top, code.slice(0, 3))?.name || "",
            class2Nm: nameOf(mids, code.slice(3, 5))?.name || "",
            class3Nm: nameOf(smalls, code.slice(5, 7))?.name || "",
            class4Nm: leaf.prdClsNm || "",
          }));
          if (!same(value("base.prdClsCd"), code)) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`상품분류 ${leaf.prdClsNm || code}`);
        } catch (error) {
          warnings.push(`상품분류 ${form.category}를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 2) 전시 카테고리. 매장 번호로 상위 단계를 받아 '최근 등록한 전시 카테고리' 를 고른 것처럼 넣는다.
        try {
          const [section] = await getJson(`/bff/display/sections/by-leaf?sectIds=${form.sectionId}`);
          if (!section) throw new Error("매장 번호가 없습니다");
          await act(() => actions().baseInfo.onClickRecentRegSectCls(section));
          const shops = value("shop.ctgrShops") || [];
          if (!shops.some((shop) => same(shop?.sectid, form.sectionId))) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`전시 카테고리 ${section.name || form.sectionId}`);
        } catch (error) {
          warnings.push(`전시 카테고리 ${form.sectionId}를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 3) 협력사 상품코드. 이미 쓰인 코드면 저장이 막히므로 미리 알린다.
        try {
          const exists = await getJson(`/bff/product/suppliers/products/codes/exists?supPrdCd=${encodeURIComponent(form.supplierProductCode)}`);
          if (exists === true || exists?.exists === true) warnings.push(`협력사 상품코드 ${form.supplierProductCode} 는 이미 쓰였습니다. 다른 코드로 바꾸세요.`);
        } catch { /* 확인 못 해도 저장할 때 화면이 다시 본다 */ }
        await act(() => actions().baseInfo.onChangeSupPrdCd(form.supplierProductCode));
        if (same(value("base.supPrdCd"), form.supplierProductCode)) steps.push(`협력사 상품코드 ${form.supplierProductCode}`);
        else warnings.push("협력사 상품코드를 넣지 못했습니다.");

        // 4) 담당MD. 고르면 화면이 담당자 목록과 수수료 기준을 새로 받는다.
        try {
          const mds = await getJson("/bff/supplier/me/md");
          const mdId = form.mdId || String(mds?.list?.[0]?.mdId || mds?.recentList?.[0]?.mdId || "");
          if (!mdId) throw new Error("담당MD 목록이 비었습니다");
          await act(() => actions().baseInfo.onChangeOperMdId(mdId));
          const employees = await getJson(`/bff/product/codes/employees/by-md/${mdId}`);
          const employeeNo = form.employeeNo || String(employees?.[0]?.empNo || "");
          if (employeeNo) await act(() => actions().baseInfo.onChangeRepMdUserId(employeeNo));
          if (!same(value("base.operMdId"), mdId) || !value("base.repMdUserId")) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`담당MD ${mdId}`);
        } catch (error) {
          warnings.push(`담당MD를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 5) 상품명 · 브랜드 · 모델명.
        await act(() => actions().baseInfo.onChangeExposPrdNm(form.exposureName));
        await act(() => actions().baseInfo.onChangePrdNm(form.invoiceName));
        if (same(value("base.exposPrdNm"), form.exposureName) && same(value("base.prdNm"), form.invoiceName)) {
          steps.push("노출상품명 · 송장상품명");
        } else {
          warnings.push("상품명을 넣지 못했습니다. 노출상품명·송장상품명을 확인하세요.");
        }
        await act(() => actions().baseInfo.onSelectSearchedBrand({ brandCd: Number(form.brand.code), brandNm: form.brand.name }));
        if (same(value("base.brandCd"), form.brand.code)) steps.push(`브랜드 ${form.brand.name}`);
        else warnings.push(`브랜드 ${form.brand.name}을(를) 넣지 못했습니다. 화면에서 검색해 고르세요.`);
        if (form.modelName) await act(() => actions().baseInfo.onChangeModelNo(form.modelName));

        // 6) 구성상품 · 가격. 판매가와 수수료율을 넣으면 공급가는 화면이 계산한다.
        const composition = form.composition;
        for (const [key, entry] of [
          ["custom.goodsDesc", composition.content],
          ["custom.pkgCnt", String(composition.packageCount)],
          ["custom.factoryName", composition.maker],
          ["custom.nativeCountry", composition.origin],
        ]) {
          if (entry) await act(() => actions().cmposInfo.onChangeCompositions(key, entry));
        }
        if (same(value("custom.goodsDesc"), composition.content)) steps.push("구성상품");
        await act(() => actions().cmposInfo.onChangeSalePrc(String(form.salePrice)));
        if (form.marginRate > 0) await act(() => actions().cmposInfo.onChangeMargnRt(String(form.marginRate)));
        const fee = value("price.fee");
        if (same(value("price.salePrc"), form.salePrice) && fee !== "" && fee !== undefined && fee !== null) {
          steps.push(`판매가 ${form.salePrice} · 수수료율 ${form.marginRate}% · 공급가 ${fee}`);
        } else {
          warnings.push("판매가·공급가가 계산되지 않았습니다. 가격 칸을 확인하세요.");
        }

        // 7) 배송·반품·교환.
        const delivery = form.delivery;
        const d = () => actions().deliveryInfo;
        if (delivery.courier) await act(() => d().onChangeDlvsCoCd(delivery.courier));
        await act(() => d().onChangeCvsDlvsRtpYn(delivery.convenienceReturn));
        await act(() => d().onChangeDlvcYn(delivery.fee > 0 ? "YN" : "NN"));
        if (delivery.fee > 0) {
          await act(() => d().onChangeChrDlvCost(String(delivery.fee)));
          await act(() => d().onChangeStdAmtYn(delivery.freeOver > 0 ? "N" : "Y"));
          if (delivery.freeOver > 0) await act(() => d().onChangeDlvcLimitAmt(String(delivery.freeOver)));
        }
        for (const [yes, amountHandler, fee] of [
          ["onChangeRtnChrYn", "onChangeRtnChrAmt", delivery.returnFee],
          ["onChangeExchChrYn", "onChangeExchChrAmt", delivery.exchangeFee],
        ]) {
          await act(() => d()[yes](fee > 0 ? "Y" : "N"));
          if (fee > 0) await act(() => d()[amountHandler](String(fee)));
        }
        const remote = delivery.remote;
        if (remote.fee > 0 || remote.returnFee > 0 || remote.exchangeFee > 0) {
          await act(() => d().onChangeJejuIlndAddFeeYn("Y"));
          for (const area of ["Jeju", "Ilnd"]) {
            await act(() => d()[`onChange${area}DlvPsblYn`]("Y"));
            for (const [yes, amountHandler, fee] of [
              ["ChrDlvYn", "ChrDlvcAmt", remote.fee],
              ["RtnChrYn", "RtnChrAmt", remote.returnFee],
              ["ExchChrYn", "ExchChrAmt", remote.exchangeFee],
            ]) {
              await act(() => d()[`onChange${area}${yes}`](fee > 0 ? "Y" : "N"));
              if (fee > 0) await act(() => d()[`onChange${area}${amountHandler}`](String(fee)));
            }
          }
        }
        await act(() => d().onChangeRfnTypCd(delivery.refundType));
        if (delivery.shipAddress) await act(() => d().onChangePrdRelspAddrCd(delivery.shipAddress));
        if (delivery.returnAddress) await act(() => d().onChangePrdRetpAddrCd(delivery.returnAddress));
        if (delivery.bundle) await act(() => d().onChangeBundlDlvCd(delivery.bundle));
        if (delivery.weight) await act(() => d().onChangeQuantityValUnitCd(delivery.weight));
        if (delivery.length) await act(() => d().onChangeLengthValUnitCd(delivery.length));
        const deliveryMissing = [
          ["delivery.dlvsCoCd", delivery.courier, "택배사"],
          ["delivery.chrDlvCost", delivery.fee > 0 ? delivery.fee : "", "배송비"],
          ["custom.rtnChrAmt", delivery.returnFee > 0 ? delivery.returnFee : "", "반품비"],
          ["delivery.prdRelspAddrCd", delivery.shipAddress, "출고지"],
          ["delivery.prdRetpAddrCd", delivery.returnAddress, "반송지"],
          ["delivery.quantityValue.unitCd", delivery.weight, "무게"],
        ].filter(([key, expected]) => expected !== "" && !same(value(key), expected)).map(([, , label]) => label);
        if (deliveryMissing.length === 0) steps.push("배송·반품·교환");
        else warnings.push(`배송 정보 ${deliveryMissing.join(", ")} 을(를) 넣지 못했습니다.`);

        // 8) 재고.
        if (form.stock > 0) await act(() => actions().attrInfo.onChangeOrdPsblQty(String(form.stock)));
        if (form.safeStock > 0) await act(() => actions().attrInfo.onChangeSafeStockQty(String(form.safeStock)));
        if (form.stock > 0 && same(value("custom.ordPsblQty"), form.stock)) steps.push(`주문가능수량 ${form.stock}`);

        // 9) 정보고시. 상품군을 고르면 항목이 새로 그려진다. 고칠 수 있는 항목만 채운다(A/S 는 GS 고정).
        const notice = form.notice;
        if (notice.groupCode) {
          await act(() => actions().govPublsInfo.onChangeGovPublsPrdGrpCd(notice.groupCode));
          const loaded = await waitFor(() => (value("custom.govPublsListG") || []).length > 0, stepWait);
          if (loaded) {
            const list = (value("custom.govPublsListG") || []).map((item) => (item?.editable
              && Object.prototype.hasOwnProperty.call(notice.values, String(item.prdExplnItmCd))
              ? { ...item, prdExplnCntnt: notice.values[String(item.prdExplnItmCd)] }
              : item));
            actions().setFieldValue("custom.govPublsListG", list);
            const empty = (value("custom.govPublsListG") || [])
              .filter((item) => item?.mandYn === "Y" && !String(item?.prdExplnCntnt || "").trim())
              .map((item) => item.prdExplnItmNm);
            if (same(value("explanation.govPublsPrdGrpCd"), notice.groupCode) && empty.length === 0) {
              steps.push(`정보고시 ${notice.groupCode}`);
            } else if (empty.length > 0) {
              warnings.push(`정보고시 필수 항목 ${empty.join(", ")} 이(가) 비었습니다.`);
            }
          } else {
            warnings.push(`정보고시 상품군 ${notice.groupCode} 항목을 불러오지 못했습니다. 화면에서 고르세요.`);
          }
        }
        // 안전인증 대상여부. 인증번호·기관·발급일은 우리가 다 알지 못해 '해당사항 없음' 으로 둔다(기존 등록물과 같다).
        await act(() => actions().govPublsInfo.onChangeSafeCertTgtYn("N"));

        // 10) 상품 이미지. 사진 칸 처리 함수가 GS 임시 저장소에 올리고 미리보기를 붙인다(1 = 대표).
        const toFile = (image, fallbackName) => {
          const [head, encoded] = String(image.dataUrl).split(",");
          const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
          const binary = atob(encoded);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          let name = String(image.fileName || fallbackName);
          if (!/\.(jpe?g|png|webp)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
          return new File([bytes], name, { type: mime });
        };
        const images = (payload.images || []).filter((image) => image && image.dataUrl).slice(0, payload.maxImages || 8);
        let uploaded = 0;
        for (let index = 0; index < images.length; index += 1) {
          const seq = index + 1;
          const file = toFile(images[index], `image${seq}`);
          const saidBefore = said.length;
          await act(() => actions().imgInfo.uploadPrdImg({ orgFile: file, cntntFileNm: file.name, seq }, {}));
          const slot = (value("images") || []).find((image) => image?.seq === seq);
          if (slot?.cntntUrl && slot?.filePath) uploaded += 1;
          else warnings.push(`${seq === 1 ? "대표" : `추가${seq - 1}`} 이미지를 올리지 못했습니다${said.length > saidBefore ? `: ${said[said.length - 1].replace(/[.\s]+$/, "")}` : ""}.`);
        }
        if (uploaded > 0) steps.push(`상품 이미지 ${uploaded}장`);

        // 11) 기술서. 편집기의 사진 올리기와 같은 임시 업로드로 주소를 받아 편집기에 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const upload = Object.values(storeModule || {}).find((entry) => typeof entry === "function"
              && /keepName/.test(String(entry)) && /\.file/.test(String(entry)));
            if (!upload) throw new Error("편집기 업로드를 찾지 못했습니다");
            const result = await upload({ files: [{ id: `$$_${Date.now()}_$$`, file: toFile(payload.detailImage, "detail") }] });
            const path = String((Array.isArray(result) ? result[0]?.path : "") || "");
            if (!path) throw new Error("응답에 사진 주소가 없습니다");
            detailHtml = `<center><img src="${path}" data-uploaded-path="${path}"></center>`;
            steps.push("기술서 사진 GS 업로드");
          } catch (error) {
            warnings.push(`기술서 사진을 GS에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        const editor = state().deps?.crossEditor;
        if (detailHtml && editor) {
          editor.setValue(detailHtml);
          actions().setFieldValue("custom.documentDesc", detailHtml);
          if (/<img/i.test(String(editor.getValue() || ""))) steps.push("기술서");
          else warnings.push("기술서를 넣지 못했습니다. 편집기에 직접 넣으세요.");
        } else {
          warnings.push(detailHtml ? "기술서 편집기를 찾지 못했습니다. 직접 넣으세요." : "기술서에 넣을 사진을 만들지 못했습니다. 직접 넣으세요.");
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        clearDialogs();
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 12) 저장 전에 화면이 막는 필수 칸만 다시 본다(저장 검사 함수는 막히면 값을 지우므로 부르지 않는다).
        const blocked = [
          ["base.prdClsCd", "상품분류"],
          ["base.supPrdCd", "협력사 상품코드"],
          ["base.operMdId", "담당MD"],
          ["base.repMdUserId", "담당MD 담당자"],
          ["base.exposPrdNm", "노출상품명"],
          ["base.prdNm", "송장상품명"],
          ["base.brandCd", "브랜드"],
          ["price.salePrc", "판매가"],
          ["price.fee", "공급가"],
          ["delivery.dlvsCoCd", "택배사"],
          ["delivery.prdRelspAddrCd", "출고지"],
          ["delivery.prdRetpAddrCd", "반송지"],
        ].filter(([key]) => {
          const current = value(key);
          return current === "" || current === null || current === undefined;
        }).map(([, label]) => label);
        if (!(value("shop.ctgrShops") || []).some((shop) => shop?.sectid)) blocked.push("전시 카테고리");
        if (!(value("images") || []).some((image) => image?.seq === 1 && image?.cntntUrl)) blocked.push("대표 이미지");
        if (blocked.length === 0) steps.push("저장 전 필수 칸 확인");
        else warnings.push(`저장 전 확인: ${blocked.join(" · ")}`);
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        window.alert = nativeAlert;
        window.confirm = nativeConfirm;
      }
    })();
  }

  /**
   * 롯데ON 판매자센터 상품등록(WebSquare) 채우기. `index_SO.wsp` 에 주입된다.
   *
   * 화면 칸은 데이터(`dat_*`)에 묶여 있고, 섹션(`wfm_*`)마다 사람이 누를 때 도는 함수가 있다. 그 함수를
   * 사람 순서대로 부른다. 순서가 중요하다 — 표준카테고리를 고르면 단품 줄·판매유형이 새로 만들어지고,
   * 고시 상품군을 고르면 제조자 칸이 비워지고, 거래처·분류 조회가 배송비 정책을 다시 고른다.
   *
   * 화면 알림(`com.alert`/`com.confirm`)은 DOM 대화상자이고 섹션마다 `com` 이 따로 있다. 채우는 동안
   * 전부 가로채 **기록만** 한다 — 알림 콜백 중에는 탭을 닫거나 등록 첫 화면으로 보내는 것이 있다.
   * `저장`(`scwin.product.regist`)·`임시저장` 은 부르지 않는다.
   */
  function fillLotteonProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const form = payload.form;
      const stepWait = payload.stepWaitMs || 20000;
      // 화면이 늦게 끝내는 조회를 기다리는 짧은 간격. 섹션 대기보다 길지 않게 둔다.
      const settle = Math.min(1500, stepWait);
      const PATH = "/ui/product/registration/productInsert.xml";
      const nativeAlert = window.alert;
      const nativeConfirm = window.confirm;
      window.alert = (message) => { said.push(String(message)); };
      window.confirm = (message) => { said.push(String(message)); return false; };

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = await probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const clean = (message) => String(message || "").replace(/\s+/g, " ").trim();
      const tidy = (message) => clean(message).replace(/[.\s]+$/, "");
      const toBlob = (dataUrl) => {
        const [head, encoded] = String(dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      };

      // 섹션마다 따로 있는 `com` 의 알림을 기록만 하게 바꾼다. 끝나면 되돌린다.
      const patched = [];
      const patchCom = (target) => {
        if (!target || typeof target.alert !== "function" || patched.some((entry) => entry.target === target)) return;
        patched.push({ target, alert: target.alert, confirm: target.confirm });
        target.alert = (message) => { said.push(clean(message)); return null; };
        target.confirm = (message) => { said.push(clean(message)); return null; };
      };
      // 조회 오류 알림처럼 `com.alert` 를 거치지 않는 대화상자는 치운다. 확인창은 취소(비강조 단추)로 닫는다.
      const sweepDialogs = () => {
        for (const node of [...document.querySelectorAll(".dialog-block, .dialog-block-for-tab")]) {
          const content = node.querySelector(".dialog-block-content") || node;
          const message = clean(content.innerText || content.textContent);
          if (message) said.push(message.slice(0, 200));
          const buttons = [...node.querySelectorAll(".dialog-block-buttons input[type=button]")];
          if (buttons.length > 1) buttons.find((button) => !/\bpoint3\b/.test(button.className))?.click();
          node.parentNode?.removeChild(node);
        }
      };
      // WebSquare 는 그릴 때 DOM 을 많이 바꾼다. 바뀔 때마다 훑지 않고 잠깐 모아서 한 번 훑는다.
      let sweepQueued = false;
      const observer = new MutationObserver(() => {
        if (sweepQueued) return;
        sweepQueued = true;
        setTimeout(() => { sweepQueued = false; sweepDialogs(); }, 150);
      });

      try {
        // 0) 판매자센터 껍데기. 로그아웃이면 로그인 화면으로 넘어간다.
        const shell = await waitFor(() => {
          if (/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some((el) => el.getClientRects().length > 0)) return "login";
          return window.com && typeof window.com.openTab === "function" && window.gcm?.user?.getTrNo?.() ? "shell" : null;
        }, payload.formWaitMs || 60000, 500);
        if (shell !== "shell") {
          return { ok: false, noForm: true, error: "롯데ON 판매자센터 화면을 찾지 못했습니다." };
        }
        observer.observe(document.body, { childList: true, subtree: true });
        sweepDialogs();
        patchCom(window.com);

        // 1) 상품등록 탭. 새로 여는 탭 번호를 우리가 정해 두면 그 탭의 화면을 정확히 집는다.
        const tac = window.com.getHighestOpener(window).$p.getComponentById("tac_layout");
        if (tac.getTabCount() >= 10) {
          return { ok: false, error: "롯데ON 화면 탭이 10개라 상품등록을 열 수 없습니다. 탭을 닫고 다시 누르세요." };
        }
        const tabId = `kiditemPI${Date.now()}`;
        window.com.openTab("상품등록", PATH, { initType: "category", menuName: "상품등록", jsonData: {} }, tabId);
        const pi = await waitFor(() => {
          const scope = tac.getWindow(tabId);
          return scope && scope.scwin && scope.scwin.product && scope.wfm_title && scope.wfm_delivery ? scope : null;
        }, stepWait, 300);
        if (!pi) return { ok: false, error: "롯데ON 상품등록 화면을 열지 못했습니다." };
        const win = (name) => pi[name].getWindow();

        // 공통코드 → 1.5초 뒤 초기화 → 거래처 조회 → 배송 정보 조회까지 끝나야 칸이 안 뒤집힌다.
        const initialized = () => {
          const scwin = pi.scwin;
          const delivery = win("wfm_delivery");
          return scwin.isPause === true && scwin.product.tp === "category" && scwin.product.data.pdTypCd === "GNRL_GNRL"
            && scwin.traderData?.trNo && pi.dat_basicInfo.get("trNo")
            && win("wfm_buyService").rad_maxPurLmtTypCd.getValue() === "N"
            && (delivery.scwin.dvCstPolList || []).length > 0 && (delivery.scwin.owhpList || []).length > 0
            && delivery.sbx_hdcCd.getValue() !== "";
        };
        const settled = await waitFor(async () => {
          if (!initialized()) return false;
          await sleep(Math.min(1000, settle));
          return initialized();
        }, payload.formWaitMs || 60000, 500);
        patchCom(pi.com);
        for (const name of Object.keys(pi).filter((key) => /^wfm_/.test(key) && typeof pi[key]?.getWindow === "function")) {
          try { patchCom(win(name).com); } catch { /* 아직 안 붙은 섹션 */ }
        }
        if (!settled) {
          if (!pi.scwin.traderData?.trNo) return { ok: false, error: "롯데ON 상품등록 화면이 거래처 정보를 불러오지 못했습니다." };
          warnings.push("롯데ON 화면 초기화가 늦어 배송 정보가 덜 불러와졌을 수 있습니다. 배송 칸을 확인하세요.");
        }

        // 2) 표준카테고리. 화면의 [선택하기] 가 끝에 부르는 함수를 부른다. 연관정보 콜백이 전시카테고리·수수료·
        //    판매유형·단품 줄·속성·인증 대상을 한꺼번에 채운다.
        const scwin = pi.scwin;
        const categoryWin = win("wfm_category");
        const basic = pi.dat_basicInfo;
        const categoryRun = { callback: false, error: null };
        const originalCallback = categoryWin.scwin.categoryCallback;
        categoryWin.scwin.categoryCallback = function (...args) {
          categoryRun.callback = true;
          try { return originalCallback.apply(this, args); } catch (error) { categoryRun.error = error; throw error; }
        };
        let special = false;
        try {
          special = Boolean(categoryWin.scwin.getStdMappingInfo(form.category))
            || [categoryWin.scwin.rntlCatYn, categoryWin.scwin.ecpnTraderYn, categoryWin.scwin.mblTraderYn,
              categoryWin.scwin.pprTraderYn, categoryWin.scwin.zeroPdTypCdCategoryYn].includes("Y");
        } catch { special = false; }
        const saidBeforeCategory = said.length;
        if (!special) scwin.select_standard_category(form.category);
        const chosen = special ? null : await waitFor(() => categoryRun.error || (categoryRun.callback
          && basic.get("scatNo") === form.category && basic.get("scatNm") && basic.get("dcatNoLst")
          && String(basic.get("slfee") ?? "") !== "" && pi.dat_saleOptionGrid.getRowCount() > 0), stepWait, 250);
        categoryWin.scwin.categoryCallback = originalCallback;
        if (!chosen || categoryRun.error || basic.get("scatNo") !== form.category) {
          const reason = special ? "해외·렌탈·상품권 전용 분류입니다"
            : tidy(said.slice(saidBeforeCategory).pop() || categoryRun.error?.message || "화면에 반영되지 않았습니다");
          return {
            ok: false,
            steps,
            warnings,
            error: `롯데ON 표준카테고리 ${form.category} 를 고르지 못했습니다(${reason}). 열린 탭에서 카테고리를 고르세요.`,
          };
        }
        steps.push(`표준카테고리 ${basic.get("scatNm")} · 수수료 ${basic.get("slfee")}%`);

        // 3) 판매자상품명. 전시상품명도 같은 값으로 두고 단품 줄에 따라 적는다.
        const titleWin = win("wfm_title");
        titleWin.dat_productInfo.set("spdNm", form.productName);
        titleWin.dat_productInfo.set("pdNm", form.productName);
        titleWin.scwin.ibx_pdNm_onchange();
        try { titleWin.tbx_spdNmLength.setValue(window.WebSquare.util.getStringByteSize(form.productName)); } catch { /* 글자 수 표시만 */ }
        if (pi.dat_productInfo.get("spdNm") === form.productName) steps.push("판매자상품명");
        else warnings.push("판매자상품명을 넣지 못했습니다. 화면에서 확인하세요.");
        const keywordRule = String(scwin.pdNmEstlKwdCnts || "");
        if (keywordRule && !keywordRule.split("|").some((keyword) => keyword && form.productName.includes(keyword))) {
          warnings.push(`이 카테고리는 상품명에 ${keywordRule.split("|").join(", ")} 중 하나가 들어가야 저장됩니다.`);
        }

        // 4) 판매옵션 — 선택형 옵션 없이 단품 한 줄. 재고관리를 바꾸면 재고가 초기화되므로 가격·재고보다 먼저.
        const optionWin = win("wfm_option");
        const grid = optionWin.dat_saleOptionGrid;
        if (optionWin.rad_slOptYn.getValue() !== "N" || grid.getRowCount() !== 1) {
          optionWin.rad_slOptYn.setValue("N");
          optionWin.scwin.rad_slOptYn_onviewchange();
        }
        optionWin.rad_stkMgtYn.setValue(form.stockManaged ? "Y" : "N");
        optionWin.scwin.rad_stkMgtYn_onchange.call(optionWin.rad_stkMgtYn);
        grid.setCellData(0, "slPrc", form.salePrice);
        if (form.stockManaged) grid.setCellData(0, "stkQty", form.stock);
        const row = grid.getRowJSON(0) || {};
        if (Number(row.slPrc) === form.salePrice && String(row.stkQty ?? "") !== "") {
          steps.push(`판매가 ${form.salePrice} · 재고 ${form.stockManaged ? form.stock : "관리 안 함"}`);
        } else {
          warnings.push("판매가·재고를 넣지 못했습니다. 판매옵션 목록을 확인하세요.");
        }

        // 5) 상품정보제공고시. 상품군을 고르면 항목이 새로 그려지면서 칸이 비워진다 — 그 뒤에 채운다.
        const notice = form.notice;
        const articleWin = win("wfm_article");
        if (notice.groupCode) {
          if (articleWin.rad_pdItmsRegWay.getValue() !== "NEW") {
            articleWin.rad_pdItmsRegWay.setValue("NEW");
            articleWin.scwin.rad_pdItmsRegWay_onchange();
          }
          const noticeRun = { fired: false, loaded: false };
          const originalDisplay = articleWin.scwin.setItemDisplay;
          const originalDisplayed = articleWin.scwin.setItemDisplay1;
          articleWin.scwin.setItemDisplay = function (...args) { noticeRun.fired = true; return originalDisplay.apply(this, args); };
          articleWin.scwin.setItemDisplay1 = function (...args) {
            const result = originalDisplayed.apply(this, args);
            noticeRun.loaded = true;
            return result;
          };
          articleWin.sbx_pdItmsCd.setValue(notice.groupCode);
          if (!noticeRun.fired) articleWin.scwin.sbx_pdItmsCd_onchange.call(articleWin.sbx_pdItmsCd);
          const loaded = await waitFor(() => noticeRun.loaded, stepWait, 200);
          articleWin.scwin.setItemDisplay = originalDisplay;
          articleWin.scwin.setItemDisplay1 = originalDisplayed;
          if (loaded) {
            const exclude = "group trigger textbox output calendar image span anchor pageInherit wframe itemTable generator";
            for (const ref of articleWin.data_pdArtlCdList.getFilteredColData("artlRefcNo")) {
              const group = articleWin.$p.getComponentById(`grp_item${ref}`);
              if (!group) continue;
              for (const input of window.WebSquare.util.getChildren(group, { excludePlugin: exclude, recursive: true })) {
                let itemCode = null;
                try { itemCode = input.getUserData("userData1"); } catch { itemCode = null; }
                if (typeof itemCode !== "string" || !itemCode) continue;
                if (itemCode === "1420") {
                  articleWin.sbx_oplcTypCd3.setValue(form.origin.typeCode);
                  articleWin.scwin.sbx_oplcTypCd3_onviewchange();
                  input.setValue(form.origin.code);
                  articleWin.scwin.acb_oplcCd3_onviewchange();
                } else if (Object.prototype.hasOwnProperty.call(notice.values, itemCode)) {
                  input.setValue(notice.values[itemCode]);
                }
              }
            }
            const filled = articleWin.scwin.getPdItmsArtlInfo() || [];
            const empty = filled.filter((item) => !String(item.pdArtlCnts || "").replace(/\/\//g, "").trim()
              || /\/\/$/.test(String(item.pdArtlCnts || "")) || /^\/\//.test(String(item.pdArtlCnts || "")))
              .map((item) => item.pdArtlCd);
            if (filled.length > 0 && empty.length === 0) steps.push(`정보고시 ${notice.groupCode}`);
            else warnings.push(`정보고시 항목 ${empty.join(", ") || "전부"} 이(가) 비었습니다. 화면에서 채우세요.`);
          } else {
            warnings.push(`정보고시 상품군 ${notice.groupCode} 항목을 불러오지 못했습니다. 화면에서 고르세요.`);
          }
        }

        // 6) 상품주요정보 — 원산지·제조사·모델명. 제조사 칸은 고시 제조자와 같은 데이터라 고시 뒤에 넣는다.
        const infoWin = win("wfm_info");
        if (form.origin.code !== "KR") {
          infoWin.dat_productInfo.set("oplcCd", form.origin.code);
          infoWin.scwin.acb_oplcCd_onchange();
        }
        if (form.maker) infoWin.ibx_mfcrNm.setValue(form.maker);
        if (form.modelNo) win("wfm_etc").ibx_mdlNo.setValue(form.modelNo);
        const product = pi.dat_productInfo;
        if (product.get("oplcCd") === form.origin.code && (!form.maker || product.get("mfcrNm") === form.maker)) {
          steps.push(`원산지 ${form.origin.code}${form.maker ? ` · 제조사 ${form.maker}` : ""}${form.modelNo ? ` · 모델명 ${form.modelNo}` : ""}`);
        } else {
          warnings.push("원산지·제조사를 넣지 못했습니다. 상품주요정보를 확인하세요.");
        }

        // 7) 인증정보. 분류가 KC 대상이면 화면이 '설정함'으로 바꾼다 — 인증번호·기관은 사람이 넣는다.
        const safetyWin = win("wfm_saftyAthn");
        const certRadios = ["rad_isSftyAthn", "rad_isChildSftyAthn", "rad_isChemSftyAthn"];
        if (certRadios.some((radio) => safetyWin[radio]?.getValue() === "Y")) {
          warnings.push("이 카테고리는 KC 인증정보가 필요합니다. 인증정보 칸에 인증 구분·번호를 직접 넣으세요.");
        }

        // 8) 상세설명 · A/S. 상세 이미지는 편집기 안내("이미지를 내용입력영역에 드래그&드롭")대로 편집기의 사진
        //    업로드로 넣는다 — 끌어다 놓을 때 CKEditor `uploadimage` 가 쓰는 `uploadRepository` 를 그대로 쓴다.
        //    롯데ON 은 올린 사진을 본문에 넣을 이미지 데이터로 돌려준다(실측 `/websquare/imageupload.wq` →
        //    `{uploaded:1, url:"data:image/jpeg;base64,…"}`). 화면이 쓰는 변경 함수로 '설정함' 표시를 맞춘다.
        const descWin = win("wfm_desc");
        const writeDetail = (html, marker) => waitFor(() => {
          descWin.edt_dscrp.setHTML(html);
          descWin.scwin.edt_dscrp_onchange();
          return String(descWin.edt_dscrp.getHTML() || "").includes(marker);
        }, Math.min(5000, stepWait), 500);
        let detailWritten = false;
        if (payload.detailImage?.dataUrl) {
          try {
            const editorId = String(descWin.edt_dscrp.id || "");
            const instances = window.CKEDITOR?.instances || {};
            const editor = instances[`${editorId}_`]
              || Object.values(instances).find((instance) => editorId && String(instance.name).startsWith(editorId));
            if (!editor?.uploadRepository) throw new Error("상세설명 편집기를 찾지 못했습니다");
            const blob = toBlob(payload.detailImage.dataUrl);
            const extension = /png/i.test(blob.type) ? "png" : "jpg";
            const name = /\.(jpe?g|png)$/i.test(String(payload.detailImage.fileName || "")) ? String(payload.detailImage.fileName) : `detail.${extension}`;
            const loader = editor.uploadRepository.create(new File([blob], name, { type: blob.type }));
            loader.loadAndUpload(window.CKEDITOR.fileTools.getUploadUrl(editor.config, "image"));
            const finished = await waitFor(() => (["uploaded", "error", "abort"].includes(loader.status) ? loader.status : null), stepWait * 3, 250);
            if (finished !== "uploaded" || !loader.url) {
              throw new Error(loader.message || (finished ? "편집기가 사진을 받지 않았습니다" : "업로드가 끝나지 않았습니다"));
            }
            const alt = form.productName.replace(/["<>]/g, "");
            detailWritten = await writeDetail(`<center><img src="${loader.url}" alt="${alt}"></center>`, String(loader.url).slice(0, 64));
            if (detailWritten) steps.push("상세설명 이미지(편집기 업로드)");
          } catch (error) {
            warnings.push(`상세 이미지를 편집기에 올리지 못했습니다: ${tidy(error?.message || error)}.`);
          }
        }
        if (!detailWritten && payload.detailHtml) {
          const detailHtml = String(payload.detailHtml);
          detailWritten = await writeDetail(detailHtml, (detailHtml.match(/src="([^"]+)"/) || [])[1] || "<img");
          if (detailWritten) steps.push("상세설명");
        }
        if (!detailWritten) warnings.push("상세설명을 넣지 못했습니다. 상세 이미지를 편집기에 끌어다 놓으세요.");
        if (form.asText) {
          const asWin = win("wfm_as");
          asWin.edt_asCnts.setHTML(form.asText);
          asWin.scwin.edt_asCnts_onchange();
          if (String(asWin.edt_asCnts.getHTML() || "").includes(form.asText.slice(0, 8))) steps.push("A/S 안내");
        }

        // 9) 구매수량 제한. 화면 초기화의 0.5초 타이머가 '사용안함'으로 되돌리므로 초기화가 끝난 뒤에 넣는다.
        if (form.purchase.maxQty > 0) {
          const buyWin = win("wfm_buyService");
          buyWin.rad_maxPurLmtTypCd.setValue("PERIOD");
          buyWin.scwin.rad_maxPurLmtTypCd_onchange();
          buyWin.ibx_maxPurQty.setValue(form.purchase.maxQty);
          buyWin.ibx_maxPurLmtPrd.setValue(form.purchase.periodDays);
          const option = pi.dat_saleOption;
          if (option.get("maxPurLmtTypCd") === "PERIOD" && Number(option.get("maxPurQty")) === form.purchase.maxQty) {
            steps.push(`최대구매 ${form.purchase.periodDays}일 ${form.purchase.maxQty}개`);
          } else {
            warnings.push("최대 구매수량을 넣지 못했습니다. 구매/서비스조건을 확인하세요.");
          }
        }

        // 10) 판매자 내부관리번호.
        if (form.sellerCode) {
          const manageWin = win("wfm_manageNo");
          manageWin.ibx_epdNo.setValue(form.sellerCode);
          try { manageWin.scwin.setTitle(form.sellerCode); } catch { /* 요약 표시만 */ }
          if (pi.dat_manageNo.get("epdNo") === form.sellerCode) steps.push(`판매자내부상품번호 ${form.sellerCode}`);
        }

        // 11) 배송 · 반품. 분류·거래처 조회가 정책을 다시 고르므로 마지막에 넣고, 잠시 뒤 다시 본다.
        const deliveryWin = win("wfm_delivery");
        const output = deliveryWin.dat_output;
        const returns = deliveryWin.dat_returnInfo;
        const delivery = form.delivery;
        const pick = (component, wanted) => {
          if (!wanted || !component) return true;
          if (component.getValue() !== wanted) component.setValue(wanted);
          return component.getValue() === wanted;
        };
        const applyDelivery = () => {
          if (delivery.sameDay && output.get("sndBgtNday") !== 0 && output.get("sndBgtNday") !== "0") deliveryWin.scwin.todaySndBgt();
          const missed = [];
          if (!pick(deliveryWin.sbx_nldySndCloseTm, delivery.closeTime)) missed.push("발송마감시간");
          if (!pick(deliveryWin.rad_satSndPsbYn, delivery.saturday)) missed.push("토요일발송");
          if (!pick(deliveryWin.sbx_dvCstPolNo, delivery.costPolicy)) missed.push(`배송비 정책 ${delivery.costPolicy}`);
          if (!pick(deliveryWin.sbx_adtnDvCstPolNo, delivery.extraCostPolicy)) missed.push(`추가배송비 정책 ${delivery.extraCostPolicy}`);
          if (!pick(deliveryWin.sbx_owhpNo, delivery.shipPlace)) missed.push(`출고지 ${delivery.shipPlace}`);
          if (!pick(deliveryWin.sbx_rtrpNo, delivery.returnPlace)) missed.push(`반품지 ${delivery.returnPlace}`);
          if (!pick(deliveryWin.sbx_hdcCd, delivery.courier)) missed.push("택배사");
          if (!pick(deliveryWin.sbx_rtngHdcCd, delivery.returnCourier)) missed.push("반품 택배사");
          if (delivery.returnPlace && deliveryWin.sbx_rtrpNo.getValue() === delivery.returnPlace) returns.set("rtrpNo", delivery.returnPlace);
          if (delivery.retrieveType && deliveryWin.rad_rtrvTypCd) {
            deliveryWin.rad_rtrvTypCd.setValue(delivery.retrieveType);
            if (returns.get("rtrvTypCd") !== delivery.retrieveType) returns.set("rtrvTypCd", delivery.retrieveType);
          }
          return missed;
        };
        const deliverySnapshot = () => JSON.stringify([output.get("dvCstPolNo"), output.get("adtnDvCstPolNo"), output.get("owhpNo"),
          returns.get("rtrpNo"), output.get("hdcCd"), returns.get("rtngHdcCd"), output.get("sndBgtNday"),
          deliveryWin.sbx_nldySndCloseTm.getValue(), returns.get("rtrvTypCd")]);
        applyDelivery();
        const firstPass = deliverySnapshot();
        await sleep(settle);
        if (deliverySnapshot() !== firstPass) {
          // 늦게 끝난 조회가 고른 값을 되돌렸다. 한 번 더 넣고 가라앉기를 본다.
          applyDelivery();
          await sleep(settle);
        }
        const missedDelivery = applyDelivery();
        if (missedDelivery.length === 0) {
          steps.push(`배송 ${delivery.sameDay ? "오늘발송" : "일반발송"} · 배송비 정책 ${output.get("dvCstPolNo")} · 출고/반품지 ${output.get("owhpNo")}`);
        } else {
          warnings.push(`배송 정보 ${missedDelivery.join(", ")} 을(를) 고르지 못했습니다. 목록에 없으면 화면에서 고르세요.`);
        }

        // 12) 상품 이미지. 단품이미지 창이 쓰는 업로드(티켓 → 파일)로 올리고, 창이 닫힐 때 부르는 콜백을 부른다.
        const images = (payload.images || []).filter((image) => image && image.dataUrl).slice(0, payload.maxImages || 10);
        if (images.length > 0) {
          const apiBase = String(window.gcm.API_GW || "https://soapi.lotteon.com");
          // ⚠️ `Accept` 가 없으면 파일 업로드가 XML(`<FineUploaderResponseModel>`)로 답한다(실측 2026-09-14).
          const headers = () => {
            const token = window.gcm.getAuthToken?.();
            return {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "X-Timezone": window.gcm.getTimezone?.() || "GMT+09:00",
              Accept: "application/json",
            };
          };
          /** JSON 이 기본이고, 그래도 XML 로 오면 같은 칸을 읽는다. */
          const readUploadResult = async (response) => {
            const text = await response.text().catch(() => "");
            try { return JSON.parse(text); } catch { /* XML 답 */ }
            const tag = (name) => (text.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1];
            if (!tag("success")) return {};
            return {
              success: tag("success") === "true",
              message: tag("message"),
              meta: { fileId: tag("fileId"), fileName: tag("fileName"), size: Number(tag("size")) || 0 },
            };
          };
          const measure = (blob) => new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const probe = new Image();
            probe.onload = () => { URL.revokeObjectURL(url); resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); };
            probe.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            probe.src = url;
          });
          const sizeLabel = (size) => {
            const kb = Math.ceil(size / 1024);
            return kb >= 1024 ? `${Math.ceil(kb / 1024)}MB` : `${kb}KB`;
          };
          const accepted = [];
          for (let index = 0; index < images.length; index += 1) {
            const label = index === 0 ? "대표" : `추가${index}`;
            const blob = toBlob(images[index].dataUrl);
            const dimension = await measure(blob);
            if (!dimension) warnings.push(`${label} 이미지를 읽지 못했습니다.`);
            else if (blob.size > 5 * 1024 * 1024) warnings.push(`${label} 이미지가 5MB 를 넘어 올리지 않았습니다.`);
            else if (Math.min(dimension.width, dimension.height) < 500 || Math.max(dimension.width, dimension.height) > 5000) {
              warnings.push(`${label} 이미지 크기 ${dimension.width}x${dimension.height} 는 롯데ON 규격(500~5000px)이 아니라 올리지 않았습니다.`);
            } else {
              const extension = /png/i.test(blob.type) ? "png" : "jpg";
              const name = /\.(jpe?g|png)$/i.test(String(images[index].fileName || "")) ? String(images[index].fileName) : `image${index + 1}.${extension}`;
              accepted.push({ blob, name, dimension, label });
            }
          }
          const uploaded = [];
          if (accepted.length > 0) {
            try {
              const ticketResponse = await fetch(`${apiBase}/soapi/v1/product/registration/createProductImagesFileUploadTicket?limitSizePerEach=${5 * 1024 * 1024}&limitFiles=${accepted.length}`, {
                method: "POST",
                headers: headers(),
              });
              const ticket = (await readUploadResult(ticketResponse))?.data?.ticket;
              if (!ticket) throw new Error(`업로드 준비에 실패했습니다(HTTP ${ticketResponse.status})`);
              for (let index = 0; index < accepted.length; index += 1) {
                const entry = accepted[index];
                const body = new FormData();
                body.append("qquuid", `kiditem-${Date.now()}-${index}`);
                body.append("fileName", entry.name);
                body.append("qqtotalfilesize", String(entry.blob.size));
                body.append("file", entry.blob, entry.name);
                const response = await fetch(`${apiBase}/soapi/v1/bocommon/o/fileManage/upload4FineUploader/${ticket}`, {
                  method: "POST",
                  headers: headers(),
                  body,
                });
                const result = await readUploadResult(response);
                if (!result?.success || !result?.meta?.fileId) {
                  warnings.push(`${entry.label} 이미지를 올리지 못했습니다${result?.message ? `: ${tidy(result.message)}` : ` (HTTP ${response.status})`}.`);
                  continue;
                }
                uploaded.push({ meta: result.meta, entry });
              }
            } catch (error) {
              warnings.push(`상품 이미지를 올리지 못했습니다: ${tidy(error?.message || error)}.`);
            }
          }
          if (uploaded.length > 0) {
            const ret = uploaded.map(({ meta, entry }, index) => ({
              fileId: meta.fileId,
              imgSeq: index + 1,
              epsrTypCd: "IMG",
              epsrTypDtlCd: entry.dimension.height > entry.dimension.width ? "IMG_LNTH" : "IMG_SQRE",
              fileSrc: "",
              origFileNm: meta.fileName || entry.name,
              rprtImgYn: index === 0 ? "Y" : "N",
              fileSize: sizeLabel(meta.size || entry.blob.size),
              origImgFileNm: "",
              imgSortSeq: index + 1,
            }));
            optionWin.scwin.tempBlobImageRow = 0;
            optionWin.scwin.popupCallbackInProductReg({
              param: { callbackId: "uploadItemImage", row: 0, trGrpCd: basic.get("trGrpCd"), paramImageList: [] },
              ret,
            });
            // 창 콜백은 대표 사진을 받아 썸네일 칸(검사용)을 채운다. 늦으면 우리가 가진 사진으로 채운다.
            const thumbnail = await waitFor(() => grid.getCellData(0, "imageSrc"), Math.min(8000, stepWait), 250);
            if (!thumbnail) grid.setCellData(0, "imageSrc", images[0].dataUrl);
            const attached = (optionWin.data_itemImageList || pi.data_itemImageList).getMatchedJSON("row", 0).length;
            if (attached === uploaded.length) steps.push(`상품 이미지 ${attached}장`);
            else warnings.push(`상품 이미지 ${uploaded.length}장 중 ${attached}장만 붙었습니다. 판매옵션 이미지를 확인하세요.`);
          }
        } else {
          warnings.push("상품 이미지가 없습니다. 판매옵션 목록의 이미지 [등록] 으로 올리세요.");
        }

        // 13) 저장 전 검사. 화면의 검사 함수만 부른다(저장·확인창 없음). 막히면 화면이 알려 준 첫 문장을 싣는다.
        const saidBeforeValidation = said.length;
        let valid = false;
        try { valid = scwin.product.validation(); } catch { valid = false; }
        const validationMessages = said.splice(saidBeforeValidation);
        if (valid) steps.push("저장 전 필수 칸 확인");
        else warnings.push(`저장 전 확인: ${tidy(validationMessages[0] || "필수 칸이 비었습니다")}`);

        sweepDialogs();
        for (const message of new Set(said)) {
          if (message && !warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }
        window.scrollTo(0, 0);
        return { ok: true, steps, warnings, submitted: false };
      } finally {
        observer.disconnect();
        for (const entry of patched) {
          entry.target.alert = entry.alert;
          entry.target.confirm = entry.confirm;
        }
        window.alert = nativeAlert;
        window.confirm = nativeConfirm;
      }
    })();
  }

  /**
   * 카카오 톡스토어 상품등록 화면(`/product/store-seller/insert`)을 채운다 — 페이지(MAIN 월드)에서 돈다.
   *
   * Angular 운영 빌드라 폼 객체에 닿지 않는다. 사람이 하는 길 그대로 채운다 — 글자는 치고(`input`
   * 이벤트), 목록(`cu-dropdown`)은 펼쳐 고르고, 사진은 파일 칸에 넣는다. 끝나면 Angular 가 칸마다 매긴
   * `ng-invalid` 로 아직 받지 않은 칸을 알린다. [저장하기]·[상품정보 임시저장] 은 누르지 않고, 확인창은 거절한다.
   */
  function fillKakaoProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const form = payload.form;
      const stepWait = payload.stepWaitMs || 12000;
      const nativeAlert = window.alert;
      const nativeConfirm = window.confirm;
      window.alert = (message) => { said.push(String(message)); };
      window.confirm = (message) => { said.push(String(message)); return false; };

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = await probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length > 0);
      // 폼 맨 위 칸만. 같은 이름이 칸 안에 또 있다 — 톡딜 할인 안에도 `stock` 이 있고 그게 먼저 나온다.
      const topControls = () => [...document.querySelectorAll("form [formcontrolname], form [formgroupname], form [formarrayname]")]
        .filter((element) => !element.parentElement.closest("[formcontrolname], [formgroupname], [formarrayname]"));
      const control = (name) => topControls().find((element) => element.getAttribute("formcontrolname") === name) || null;
      const textInputs = (root) => (root
        ? [...root.querySelectorAll("input")].filter((input) => visible(input) && !input.disabled
          && !["checkbox", "radio", "file", "hidden"].includes(String(input.type).toLowerCase()))
        : []);
      const buttonIn = (root, label) => (root
        ? [...root.querySelectorAll("button")].find((button) => visible(button) && clean(button.textContent) === label) || null
        : null);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      // Angular 값 연결은 `input` 이벤트로 받고, 칸을 떠날 때(`blur`) 모양(천 단위 쉼표 등)을 다듬는다.
      const typeInto = (input, value) => {
        input.focus();
        valueSetter.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      };
      const toFile = (image, fallback) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded || "");
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const extension = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const base = String(image.fileName || image.name || fallback).replace(/\.[A-Za-z0-9]+$/, "") || fallback;
        return new File([bytes], `${base}.${extension}`, { type: mime });
      };
      /** 목록(`cu-dropdown`)을 펼쳐 글자가 같은 항목을 누른다. `verify` 면 고른 글자가 그대로 남았는지도 본다. */
      const pick = async (dropdown, label, verify = true) => {
        const option = () => [...(dropdown?.querySelectorAll("li a.link-opt") || [])]
          .find((link) => clean(link.textContent) === label);
        if (!option()) return false;
        dropdown.querySelector("a.link-selected")?.click();
        await sleep(150);
        const link = option();
        if (!link) return false;
        link.click();
        await sleep(300);
        return !verify || clean(dropdown.querySelector("a.link-selected")?.textContent) === label;
      };
      const dropdownWith = (root, label) => [...(root?.querySelectorAll("cu-dropdown") || [])]
        .find((box) => [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === label)) || null;
      // 톡스토어 안내 · 확인 창(`_cu-popup-anim`). 무엇을 묻든 '예' 가 눌리는 일이 없게 취소 · 닫기로만 닫는다.
      const popups = () => [...document.querySelectorAll("div._cu-popup-anim")].filter(visible);
      const sweepPopups = () => {
        for (const popup of popups()) {
          const message = clean(popup.innerText || popup.textContent);
          if (message) said.push(message.slice(0, 200));
          (buttonIn(popup, "취소") || buttonIn(popup, "닫기"))?.click();
        }
      };
      const LABELS = {
        name: "상품명", categoryId: "카테고리", productOriginAreaInfo: "원산지", taxType: "부가세", certs: "인증정보",
        salePrice: "판매가", stock: "재고수량", option: "옵션", productImage: "상품이미지",
        productDetailDescription: "상품상세", announcementInfo: "상품정보고시", delivery: "배송정보",
        brand: "브랜드", manufacturer: "제조사", model: "모델명",
      };

      try {
        // 0) 화면. 로그아웃이면 카카오 계정 로그인 화면으로 넘어간다.
        const ready = await waitFor(() => {
          if (/accounts\.kakao\.com/i.test(location.hostname) || /\/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          return control("name") && control("categoryId") && control("productImage") ? "form" : null;
        }, payload.formWaitMs || 40000, 400);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "카카오 톡스토어 상품등록 화면을 찾지 못했습니다." };
        }
        sweepPopups();

        // 1) 상품명. 화면은 70자에서 자른다. 치면 AI 추천 카테고리를 불러온다.
        const nameInput = await waitFor(() => textInputs(control("name"))[0], stepWait);
        if (!nameInput) return { ok: false, error: "카카오 톡스토어 상품명 칸을 찾지 못했습니다." };
        typeInto(nameInput, form.productName);
        steps.push("상품명");

        // 2) 카테고리. 원산지 · 부가세 · 인증 칸이 이걸 골라야 생긴다.
        const categoryRoot = control("categoryId");
        const levels = () => [...categoryRoot.querySelectorAll("lib-form-cascading-item")];
        const chosen = () => levels()
          .map((item) => clean(item.querySelector("a.link-selected")?.textContent))
          // 고르지 않은 단계는 `세분류`·`세분류 카테고리 없음` 같은 안내 글자를 띄운다.
          .filter((name) => name && !/^(대|중|소|세)분류/.test(name));
        let categoryPath = "";
        if (form.categoryId) {
          // 단계 이름은 카테고리 API 가 안다. 맨 앞 세 자리(식품/유아동 같은 대대분류)는 화면 목록에 없다.
          const names = [];
          for (let end = 6; end <= form.categoryId.length; end += 3) {
            const response = await fetch(`/api/tstore/categories/${form.categoryId.slice(0, end)}`, {
              credentials: "include",
              headers: { accept: "application/json" },
            }).catch(() => null);
            const json = response && response.ok ? await response.json().catch(() => null) : null;
            if (!json || !json.name) {
              names.length = 0;
              break;
            }
            names.push(clean(json.name));
          }
          for (let level = 0; level < names.length; level += 1) {
            const dropdown = await waitFor(() => {
              const item = levels()[level];
              if (!item || item.classList.contains("cascading-item-disabled")) return null;
              const box = item.querySelector("cu-dropdown");
              return box && [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === names[level])
                ? box
                : null;
            }, stepWait);
            if (!dropdown || !(await pick(dropdown, names[level]))) break;
          }
          if (names.length > 0 && chosen().join(">") === names.join(">")) {
            categoryPath = names.join(">");
            steps.push(`카테고리 ${categoryPath}`);
          } else {
            warnings.push(`카테고리 ${form.categoryId} 를 고르지 못해 톡스토어 AI 추천으로 고릅니다.`);
          }
        }
        if (!categoryPath) {
          const choice = await waitFor(
            () => [...document.querySelectorAll(".box_recommcate button.btn_choice")].find(visible),
            stepWait,
            300,
          );
          if (choice) {
            choice.click();
            await waitFor(() => chosen().length > 0, stepWait);
            categoryPath = chosen().join(">");
            if (categoryPath) steps.push(`카테고리(톡스토어 AI 추천) ${categoryPath}`);
          }
        }
        if (!categoryPath) {
          warnings.push("카테고리를 고르지 못했습니다. 카테고리를 고른 뒤 원산지 · 인증을 확인하세요.");
        }

        // 3) 원산지. 구분 → 지역 → 나라 목록이 앞 칸을 고를 때마다 이어진다. 카테고리를 고른 직후에는 화면이
        //    카테고리 정보를 받아 원산지 칸을 다시 그린다 — 그 전에 고르면 되돌아간다(라이브 2026-09-18).
        //    그래서 칸이 선 뒤 잠깐 기다리고, 다 고른 뒤에도 그대로인지 보고 한 번 더 고른다.
        const originPath = [form.origin.type, form.origin.region, form.origin.country].filter(Boolean);
        const originBoxes = () => [...(control("productOriginAreaInfo")?.querySelectorAll("cu-dropdown") || [])].filter(visible);
        const originShown = () => originBoxes().map((box) => clean(box.querySelector("a.link-selected")?.textContent));
        await waitFor(() => originBoxes()[0]?.querySelector("li a.link-opt"), stepWait);
        await sleep(1000);
        let originSet = false;
        for (let attempt = 0; attempt < 2 && !originSet && originPath.length > 0; attempt += 1) {
          let done = 0;
          for (let level = 0; level < originPath.length; level += 1) {
            const dropdown = await waitFor(() => {
              const box = originBoxes()[level];
              return box && [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === originPath[level])
                ? box
                : null;
            }, stepWait);
            if (!dropdown || !(await pick(dropdown, originPath[level]))) break;
            done += 1;
          }
          await sleep(600);
          originSet = done === originPath.length && originShown().slice(0, originPath.length).join(">") === originPath.join(">");
        }
        if (originSet) steps.push(`원산지 ${originPath.join(" > ")}`);
        else warnings.push(`원산지를 '${originPath.join(" > ")}' 로 고르지 못했습니다. 직접 고르세요.`);

        // 4) 인증. 목록에서 고르면 줄(`lib-form-cert-item`)이 생긴다. 번호를 넣고 [인증번호확인] 으로 KC 조회만 돌린다.
        if (form.cert) {
          const certRoot = () => control("certs");
          const rows = () => [...(certRoot()?.querySelectorAll("lib-form-cert-item") || [])];
          const before = rows().length;
          const dropdown = await waitFor(() => dropdownWith(certRoot(), form.cert.type), stepWait);
          const added = dropdown && (await pick(dropdown, form.cert.type, false))
            ? await waitFor(() => (rows().length > before ? rows()[rows().length - 1] : null), stepWait)
            : null;
          const numberInput = added ? textInputs(added)[0] : null;
          if (!numberInput) {
            warnings.push(`인증 '${form.cert.type}' 줄을 만들지 못했습니다. 인증번호 ${form.cert.number} 를 직접 넣으세요.`);
          } else {
            typeInto(numberInput, form.cert.number);
            const lookup = buttonIn(added, "인증번호확인");
            if (!lookup) {
              warnings.push(`인증번호 ${form.cert.number} 를 넣었습니다. [인증번호확인] 을 눌러 주세요.`);
            } else {
              const saidBefore = said.length;
              lookup.click();
              const answer = await waitFor(() => {
                const model = textInputs(added).find((input) => input !== numberInput && clean(input.value));
                if (model) return { model: clean(model.value) };
                const popup = popups()[0];
                if (popup) return { message: clean(popup.innerText || popup.textContent).slice(0, 200) };
                return said.length > saidBefore ? { message: said[said.length - 1] } : null;
              }, stepWait, 300);
              if (answer?.model) steps.push(`KC 인증 ${form.cert.number} 확인(모델명 ${answer.model})`);
              else {
                warnings.push(`KC 인증번호 ${form.cert.number} 조회 결과를 받지 못했습니다${answer?.message ? `: ${answer.message}` : ""}. 인증정보를 확인하세요.`);
                sweepPopups();
              }
            }
          }
        }

        // 5) 판매가 · 재고.
        const priceInput = textInputs(control("salePrice"))[0];
        if (priceInput) {
          typeInto(priceInput, String(form.salePrice));
          steps.push(`판매가 ${form.salePrice}원`);
        } else {
          warnings.push("판매가 칸을 찾지 못했습니다.");
        }
        const stockInput = textInputs(control("stock"))[0];
        if (stockInput) {
          typeInto(stockInput, String(form.stock));
          steps.push(`재고 ${form.stock}`);
        } else {
          warnings.push("재고수량 칸을 찾지 못했습니다.");
        }

        // 6) 상품이미지. 사람이 고르는 파일 칸에 넣으면 화면이 `/api/tstore/images` 로 올리고 썸네일을 그린다.
        //    첫 칸(`box_img_register`)이 대표, 끌어 옮기는 다섯 칸이 추가이미지다.
        const imageRoot = control("productImage");
        const images = (payload.images || []).slice(0, payload.maxImages || 6);
        const hasImage = (card) => [...card.querySelectorAll("img")].some((img) => img.getAttribute("src"));
        const putImage = async (card, image, index) => {
          const input = card?.querySelector('input[type="file"]');
          if (!input) return false;
          const transfer = new DataTransfer();
          transfer.items.add(toFile(image, `kakao${index}`));
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return Boolean(await waitFor(() => hasImage(card), stepWait, 300));
        };
        if (images.length === 0) {
          warnings.push("상품이미지가 없습니다. 대표이미지를 직접 넣으세요.");
        } else {
          let placed = 0;
          if (await putImage(imageRoot?.querySelector(".box_img_register"), images[0], 0)) placed += 1;
          else warnings.push("대표이미지를 올리지 못했습니다. 상품이미지 첫 칸에 직접 넣으세요.");
          for (let index = 1; index < images.length; index += 1) {
            const card = [...(imageRoot?.querySelectorAll(".cdk-drop-list .card-register") || [])]
              .find((candidate) => !hasImage(candidate));
            if (!card) {
              warnings.push(`추가이미지 칸이 모자라 ${images.length - index}장은 넣지 못했습니다.`);
              break;
            }
            if (await putImage(card, images[index], index)) placed += 1;
            else warnings.push(`추가이미지 ${index}번째를 올리지 못했습니다.`);
          }
          if (placed > 0) steps.push(`상품이미지 ${placed}장`);
        }

        // 7) 상세설명. 편집기(CKEditor 4)가 사진을 넣을 때 쓰는 업로드(`type=EDITOR`)로 올려 그 주소로 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const body = new FormData();
            body.append("type", "EDITOR");
            body.append("ratio", "NONE");
            body.append("image[]", toFile(payload.detailImage, "detail"));
            const response = await fetch("/api/tstore/images", {
              method: "POST",
              body,
              credentials: "include",
              headers: { accept: "application/json" },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            const entry = Array.isArray(result) ? result[0] : result;
            const hosted = String(entry?.data?.originUrl || "").trim();
            if (entry?.result !== "SUCCESS" || !/^https:\/\/[^/]*kakaocdn\.net\//.test(hosted)) {
              throw new Error("응답에 이미지 주소가 없습니다");
            }
            detailHtml = `<center><img src="${hosted}"></center>`;
            steps.push("상세이미지 톡스토어 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 톡스토어에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        const editor = window.CKEDITOR?.instances?.editor1 || Object.values(window.CKEDITOR?.instances || {})[0];
        if (detailHtml && editor) {
          await new Promise((resolve) => {
            setTimeout(resolve, stepWait);
            try {
              editor.setData(detailHtml, { callback: resolve });
            } catch {
              resolve();
            }
          });
          editor.fire("change");
          const accepted = await waitFor(
            () => !control("productDetailDescription")?.classList.contains("ng-invalid"),
            Math.min(3000, stepWait),
          );
          if (accepted) steps.push("상세설명");
          else warnings.push("상세설명을 넣었지만 화면이 받지 않았습니다. 상품상세 칸을 확인하세요.");
        } else {
          warnings.push("상세설명에 넣을 이미지가 없습니다. 상품상세에 직접 넣으세요.");
        }

        // 8) 상품정보고시. 설정 창에서 상품군을 고르고, 칸마다 값을 치거나 `상품상세설명 참조` 를 체크한 뒤
        //    그 창의 [확인] 으로 폼에 넣는다 — 창 안에서만 쓰는 적용 단추다. 상품 [저장하기] 가 아니다.
        const noticeOpen = buttonIn(control("announcementInfo"), "상품정보고시 설정");
        const layer = noticeOpen
          ? (noticeOpen.click(), await waitFor(() => popups().find((popup) => /상품정보고시 설정/.test(popup.textContent || "")), stepWait))
          : null;
        if (!layer) {
          warnings.push("상품정보고시 설정 창을 열지 못했습니다. 직접 넣으세요.");
        } else {
          // 첫 목록은 판매자 템플릿, 상품군 이름이 그대로 있는 목록이 상품군이다.
          const group = await waitFor(() => dropdownWith(layer, form.notice.group), stepWait);
          const noticeRows = () => [...layer.querySelectorAll(".field-row")].filter(visible);
          if (!group || !(await pick(group, form.notice.group))) {
            warnings.push(`상품정보고시 상품군 '${form.notice.group}' 을 고르지 못했습니다. 직접 넣으세요.`);
            buttonIn(layer, "취소")?.click();
          } else {
            await waitFor(() => noticeRows().some((row) => row.querySelector("cu-textbox input, textarea")), stepWait);
            const keys = Object.keys(form.notice.values);
            let typed = 0;
            let referred = 0;
            for (const row of noticeRows()) {
              const label = clean(row.querySelector("strong.tit-field")?.childNodes[0]?.textContent);
              const input = row.querySelector("cu-textbox input, textarea");
              const refer = row.querySelector('cu-checkbox input[type="checkbox"]');
              if (!label || !input || !refer) continue;
              const key = keys.find((candidate) => label.startsWith(candidate));
              const value = key ? form.notice.values[key] : "";
              if (value) {
                if (refer.checked) {
                  refer.click();
                  await sleep(120);
                }
                typeInto(input, value);
                typed += 1;
              } else {
                if (!refer.checked) {
                  refer.click();
                  await sleep(120);
                }
                referred += 1;
              }
            }
            buttonIn(layer, "확인")?.click();
            const closed = await waitFor(() => !visible(layer), stepWait);
            if (closed) {
              steps.push(`상품정보고시 ${form.notice.group} (값 ${typed} · 상품상세설명 참조 ${referred})`);
            } else {
              const errors = [...new Set([...layer.querySelectorAll("*")]
                .filter((element) => visible(element) && !element.children.length && /입력해주세요|선택해주세요/.test(element.textContent))
                .map((element) => clean(element.textContent)))];
              warnings.push(`상품정보고시 창이 닫히지 않았습니다${errors.length ? `: ${errors.slice(0, 3).join(" / ")}` : ""}. 창에서 확인하세요.`);
            }
          }
        }

        // 9) 배송. 판매자 배송비 템플릿을 고르면 조건부 무료 · A/S 안내문구 · 도서산간 비용이 따라온다.
        if (form.deliveryTemplate) {
          const box = await waitFor(() => dropdownWith(control("delivery"), form.deliveryTemplate), Math.min(5000, stepWait));
          if (box && (await pick(box, form.deliveryTemplate))) steps.push(`배송비 템플릿 ${form.deliveryTemplate}`);
          else warnings.push(`배송비 템플릿 '${form.deliveryTemplate}' 을 찾지 못했습니다. 배송비를 확인하세요.`);
        }

        // 10) 브랜드 · 제조사 · 판매자 상품코드. 글자만 치면 받는다(검색 창을 열지 않는다).
        for (const [name, value, label] of [
          ["brand", form.brand, "브랜드"],
          ["manufacturer", form.manufacturer, "제조사"],
          ["storeManagementCode", form.sellerCode, "판매자 상품코드"],
        ]) {
          if (!value) continue;
          const input = textInputs(control(name))[0];
          if (input) {
            typeInto(input, value);
            steps.push(`${label} ${value}`);
          } else {
            warnings.push(`${label} 칸을 찾지 못했습니다.`);
          }
        }

        // 11) 추천 리워드. 화면 기본은 켜짐이고 기존 등록물은 끈다.
        const reward = [...(control("affiliate")?.querySelectorAll('input[type="checkbox"]') || [])].find(visible);
        if (reward && reward.checked !== form.affiliate) {
          reward.click();
          await sleep(200);
        }
        if (reward && reward.checked === form.affiliate) steps.push(form.affiliate ? "추천 리워드 켬" : "추천 리워드 끔");

        // 12) 화면이 아직 받지 않은 칸을 알린다(Angular 가 칸마다 매기는 상태). 저장은 사람이 누른다.
        await sleep(300);
        sweepPopups();
        const pending = [...new Set(topControls()
          .filter((element) => element.classList.contains("ng-invalid"))
          .map((element) => {
            const name = element.getAttribute("formcontrolname") || element.getAttribute("formgroupname")
              || element.getAttribute("formarrayname");
            return LABELS[name] || name;
          }))];
        if (pending.length > 0) warnings.push(`아직 화면이 받지 않은 칸: ${pending.join(", ")}`);
        else steps.push("필수 칸 확인");
        for (const message of new Set(said)) {
          if (message && !warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }
        window.scrollTo(0, 0);
        return { ok: true, steps, warnings, submitted: false };
      } finally {
        window.alert = nativeAlert;
        window.confirm = nativeConfirm;
      }
    })();
  }

  function create({ chrome: chromeApi, fetch: fetchApi, interactiveTabs, tabReason, ensureLogin }) {
    /**
     * 탭이 실제로 다 뜰 때까지 기다린다.
     *
     * `chrome.tabs.create` 가 돌려주는 순간의 탭은 아직 로딩 중이다. 이때 주입하면
     * 프레임이 갈려나가거나 폼이 없다. 몰 관리자는 로그인 리다이렉트가 흔해서
     * 고정 대기로는 못 맞춘다.
     */
    function waitForTabComplete(tabId, timeoutMs = 45000) {
      // 이 API 를 못 쓰는 실행 환경(테스트 더블 등)에서는 기다리지 않는다. 기다림은
      // 안정성 보강이지 동작의 전제가 아니다 — 없다고 등록을 못 하게 만들지 않는다.
      if (!chromeApi.tabs?.onUpdated?.addListener) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        let done = false;
        const finish = (value, error) => {
          if (done) return;
          done = true;
          chromeApi.tabs.onUpdated.removeListener(onUpdated);
          chromeApi.tabs.onRemoved?.removeListener?.(onRemoved);
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            finish(updatedTab || {});
          }
        };
        const onRemoved = (removedTabId) => {
          if (removedTabId === tabId) finish(null, new Error("상품등록 탭이 닫혔습니다."));
        };
        const timer = setTimeout(
          () => finish(null, new Error("상품등록 화면이 열리지 않았습니다.")),
          timeoutMs,
        );
        chromeApi.tabs.onUpdated.addListener(onUpdated);
        chromeApi.tabs.onRemoved?.addListener?.(onRemoved);
        // 이미 다 뜬 뒤에 붙었을 수 있다. 그 경우 이벤트는 다시 오지 않는다.
        chromeApi.tabs.get?.(tabId, (current) => {
          if (chromeApi.runtime?.lastError) {
            finish(null, new Error(chromeApi.runtime.lastError.message));
            return;
          }
          if (current?.status === "complete") finish(current);
        });
      });
    }

    /**
     * 주입 한 번은 실패할 수 있다.
     *
     * 몰이 로딩 끝난 뒤에도 한 번 더 이동하면(로그인 확인, 프레임 교체) 그 순간의
     * 주입이 `Frame ... was removed` 로 거절된다. 그건 몰의 잘못도 우리 잘못도
     * 아니고 타이밍이라, 다시 뜰 때까지 기다렸다가 한 번만 더 시도한다.
     */
    /** 여러 프레임의 응답 중 쓸 것 하나를 고른다. */
    function pickOutcome(injected) {
      const results = (injected || []).map((entry) => entry?.result).filter(Boolean);
      return results.find((entry) => entry.ok === true)
        || results.find((entry) => !entry.noForm)
        || results[0]
        || { ok: false, error: "폼 채움 결과를 받지 못했습니다." };
    }

    async function injectWithRetry(options) {
      try {
        return await chromeApi.scripting.executeScript(options);
      } catch (error) {
        const message = String(error?.message || error);
        if (!/frame .*(was removed|not found)|no frame with id/i.test(message)) throw error;
        await waitForTabComplete(options.target.tabId).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return chromeApi.scripting.executeScript(options);
      }
    }

    /** 이미지를 서비스워커가 받아 data URL 로 바꾼다. 페이지에서 우리 저장소를 fetch 하면 CORS 로 막힌다. */
    async function toDataUrls(uploads) {
      const images = [];
      for (const upload of uploads) {
        try {
          const response = await fetchApi(upload.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (blob.size > MAX_IMAGE_BYTES) throw new Error("이미지가 8MB 를 넘습니다.");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error("이미지를 읽지 못했습니다."));
            reader.readAsDataURL(blob);
          });
          const fileName = (new URL(upload.url).pathname.split("/").pop() || "image") + "";
          images.push({ name: upload.name, dataUrl, fileName });
        } catch (error) {
          // 어느 주소에서 막혔는지 남긴다. 'Failed to fetch' 만으로는 권한 문제인지 알 수 없다.
          let host = "";
          try { host = new URL(upload.url).host; } catch { /* 주소가 아니면 비워 둔다 */ }
          const message = error?.message || String(error);
          images.push({ name: upload.name, error: host ? `${message} (${host})` : message });
        }
      }
      return images;
    }

    /**
     * 상세 이미지를 우리 상점 첨부 저장소에 올려 공개 주소를 받는다.
     *
     * 창을 열지 않는다. 예전엔 업로더가 iframe 이라 페이지를 띄워야 하는 줄 알았지만,
     * 그 폼이 쏘는 곳은 평범한 멀티파트 엔드포인트였다(라이브 확인 2026-09-10).
     * 도매꾹을 눌렀는데 다른 몰 창이 뜨는 일이 없어진다.
     */
    async function hostDetailImage(host, sourceUrl) {
      const decode = (buffer) => new TextDecoder("euc-kr").decode(buffer);

      const source0 = await fetchApi(sourceUrl);
      if (!source0.ok) throw new Error(`상세 이미지를 읽지 못했습니다 — HTTP ${source0.status}`);
      const blob0 = await source0.blob();
      if (blob0.size > MAX_IMAGE_BYTES) throw new Error("상세 이미지가 8MB 를 넘습니다.");

      // 응답이 곧 주소인 업로더(온채널). 상품번호도 목록 읽기도 필요 없다.
      if (host.uploadField) {
        const body = new FormData();
        body.append(host.uploadField, blob0, detailFileName(sourceUrl, blob0.type));
        const response = await fetchApi(host.origin + host.uploadPath, {
          method: "POST",
          body,
          credentials: "include",
        });
        if (!response.ok) throw new Error(`업로드 응답 HTTP ${response.status}`);
        const url = decode(await response.arrayBuffer()).trim();
        if (!/^https?:\/\//.test(url)) throw new Error("업로드 결과가 주소가 아닙니다.");
        return url;
      }
      const read = async (path) => {
        const response = await fetchApi(host.origin + path, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return decode(await response.arrayBuffer());
      };

      // 1) 빈 상품번호를 받는다. 상품을 만들지는 않는다 — 첨부를 걸 자리만 필요하다.
      const page = await read(host.registerPath);
      const pno = (page.match(/name=["']?pno["']?[^>]*value=["']?(\d+)/i) || [])[1];
      if (!pno) {
        // 번호가 없는 건 거의 언제나 로그인 화면이 온 것이다.
        const error = new Error("상품번호를 받지 못했습니다.");
        error.needsLogin = true;
        throw error;
      }

      // 2) 우리가 렌더한 이미지를 그대로 올린다.
      const blob = blob0;

      const body = new FormData();
      body.append("body", "product@product_file.exe");
      body.append("pno", pno);
      body.append("upload_one", "Y");
      body.append("filetype", host.filetype);
      body.append("ino", "");
      body.append("upfile", blob, detailFileName(sourceUrl, blob.type));
      const upload = await fetchApi(host.origin + host.uploadPath, {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!upload.ok) throw new Error(`업로드 응답 HTTP ${upload.status}`);
      await upload.arrayBuffer();

      // 3) 주소는 응답이 아니라 첨부 목록에 생긴다. 목록을 읽어 집는다.
      const list = await read(`${host.listPath}&pno=${pno}`);
      const found = list.match(HOSTED_URL);
      if (!found || found.length === 0) throw new Error("올라간 주소를 찾지 못했습니다.");
      return found[found.length - 1];
    }

    /**
     * '상품상세내용 작성하기' 를 눌러 팝업 에디터로 상세설명을 넣는다.
     *
     * 사람이 하는 순서 그대로다: 버튼 → 팝업 → 내용 → 등록. 칸에 몰래 써넣지
     * 않는 이유는 버튼 상태가 안 따라오기 때문이다. 에디터를 거치면 라벨과
     * `data-mode` 를 페이지가 스스로 바꾼다.
     */
    /**
     * '상품상세내용 작성하기' 를 눌러 상세설명을 넣는다.
     *
     * 등록화면 한 곳에만 주입한다. 팝업은 그 화면이 직접 잡으므로 우리가 창을
     * 찾아다닐 일이 없다.
     */
    async function writeDetailThroughEditor(tabId, editor, formSelector, target, html, promoHtml) {
      const [result] = await chromeApi.scripting.executeScript({
        target: { tabId },
        // MAIN 월드여야 한다. 격리 월드에서는 페이지의 `window.open` 을 갈아끼울 수 없다.
        world: "MAIN",
        func: driveDetailEditor,
        args: [{
          html,
          formSelector,
          target,
          buttonId: editor.buttonId,
          editorKey: editor.editorKey,
          toggleSelector: editor.toggleSelector,
          framePrefix: editor.framePrefix,
          frameSuffix: editor.frameSuffix,
          submitId: editor.submitId,
          promoKey: editor.promoKey || "",
          promoHtml,
          openTimeoutMs: editor.openTimeoutMs,
          submitTimeoutMs: editor.submitTimeoutMs,
        }],
      });

      const outcome = result?.result;
      if (!outcome?.ok) throw new Error(outcome?.error || "상세내용을 넣지 못했습니다.");
      if (!outcome.filled) {
        const said = (outcome.alerts || []).join(" / ");
        throw new Error(said || "에디터가 등록을 받지 않았습니다.");
      }
      return outcome;
    }

    /**
     * 몰의 분류 목록 한 단.
     *
     * 읽기만 한다. 폼을 열지도, 값을 넣지도 않는다 — 사람이 고르는 동안 화면이
     * 물어보는 용도다.
     */
    async function listCategories(message) {
      const spec = specFor(message?.mall);
      const source = spec.categorySource;
      if (!source) throw new Error(`${spec.label} 은 분류 목록을 제공하지 않습니다.`);

      const path = Array.isArray(message?.path) ? message.path.map((part) => String(part)) : [];
      if (path.length >= source.levels) return { mall: message.mall, path, names: [] };

      const query = new URLSearchParams({ ...source.fixed });
      query.set(source.depthParam, String(path.length));
      path.forEach((value, index) => {
        const name = source.levelParams[index];
        if (name) query.set(name, value);
      });

      const response = await fetchApi(`${spec.origin}${source.path}?${query.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`분류 목록 HTTP ${response.status}`);
      const body = await response.json();
      const rows = Array.isArray(body?.[source.itemsKey]) ? body[source.itemsKey] : [];
      const names = rows
        .map((row) => String(row?.[source.nameKey] ?? "").trim())
        .filter(Boolean);
      return { success: true, ok: true, mall: message.mall, path, names };
    }

    async function register(message) {
      const spec = specFor(message?.mall);
      const form = normalizeForm(spec, message?.form);

      const uploaded = await toDataUrls(form.fileUploads);
      const images = uploaded.filter((image) => image.dataUrl);
      const imageWarnings = uploaded
        .filter((image) => image.error)
        .map((image) => `이미지 ${image.name}: ${image.error}`);

      // 상세설명은 몰이 읽을 수 있는 주소여야 한다. 우리 렌더 산출물은 로컬
      // MinIO(`localhost:9000`)라 그대로 넣으면 구매자에게 빈 상세페이지가 보인다.
      // 이미 읽을 수 있는 주소면 그대로 쓰고, 아니면 호스팅에 먼저 올린다.
      const detailWarnings = [];
      const host = DETAIL_HOSTS[spec.detailHost] || null;
      let detailUrl = form.detailUploads.find((entry) => isMallReadable(entry.url))?.url || "";
      if (!detailUrl && form.detailUploads.length > 0 && host) {
        try {
          detailUrl = await hostDetailImage(host, form.detailUploads[0].url);
        } catch (error) {
          detailWarnings.push(
            error?.needsLogin && host.loginLabel
              ? `상세 이미지를 올리지 못했습니다 — ${host.loginLabel}에 로그인되어 있지 않습니다. `
                + `${host.loginLabel}에 로그인한 뒤 다시 채우세요.`
              : `${host.label}에 상세설명을 올리지 못했습니다: ${error?.message || error}. 화면에서 직접 올리세요.`,
          );
        }
      } else if (!detailUrl && form.detailUploads.length > 0 && !spec.detailSelfUpload) {
        detailWarnings.push("상세설명 이미지가 몰이 읽을 수 있는 주소가 아닙니다. 화면에서 직접 올리세요.");
      }
      const detailHtml = detailUrl ? detailImageHtml(detailUrl, Boolean(spec.detailParagraph)) : "";

      /**
       * 몰이 자기 서버에 받아 주는 경우는 주소를 만들 필요가 없다.
       *
       * 아트공구(Cafe24)가 그렇다 — 대표이미지는 파일 칸에, 상세설명은 편집기의
       * 파일매니저에 올리면 몰이 자기 주소를 준다. 남의 호스팅을 거치면 핫링크
       * 차단에 걸려 구매자에게 깨진 이미지가 보인다(라이브 실측 2026-09-10).
       *
       * 서비스워커는 우리 이미지를 읽어 data URL 로 건네주기만 한다 — 화면에서
       * `localhost:9000` 을 부르면 CORS 로 막힌다.
       */
      const selfUploadWarnings = [];
      let repImage = null;
      let detailImage = null;
      /**
       * 파일 칸이 여럿인 몰(올웨이즈)에 넣을 이미지들.
       *
       * 화면에서 우리 저장소를 부르면 CORS 로 막히므로 서비스워커가 읽어 data URL
       * 로 건네준다. 못 읽은 것은 넣지 않고 이유를 남긴다 — 빠진 채로 "채웠다"고
       * 하지 않는다.
       */
      const imageGroups = {};
      // 파일 칸에 넣는 몰(올웨이즈)과 몰 서버에 올리는 몰(티처몰)이 같은 통로를 쓴다.
      const imageSlotSpecs = [
        ...(spec.imageFileInputs || []),
        ...(spec.imageDialogs || []),
        // 칸을 늘려 가며 넣는 몰(아이스크림몰 추가 이미지). 여기 없으면 이미지를
        // 내려받지 않아 칸만 생기고 빈 채로 남는다.
        ...(spec.imageRepeat
          ? [{ key: spec.imageRepeat.groupKey, label: spec.imageRepeat.label }]
          : []),
        ...(spec.imageUpload
          ? [{ key: spec.imageUpload.groupKey, label: spec.imageUpload.label }]
          : []),
        // 칸 하나에 여러 장을 한 번에 넣는 몰(ESM Plus). 여기 없으면 내려받지 않아
        // 칸이 빈 채로 남는다.
        ...(spec.sectionImages
          ? [{ key: spec.sectionImages.groupKey, label: spec.sectionImages.label }]
          : []),
        // 표의 줄 제목으로 찾는 이미지 칸(떠리몰). 여기 없으면 내려받지 않는다.
        ...((spec.tableForm && spec.tableForm.images) || [])
          .map((slot) => ({ key: slot.key, label: slot.row })),
        // 전용 페이지 함수가 칸마다 올리는 몰(신세계·스마트스토어). 여기 없으면 내려받지 않는다.
        ...(spec.ssgForm ? [{ key: spec.ssgForm.imageGroupKey, label: "상품이미지" }] : []),
        ...(spec.smartstoreForm ? [{ key: spec.smartstoreForm.imageGroupKey, label: "상품이미지" }] : []),
        ...(spec.gsshopForm ? [{ key: spec.gsshopForm.imageGroupKey, label: "상품이미지" }] : []),
        ...(spec.lotteonForm ? [{ key: spec.lotteonForm.imageGroupKey, label: "상품이미지" }] : []),
        ...(spec.kakaoForm ? [{ key: spec.kakaoForm.imageGroupKey, label: "상품이미지" }] : []),
      ];
      for (const slot of imageSlotSpecs) {
        const urls = form.imageGroups[slot.key] || [];
        if (urls.length === 0) continue;
        const loaded = await toDataUrls(urls.map((url, i) => ({ name: `${slot.key}${i}`, url })));
        const ok = loaded.filter((image) => image.dataUrl);
        for (const bad of loaded.filter((image) => image.error)) {
          selfUploadWarnings.push(`${slot.label} 이미지를 읽지 못했습니다: ${bad.error}`);
        }
        if (ok.length > 0) imageGroups[slot.key] = ok;
      }
      if (spec.imageFileInput && form.imageUrls[0]) {
        const [image] = await toDataUrls([{ name: "rep", url: form.imageUrls[0] }]);
        if (image?.dataUrl) repImage = image;
        else selfUploadWarnings.push(`대표이미지를 읽지 못했습니다: ${image?.error || "알 수 없음"}`);
      }
      if (spec.detailSelfUpload && form.detailUploads[0]) {
        const [image] = await toDataUrls([{ name: "detail", url: form.detailUploads[0].url }]);
        if (image?.dataUrl) detailImage = image;
        else selfUploadWarnings.push(`상세설명 이미지를 읽지 못했습니다: ${image?.error || "알 수 없음"}`);
      }

      const loginWarnings = [];
      const tab = await interactiveTabs.createTab({ url: form.url, reason: tabReason });
      // 고정 시간을 자고 주입하면 안 된다. 로그인 리다이렉트나 프레임 교체가 그 사이에
      // 일어나면 Chrome 이 `Frame with ID 0 was removed` 로 주입을 거절하고, 아직
      // 폼이 안 그려졌으면 결과가 비어 `폼 채움 결과를 받지 못했습니다` 가 된다.
      // 실제로 '한번에 등록하기' 로 몰 일곱을 연달아 열자 도매꾹·아트공구가 이렇게 깨졌다
      // (라이브 2026-09-10) — 탭을 빨리 여러 개 만들수록 로딩이 느려져서다.
      const waited = await waitForTabComplete(tab.id).catch(() => undefined);
      // 로딩이 끝나도 SPA 는 한 박자 뒤에 폼을 그린다. 기다림을 못 쓴 환경이라면
      // 예전만큼(2.5초) 자 준다.
      await new Promise((resolve) => setTimeout(resolve, waited ? 1200 : 2500));

      // 폼이 다른 도메인 iframe 에 있는 몰(떠리몰)은 그 프레임이 붙고 **가라앉을 때까지**
      // 기다린다.
      //  - 겉 로딩이 끝난 뒤에 SPA 가 iframe 을 붙인다 — 그 전에 넣으면 겉에만 들어가서
      //    `상품등록 화면을 찾지 못했습니다` 로 끝난다.
      //  - 붙은 뒤에도 한 번 더 다시 붙는다(라이브 실측 2026-09-11: 6.9초에 붙고 10.7초에 다시).
      //    채우는 도중에 문서가 새로 뜨면 채운 것이 통째로 날아간다(라이브 시험에서 한 번 겪음).
      //    그래서 칸이 그려진 **같은 문서**가 2초 동안 그대로일 때 넣는다.
      const waitForFormFrame = async () => {
        if (!spec.frameUrlIncludes) return;
        const until = Date.now() + (spec.frameWaitMs || 30000);
        let lastDoc = null;
        let steady = 0;
        while (Date.now() < until && steady < 2) {
          const frames = await chromeApi.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (ready) => ({
              href: location.href,
              doc: performance.timeOrigin,
              ready: !ready || Boolean(document.querySelector(ready)),
            }),
            args: [spec.readySelector || ""],
          }).catch(() => []);
          const hit = (frames || []).map((entry) => entry?.result)
            .find((entry) => entry && String(entry.href || "").includes(spec.frameUrlIncludes));
          steady = hit && hit.ready && hit.doc === lastDoc ? steady + 1 : 0;
          lastDoc = hit ? hit.doc : null;
          if (steady < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };
      await waitForFormFrame();

      // 팝업 에디터가 있는 몰은 칸에 직접 쓰지 않는다. 폼을 채운 뒤 버튼을 눌러서 넣는다.
      const editor = spec.detailEditor || null;
      // 공용 채움 함수로 못 다루는 화면(신세계·스마트스토어)은 전용 함수에 값 묶음만 넘긴다.
      const dedicatedFill = spec.ssgForm ? {
        func: fillSsgProductForm,
        payload: {
          form: form.ssg,
          images: imageGroups[spec.ssgForm.imageGroupKey] || [],
          maxImages: spec.ssgForm.maxImages,
          displayStartDelayHours: spec.ssgForm.displayStartDelayHours,
          formWaitMs: spec.ssgForm.formWaitMs,
          stepWaitMs: spec.ssgForm.stepWaitMs,
          detailUpload: spec.ssgForm.detailUpload,
          detailImage,
          detailHtml,
        },
      } : spec.smartstoreForm ? {
        func: fillSmartstoreProductForm,
        payload: {
          form: form.smartstore,
          images: imageGroups[spec.smartstoreForm.imageGroupKey] || [],
          maxExtraImages: spec.smartstoreForm.maxExtraImages,
          formWaitMs: spec.smartstoreForm.formWaitMs,
          stepWaitMs: spec.smartstoreForm.stepWaitMs,
          imageWaitMs: spec.smartstoreForm.imageWaitMs,
          detailImage,
          detailHtml,
        },
      } : spec.gsshopForm ? {
        func: fillGsshopProductForm,
        payload: {
          form: form.gsshop,
          images: imageGroups[spec.gsshopForm.imageGroupKey] || [],
          maxImages: spec.gsshopForm.maxImages,
          formWaitMs: spec.gsshopForm.formWaitMs,
          stepWaitMs: spec.gsshopForm.stepWaitMs,
          detailImage,
          detailHtml,
        },
      } : spec.lotteonForm ? {
        func: fillLotteonProductForm,
        payload: {
          form: form.lotteon,
          images: imageGroups[spec.lotteonForm.imageGroupKey] || [],
          maxImages: spec.lotteonForm.maxImages,
          formWaitMs: spec.lotteonForm.formWaitMs,
          stepWaitMs: spec.lotteonForm.stepWaitMs,
          detailImage,
          detailHtml,
        },
      } : spec.kakaoForm ? {
        func: fillKakaoProductForm,
        payload: {
          form: form.kakao,
          images: imageGroups[spec.kakaoForm.imageGroupKey] || [],
          maxImages: spec.kakaoForm.maxImages,
          formWaitMs: spec.kakaoForm.formWaitMs,
          stepWaitMs: spec.kakaoForm.stepWaitMs,
          detailImage,
          detailHtml,
        },
      } : null;
      const injectOptions = dedicatedFill ? {
        target: { tabId: tab.id },
        world: "MAIN",
        func: dedicatedFill.func,
        args: [dedicatedFill.payload],
      } : {
        // 폼이 iframe 안에 있는 몰(11번가)은 모든 프레임에 넣고, 폼을 찾은 프레임의
        // 결과만 쓴다. 프레임 번호를 미리 알 길이 없어서 이게 가장 단순하다.
        target: spec.allFrames ? { tabId: tab.id, allFrames: true } : { tabId: tab.id },
        // 몰 대화상자를 삼키려면 페이지가 우리 `alert` 을 봐야 한다.
        world: "MAIN",
        func: fillMallProductForm,
        args: [{
          formSelector: spec.formSelector,
          dynamic: spec.dynamic,
          acceptRecommendation: spec.acceptRecommendation || null,
          groupInputs: spec.groupInputs || [],
          groups: form.groups,
          selectorChecks: spec.selectorChecks || [],
          selectorCheckValues: form.selectorChecks,
          selectorFields: spec.selectorFields || [],
          selectorFieldValues: form.selectorFields,
          selectFirstOptions: spec.selectFirstOptions || [],
          wizardSteps: spec.wizardSteps || [],
          detailRich: spec.detailRich || null,
          categoryPicker: spec.categoryPicker || null,
          categoryPaths: form.categoryPaths,
          imageFileInput: spec.imageFileInput || null,
          repImage,
          detailSelfUpload: spec.detailSelfUpload || null,
          detailImage,
          categorySearch: spec.categorySearch || null,
          categoryFirst: Boolean(spec.categoryFirst),
          categoryConnect: spec.categoryConnect || null,
          rowFields: spec.rowFields || [],
          rowFieldValues: form.rowFields,
          rowOptions: spec.rowOptions || [],
          rowOptionValues: form.rowOptions,
          detailSelector: spec.detailSelector || "",
          detailPreviewSelector: spec.detailPreviewSelector || "",
          imageFileInputs: spec.imageFileInputs || [],
          imageRepeat: spec.imageRepeat || null,
          imageDialogs: spec.imageDialogs || [],
          imageUpload: spec.imageUpload || null,
          imageGroups,
          fields: form.fields,
          radios: form.radios,
          checks: form.checks,
          images,
          detailHtmlTarget: editor ? "" : form.detailHtmlTarget,
          detailHtml: editor ? "" : detailHtml,
          // 폼이 섹션마다 있는 몰(아이스크림몰).
          multiFormFields: form.multiFormFields || {},
          multiFormRadios: form.multiFormRadios || {},
          multiFormChecks: form.multiFormChecks || {},
          categoryFields: spec.categoryFields || null,
          categoryCode: form.category?.code || "",
          categoryPath: form.category?.path || "",
          noticeSection: spec.noticeSection || null,
          noticeItemCode: form.notice?.itemCode || "",
          noticeSafeYn: form.notice?.safeYn || "N",
          noticeRows: form.notice?.rows || [],
          noticeRadios: form.notice?.radios || {},
          detailSmartEditor: spec.detailSmartEditor || null,
          // 섹션 제목이 유일한 손잡이인 몰(ESM Plus). 스펙 네 조각을 한 덩어리로 묶어
          // 넘긴다 — 주입 함수는 클로저를 못 써서 필요한 것을 전부 인자로 받아야 한다.
          sectionLayout: spec.sectionForm
            ? {
              ...spec.sectionForm,
              category: spec.sectionCategory || null,
              detail: spec.sectionDetail || null,
              images: spec.sectionImages || null,
            }
            : null,
          sectionFields: form.sectionFields || {},
          sectionRadios: form.sectionRadios || {},
          sectionDropdowns: form.sectionDropdowns || {},
          sectionCategory: form.sectionCategory || null,
          optionalSections: form.optionalSections || [],
          dismissDialogs: spec.dismissDialogs || null,
          // 느리게 그려지는 SPA 를 페이지 안에서 기다린다.
          formWaitMs: spec.formWaitMs || 0,
          readySelector: spec.readySelector || "",
          // 칸을 여는 라디오(꼬망세 KC)와, 다 고른 뒤 눌러야 반영되는 버튼(분류 추가).
          preRadios: spec.preRadios || [],
          afterSelectorClicks: spec.afterSelectorClicks || [],
          // 고른 분류가 그려 주는, 이름이 같은 줄들(키드키즈 고시).
          infoRows: spec.infoRows || null,
          fireKeyup: Boolean(spec.fireKeyup),
          infoRowValues: form.infoRows,
          // 표의 줄 제목이 손잡이인 몰(떠리몰)과, 그 폼이 든 프레임.
          tableForm: spec.tableForm || null,
          tableFields: form.tableFields,
          tableRadios: form.tableRadios,
          tableSelects: form.tableSelects,
          tablePicks: form.tablePicks,
          frameUrlIncludes: spec.frameUrlIncludes || "",
        }],
      };
      let injected;
      try {
        injected = await injectWithRetry(injectOptions);
      } catch (error) {
        // 스마트스토어는 로그인이 풀리면 다른 도메인(네이버 커머스 로그인)으로 보낸다. 권한 밖 주소라
        // Chrome 이 주입을 거절한다 — 채움 실패가 아니라 로그인 문제다.
        if (!spec.smartstoreForm || !/cannot access|permission/i.test(String(error?.message || error))) throw error;
        injected = [{
          result: { ok: false, noForm: true, error: `${spec.label}에 로그인되어 있지 않습니다. 열린 탭에서 로그인한 뒤 다시 누르세요.` },
        }];
      }

      // 폼이 없는 프레임의 응답(`noForm`)은 실패가 아니라 '여기 아님'이다. 그것만
      // 남으면 진짜로 화면을 못 찾은 것이므로 그때 그 오류를 올린다.
      let outcome = pickOutcome(injected);

      // 폼 프레임이 채우는 도중에 새로 뜨면(토큰 갱신) 그 프레임의 답이 사라져 겉의 '여기
      // 아님'만 남는다. 가라앉기를 기다려 한 번만 다시 넣는다. 답이 사라졌다는 건 문서가
      // 새로 떴다는 뜻이라 반쯤 채운 값이 남아 있지 않다 — 다시 넣어도 겹치지 않는다.
      if (!outcome.ok && outcome.noForm && spec.frameUrlIncludes) {
        await waitForFormFrame();
        outcome = pickOutcome(await injectWithRetry(injectOptions));
      }

      // 폼이 없다 = 대개 로그인이 풀려 로그인 화면이 열린 것이다. 자격증명이 있으면
      // **이미 열어 둔 탭에서** 로그인하고 한 번만 다시 채운다. 새 탭을 열지 않는 이유는
      // 몰이 로그인 후 원래 주소로 되돌려 주기 때문이다.
      //
      // 폼을 찾았는데 채우다 실패한 것(분류 선택 실패 · 수정 화면 등)은 로그인 문제가 아니다.
      // 그때 로그인을 돌리면 등록 화면의 칸에 아이디 · 비밀번호를 넣고 제출 폴백까지 누를 수
      // 있으므로 `noForm` 일 때만 로그인한다.
      //
      // 자격증명은 사장님이 설정에 저장한 값이고, 여기서는 그대로 흘려보내기만 한다.
      // 로그·응답·저장소 어디에도 남기지 않는다.
      if (!outcome.ok && outcome.noForm && ensureLogin && message.credentials?.loginId) {
        const login = await ensureLogin(tab.id, message.credentials, message.accountKey || null)
          .catch((error) => ({ success: false, error: error?.message || String(error) }));
        // 눌렀어도 로그인 화면이 남았으면(`verified: false`) 다시 채우지 않는다.
        if (login?.submitted && login.verified !== false && login.success !== false) {
          await waitForTabComplete(tab.id).catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          outcome = pickOutcome(await injectWithRetry(injectOptions));
          if (outcome.ok) loginWarnings.push("로그인이 풀려 있어 자동 로그인한 뒤 다시 채웠습니다.");
        } else if (login?.pendingLogin || login?.success === false || login?.verified === false) {
          // 캡차·OTP·폼 없는 몰(11번가·올웨이즈)은 여기서 멈춘다. 사람이 눌러야 한다.
          outcome = {
            ok: false,
            error: "몰에 로그인되어 있지 않습니다. 열린 탭에서 직접 로그인한 뒤 다시 누르세요.",
          };
        }
      }

      if (editor && detailHtml && form.detailHtmlTarget) {
        try {
          await writeDetailThroughEditor(
            tab.id, editor, spec.formSelector, form.detailHtmlTarget, detailHtml, form.promoHtml,
          );
          (outcome.steps = outcome.steps || []).push("상세설명(작성하기 에디터)");
        } catch (error) {
          detailWarnings.push(
            `상세설명을 에디터로 넣지 못했습니다: ${error?.message || error}. 화면에서 직접 넣으세요.`,
          );
        }
      }
      return {
        success: outcome.ok === true,
        ok: outcome.ok === true,
        tabId: tab.id,
        // 제출하지 않는다. 응답이 어떻든 제출됐다고 보고하지 않는다.
        submitted: false,
        mall: message.mall,
        steps: outcome.steps || [],
        warnings: [
          ...(outcome.warnings || []),
          ...loginWarnings,
          ...imageWarnings,
          ...selfUploadWarnings,
          ...detailWarnings,
        ],
        manualSteps: form.manualSteps,
        ...(outcome.error ? { error: outcome.error } : {}),
      };
    }

    return { register, listCategories };
  }

  // 페이지 안에서 도는 함수들도 내보낸다. 이것들이 실제로 몰 화면에 들어가는
  // 페이로드라서, 여기서 막는 규칙(빈 항목을 끄지 않으면 대화상자가 떠서 화면이
  // 얼어붙는다)은 테스트로 지켜야 한다.
  root.KidItemMallFormRegister = {
    create,
    SPECS,
    FILL_TIMEOUT_MS,
    pageFunctions: {
      driveDetailEditor, fillMallProductForm, fillSsgProductForm, fillSmartstoreProductForm, fillGsshopProductForm,
      fillLotteonProductForm, fillKakaoProductForm,
    },
  };
})(typeof self !== "undefined" ? self : globalThis);
