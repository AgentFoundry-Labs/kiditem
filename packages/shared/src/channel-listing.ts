export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from './operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from './operation-lifecycle.js';

/**
 * 판매중 정본 규칙(KID-333 ②·KID-369, 사장님 2026-09-29 17:0x "추천대로" Q1 (a)). 모든 화면·ABC·매칭 카드·대시보드가
 * 같은 판정을 쓴다 — Channels가 리더로 제공하고 Products·Analytics는 그 포트를 소비한다.
 *
 * 리스팅이 **판매중**이려면 셋 다 참이어야 한다:
 *  1. `isActive` — 우리가 켜 둔 리스팅.
 *  2. 리스팅 상태가 게시 집합(`ON_SALE_LISTING_STATUSES`)에 있다 — 몰 원문(승인완료·on_sale·partial_on_sale·사방넷 공급중·판매중…).
 *  3. 몰 원본 판매상태(rawJson)가 있으면 그것도 판매중이어야 한다 — 쿠팡 `승인완료`인데 원본 `판매중지`인 리스팅은 판매중이 아니다.
 * 옵션 상태가 있고 모두 알아본 값이 판매 중지면 판매중이 아니다. 모르는 상태(`단종`·`observed`·`미확인`·`REJECTED` 등)는
 * **판매중이 아니다**(옛 규칙은 `isActive`면 판매중으로 쳤다 — 로컬 실측에서 로켓 단종 42·observed 165가 판매중으로 잡히던 원인).
 * 스냅샷 판매상태 칸은 아무도 채우지 않아(KID-369) 입력에서 뺐다.
 */
export type ChannelListingSaleStatusInput = {
  rawStatus?: string | null;
  optionStatuses?: readonly (string | null | undefined)[];
  listingStatus?: string | null;
  isActive: boolean;
};

export const CHANNEL_LISTING_SALE_STATES = ['on_sale', 'off_sale', 'unknown'] as const;
export type ChannelListingSaleState = (typeof CHANNEL_LISTING_SALE_STATES)[number];

/** 게시(판매중) 상태 — 몰·적재 파일·Wing API·사방넷·몰 관리자 목록이 주는 글자를 소문자로 맞춰 비교한다. */
const ON_SALE_LISTING_STATUSES = new Set([
  'active', 'on_sale', 'partial_on_sale', 'sale', 'selling', 'true', 'approved', 'published',
  '활성', '판매 중', '판매중', '승인완료', '사방넷 공급중',
]);

const OFF_SALE_LISTING_STATUSES = new Set([
  'inactive', 'off_sale', 'stopped', 'suspended', 'paused', 'soldout', 'sold_out', 'out_of_stock', 'hidden', 'held',
  'discontinued', 'deleted', 'rejected', 'ended',
  '비활성', '판매 중지', '판매중지', '품절', '단종', '승인반려', '판매종료', '미노출', '보류',
  '사방넷 일시중지', '사방넷 완전품절',
]);

function normalizeStatus(status: string | null | undefined): string | null {
  const value = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return value ? value : null;
}

/** 한 상태 글자의 판정. 모르는 글자는 `unknown`. */
export function classifyChannelListingSaleStatus(status: string | null | undefined): ChannelListingSaleState {
  const normalized = normalizeStatus(status);
  if (normalized === null) return 'unknown';
  if (ON_SALE_LISTING_STATUSES.has(normalized)) return 'on_sale';
  if (OFF_SALE_LISTING_STATUSES.has(normalized)) return 'off_sale';
  return 'unknown';
}

/** 정본 판정 — 위 세 조건. `unknown`은 판매중이 아니지만 화면이 "모름"으로 따로 보일 수 있게 구분해 돌려준다. */
export function resolveChannelListingSaleState(input: ChannelListingSaleStatusInput): ChannelListingSaleState {
  if (!input.isActive) return 'off_sale';
  const listing = classifyChannelListingSaleStatus(input.listingStatus);
  if (listing === 'off_sale') return 'off_sale';
  const raw = classifyChannelListingSaleStatus(input.rawStatus);
  if (raw === 'off_sale') return 'off_sale';
  const options = (input.optionStatuses ?? []).map(classifyChannelListingSaleStatus).filter((state) => state !== 'unknown');
  if (options.length > 0 && options.every((state) => state === 'off_sale')) return 'off_sale';
  if (listing === 'on_sale' && raw !== 'unknown') return 'on_sale';
  if (listing === 'on_sale' && normalizeStatus(input.rawStatus) === null) return 'on_sale';
  return 'unknown';
}

export function isChannelListingSelling(input: ChannelListingSaleStatusInput): boolean {
  return resolveChannelListingSaleState(input) === 'on_sale';
}
