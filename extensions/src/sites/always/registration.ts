import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { ALWAYS_PAGE_GUARD } from './index';

/** 올웨이즈 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const ALWAYS_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'always',
  displayName: '올웨이즈',
  guard: registrationGuard(ALWAYS_PAGE_GUARD, '올웨이즈'),
  dialogHosts: ['alwayzseller.ilevit.com'],
  form: ALWAYS_REGISTRATION_FORM,
});
