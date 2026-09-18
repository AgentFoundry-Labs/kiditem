/**
 * 몰별 상품등록·품절 제약 선언.
 *
 * 사방넷은 이 정보를 [쇼핑몰특이사항] 팝업 안에만 뒀다. 그래서 "완전품절이 어느
 * 몰에서 영구삭제인지"를 운영자가 외우고 있어야 했다. 우리는 타입으로 선언하고
 * 검증기·디스패처·화면이 같은 소스를 읽는다.
 *
 * DB 가 아니라 코드인 이유: 이 값이 바뀌면 반드시 어댑터 코드도 함께 바뀐다.
 * 운영자가 화면에서 고칠 수 있으면 안 되는 값이다.
 */

/** 어떤 실행 경로로 몰에 쓰는가. */
export type MallAdapterKind = 'api' | 'extension_form' | 'extension_excel' | 'unknown';

export type MallDifficulty = 'low' | 'medium' | 'high' | 'unknown';

/** 재고·판매상태를 어느 단위로 쓸 수 있는가. null = 그 축이 없음. */
export type MallWriteAxis = 'option' | 'listing' | null;

export interface MallAdapterSupports {
  createListing: boolean;
  updateListing: boolean;
  setStock: MallWriteAxis;
  setSaleStatus: MallWriteAxis;
  soldOut: boolean;
  /**
   * 품절 해제(재판매)를 자동으로 되돌릴 수 있는가.
   *
   * 사방넷이 문서화하지 않은 축이다. 원문: "[일시중지, 완전품절 → 공급중]은
   * 자동화로 송신 불가". false 면 화면이 "수동 해제 필요"로 표시한다.
   */
  resume: boolean;
}

export interface MallAdapterHazards {
  /**
   * 완전품절 상태를 보내면 몰이 리스팅을 영구삭제한다.
   * 사방넷 원문 기준 ESM옥션·ESM지마켓·11번가·인터파크·고도몰.
   * true 면 sold_out 명령을 기술적으로 차단하고 suspended 로 강등한다.
   */
  soldOutDeletesListing: boolean;
  /** 판매중지 상태를 N일 유지하면 몰이 자동 삭제한다. ESM = 30. */
  suspendAutoDeletesAfterDays: number | null;
  /** 한 번 들어가면 되돌릴 수 없는 판매상태 값. 어댑터가 거부한다. */
  irreversibleStates: readonly string[];
  /** 상품 정보 수정이 승인 상태를 초기화한다(티처몰: 미승인+판매중지+미노출). */
  updateResetsApproval: boolean;
  /** 재고만 써도 판매가가 함께 덮어써진다. 참이면 현재가를 읽어 보존 전송한다. */
  stockWriteOverwritesPrice: boolean;
  /** 송신이 곧 반영이 아니라 몰 관리자 승인 요청이다(온채널). */
  requiresOperatorApproval: boolean;
  /** 수정 시 전체 필드 재전송 필수. 누락 필드는 삭제된다(카카오·스마트스토어). */
  fullPayloadOnUpdate: boolean;
  /** 해제가 품절과 다른 경로를 타야 한다(해법몰: 상태 팝업에 되돌릴 값이 없음). */
  resumeRequiresAlternatePath: boolean;
}

export interface MallAdapterLimits {
  /** 1회 요청에 담을 수 있는 최대 건수. */
  maxPerRequest: number | null;
  ratePerSecond: number | null;
  /** 상품 1건이 가질 수 있는 최대 옵션 수. */
  maxOptionsPerListing: number | null;
  /** 재고에 쓸 수 있는 최솟값. ESM 은 1이라 0(품절)을 재고축으로 만들 수 없다. */
  minStockValue: number | null;
}

/** 송신 전에 검사할 항목. 몰마다 강제되는 집합이 다르다. */
export type MallPreflightRule =
  | 'mall_category_mapped'
  | 'kc_certification'
  | 'images_present'
  | 'price_positive'
  | 'option_name_forbids_danpum'
  | 'charset_korean_english_only'
  | 'option_count_within_limit'
  | 'profile_selected';

export type MallProfileField =
  | 'shipping'
  | 'returnPolicy'
  | 'releaseAddress'
  | 'returnAddress'
  | 'asPhone';

