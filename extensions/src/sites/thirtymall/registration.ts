import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { THIRTYMALL_LISTINGS_GUARD } from './listings';

  /**
   * 떠리몰(샵바이 파트너어드민 · `partner.shopby.co.kr`).
   *
   * 실측 2026-09-11, 등록물 `132154869` 외 둘 + 목록 479개. 이 몰만 다른 것 넷:
   *
   *  1. ⭐ 폼이 **다른 도메인 iframe** 안의 React 앱이다
   *     (`partner-remote.shopby.co.kr/product/management/single/add`). 겉 주소는 껍데기다.
   *     원격 주소를 바로 열면 칸이 하나도 안 그려진다(라이브 실측 — 인증을 겉이 넘겨준다).
   *     그래서 겉을 열고 모든 프레임에 넣되, 일은 그 프레임에서만 한다(`frameUrlIncludes`).
   *     iframe 은 겉 로딩이 끝난 뒤에 붙으므로 서비스워커가 그 프레임부터 기다린다.
   *  2. 칸에 `name` 이 없다. 표의 줄 제목(`th`)이 유일한 손잡이다(`tableForm`).
   *  3. 분류·담당자·브랜드는 검색칸에 넣으면 뜨는 목록(`li`)에서 고른다.
   *  4. 상세설명은 Summernote 다. 그림 버튼 → 파일을 넣으면 몰이 자기 서버에 올리고 그
   *     주소로 그림을 넣는다. 남의 호스팅(diskn)을 쓰지 않는다 — ESM 에서 그 의존 때문에
   *     등록이 막혔다.
   *
   * 상품정보제공고시는 `등록` 을 누르면 **새 창**이 떠서 확장이 채우지 않는다.
   */
export const THIRTYMALL_REGISTRATION_FORM: MallFormSpec = {
  label: "떠리몰",
  origin: "https://partner.shopby.co.kr",
  pathPrefix: "/product/add",
  allFrames: true,
  frameUrlIncludes: "/product/management/single/add",
  frameWaitMs: 30000,
  formSelector: "body",
  // 칸이 생겨야 준비된 것이다. 이 앱은 로딩이 끝나고도 몇 초 뒤에 칸을 그린다.
  readySelector: 'input[data-cy="productName"]',
  formWaitMs: 30000,
  tableForm: {
    pickWaitMs: 6000,
    images: [
      { key: "main", row: "대표이미지" },
      // 칸이 처음엔 없다. `이미지 추가` 를 누를 때마다 파일 칸이 하나씩 생긴다(실측).
      { key: "additional", row: "추가이미지", addLabel: "이미지 추가", max: 9 },
      { key: "list", row: "리스트 이미지" },
    ],
    summernote: { row: "상품 상세", radio: "USE_CONFIG_VALUE", uploadWaitMs: 15000 },
  },
  // 상세 이미지를 File 로 받아 와야 편집기에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'thirtymall',
  displayName: '떠리몰',
  guard: registrationGuard(THIRTYMALL_LISTINGS_GUARD, '떠리몰'),
  dialogHosts: ['shopby.co.kr'],
  form: THIRTYMALL_REGISTRATION_FORM,
});
