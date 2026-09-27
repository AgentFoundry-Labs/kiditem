import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { KIDKIDS_LOGIN, KIDKIDS_PAGE_GUARD } from './index';

  /**
   * 키드키즈 스토어 파트너센터(`partner.kidkids.net`, euc-kr PHP).
   *
   * 실측 2026-09-14, 목록 3,478개 + 최근 등록물 60개(2026-06~08). 겉 주소
   * `/new/pages/sales/goods_register.htm` 은 껍데기고 폼은 iframe 의
   * `/sales/goods_reg_renewal.htm` 이다 — 그 주소를 바로 열어도 폼이 온전히 그려진다.
   *
   * 칸 이름은 다 있다. 다른 몰과 다른 것 셋:
   *
   *  1. 분류는 대·중·소 계단식이다. 앞 단을 고르면 jQuery 가 `get_category_data.php` 로
   *     다음 단을 채운다(라이브 확인: 네이티브 change 이벤트로도 돈다).
   *  2. ⭐ 공정위 고시는 `gs_id` 를 골라야 칸이 **그려진다**(`goods_spec_proc.php`).
   *     칸은 전부 `name="spec_contents"` 로 이름이 같고 `info` 속성(고시 항목 번호)만
   *     다르다. 제출할 때 화면이 그 칸들을 `info|값//` 로 묶어 `my_gs_data` 에 담는다.
   *  3. 상세설명은 TinyMCE 3.5.8 이다. textarea 에만 쓰면 제출 때 에디터 내용으로
   *     덮이므로 에디터에 넣는다. 등록물 60개 전부 `<center><img …></center>` 한 장.
   *  4. ⭐ 상세 이미지는 **키드키즈 자체 업로드**에 올린다. 에디터 `이미지 삽입/편집` 창의
   *     [...] 이 여는 `galery_ftp.htm` 이다 — 파일을 올리면 응답 HTML 의 `insertimg()` 에
   *     `https://img.kidkids.net/upimage/<시각>_<난수>.<확장자>` 가 실린다(라이브 확인
   *     2026-09-14: 올린 바이트 그대로 공개로 읽히고 다른 사이트 리퍼러도 통과). 이름이 바뀌어
   *     저장되므로 올린 파일명으로 찾으면 못 찾는다. 남의 저장소(키즈노트)가 필요 없다 —
   *     예전엔 키즈노트 관리자 세션이 없으면 키드키즈 상세가 통째로 빠졌다.
   *     그 창의 파일 목록은 서버 쪽 오류(opendir)로 깨져 있지만 업로드는 된다.
   */
export const KIDKIDS_REGISTRATION_FORM: MallFormSpec = {
  label: "키드키즈",
  origin: "https://partner.kidkids.net",
  pathPrefix: "/sales/goods_reg_renewal.htm",
  formSelector: 'form[name="goods_form"]',
  preRadios: ["kc_view"],
  selectorFields: [
    { key: "category1", selector: 'select[name="large_cat_id"]', label: "대분류", waitMs: 600, waitForOption: true },
    { key: "category2", selector: 'select[name="middle_cat_id"]', label: "중분류", waitMs: 600, waitForOption: true },
    { key: "category3", selector: 'select[name="small_cat_id"]', label: "소분류", waitMs: 300, waitForOption: true },
    // 목록은 화면이 열리자마자 AJAX 로 채운다(처음엔 `선택` 한 줄).
    { key: "noticeGroup", selector: "#gs_id", label: "공정위 고시 분류", waitMs: 300, waitForOption: true },
  ],
  infoRows: { itemSelector: "textarea.spec_contents", attr: "info", label: "공정위 고시", timeoutMs: 10000 },
  fireKeyup: true,
  // 목록 이미지 + 추가 이미지 4칸. 칸마다 한 장.
  imageFileInputs: [
    { key: "main", label: "대표 이미지", selector: 'input[type="file"][name="goods_photo_new"]' },
    { key: "img2", label: "추가 이미지 2", selector: 'input[type="file"][name="goods_img_2"]' },
    { key: "img3", label: "추가 이미지 3", selector: 'input[type="file"][name="goods_img_3"]' },
    { key: "img4", label: "추가 이미지 4", selector: 'input[type="file"][name="goods_img_4"]' },
    { key: "img5", label: "추가 이미지 5", selector: 'input[type="file"][name="goods_img_5"]' },
  ],
  /**
   * TinyMCE 3 는 모르는 속성을 저장할 때 지운다. 몰 업로드가 실패해 이미 읽히는 남의
   * 주소(카카오 CDN)로 넣게 되면 핫링크를 통과시키는 `referrerpolicy` 가 필요하므로 그
   * 속성을 허용한다(라이브 확인: 허용 후 `triggerSave` 결과에 속성이 남는다).
   */
  detailRich: {
    kind: "tinymce",
    editorId: "goods_desc",
    validElements: "img[src|alt|width|height|style|referrerpolicy]",
    // 에디터 [...] 업로드 창의 폼 그대로다(`imgupload`: 파일 `upload` + `act=upload` + `fname`).
    upload: {
      endpoint: "/sales/js/tiny_mce/plugins/advimage/galery_ftp.htm?dirname=https://img.kidkids.net/upimage/",
      field: "upload",
      fields: { act: "upload", fname: "" },
      // 응답에는 파일명 없는 기본 주소(`…/upimage/'`)와 `…/upimage//' + img.alt` 도 있다.
      // 파일명과 확장자까지 붙은 것만 올린 결과다.
      hostedPattern: "https://img\\.kidkids\\.net/upimage/[^'\"\\s<>/]+\\.(?:jpe?g|png|gif)",
    },
  },
  // 상세 이미지를 File 로 받아 와야 몰 업로드에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'kidkids',
  displayName: '키드키즈',
  guard: registrationGuard(KIDKIDS_PAGE_GUARD, '키드키즈'),
  dialogHosts: ['kidkids.net'],
  login: KIDKIDS_LOGIN,
  form: KIDKIDS_REGISTRATION_FORM,
});
