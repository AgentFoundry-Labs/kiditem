import { hostWithin } from '../tab-page';
import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { ART09_LOGIN, ART09_PAGE_GUARD } from './index';

/**
 * 아트공구(Cafe24) 로그인 화면: 통합 로그인(eclogin) 또는 로그인 경로. 주문 읽기 규칙(주문목록 밖 Cafe24 화면은 다 로그인)을
 * 쓰면 상품등록 화면도 로그인으로 보고 채우지 못하며, 로그인 문턱이 등록 화면의 비밀번호 칸에 자격을 넣을 수 있다 — 등록은
 * 로그인 화면을 주소로만 가린다.
 */
const isArt09LoginPage = (url: URL) => hostWithin(url, ['eclogin.cafe24.com'])
  || (hostWithin(url, ['cafe24.com']) && /login/i.test(url.pathname));

/** 아트공구 상품등록 폼 명세(옛 `mall-form-register.js` SPECS 줄 그대로, KID-256). */
export const ART09_REGISTRATION_FORM: MallFormSpec = {
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
};

registerMallWriter({
  mallKey: 'art09',
  displayName: '아트공구',
  guard: registrationGuard(ART09_PAGE_GUARD, '아트공구', isArt09LoginPage),
  dialogHosts: ['zzogzzog1.cafe24.com', 'eclogin.cafe24.com'],
  login: { ...ART09_LOGIN, isLoginUrl: isArt09LoginPage },
  form: ART09_REGISTRATION_FORM,
});
