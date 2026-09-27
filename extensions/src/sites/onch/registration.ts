import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { ONCH_LOGIN, ONCH_PAGE_GUARD } from './index';

/** 온채널 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const ONCH_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'onch',
  displayName: '온채널',
  guard: registrationGuard(ONCH_PAGE_GUARD, '온채널'),
  dialogHosts: ['onch3.co.kr'],
  login: ONCH_LOGIN,
  form: ONCH_REGISTRATION_FORM,
});
