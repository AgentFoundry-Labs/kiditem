import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { BORIBORI_LOGIN, BORIBORI_PAGE_GUARD } from './index';

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
export const BORIBORI_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'boribori',
  displayName: '보리보리',
  guard: registrationGuard(BORIBORI_PAGE_GUARD, '보리보리'),
  dialogHosts: ['seller-club.co.kr'],
  login: BORIBORI_LOGIN,
  form: BORIBORI_REGISTRATION_FORM,
});
