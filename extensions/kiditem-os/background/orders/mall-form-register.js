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
      /** 같은 방식인데 목록에서 **보이는 글자**로 고르는 것들. */
      rowOptions: (() => {
        const out = {};
        for (const [key, entry] of Object.entries(value.rowOptions || {})) {
          if (entry === null || entry === undefined) continue;
          out[key] = String(entry);
        }
        return out;
      })(),
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

    const form = document.querySelector(payload.formSelector);
    if (!form) {
      return {
        ok: false,
        // 모든 프레임에 넣는 몰(11번가)은 폼이 없는 프레임에서도 여기로 온다.
        // 진짜 실패와 구분하려고 표시를 남긴다.
        noForm: true,
        error: `상품등록 폼(${payload.formSelector})이 없습니다. 로그인 상태와 화면을 확인하세요.`,
      };
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

    return (async () => {
      // 0) 분류가 방아쇠인 몰은 분류부터 끝낸다.
      //
      // 11번가는 분류를 고르기 전에 상품정보 제공고시 블록이 숨어 있어서, 순서를
      // 지키지 않으면 그 단계가 통째로 실패한다(라이브 확인 2026-09-10).
      if (payload.categoryFirst) await runCategorySearch();

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

      // 5) 이름 없는 칸들. 폼으로 못 닿아 선택자로 찾는다.
      //
      // 계단식(원산지)이라 순서와 기다림이 중요하다. 앞 칸을 고르기 전에 뒤 칸을
      // 건드리면 목록이 비어 있어 아무것도 안 들어간다.
      for (const entry of payload.selectorFields || []) {
        const want = payload.selectorFieldValues[entry.key];
        if (want === undefined || want === "") continue;
        const el = document.querySelector(entry.selector);
        if (!el) { warnings.push(`${entry.label || entry.key} 칸을 찾지 못했습니다.`); continue; }
        assign(el, want);
        // 고른 값이 목록에 없으면 브라우저가 조용히 빈 값으로 되돌린다. 그냥 넘기지 않는다.
        if (el.tagName === "SELECT" && el.value !== want) {
          warnings.push(`${entry.label || entry.key} 에 '${want}' 가 목록에 없습니다.`);
          continue;
        }
        steps.push(entry.label || entry.key);
        if (entry.waitMs) await sleep(entry.waitMs);
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
      if ((payload.detailHtmlTarget || payload.detailSelector) && hasDetailWork) {
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
        ...(spec.imageUpload
          ? [{ key: spec.imageUpload.groupKey, label: spec.imageUpload.label }]
          : []),
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
          imageDialogs: spec.imageDialogs || [],
          imageUpload: spec.imageUpload || null,
          imageGroups,
          fields: form.fields,
          radios: form.radios,
          checks: form.checks,
          images,
          detailHtmlTarget: editor ? "" : form.detailHtmlTarget,
          detailHtml: editor ? "" : detailHtml,
        }],
      };
      const injected = await injectWithRetry(injectOptions);

      // 폼이 없는 프레임의 응답(`noForm`)은 실패가 아니라 '여기 아님'이다. 그것만
      // 남으면 진짜로 화면을 못 찾은 것이므로 그때 그 오류를 올린다.
      let outcome = pickOutcome(injected);

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
