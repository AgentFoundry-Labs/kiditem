import {
  summarizeRegistrationAccounts,
  type RegistrationAccountState,
  type RegistrationAccountStateValue,
} from '@kiditem/shared/sales-product';
import type { MallListingState } from '@kiditem/shared/mall-publishing';
import { MALL_STOP_TONE, listingStatePill, type MallStopKind } from './mall-presentation';

/**
 * 몰 계정별 등록 상태를 화면 말로 옮기는 하나뿐인 표(KID-313 결정 11 · KID-320).
 *
 * 상태 판정은 서버의 등록 상태 reader 가 한다. 화면은 그 값을 이 표로 읽기만 하고, 실행 이력이나
 * 리스팅을 스스로 조합해 상태를 만들지 않는다. 몰 이름은 여기 없다 — 모든 몰이 같은 말을 쓴다.
 */
export type RegistrationTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

export interface RegistrationBadge {
  key: 'state' | 'listing' | 'soldOut' | 'changed';
  label: string;
  tone: RegistrationTone;
  /**
   * 몰 칸과 같은 색을 써야 하는 칩(몰이 보고한 리스팅 상태 · 품절)의 칸 색(`mall-presentation.ts`). 있으면 `tone` 색
   * 대신 이것으로 그린다 — 같은 판매중지 · 품절이 칸에선 빨강, 배지에선 주황이면 안 된다(사장님 2026-09-18 · 19).
   */
  className?: string;
}

export interface ProductRegistrationSummary {
  state: RegistrationAccountStateValue;
  label: string;
  tone: RegistrationTone;
  registeredCount: number;
  soldOutCount: number;
  changedCount: number;
}

const STATE_LABELS: Record<RegistrationAccountStateValue, string> = {
  unregistered: '미등록',
  preparing: '준비 중',
  submitting: '전송 중',
  confirming: '확인 대기',
  registered: '등록됨',
  failed: '실패',
};

const STATE_TONES: Record<RegistrationAccountStateValue, RegistrationTone> = {
  unregistered: 'neutral',
  preparing: 'progress',
  submitting: 'progress',
  confirming: 'progress',
  registered: 'success',
  failed: 'danger',
};

export const CHANGED_SINCE_REGISTRATION_LABEL = '변경됨 · 재전송 필요';

export function registrationStateLabel(state: RegistrationAccountStateValue): string {
  return STATE_LABELS[state];
}

export function registrationStateTone(state: RegistrationAccountStateValue): RegistrationTone {
  return STATE_TONES[state];
}

/** 준비 중 · 전송 중 · 확인 대기 — 실행이 아직 끝나지 않아 다시 읽어야 하는 상태. */
export function isLiveRegistrationState(state: RegistrationAccountStateValue): boolean {
  return state === 'preparing' || state === 'submitting' || state === 'confirming';
}

/** 등록 준비(등록 설정 열기)는 아직 등록되지 않았거나 실패한 계정에만 연다. */
export function canPrepareRegistration(state: RegistrationAccountStateValue): boolean {
  return state === 'unregistered' || state === 'failed';
}

export const TAKEN_DOWN_LABEL = '등록됨 · 내림';

export type RegistrationBadgeAccount = Pick<
  RegistrationAccountState,
  'state' | 'soldOut' | 'changedSinceRegistration' | 'listingState' | 'listingRawStatus' | 'listingActive'
>;

const STOP_KIND_TONES: Record<MallStopKind, RegistrationTone> = {
  sold_out: 'danger',
  blocked: 'danger',
  partial: 'progress',
  pending: 'progress',
  ended: 'neutral',
};

const LISTING_STATE_TONES: Record<MallListingState, RegistrationTone> = {
  published: 'success',
  reviewing: 'progress',
  error: 'danger',
  paused: 'danger',
  discontinued: 'neutral',
  unknown: 'warning',
  unregistered: 'neutral',
};

