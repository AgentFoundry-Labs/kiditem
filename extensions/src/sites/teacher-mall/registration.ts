import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { TEACHER_MALL_LOGIN, TEACHER_MALL_PAGE_GUARD } from './index';

/** 티처몰 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const TEACHER_MALL_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'teacher-mall',
  displayName: '티처몰',
  guard: registrationGuard(TEACHER_MALL_PAGE_GUARD, '티처몰'),
  dialogHosts: ['teacherville.co.kr'],
  login: TEACHER_MALL_LOGIN,
  form: TEACHER_MALL_REGISTRATION_FORM,
});
