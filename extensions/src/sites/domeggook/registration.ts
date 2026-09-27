import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { DOMEGGOOK_LOGIN, DOMEGGOOK_PAGE_GUARD } from './index';

/** 도매꾹 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const DOMEGGOOK_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'domeggook',
  displayName: '도매꾹',
  guard: registrationGuard(DOMEGGOOK_PAGE_GUARD, '도매꾹'),
  dialogHosts: ['domeggook.com'],
  login: DOMEGGOOK_LOGIN,
  form: DOMEGGOOK_REGISTRATION_FORM,
});
