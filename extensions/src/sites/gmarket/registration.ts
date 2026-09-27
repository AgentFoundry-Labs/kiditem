import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { registerMallWriter } from '../mall-write/writer';
import { esmListingsGuard } from './listings';

  /**
   * ESM Plus — **G마켓과 옥션을 한 번에** 등록한다.
   *
   * 실측 2026-09-11(빈 폼 `item.esmplus.com/goods/new`). 지금까지 붙인 몰과
   * 근본이 다르다:
   *
   *  1. **`<form>` 도 `name` 도 `id` 도 없다.** Next.js + React 라 `id` 는 React
   *     `useId` 가 만든 `:r0:` 이고 렌더마다 바뀐다. 네이티브 `<select>` 도 0개다.
   *     유일한 손잡이가 화면에 찍힌 **섹션 제목**이라 `sectionForm` 을 쓴다.
   *  2. **고시가 일반 칸과 같은 블록이다.** `상품군` 을 고르면 15줄이 같은
   *     `div.box__filter-item` 으로 그려진다 — `noticeSection` 이 필요 없다.
   *  3. **상세설명이 그냥 textarea 다.** SmartEditor 도 iframe 도 없다. `HTML 작성`
   *     탭을 누르면 `textarea.box__board-textarea` 가 나온다.
   *
   * 판매사이트(G마켓·옥션) 체크박스는 둘 다 켜진 채로 열린다 — 건드리지 않는다.
   * 배송(택배사·발송정책·출고지·배송비·반품지)도 계정 템플릿으로 이미 차 있다.
   */
export const GMARKET_REGISTRATION_FORM: MallFormSpec = {
  label: "지마켓·옥션",
  origin: "https://item.esmplus.com",
  pathPrefix: "/goods/new",
  // `<form>` 이 없다. 화면이 그려졌는지만 보는 표식으로 쓴다.
  formSelector: "main.box__wrap",
  /**
   * ⚠️ 이 화면은 `load` 뒤에도 **8~10초** 더 지나야 칸이 그려진다(라이브 실측).
   * 껍데기(`main.box__wrap`)만 보고 진행하면 칸이 하나도 없어 전부 실패한다.
   * 그래서 칸 하나가 실제로 생길 때까지 기다린다.
   */
  readySelector: "div.box__filter-item",
  formWaitMs: 25000,
  sectionForm: {
    itemSelector: "div.box__filter-item",
    headSelector: ".box__filter-head",
    contentSelector: ".box__filter-content",
    inputSelector: "input.form__input, textarea",
    dropdownSelector: "div.box__dropdown",
    openerSelector: "button.button__opener",
    // ⚠️ `li` 가 아니라 이 버튼을 눌러야 한다. li 클릭은 아무 일도 안 일어난다.
    optionSelector: "button.button__option",
    labelSelector: "label.form__label",
  },
  sectionCategory: {
    section: "카테고리",
    queryInput: 'input.form__input[placeholder*="카테고리"]',
    searchButton: "button.button__search",
    waitMs: 2500,
  },
  /**
   * 상세설명.
   *
   * ⭐ **ESM 자체 업로드가 주 경로다.** 예전엔 키즈노트(diskn)에 먼저 올려 주소를
   * 받아 HTML 로 넣었는데, 키즈노트 로그인이 풀리면 ESM 등록이 통째로 막혔다
   * (사장님 지적 2026-09-11: "esm 인데 왜 키즈노트를 쓰냐"). 남의 몰 세션이 우리
   * 등록을 막는 구조라 버렸다.
   *
   * `이미지 업로드` 탭 안에 전용 파일 칸이 있다(라이브 실증: 넣으니 안내 문구가
   * "등록된 이미지가 없습니다" → "등록된 이미지가 있습니다"로 바뀌었다).
   * ⚠️ 파일 칸 이름이 상품이미지와 똑같은 `btnSelectFile` 이라 문서 전체에서 찾으면
   * 대표이미지 칸을 집는다. 반드시 `div.box__board` 안에서 찾는다.
   */
  sectionDetail: {
    tabSelector: "ul.list__tab-board button.button__tab",
    /** 주 경로 — 파일을 직접 올린다. */
    uploadTabLabel: "이미지 업로드",
    uploadBoardSelector: "div.box__board",
    uploadFileSelector: "input.form__file",
    uploadDoneText: "등록된 이미지가 있습니다",
    /** 대비 경로 — 이미 몰이 읽을 수 있는 주소일 때만 쓴다. */
    tabLabel: "HTML 작성",
    textareaSelector: "textarea.box__board-textarea",
  },
  /** 상세 이미지를 File 로 받아 와야 몰에 올릴 수 있다. */
  detailSelfUpload: { editorTab: null },
  // 칸이 하나뿐인데 `multiple` 이다. 대표·추가를 한 번에 넣고 첫 장이 대표가 된다.
  sectionImages: {
    groupKey: "esmplus",
    label: "상품이미지",
    fileInputSelector: "input.form__file",
    max: 15,
  },
  /**
   * 화면을 덮는 안내 팝업을 닫는다(사장님 요청 2026-09-11).
   *
   * 실물 예: "[G kiditem / A kiditem] 이벤트에 참여중입니다 … [확인]".
   * 덮여 있는 동안에는 우리 클릭이 전부 그 창으로 먹어서 폼이 안 채워진다.
   *
   * ⚠️ 판단은 **버튼 글자로만** 한다. 글자 있는 버튼이 하나뿐이고 그게 `확인`·`닫기`
   * 일 때만 누른다 — 확인/취소가 같이 있는 '되묻는 창' 은 사람의 결정이라 건드리지
   * 않는다. 이 안내창은 본문에 '등록' 이 들어 있어서(신규로 등록되는 상품은 …)
   * 본문으로 거르면 오히려 못 닫는다.
   */
  dismissDialogs: {
    label: "안내 팝업",
    /** 이 글자를 누른다. */
    closeLabels: ["확인", "닫기"],
    /**
     * 창 안에서 '고르라는 자리' 인지 판단할 낱말들.
     *
     * 여기 있는 낱말 중 닫기류가 아닌 것이 하나라도 창에 있으면 손대지 않는다 —
     * `취소` 가 같이 있으면 되묻는 창이고, 그건 사람의 결정이다.
     */
    actionWords: [
      "확인", "닫기", "취소", "등록", "저장", "삭제", "전송", "제출",
      "계속", "다음", "이전", "예", "아니오", "등록하기", "저장하기",
    ],
    /** 묻는 말로 끝나는 창은 닫기류만 있어도 사람의 결정이다. */
    questionPattern: "하시겠습니까|하시겠어요|계속할까요|진행할까요",
    /** 안내 문구가 이만큼은 있어야 '읽으라고 띄운 창' 이다. */
    minMessageLength: 10,
    retries: 4,
    waitMs: 700,
  },
  // ⚠️ `detailHost` 를 두지 않는다. 두면 키즈노트에 먼저 올리려다 그 몰 로그인이
  // 풀렸을 때 ESM 등록까지 막힌다 — 실제로 그렇게 막혔다(라이브 2026-09-11).
};

registerMallWriter({
  mallKey: 'gmarket',
  displayName: '지마켓',
  guard: registrationGuard(esmListingsGuard('지마켓'), '지마켓'),
  dialogHosts: ['esmplus.com'],
  form: GMARKET_REGISTRATION_FORM,
});
