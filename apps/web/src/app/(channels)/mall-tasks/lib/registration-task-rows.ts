import { findChannel } from '@kiditem/shared/channel-registry';
import type { RegistrationExecutionKind } from '@kiditem/shared/channels-operations';
import type { OperationView } from '@kiditem/shared/operation';
import { describeRegistrationOperation, type RegistrationOperationState } from '../../_shared/registration-operation';

/** `/mall-tasks` 표의 한 줄 — 등록 실행(`channels.registration`) 하나. 상태 말은 등록 실행 표 하나를 쓴다. */
export interface RegistrationTaskRow {
  id: string;
  startedAt: string | Date;
  mallName: string;
  kindLabel: string;
  target: string;
  state: RegistrationOperationState;
  stateLabel: string;
  summary: string;
}

const KIND_LABEL: Record<RegistrationExecutionKind, string> = {
  register: '등록',
  update: '수정',
  composition_change: '구성 변경',
  sold_out: '품절',
  resume: '판매 재개',
  thumbnail_update: '대표이미지',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function targetOf(plan: Record<string, unknown> | null): string {
  if (!plan) return '—';
  // 묶음 품절·재개: 서버 plan이 풀어 얼린 리스팅 목록(`payload.listings`).
  const payload = plan.payload && typeof plan.payload === 'object' ? plan.payload as Record<string, unknown> : null;
  if (Array.isArray(payload?.listings)) return `리스팅 ${payload.listings.length}개`;
  const listing = text(plan.externalListingId);
  if (listing) return `몰 상품 ${listing}`;
  const id = text(plan.registrationTargetId) ?? text(plan.salesProductId) ?? text(plan.channelListingId);
  return id ? id.slice(0, 8) : '—';
}

export function registrationTaskRow(operation: OperationView): RegistrationTaskRow {
  const read = describeRegistrationOperation(operation);
  const plan = operation.plan;
  const mallKey = text(plan?.mallKey);
  const kind = text(plan?.executionKind) as RegistrationExecutionKind | null;
  const result = read.result;
  const summary = read.message
    ?? (result && !result.submitted && read.state === 'confirmed'
      ? `폼만 채움${result.submitSkipped ? ` — ${result.submitSkipped}` : ''}`
      : result?.externalListingId
        ? `등록상품ID ${result.externalListingId}`
        : read.state === 'needs_confirmation'
          ? '몰에서 결과를 확인해 주세요.'
          : '');
  return {
    id: operation.id,
    startedAt: operation.startedAt,
    mallName: mallKey ? findChannel(mallKey)?.name ?? mallKey : '—',
    kindLabel: kind && KIND_LABEL[kind] ? KIND_LABEL[kind] : '등록 실행',
    target: targetOf(plan),
    state: read.state,
    stateLabel: read.label,
    summary,
  };
}

/**
 * 목록 폴링 주기. 도는 실행이 있을 때만 10초마다 한 번 목록 하나를 읽는다 — 분당 6회(탭 하나). 확인 필요는 사람이
 * 닫을 때까지 바뀌지 않으므로 폴링하지 않는다.
 */
export function registrationTasksPollMs(operations: readonly OperationView[]): number | false {
  return operations.some((operation) => operation.status === 'prepared' || operation.status === 'executing') ? 10_000 : false;
}
