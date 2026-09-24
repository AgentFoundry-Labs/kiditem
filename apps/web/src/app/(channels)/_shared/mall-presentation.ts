import type {
  MallAdapterManifestView,
  MallListingState,
  MallPreflightRule,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';
import { channelLogoPath } from '@kiditem/shared/channel-registry';

export const MALL_READINESS_LABEL: Record<MallPublishTarget['readiness'], string> = {
  ready: '송신 준비됨',
  needs_profile: '등록 기본값 없음 — 쇼핑몰 계정 설정에서 입력',
  needs_account: '계정 정보 필요',
  unsupported: '경로 미확인',
};

export const MALL_READINESS_TONE: Record<MallPublishTarget['readiness'], string> = {
  ready: 'bg-emerald-500',
  needs_profile: 'bg-emerald-500',
  needs_account: 'bg-slate-300',
  unsupported: 'bg-slate-200',
};

export const MALL_KIND_LABEL: Record<MallAdapterManifestView['kind'], string> = {
  api: '공식 API',
  extension_form: '어드민 폼',
  extension_excel: '엑셀',
  unknown: '미확인',
};

export const PREFLIGHT_RULE_LABEL: Record<MallPreflightRule, string> = {
  mall_category_mapped: '카테고리 매핑',
  kc_certification: 'KC 인증',
  images_present: '이미지',
  price_positive: '판매가',
  option_name_forbids_danpum: '옵션명 규칙',
  charset_korean_english_only: '문자 규칙',
  option_count_within_limit: '옵션 수 상한',
  profile_selected: '등록 기본값',
  out_of_stock: '재고',
};

export interface MallHazardBadge {
  label: string;
  detail: string;
  tone: 'danger' | 'warn';
}

/**
 * 매니페스트의 위험 플래그를 화면 뱃지로 편다.
 *
 * 사방넷은 이 정보를 [쇼핑몰특이사항] 팝업 안에만 뒀다. 몰 카드에 상시로 붙여
 * 두면 운영자가 외우지 않아도 된다.
 */
export function mallHazardBadges(manifest: MallAdapterManifestView): MallHazardBadge[] {
  const badges: MallHazardBadge[] = [];
  const { hazards, limits } = manifest;

  if (hazards.soldOutDeletesListing) {
    badges.push({
      label: '완전품절 = 삭제',
      detail: '이 몰에서 완전품절은 리스팅 영구삭제입니다. 품절 명령은 판매중지로 강등해서 보냅니다.',
      tone: 'danger',
    });
  }
  if (hazards.irreversibleStates.length > 0) {
    badges.push({
      label: `비가역 상태 ${hazards.irreversibleStates.join('·')}`,
      detail: '한 번 들어가면 되돌릴 수 없어 자동화에서 차단합니다.',
      tone: 'danger',
    });
  }
  if (hazards.suspendAutoDeletesAfterDays !== null) {
    badges.push({
      label: `판매중지 ${hazards.suspendAutoDeletesAfterDays}일 후 삭제`,
      detail: '판매중지 상태를 오래 두면 몰이 리스팅을 자동 삭제합니다.',
      tone: 'danger',
    });
  }
  if (hazards.updateResetsApproval) {
    badges.push({
      label: '수정 = 재승인',
      detail: '정보 수정이 미승인·판매중지·미노출로 역행합니다. 판매상태 단독 변경 경로를 써야 합니다.',
      tone: 'warn',
    });
  }
  if (hazards.fullPayloadOnUpdate) {
    badges.push({
      label: '전체 재전송',
      detail: '수정 시 전체 필드를 다시 보내야 합니다. 누락한 필드는 삭제됩니다.',
      tone: 'warn',
    });
  }
  if (hazards.stockWriteOverwritesPrice) {
    badges.push({
      label: '재고 송신이 판매가 덮어씀',
      detail: '재고만 보내도 판매가가 바뀝니다. 현재가를 함께 읽어 보존 전송합니다.',
      tone: 'warn',
    });
  }
  if (hazards.requiresOperatorApproval) {
    badges.push({
      label: '관리자 승인 필요',
      detail: '송신이 곧 반영이 아니라 몰 관리자에게 요청이 갑니다. 즉시 반영이 보장되지 않습니다.',
      tone: 'warn',
    });
  }
  if (hazards.resumeRequiresAlternatePath) {
    badges.push({
      label: '해제 경로 다름',
      detail: '품절과 해제가 같은 화면에서 대칭이 아닙니다. 해제는 다른 경로로 보냅니다.',
      tone: 'warn',
    });
  }
  if (limits.minStockValue !== null && limits.minStockValue > 0) {
    badges.push({
      label: `재고 최소 ${limits.minStockValue}`,
      detail: '재고를 0으로 만들 수 없어 품절을 재고축으로 표현할 수 없습니다.',
      tone: 'warn',
    });
  }
  if (limits.ratePerSecond !== null) {
    badges.push({
      label: `${limits.ratePerSecond}건/초`,
      detail: '몰이 정한 호출 상한입니다.',
      tone: 'warn',
    });
  }
  return badges;
}

/**
 * 매트릭스 칸 하나의 표시.
 *
 * 색은 사람이 무엇을 해야 하는지로 정한다 — 초록은 손댈 것 없음, 빨강은 못 파는 것(품절 · 판매중지)과
 * 고쳐야 할 오류, 주황은 확인이 필요함, 하늘은 승인 · 판매 시작을 기다림, 회색은 끝났거나 아직 시작하지
 * 않음. 가져온 원문이 아는 말이면 이 표 대신 `listingStatePill` 이 그 말로 적는다.
 */
export interface MallListingStatePresentation {
  label: string;
  /** 칸 배경과 글자색. */
  tone: string;
  /** 점 색. 라벨 없이 좁은 칸에서 쓴다. */
  dot: string;
  /** 이 칸이 사람을 부르는가. */
  attention: boolean;
}

export const MALL_LISTING_STATE_PRESENTATION: Record<
  MallListingState,
  MallListingStatePresentation
> = {
  published: {
    label: '등록',
    // 쇼핑몰 현황의 ON 스위치처럼 꽉 찬 초록(사장님 2026-09-19 "색상 좀 진하게 쇼핑몰 현황처럼").
    tone: 'bg-emerald-600 text-white',
    dot: 'bg-green-600',
    attention: false,
  },
  reviewing: {
    label: '검수중',
    tone: 'bg-sky-600 text-white',
    dot: 'bg-sky-500',
    attention: false,
  },
  error: {
    label: '오류',
    tone: 'bg-red-600 text-white',
    dot: 'bg-red-600',
    attention: true,
  },
  paused: {
    label: '판매중지',
    tone: 'bg-rose-600 text-white',
    dot: 'bg-rose-500',
    attention: false,
  },
  discontinued: {
    label: '단종',
    tone: 'bg-slate-400 text-white',
    dot: 'bg-slate-300',
    attention: false,
  },
  unknown: {
    label: '확인필요',
    tone: 'bg-orange-500 text-white',
    dot: 'bg-orange-500',
    attention: true,
  },
  unregistered: {
    label: '미등록',
    // 없는 것은 비워 둔 칸처럼 옅게 — 꽉 찬 칸 사이에서 '아직 안 올린 곳'이 한눈에 비어 보이게.
    tone: 'bg-slate-100 text-slate-400',
    dot: 'bg-slate-200',
    attention: false,
  },
};

/**
 * 칸이 "지금 못 사는" 까닭의 갈래. 사방넷 · 몰 관리자에서 가져온 상태와 확장이 몰에서 지금 읽은 상태가 같은 말 · 같은 색을
 * 쓴다 — 같은 판매중지가 여기선 빨강, 저기선 회색이면 안 되고, 옥션이 막은 판매불가를 품절로 적어서도 안 된다(사장님
 * 2026-09-19 "품절이 아니라 미승인이나 판매불가로 해줘야지" · "색상 같은데?").
 */
export type MallStopKind = 'sold_out' | 'partial' | 'blocked' | 'pending' | 'ended';

export const MALL_STOP_TONE: Record<MallStopKind, string> = {
  // 품절 처리가 만드는 것(품절 · 판매중지)은 빨강이다(사장님 2026-09-18 "품절은 빨간색으로"). 칸은 쇼핑몰 현황 스위치처럼
  // 꽉 찬 색에 흰 글씨다(사장님 2026-09-19 "색상 좀 진하게").
  sold_out: 'bg-rose-600 text-white',
  partial: 'bg-amber-500 text-white',
  // 몰이 막은 것 — 판매 재개로 풀리지 않고 몰에서 까닭을 봐야 한다.
  blocked: 'bg-orange-600 text-white',
  pending: 'bg-sky-600 text-white',
  ended: 'bg-slate-500 text-white',
};

export interface MallStopBadge {
  kind: MallStopKind;
  /** 칸 알약의 말. 승인 전 상태는 사장님 말로 '미승인', 사방넷 일시중지는 몰이 받는 말 그대로 '판매중지'. */
  label: string;
}

const STOP_WORDS: Readonly<Record<string, MallStopBadge>> = {
  품절: { kind: 'sold_out', label: '품절' },
  SKU품절: { kind: 'sold_out', label: 'SKU품절' },
  완전품절: { kind: 'sold_out', label: '완전품절' },
  판매중지: { kind: 'sold_out', label: '판매중지' },
  일시중지: { kind: 'sold_out', label: '판매중지' },
  비활성: { kind: 'sold_out', label: '판매중지' },
  판매불가: { kind: 'blocked', label: '판매불가' },
  판매금지: { kind: 'blocked', label: '판매금지' },
  보류: { kind: 'blocked', label: '보류' },
  반려: { kind: 'blocked', label: '반려' },
  승인반려: { kind: 'blocked', label: '승인반려' },
  승인거부: { kind: 'blocked', label: '승인거부' },
  등록대기: { kind: 'pending', label: '미승인' },
  승인대기: { kind: 'pending', label: '미승인' },
  대기중: { kind: 'pending', label: '미승인' },
  판매대기: { kind: 'pending', label: '판매대기' },
  전시전: { kind: 'pending', label: '전시전' },
  판매종료: { kind: 'ended', label: '판매종료' },
  단종: { kind: 'ended', label: '단종' },
  숨김: { kind: 'ended', label: '숨김' },
  미노출: { kind: 'ended', label: '미노출' },
};

/** 몰 · 사방넷이 준 상태 글자 하나의 갈래. 아는 말이 아니면 null(`사방넷 ` 머리는 떼고 본다). */
export function mallStopBadge(word: string | null | undefined): MallStopBadge | null {
  const key = String(word ?? '').replace(/^사방넷\s+/, '').trim();
  return Object.prototype.hasOwnProperty.call(STOP_WORDS, key) ? STOP_WORDS[key] : null;
}

/**
 * 가져온 상태의 칸 알약. 판매중 · 미등록이 아닌데 원문이 아는 말이면 그 말과 그 갈래 색으로(몰 관리자 품절이 '판매중지',
 * 판매종료가 '단종' 으로 접히지 않게), 아니면 우리 어휘 표로 적는다.
 */
export function listingStatePill(
  state: MallListingState,
  rawStatus: string | null | undefined,
): { label: string; tone: string; kind: MallStopKind | null } {
  const stop = state === 'published' || state === 'unregistered' ? null : mallStopBadge(rawStatus);
  if (stop) return { label: stop.label, tone: MALL_STOP_TONE[stop.kind], kind: stop.kind };
  const presentation = MALL_LISTING_STATE_PRESENTATION[state];
  return { label: presentation.label, tone: presentation.tone, kind: null };
}

/**
 * 몰 표시색.
 *
 * 몰 로고 파일은 저장소에 없다(라이브 확인 2026-09-09). 남의 브랜드 로고를
 * 임의로 넣지 않고, 몰 이름에서 만든 고정 색과 머리글자로 대신한다. 같은 몰은
 * 언제나 같은 색이라 표에서 열을 눈으로 따라갈 수 있다.
 */
const MALL_ACCENTS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
] as const;

