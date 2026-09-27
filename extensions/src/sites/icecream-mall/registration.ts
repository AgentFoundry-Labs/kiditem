import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { ICECREAM_LOGIN, ICECREAM_PAGE_GUARD } from './index';

/** 아이스크림몰 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const ICECREAM_MALL_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'icecream-mall',
  displayName: '아이스크림몰',
  guard: registrationGuard(ICECREAM_PAGE_GUARD, '아이스크림몰'),
  dialogHosts: ['i-screammall.co.kr'],
  login: ICECREAM_LOGIN,
  form: ICECREAM_MALL_REGISTRATION_FORM,
});
