import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { KKOMANGSE_LOGIN, KKOMANGSE_PAGE_GUARD } from './index';

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
export const KKOMANGSE_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'kkomangse',
  displayName: '꼬망세',
  guard: registrationGuard(KKOMANGSE_PAGE_GUARD, '꼬망세'),
  dialogHosts: ['edupre.co.kr'],
  login: KKOMANGSE_LOGIN,
  form: KKOMANGSE_REGISTRATION_FORM,
});