export function mallAccentClass(mallKey: string): string {
  let hash = 0;
  for (let index = 0; index < mallKey.length; index += 1) {
    hash = (hash * 31 + mallKey.charCodeAt(index)) % 100_000;
  }
  return MALL_ACCENTS[hash % MALL_ACCENTS.length] ?? MALL_ACCENTS[0];
}

/** 카드·열 머리에 쓸 머리글자. 한글은 첫 글자, 영문은 첫 두 글자. */
export function mallMonogram(mallName: string): string {
  const trimmed = mallName.trim();
  if (!trimmed) return '?';
  const first = trimmed[0] ?? '?';
  return /[A-Za-z]/.test(first) ? trimmed.slice(0, 2).toUpperCase() : first;
}

/**
 * 상품 머리글자.
 *
 * 우리 상품명은 대부분 가격코드로 시작한다(`3000심쿵!뽑기왕`, `700국어노트(8칸)`).
 * 첫 글자를 그대로 쓰면 타일이 전부 숫자가 되어 아무것도 구별해 주지 않는다.
 * 앞의 숫자를 건너뛰고 실제 이름의 첫 글자를 쓴다.
 *
 * 몰 이름에는 쓰지 않는다 — `11번가` 가 `번` 이 되어 버린다.
 */
export function productMonogram(productName: string): string {
  const trimmed = productName.trim();
  if (!trimmed) return '?';
  const withoutPriceCode = trimmed.replace(/^\d+\s*/, '');
  const source = withoutPriceCode || trimmed;
  const first = source[0] ?? '?';
  return /[A-Za-z]/.test(first) ? source.slice(0, 2).toUpperCase() : first;
}