/**
 * 몰이 보고한 리스팅 상태가 "올라가 있다"를 넘어 할 말이 있는가 — 발행(`published`)이 아닌 살아 있는 리스팅.
 * 그 말(미승인 · 반려 · 판매중지 · 검수중 · 확인필요)은 매트릭스 칸과 같은 알약(`listingStatePill`)으로 등록 상태 옆에 선다.
 */
function listingBadge(account: RegistrationBadgeAccount): RegistrationBadge | null {
  const state = account.listingState;
  if (!state || state === 'published' || state === 'unregistered' || !account.listingActive) return null;
  const pill = listingStatePill(state, account.listingRawStatus);
  const tone = pill.kind ? STOP_KIND_TONES[pill.kind] : LISTING_STATE_TONES[state];
  return { key: 'listing', label: pill.label, tone, className: pill.tone };
}

/**
 * 계정 한 줄의 배지: 상태, 몰이 발행하지 않은 리스팅이면 그 몰 상태, 그 위에 품절 · 변경됨(재전송 필요).
 *
 * "등록됨"이 초록인 것은 몰이 발행했다고 보고했거나(`published`) 울타리가 확인한 성공을 몰이 아직 돌려주지 않았을
 * 때(`listingState` null)뿐이다 — 성공은 몰 재조회로 확인된 것이다(`(channels)/CLAUDE.md`). 내린 리스팅은
 * "등록됨 · 내림"이다(2026-09-23 사용자 결정 "비활성화는 등록된 상태에서 내린 것").
 */
export function registrationBadges(account: RegistrationBadgeAccount): RegistrationBadge[] {
  const badges: RegistrationBadge[] = [];
  if (account.state === 'registered' && account.listingState !== null && !account.listingActive) {
    badges.push({ key: 'state', label: TAKEN_DOWN_LABEL, tone: 'neutral' });
  } else {
    const listing = listingBadge(account);
    const tone = account.state === 'registered' && listing ? 'neutral' : registrationStateTone(account.state);
    badges.push({ key: 'state', label: registrationStateLabel(account.state), tone });
    if (listing) badges.push(listing);
  }
  if (account.soldOut) badges.push({ key: 'soldOut', label: '품절', tone: 'danger', className: MALL_STOP_TONE.sold_out });
  if (account.changedSinceRegistration) {
    badges.push({ key: 'changed', label: CHANGED_SINCE_REGISTRATION_LABEL, tone: 'warning' });
  }
  return badges;
}

/** 상품 하나를 배지 하나로: 살아 있는 실행 · 실패가 먼저, 그다음 등록 몰 수와 품절 · 변경됨 수. */
export function productRegistrationSummary(
  accounts: readonly Pick<RegistrationAccountState, 'state' | 'soldOut' | 'changedSinceRegistration'>[],
): ProductRegistrationSummary {
  const summary = summarizeRegistrationAccounts(accounts);
  const leading = summary.state !== 'registered' && summary.state !== 'unregistered'
    ? registrationStateLabel(summary.state)
    : null;
  const parts = [
    leading,
    summary.registeredCount > 0 ? `${summary.registeredCount}몰 등록` : null,
    summary.soldOutCount > 0 ? `${summary.soldOutCount} 품절` : null,
    summary.changedCount > 0 ? `${summary.changedCount} 변경됨` : null,
  ].filter((part): part is string => part !== null);
  const tone = summary.state === 'registered' && (summary.changedCount > 0 || summary.soldOutCount > 0)
    ? 'warning'
    : registrationStateTone(summary.state);
  return {
    ...summary,
    label: parts.length > 0 ? parts.join(' · ') : registrationStateLabel('unregistered'),
    tone,
  };
}

export const REGISTRATION_TONE_CLASS: Record<RegistrationTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  progress: 'border-amber-200 bg-amber-50 text-amber-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-orange-200 bg-orange-50 text-orange-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};
