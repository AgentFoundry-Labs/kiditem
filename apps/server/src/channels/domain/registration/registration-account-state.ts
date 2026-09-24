import type { RegistrationAccountStateValue } from '@kiditem/shared/sales-product';
import type { MallListingState } from '../listing/mall-listing-state';

/**
 * 몰 계정 하나에서 판매 상품의 등록 상태를 정하는 순수 규칙(KID-313 결정 11, W4 KID-320).
 *
 * 근거는 셋뿐이다 — 몰이 보고한 리스팅(`ChannelListing`), 등록성 실행(register · update ·
 * composition_change)의 최신 한 건, 가용성 실행(sold_out · resume)의 최신 한 건. `thumbnail_update` 는
 * 여기 오지 않는다. 우선순위:
 *
 *  1. 살아 있는 등록성 실행이 있으면 그 단계가 상태다(준비 중 · 전송 중 · 확인 대기) — 리스팅이 있어도
 *     지금 고치는 중이라는 사실이 먼저다.
 *  2. 리스팅이 있으면(내린 것도) 등록됨이다 — 몰이 보고한 사실이 fence 의 옛 결과보다 앞선다(카탈로그 import 로만
 *     들어온 리스팅도 등록됨; 내린 리스팅은 `listingActive: false` 로 화면이 "등록됨 · 내림"을 그린다 — 2026-09-23
 *     사용자 결정 "비활성화는 등록된 상태에서 내린 것").
 *  3. 리스팅이 없으면 마지막 등록성 실행이 말한다: 실패 → 실패, 성공 → 등록됨(몰이 아직 안 돌려준
 *     리스팅), 취소 · 없음 → 미등록.
 *
 * 품절은 몰이 보고한 리스팅 상태가 먼저다(fence 가 확인할 때 리스팅 상태를 함께 쓰고, 그 뒤 수집이 몰 사실로
 * 덮어쓴다) — 몰 상태를 모르면(`unknown`) 우리가 마지막으로 보낸 가용성 실행의 성공만 근거가 된다. 재전송 필요는 등록됨일 때만, 마지막 성공 등록성 실행이 얼린 값(상품 · 등록 설정 version, 상세
 * revision id, 대표이미지 자산 id)과 지금 값이 다르면 true 다.
 */

export const LISTING_SHAPING_EXECUTION_KINDS = ['register', 'update', 'composition_change'] as const;
export const AVAILABILITY_EXECUTION_KINDS = ['sold_out', 'resume'] as const;

export type ListingShapingExecution = Readonly<{
  kind: string;
  status: string;
  providerOutcome: string;
}>;

export type FrozenRegistrationFacts = Readonly<{
  targetVersion: number | null;
  productVersion: number | null;
  detailPageRevisionId: string | null;
  representativeImageAssetId: string | null;
}>;

export type CurrentRegistrationFacts = Readonly<{
  targetVersion: number | null;
  productVersion: number;
  detailPageRevisionId: string | null;
  thumbnailAssetId: string | null;
}>;

export type RegistrationAccountInputs = Readonly<{
  hasTarget: boolean;
  /** 몰에 있는 가장 최근 리스팅(내린 것도). 없으면 null. */
  listing: Readonly<{
    /** 몰이 보고한 상태(우리 어휘). */
    state: MallListingState;
    /** 몰에 살아 있는가. */
    active: boolean;
    /** 몰이 품절이라 보고했는가(원문 기준, `listingStatusReportsSoldOut`). */
    soldOut: boolean;
  }> | null;
  /** 가장 최근 등록성 실행. 없으면 null. */
  latestListingShaping: ListingShapingExecution | null;
  /** 가장 최근에 성공한 등록성 실행이 얼린 값. 없으면 null. */
  lastSucceededFrozen: FrozenRegistrationFacts | null;
  /** 가장 최근 가용성 실행. 없으면 null. */
  latestAvailability: Readonly<{ kind: string; status: string }> | null;
  current: CurrentRegistrationFacts;
}>;

export type RegistrationAccountDecision = Readonly<{
  state: RegistrationAccountStateValue;
  soldOut: boolean;
  changedSinceRegistration: boolean;
}>;

export function decideRegistrationAccountState(input: RegistrationAccountInputs): RegistrationAccountDecision {
  const state = decideState(input);
  const registered = state === 'registered';
  return {
    state,
    soldOut: registered && decideSoldOut(input),
    changedSinceRegistration: registered && decideChanged(input.lastSucceededFrozen, input.current),
  };
}

function decideState(input: RegistrationAccountInputs): RegistrationAccountStateValue {
  const live = liveStage(input.latestListingShaping);
  if (live) return live;
  if (input.listing !== null) return 'registered';
  const latest = input.latestListingShaping;
  if (latest?.status === 'failed') return 'failed';
  if (latest?.status === 'succeeded') return 'registered';
  return 'unregistered';
}

function liveStage(execution: ListingShapingExecution | null): RegistrationAccountStateValue | null {
  if (!execution) return null;
  if (execution.status === 'prepared') return 'preparing';
  if (execution.status === 'reconciling') return 'confirming';
  if (execution.status === 'executing') {
    // provider 는 됐다는데 fence 가 아직 못 닫았으면 사람이 같은 상품을 한 번 더 올리지 않게 "확인 대기".
    return execution.providerOutcome === 'succeeded' ? 'confirming' : 'submitting';
  }
  return null;
}

function decideSoldOut(input: RegistrationAccountInputs): boolean {
  if (input.listing && input.listing.state !== 'unknown') return input.listing.soldOut;
  const availability = input.latestAvailability;
  return availability?.status === 'succeeded' && availability.kind === 'sold_out';
}

function decideChanged(frozen: FrozenRegistrationFacts | null, current: CurrentRegistrationFacts): boolean {
  if (!frozen) return false;
  if (frozen.targetVersion !== null && current.targetVersion !== null && current.targetVersion > frozen.targetVersion) return true;
  if (frozen.productVersion !== null && current.productVersion > frozen.productVersion) return true;
  if (frozen.detailPageRevisionId !== null && current.detailPageRevisionId !== frozen.detailPageRevisionId) return true;
  if (frozen.representativeImageAssetId !== null && current.thumbnailAssetId !== frozen.representativeImageAssetId) return true;
  return false;
}