export interface MallAdapterManifest {
  readonly key: string;
  readonly name: string;
  readonly kind: MallAdapterKind;
  readonly difficulty: MallDifficulty;
  /** 스펙이 문서/실측으로 확인되지 않은 몰. supports 는 전부 닫아 둔다. */
  readonly unverified: boolean;
  /** 상품등록·품절 개념 자체가 없는 채널(발주 전용 등). */
  readonly applicable: boolean;
  readonly supports: MallAdapterSupports;
  /**
   * 품절을 **어느 길로** 보내는가. `supports` 와 따로 두는 이유는 종류가 달라서다 —
   * `supports` 는 "그 몰이 품절을 지원하는가"(매니페스트 실측)이고, 이건 "우리가 그리로
   * 쓰는 구현을 만들었는가"다. 지원하는데 우리가 아직 안 뚫은 몰이 대부분이라, 둘을 한
   * 값으로 뭉개면 화면이 "왜 버튼이 없는지"를 말하지 못한다.
   *
   * `mall_admin` 우리 확장에 그 몰 관리자로 쓰는 구현이 **실제로 있다**.
   * `null`       아직 그 몰 관리자를 뚫지 않았다.
   *
   * 사방넷 경유는 길이 아니다 — 사방넷 기능을 흡수하고 그만 쓰는 것이 방침이다(KID-251).
   */
  readonly soldOutRoute: 'mall_admin' | null;
  readonly hazards: MallAdapterHazards;
  readonly limits: MallAdapterLimits;
  readonly preflightRules: readonly MallPreflightRule[];
  readonly requiredProfileFields: readonly MallProfileField[];
  /** 이 매니페스트 값의 근거. 화면 툴팁에 그대로 나간다. */
  readonly note: string;
}

/**
 * 몰에서 **우리 쪽으로** 들어오는 방향의 능력.
 *
 * 상품등록(`supports`)과 반대 방향이라 따로 둔다. 화면이 "이 몰은 연결만 돼 있다" 로
 * 보여 주던 자리에 **무엇이 실제로 되는지**를 말해 주기 위한 값이다.
 *
 * ⚠️ 근거는 **코드에 실제로 있는 경로**다. 문서에 스펙만 적힌 것은 켜지 않는다 —
 * 그러면 화면이 되는 것처럼 말하고 사람이 눌렀을 때 아무 일도 안 일어난다.
 *
 *  - `collectsOrders`: 이 몰의 주문이 들어오는가. 길은 `orderCollectionVia` 가 말한다 —
 *    `kiditem` 은 우리 확장 수집기(쿠팡 로켓은 발주 수집), `sellpia` 는 셀피아가 그 몰에서
 *    직접 가져오는 주문수집이다.
 *  - `uploadsTracking`: 확장에 발송처리(송장 등록) 액션이 있는 몰
 *    (`uploadOnchTracking`·`uploadKidkidsTracking`·`uploadDomeggookTracking`, 3곳).
 *    아이스크림몰·티쳐몰·키즈노트·보리보리·카카오는 **스펙만 있고 미구현**이다.
 */
export type OrderCollectionVia = 'kiditem' | 'sellpia';

export interface MallInboundSupports {
  readonly collectsOrders: boolean;
  readonly orderCollectionVia: OrderCollectionVia | null;
  readonly uploadsTracking: boolean;
}

/**
 * 우리 수집기가 주문을 가져오는 몰. 아트공구는 확장 수집기가 CSV 로 만들고, 쿠팡 로켓은
 * 발주 수집(Supply)이 주문 자리를 채운다(사장님 확인 2026-09-17).
 */
const ORDER_COLLECTING_KEYS: ReadonlySet<string> = new Set([
  'always', 'art09', 'boribori', 'coupang-direct', 'domeggook', 'gs-shop', 'haebub-mall',
  'icecream-mall', 'kidkids', 'kidsnote', 'kkomangse', 'lotte-on', 'onch', 'rocket',
  'teacher-mall',
]);

/**
 * 셀피아가 그 몰에서 주문을 직접 가져오는 몰. 우리 수집기는 없고, 주문은 셀피아
 * 주문수집 화면으로 들어온다(사장님 확인 2026-09-17). 쿠팡은 마켓플레이스(윙) 주문이다 —
 * 로켓 발주와 직배송은 우리 수집기로 들어온다.
 */
const SELLPIA_ORDER_COLLECTING_KEYS: ReadonlySet<string> = new Set([
  '11st', 'auction', 'coupang', 'gmarket', 'smartstore', 'ssg',
]);

