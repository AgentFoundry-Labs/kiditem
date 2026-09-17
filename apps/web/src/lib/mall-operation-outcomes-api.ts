'use client';

import {
  MallOperationOutcomeSummarySchema,
  RecordMallOperationOutcomeRequestSchema,
  mallOperationOutcomeKey,
  type MallOperationOutcomeSummary,
  type RecordMallOperationOutcomeRequest,
} from '@kiditem/shared/mall-operation-outcomes';
import { apiClient } from './api-client';
import { createSecureRandomUuid } from './secure-random-uuid';

const BASE = '/api/channels/mall-operation-outcomes';
const MESSAGE_LIMIT = 200;

/** 기록 한 줄. idempotencyKey 는 비우면 여기서 만든다. */
export type MallOperationOutcomeInput = Omit<RecordMallOperationOutcomeRequest, 'idempotencyKey'> & {
  idempotencyKey?: string;
};

/**
 * 사람이 읽을 요약만 남긴다. 주소창 값(쿼리 — 토큰 · 아이디가 붙곤 한다)은 떼고, 줄바꿈을
 * 접고, 길면 자른다. 개인 정보를 걸러내는 장치는 아니다 — 부르는 쪽이 애초에 넣지 않는다.
 */
export function sanitizeOutcomeMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const cleaned = message
    .replace(/https?:\/\/\S+/g, (url) => url.split(/[?#]/)[0] ?? url)
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > MESSAGE_LIMIT ? `${cleaned.slice(0, MESSAGE_LIMIT - 1)}…` : cleaned;
}

/**
 * 쇼핑몰 에이전트의 관찰 기록 — 로그인 확인 · 로그인 테스트 · 등록 폼 채움의 결과를 한 줄 남긴다.
 *
 * 기록은 관찰이다. 실패해도 로그인 확인 · 등록 흐름을 막지 않는다(에러를 삼킨다). 주문수집 ·
 * 셀피아 전송 · 송장 전송은 Orders 가 가진 사실이라 여기 적지 않는다. 비밀번호 · 아이디 ·
 * 받는 사람 · 주소 · 주문번호는 넣지 않는다 — 개수와 이유 코드가 기록의 본체다. 계약이
 * `.strict()` 라 모르는 키가 섞이면 보내지 않고 버린다.
 *
 * 계정 행을 함께 쓰는 몰(쿠팡직배송 → 로켓)은 여기서 그 행의 채널로 접는다. 읽는 쪽도 같은
 * `mallOperationOutcomeKey` 를 쓰므로 쓴 줄과 읽는 줄이 언제나 같은 키다.
 */
export async function recordMallOperationOutcome(input: MallOperationOutcomeInput): Promise<void> {
  try {
    const body = RecordMallOperationOutcomeRequestSchema.parse({
      ...input,
      idempotencyKey: input.idempotencyKey ?? createSecureRandomUuid(),
      mallKey: mallOperationOutcomeKey(input.mallKey),
      message: sanitizeOutcomeMessage(input.message),
    });
    await apiClient.post(BASE, body, { suppressNetworkErrorLog: true, timeoutMs: 10_000 });
  } catch (error) {
    console.warn('[mall-operation-outcomes] record failed', error);
  }
}

/** 관찰 기록 읽기. 쇼핑몰 에이전트 화면은 `(channels)/_shared/mall-publishing-api.ts` 를 거쳐 부른다. */
export const mallOperationOutcomesApi = {
  summary(days = 7): Promise<MallOperationOutcomeSummary> {
    return apiClient.getParsed(`${BASE}/summary?days=${encodeURIComponent(String(days))}`, MallOperationOutcomeSummarySchema);
  },
};
