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
      label: "상품 첨부 저장소",
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
      detailUploads: (Array.isArray(value.detailUploads) ? value.detailUploads : [])
        .filter((entry) => entry && typeof entry.url === "string"),
      manualSteps: (Array.isArray(value.manualSteps) ? value.manualSteps : [])
        .filter((step) => typeof step === "string"),
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
        if (self && payload.detailImage?.dataUrl) {
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
          images.push({ name: upload.name, error: error?.message || String(error) });
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
      if (!pno) throw new Error("상품번호를 받지 못했습니다. 로그인 상태를 확인하세요.");

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
            `${host.label}에 상세설명을 올리지 못했습니다: ${error?.message || error}. `
            + "화면에서 직접 올리세요.",
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
      const injectOptions = {
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
          // 표의 줄 제목이 손잡이인 몰(떠리몰)과, 그 폼이 든 프레임.
          tableForm: spec.tableForm || null,
          tableFields: form.tableFields,
          tableRadios: form.tableRadios,
          tableSelects: form.tableSelects,
          tablePicks: form.tablePicks,
          frameUrlIncludes: spec.frameUrlIncludes || "",
        }],
      };
      const injected = await injectWithRetry(injectOptions);

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
      // 자격증명은 사장님이 설정에 저장한 값이고, 여기서는 그대로 흘려보내기만 한다.
      // 로그·응답·저장소 어디에도 남기지 않는다.
      if (!outcome.ok && ensureLogin && message.credentials?.loginId) {
        const login = await ensureLogin(tab.id, message.credentials, message.accountKey || null)
          .catch((error) => ({ success: false, error: error?.message || String(error) }));
        if (login?.submitted) {
          await waitForTabComplete(tab.id).catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          outcome = pickOutcome(await injectWithRetry(injectOptions));
          if (outcome.ok) loginWarnings.push("로그인이 풀려 있어 자동 로그인한 뒤 다시 채웠습니다.");
        } else if (login?.pendingLogin || login?.success === false) {
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
    pageFunctions: { driveDetailEditor, fillMallProductForm },
  };
})(typeof self !== "undefined" ? self : globalThis);