/** 발송처리(송장 등록)까지 되는 몰. 조인 키가 깔끔한 셋뿐이다. */
const TRACKING_UPLOAD_KEYS: ReadonlySet<string> = new Set(['onch', 'kidkids', 'domeggook']);

export function mallInboundSupports(mallKey: string): MallInboundSupports {
  const orderCollectionVia: OrderCollectionVia | null = ORDER_COLLECTING_KEYS.has(mallKey)
    ? 'kiditem'
    : SELLPIA_ORDER_COLLECTING_KEYS.has(mallKey) ? 'sellpia' : null;
  return {
    collectsOrders: orderCollectionVia !== null,
    orderCollectionVia,
    uploadsTracking: TRACKING_UPLOAD_KEYS.has(mallKey),
  };
}

/** 몰 종류와 무관하게 항상 검사하는 항목. */
const BASE_RULES: readonly MallPreflightRule[] = [
  'mall_category_mapped',
  'kc_certification',
  'images_present',
  'price_positive',
  'option_name_forbids_danpum',
  'charset_korean_english_only',
  // 상한이 없는 몰에서는 no-op 이다. 몰별로 켜게 두면 상한이 있는 몰에서 켜는 걸
  // 잊어버리므로 기본에 둔다.
  'option_count_within_limit',
  'profile_selected',
];

const NO_SUPPORT: MallAdapterSupports = {
  createListing: false,
  updateListing: false,
  setStock: null,
  setSaleStatus: null,
  soldOut: false,
  resume: false,
};

const NO_HAZARD: MallAdapterHazards = {
  soldOutDeletesListing: false,
  suspendAutoDeletesAfterDays: null,
  irreversibleStates: [],
  updateResetsApproval: false,
  stockWriteOverwritesPrice: false,
  requiresOperatorApproval: false,
  fullPayloadOnUpdate: false,
  resumeRequiresAlternatePath: false,
};

const NO_LIMIT: MallAdapterLimits = {
  maxPerRequest: null,
  ratePerSecond: null,
  maxOptionsPerListing: null,
  minStockValue: null,
};

/**
 * 품절을 그 몰 관리자에 **직접** 쓸 수 있는 몰.
 *
 * 사방넷을 경유하지 않는다. 사장님 방침(2026-09-18): 사방넷 기능을 흡수하고 사방넷을
 * 그만 쓴다(KID-251). 그래서 "사방넷이 나르니까 된다" 는 길이 아니라, 몰마다 그
 * 관리자 화면을 뚫는 것만이 길이다.
 *
 * ⚠️ 여기에는 **확장에 실제 구현이 있는 몰만** 적는다(`mall-availability-send.js` 의
 *    SPECS 와 같아야 한다). 문서에 스펙만 있는 몰을 적으면 화면이 되는 것처럼 말하고
 *    눌렀을 때 아무 일도 안 일어난다.
 */
const MALL_ADMIN_SOLD_OUT_KEYS: ReadonlySet<string> = new Set([
  'kkomangse', 'kidkids', 'onch', 'domeggook',
]);

function soldOutRouteFor(key: string, applicable: boolean): 'mall_admin' | null {
  if (!applicable) return null;
  return MALL_ADMIN_SOLD_OUT_KEYS.has(key) ? 'mall_admin' : null;
}

interface ManifestSeed {
  key: string;
  name: string;
  kind?: MallAdapterKind;
  difficulty?: MallDifficulty;
  unverified?: boolean;
  applicable?: boolean;
  supports?: Partial<MallAdapterSupports>;
  hazards?: Partial<MallAdapterHazards>;
  limits?: Partial<MallAdapterLimits>;
  extraRules?: readonly MallPreflightRule[];
  requiredProfileFields?: readonly MallProfileField[];
  note: string;
}

