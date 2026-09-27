import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { ST11_LISTINGS_GUARD } from './listings';

/** 11번가 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const ST11_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: '11st',
  displayName: '11번가',
  guard: registrationGuard(ST11_LISTINGS_GUARD, '11번가'),
  dialogHosts: ['11st.co.kr'],
  form: ST11_REGISTRATION_FORM,
});