/**
 * 몰 로고.
 *
 * 각 몰의 공식 파비콘을 `apps/web/public/mall-logos/` 에 받아 두고 쓴다. 외부에서
 * 실시간으로 불러오면 몰이 경로를 바꾸는 날 표가 통째로 깨지고, 우리 화면이 남의
 * 서버 상태에 묶인다.
 *
 * 파일이 없는 몰은 null 이고 화면이 머리글자 타일로 대신한다. 지금 없는 곳은
 * 원폴라리스뿐이다 — 사이트(`officeone.co.kr`)가 접속되지 않는다. 아무 아이콘이나
 * 붙이지 않고 비워 둔다.
 *
 * `/favicon.ico` 를 안 내주는 몰은 **그 페이지가 선언한 아이콘**을 받았다(2026-09-11).
 * 지마켓·옥션은 봇을 막아 브라우저로 받았고, 키즈노트는 쇼핑(`shop.kidsnote.com`)에
 * 아이콘이 없어 본사이트(`kidsnote.com`) 것을, 해법몰은 운영 사이트인 지니마켓
 * (`genimarket.co.kr`) 것을 쓴다. 올웨이즈 판매자센터 파비콘은 React 기본 아이콘이라
 * 공식 사이트(`alwayz.co`) 로고로 바꿨다.
 */
export function mallLogoPath(mallKey: string): string | null {
  return channelLogoPath(mallKey);
}