function manifest(seed: ManifestSeed): MallAdapterManifest {
  const unverified = seed.unverified ?? false;
  const applicable = seed.applicable ?? true;
  // 확인 안 된 몰과 해당 없는 채널은 supports 를 열지 않는다. 시드에 뭐가 적혀
  // 있든 닫는다 — 매니페스트 실수가 몰 송신으로 이어지지 않게 하는 마지막 방어선.
  const supports = unverified || !applicable
    ? NO_SUPPORT
    : { ...NO_SUPPORT, ...seed.supports };
  return {
    key: seed.key,
    name: seed.name,
    kind: seed.kind ?? 'unknown',
    difficulty: seed.difficulty ?? 'unknown',
    unverified,
    applicable,
    supports,
    soldOutRoute: soldOutRouteFor(seed.key, applicable),
    hazards: { ...NO_HAZARD, ...seed.hazards },
    limits: { ...NO_LIMIT, ...seed.limits },
    preflightRules: applicable ? [...BASE_RULES, ...(seed.extraRules ?? [])] : [],
    requiredProfileFields: seed.requiredProfileFields ?? ['shipping', 'releaseAddress', 'returnAddress'],
    note: seed.note,
  };
}

const SEEDS: readonly ManifestSeed[] = [
  // ── 공식 API + 품절/해제 대칭이 문서로 확인된 몰 ────────────────────────────
  // 문서로 확인된 것과 우리 코드로 검증된 것은 다르다. PR 501 에서 주문수집에 새로 들어온
  // 몰(신세계 · 지마켓 · 옥션 · 스마트스토어 · 떠리몰)은 검증 전이라 `unverified` 로 닫아 둔다.
  {
    key: 'toss',
    name: '토스쇼핑',
    kind: 'api',
    difficulty: 'low',
    supports: { createListing: true, updateListing: true, setStock: 'option', soldOut: true, resume: true },
    limits: { ratePerSecond: 30, maxOptionsPerListing: 300 },
    note: '재고 엔드포인트 하나로 완전 대칭. 원문: "재고 수량을 0으로 설정하면 품절 처리됩니다. 품절 상태의 상품의 재고 수량을 1 이상으로 설정하면 품절 취소됩니다."',
  },
  {
    key: 'lotte-on',
    name: '롯데ON',
    kind: 'api',
    difficulty: 'low',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'option', soldOut: true, resume: true,
    },
    note: 'product/status/change 의 slStatCd = SALE/SOUT/END. 공식 샘플이 한 요청에 SOUT+SALE 을 동시에 담아 대칭이 명문화돼 있다. 등록은 spdLst 배열이라 fan-out 실증에 적합.',
  },
  {
    key: 'coupang',
    name: '쿠팡(마켓플레이스)',
    kind: 'api',
    difficulty: 'low',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    limits: { maxPerRequest: 1, maxOptionsPerListing: 200 },
    note: 'sales/stop ↔ sales/resume 가 둘 다 body 없는 완전 대칭이라 롤백 검증이 가장 쉽다. 예외: 쿠팡 모니터링으로 내려간 상품은 재개가 실패한다. ⚠️ OpenAPI 키는 판매자ID당 1개 — 사방넷이 점유 중이면 병행 불가.',
  },
  {
    key: 'kakao',
    name: '카카오 톡스토어',
    kind: 'api',
    difficulty: 'medium',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    hazards: { fullPayloadOnUpdate: true },
    note: '재고 0=품절 / 1이상=해제에 더해 saleStatus on|off 도 별도 대칭. ⚠️ 수정 시 전체 필드 재전송 필수 — 누락한 필드는 삭제된다.',
  },
  {
    key: 'ssg',
    name: '신세계(SSG)',
    kind: 'api',
    difficulty: 'medium',
    // 새 주문수집 몰이다. 문서로 확인한 API 경로는 아직 우리 코드로 검증하지 않았다(KID-105 Q2).
    unverified: true,
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'option', soldOut: true, resume: true,
    },
    limits: { maxPerRequest: 1 },
    note: 'sales-status 하나에 usablInvQty + optionInventories[].sellStatCd. sellStatCd=20 + 재고>0 으로 복귀. 제약: 85(판매금지)로는 변경 불가, 승인 전 상품은 20 불가. ⚠️ 구버전 API 2026-03-31 종료.',
  },
  {
    key: 'gmarket',
    name: '지마켓',
    kind: 'api',
    difficulty: 'medium',
    // 새 주문수집 몰이다. 문서로 확인한 API 경로는 아직 우리 코드로 검증하지 않았다(KID-105 Q2).
    unverified: true,
    supports: {
      createListing: true, updateListing: true,
      setStock: 'listing', setSaleStatus: 'option', soldOut: true, resume: true,
    },
    hazards: { soldOutDeletesListing: true, suspendAutoDeletesAfterDays: 30 },
    limits: { minStockValue: 1 },
    note: 'ESM 1콜로 지마켓+옥션 동시 등록. ⚠️ 옵션 상품은 재고 수정 자체가 불가하고 범위가 1~99,999 라 재고축으로 0(품절)을 만들 수 없다 → 옵션 isSoldOut boolean 축을 쓴다. 사방넷 기준 완전품절=영구삭제 몰.',
  },
  {
    key: 'auction',
    name: '옥션',
    kind: 'api',
    difficulty: 'medium',
    // 새 주문수집 몰이다. 문서로 확인한 API 경로는 아직 우리 코드로 검증하지 않았다(KID-105 Q2).
    unverified: true,
    supports: {
      createListing: true, updateListing: true,
      setStock: 'listing', setSaleStatus: 'option', soldOut: true, resume: true,
    },
    hazards: { soldOutDeletesListing: true, suspendAutoDeletesAfterDays: 30 },
    limits: { minStockValue: 1 },
    note: '지마켓과 같은 ESM 엔드포인트를 공유한다. 등록은 1콜로 양쪽에 동시 반영되므로 중복 송신 방지가 특히 중요하다.',
  },
  {
    key: 'smartstore',
    name: '스마트스토어',
    kind: 'api',
    difficulty: 'medium',
    // 새 주문수집 몰이다. 문서로 확인한 API 경로는 아직 우리 코드로 검증하지 않았다(KID-105 Q2).
    unverified: true,
    supports: {
      createListing: true, updateListing: true,
      setStock: 'listing', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    hazards: { fullPayloadOnUpdate: true },
    limits: { ratePerSecond: 2 },
    note: '⚠️ 재고 전용 API 가 없다(네이버 공식: "현재 재고 수량(stockQuantity)만 수정하는 API는 제공되고 있지 않습니다"). 채널상품 전체 재전송이라 상태 변경에도 현행 규격 검증이 걸려 과거 상품이 400 으로 막힌다. 2 RPS 고정, 상향 불가.',
  },
  {
    key: 'thirtymall',
    name: '떠리몰',
    kind: 'api',
    difficulty: 'medium',
    // 새 주문수집 몰이다. 문서로 확인한 API 경로는 아직 우리 코드로 검증하지 않았다(KID-105 Q2).
    unverified: true,
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'option', soldOut: true, resume: true,
    },
    hazards: { irreversibleStates: ['PROHIBITION'] },
    limits: { maxPerRequest: 100 },
    note: '샵바이. 옵션 forcedSoldOut 이 true/false 양방향이고 saleStatusType READY↔STOP 도 대칭. 리스팅 단위 soldout 은 "TRUE일 경우만 품절처리"라 단방향이므로 옵션축을 쓴다. ⚠️ PROHIBITION 은 비가역 — 자동화에서 절대 금지.',
  },

  // ── API 는 있으나 스펙/엔드포인트가 확인되지 않은 몰 ────────────────────────
  {
    key: '11st',
    name: '11번가',
    kind: 'api',
    difficulty: 'medium',
    unverified: true,
    hazards: { soldOutDeletesListing: true },
    note: '셀러 API 존재는 확정("판매자의 경우 셀러 API를 등록 하셔야 상품 등록부터 … 모든 기능을 사용"). 엔드포인트는 셀러오피스 로그인 후 개발가이드에서만 확인 가능해 미확정 — 호출 IP 사전 등록도 필요하다. 화면 대안은 상품정보 대량수정 엑셀(1회 500건, 옵션 재고 포함). 사방넷 기준 완전품절=영구삭제 몰.',
  },
  {
    key: 'boribori',
    name: '보리보리',
    kind: 'api',
    difficulty: 'medium',
    unverified: true,
    note: 'TRICYCLE 협력사 API 키 발급 경로만 확인됐고 엔드포인트·스펙은 담당 MD 경유 비공개. "상품 수정시 재고수량 0개인 경우 품절상품으로 등록됩니다"는 확인됐으나 해제 대칭은 근거가 없다.',
  },
  {
    key: 'art09',
    name: '아트공구',
    kind: 'extension_excel',
    difficulty: 'medium',
    unverified: true,
    note: '카페24 공급사. API 는 몰 운영자의 앱 OAuth 가 필요해 공급사 단독으로는 불가하고, 실질 경로는 상품 엑셀(CSV)과 재고 정보 수정 엑셀이다. quantity/display/selling 이 독립 필드라 양방향이 깨끗하지만, 공급사 계정 권한 3종(분류 선택/상품 수정/상품 진열) 부여 여부가 미확인이라 닫아 둔다. ⚠️ "품절표시 사용" 미체크면 재고 0 이어도 품절 처리되지 않는다.',
  },

  // ── 어드민 폼·엑셀 리버스 ──────────────────────────────────────────────────
  {
    key: 'kidsnote',
    name: '키즈노트',
    kind: 'extension_excel',
    difficulty: 'high',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    note: 'WISA 스마트윙. 상품 일괄등록 엑셀이 upsert(고유번호 있으면 수정)이고, 재고는 일괄재고 조정(재고조사표.xls, 조정사유 필수)이 따로 있다. 상품조회 목록에서 상태(정상/품절/숨김)를 고쳐 [가격/적립금/상태 수정] 한 버튼으로 일괄 적용 — 27개 몰 중 품절·해제가 가장 깨끗하게 대칭인 몰.',
  },
  {
    key: 'haebub-mall',
    name: '해법몰',
    kind: 'extension_excel',
    difficulty: 'high',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    hazards: { resumeRequiresAlternatePath: true },
    note: '지니마켓. 엑셀 한 장(prd_excel_up.php)이 등록·재고·품절을 동시에 민다(품절여부 Y=품절/N=무제한/S=수량). ⚠️ 상태 변경 팝업(prd_change_status.php)의 셀렉트가 P(일시품절)/B(보류)뿐이라 되돌리는 값이 없다 — 해제는 prd_change_exposure.php Y↔N 또는 엑셀 품절여부 N/S 로 라우팅한다. "대칭 아닌 몰"의 첫 레퍼런스.',
  },
  {
    key: 'onch',
    name: '온채널',
    kind: 'extension_excel',
    difficulty: 'high',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'option', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    hazards: { requiresOperatorApproval: true },
    note: '공급사 상품 대량 등록 엑셀(재고 컬럼, 옵션 2개 이상은 ; 구분). 품절 축은 줄마다 [판매설정](.btn-individual-sale-status[data-prd-code])이 여는 #saleStatusModal 이고, 고른 값이 POST /access/product_access.php?ubr=option_state_modi 로 간다 — prd_code_str 은 상품코드를 / 로 이은 것, sec 는 1=재입고·2=단종·4=일시품절·5=품절, comment 는 사유다(2026-09-18 실측). 되돌리는 값(1 재입고)이 같은 셀렉트에 있어 대칭. ⚠️ 이건 "요청"이라 관리자 승인이 끼어들고 즉시 반영이 보장되지 않는다. 공식 안내상 재고 자동 차감 시스템도 아니다.',
  },
  {
    key: 'teacher-mall',
    name: '티쳐몰',
    kind: 'extension_form',
    difficulty: 'high',
    supports: { createListing: true, updateListing: true, setSaleStatus: 'listing', soldOut: true, resume: true },
    hazards: { updateResetsApproval: true },
    note: '퍼스트몰 selleradmin. 판매상태는 정상/품절/판매중지/재고확보중. ⚠️ 일반 "정보수정" 경로로 처리하면 미승인+판매중지+미노출로 역행하므로 판매상태 단독 변경 경로여야 한다. goods/excel_upload 의 용도(신규등록인지 수정 전용인지)는 미확정.',
  },
  {
    key: 'kkomangse',
    name: '꼬망세',
    kind: 'extension_form',
    difficulty: 'high',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'listing', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    note: 'EduPre. 품절 축은 노출·재고 일괄 화면(_product_mass.view.php → POST _product_mass.pro.php)이다. 줄마다 chk_pcode[코드]=Y 로 지목하고 _view[코드] Y=판매중/N=판매종료, _stock_control[코드] Y=자동/N=수동, _stock[코드]=재고량을 실어 폼째 보낸다(2026-09-18 실측). ⚠️ 이 몰에는 "일시품절" 값이 없다 — 끄는 값이 판매종료뿐이라 재고 0(재고관리=자동)이 덜 거친 축이고, 되돌리기는 같은 화면에서 대칭이다.',
  },
  {
    key: 'always',
    name: '올웨이즈',
    kind: 'unknown',
    difficulty: 'high',
    unverified: true,
    note: '공식 대량 등록 경로가 사방넷과 플레이오토 두 솔루션뿐이라고 명시돼 있다("올웨이즈는 사방넷과 플레이오토 두가지 상품 대량 등록을 지원합니다"). 사방넷 기능표상 품절처리는 O 라 비공개 파트너 채널이 있는 것으로 보이나 근거 없음.',
  },
  {
    key: 'gs-shop',
    name: 'GS샵',
    kind: 'extension_form',
    difficulty: 'high',
    unverified: true,
    note: '파트너스 SPA. 화면 라우트(/product/products/create/, /product/prd-bulk-modify/)와 조회성 BFF 는 번들에서 확인했으나 실제 저장 mutation 은 lazy chunk 라 로그인 후 리버스가 필요하다.',
  },
  {
    key: 'domeggook',
    name: '도매꾹',
    kind: 'extension_form',
    difficulty: 'medium',
    supports: {
      createListing: true,
      setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    note: '상품공급사센터(PHP). 등록은 /sc/item/regFrm 폼을 확장이 채운다(2026-09-10 실측, 제출은 사람). 품절 축은 상품조회/수정 목록(/sc/item/lstAll) [수정저장] 이 /sc/item/editOnList 에 dat=[{no, disp, title, loq, useOpt}] 로 보내는 진열여부다 — 품절=진열안함, 해제=진열함(2026-09-18 실측). ⚠️ 목록에서는 재고를 못 고친다(재고 칸 편집이 막혀 있다). 사방넷도 도매꾹은 일시중지·완전품절 둘 다 숨김으로 보낸다. 주문 OpenAPI(ssl/api)는 주문수집에서 쓴다.',
  },
  {
    key: 'tekville-edu',
    name: '테크빌교육',
    kind: 'unknown',
    difficulty: 'unknown',
    unverified: true,
    note: '상품등록·품절 경로 미조사. 티쳐몰(퍼스트몰)과 같은 운영 주체인지도 확인되지 않았으므로 어댑터를 공유한다고 가정하지 말 것.',
  },
  {
    key: 'benepia-mul',
    name: '베네피아물',
    kind: 'unknown',
    difficulty: 'unknown',
    unverified: true,
    note: '벤더 어드민 경로 미확인. ⚠️ 등록 단계에서 국표원·환경부·식약처 위해상품 정보 검증이 걸려 어린이제품 KC 미비 시 반려 가능성이 27개 몰 중 가장 높다. 사방넷이 7개 기능 전부 커버하므로 자체 어댑터 ROI 재계산 필요.',
  },
  {
    key: 'icecream-mall',
    name: '아이스크림몰',
    kind: 'extension_form',
    difficulty: 'medium',
    supports: {
      createListing: true, updateListing: true,
      setStock: 'listing', setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    note: 'X2BEE PO. 로그인 뒤 경로가 열려 상품 목록(getGoodsList.do)을 실제로 가져왔다. 품절 축은 목록의 [판매상태 일괄변경](#btn_saleStateAllChange)이 고른 줄을 goodsMgmtPopup.goodsSaleStateModifyView.do 팝업으로 넘기는 경로다 — saleStatCd 10=판매중/20=품절/40=판매종료, 노출은 dispYn Y/N(2026-09-18 실측). 품절↔판매중이 같은 셀렉트라 대칭.',
  },
  {
    key: 'kidkids',
    name: '키드키즈',
    kind: 'extension_form',
    difficulty: 'medium',
    supports: {
      createListing: true, updateListing: true,
      setStock: null, setSaleStatus: 'listing', soldOut: true, resume: true,
    },
    note: '스토어 파트너센터(euc-kr PHP). 등록은 /sales/goods_reg_renewal.htm 단일 폼(multipart → /stdinfo/reg_process_renewal.htm)으로 실측됐다(2026-09-14, 목록 3,478개). 분류 3단 AJAX · 공정위 고시 gs_id 동적 줄 · TinyMCE 상세. 품절 축은 목록 폼(frmGoodsList)의 goods_code[] 를 골라 changeUseFlag(\'N\') 이 use_flag·commitType 을 세워 ./proc_logis.htm 으로 보내는 경로이고, 해제는 같은 함수의 \'Y\' 다(2026-09-18 실측). 재입고 예정일은 줄마다 stocked_popup → stocked_save 로 따로 건다. ⚠️ 수량 축은 없다 — 판매상태만 쓴다.',
  },
  {
    key: 'woongjin-class',
    name: '웅진클래스몰',
    kind: 'unknown',
    difficulty: 'unknown',
    unverified: true,
    note: '몰 실체·도메인 자체가 미확정. 샵바이 기반이라는 근거를 찾지 못했다.',
  },
  {
    key: 'yoons',
    name: '윤선생',
    kind: 'unknown',
    difficulty: 'unknown',
    unverified: true,
    note: 'SCM 으로 지목됐던 qbscm.qubridge.com 은 실측 결과 아름넷닷컴/큐브릿지 계열이었고 윤선생과의 연결 근거가 없다.',
  },
  {
    key: 'one-polaris',
    name: '원폴라리스',
    kind: 'unknown',
    difficulty: 'unknown',
    unverified: true,
    note: '최근 120일 매출 비중 6.2% 로 폐쇄몰 1위인데 판매자 어드민 도메인·계정이 모두 미상이다(officeone.co.kr / onepolaris.co.kr 은 DNS 실패). 27개 몰 중 확인 우선순위가 가장 높다.',
  },

  // ── 상품등록 개념이 없는 채널 ─────────────────────────────────────────────
  {
    key: 'rocket',
    name: '쿠팡 로켓',
    applicable: false,
    note: '쿠팡이 발주하고 우리가 납품하는 사입 채널이다(ChannelAccount channel=\'rocket\'). 리스팅 판매상태를 우리가 바꾸는 구조가 아니라 품절 송신 대상이 아니다. 재고는 발주 확정과 셀피아 재고로 관리한다. 주문수집 카탈로그의 쿠팡직배송(coupang-direct)과 같은 거래 관계를 가리킨다.',
  },
  {
    key: 'coupang-direct',
    name: '쿠팡직배송',
    applicable: false,
    note: '사입(발주) 채널이다. 쿠팡이 발주하고 우리가 납품하는 구조라 상품등록·품절 송신 개념이 없다. 마켓플레이스 판매는 별도 쿠팡(coupang) 매니페스트를 쓴다.',
  },
];

export const MALL_ADAPTER_MANIFESTS: readonly MallAdapterManifest[] = SEEDS.map(manifest);

const BY_KEY = new Map(MALL_ADAPTER_MANIFESTS.map((entry) => [entry.key, entry]));

export function getMallAdapterManifest(key: string): MallAdapterManifest | null {
  return BY_KEY.get(key) ?? null;
}

/** 지금 실제로 무언가 송신할 수 있는 몰. 화면의 몰 선택지가 이 목록이다. */
export function listSendableMallManifests(): MallAdapterManifest[] {
  return MALL_ADAPTER_MANIFESTS.filter(
    (entry) => entry.applicable && !entry.unverified,
  );
}

/**
 * 이 몰에 품절 명령을 그대로 보내도 되는가.
 *
 * 사방넷은 "완전품절 = 영구삭제"를 경고문으로만 알렸다. 우리는 명령 자체를 막고
 * 판매중지로 강등한다. 강등도 불가능하면 아예 보내지 않는다.
 */
export function resolveSoldOutCommand(
  manifest: MallAdapterManifest,
): { allowed: true; downgradedTo: 'sold_out' | 'suspended' } | { allowed: false; reason: string } {
  if (!manifest.applicable) {
    return { allowed: false, reason: `${manifest.name}은(는) 상품 판매 채널이 아닙니다.` };
  }
  if (!manifest.supports.soldOut) {
    return { allowed: false, reason: `${manifest.name} 품절 송신 경로가 아직 없습니다.` };
  }
  if (!manifest.hazards.soldOutDeletesListing) {
    return { allowed: true, downgradedTo: 'sold_out' };
  }
  if (manifest.supports.setSaleStatus === null) {
    return {
      allowed: false,
      reason: `${manifest.name}은(는) 품절이 영구삭제로 처리되는데 판매중지로 강등할 경로가 없습니다.`,
    };
  }
  return { allowed: true, downgradedTo: 'suspended' };
}

/** 품절을 자동으로 되돌릴 수 없는 몰. 화면이 "수동 해제 필요"로 표시한다. */
export function requiresManualResume(manifest: MallAdapterManifest): boolean {
  return manifest.applicable && manifest.supports.soldOut && !manifest.supports.resume;
}
