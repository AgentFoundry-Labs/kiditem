'use client';

import { z } from 'zod';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { invalidateSourcingReads, isLiveOperation, sourcingOperationCollection } from './sourcing-operations';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';

export const WING_ACCOUNT_MISSING = '쿠팡 윙 계정을 먼저 연결해 주세요.';

const PURPOSE_LABELS: Readonly<Record<string, string>> = {
  catalog_search: '카탈로그 검색',
  tracked_metrics: '추적 지표',
  market_analysis: '시장분석',
  recommendation_validation: '추천 검증',
};

const WingPlanSchema = z.object({
  keywords: z.array(z.string()),
  maxPages: z.number(),
  purpose: z.string(),
}).passthrough();

/**
 * 화면이 보는 Wing 검색 소싱 한 번(`sourcing.wing_catalog` 실행). 상태는 옛 attempt 말로 옮긴다 — 중단은
 * `*_CANCELLED` 코드의 FAILED라 `stoppedAttempt`·`attemptFailureText`가 그대로 읽는다.
 */
export type WingCatalogAttempt = Readonly<{
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: z.infer<typeof WingPlanSchema>;
  errorCode: string | null;
  errorMessage: string | null;
}>;

export type WingCatalogAccount = Pick<ChannelAccountListItem, 'id' | 'name'>;

/**
 * Wing 검색에 쓸 계정: 조직의 쿠팡 계정 중 대표 계정, 없으면 이름순 첫 계정(카탈로그 동기화·상품평과 같은 규칙).
 * 계정 선택 UI는 없다.
 */
export function pickWingSearchAccount(accounts: readonly ChannelAccountListItem[] | undefined): WingCatalogAccount | null {
  const coupang = (accounts ?? []).filter((account) => account.channel === 'coupang');
  const [first] = [...coupang].sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name, 'ko'));
  return first ? { id: first.id, name: first.name } : null;
}

export function toWingCatalogAttempt(operation: OperationView | null): WingCatalogAttempt | null {
  if (!operation) return null;
  const plan = WingPlanSchema.safeParse(operation.plan);
  if (!plan.success) return null;
  return {
    attemptId: operation.id,
    state: isLiveOperation(operation) ? 'RUNNING' : operation.status === 'succeeded' ? 'COMPLETE' : 'FAILED',
    plan: plan.data,
    errorCode: operation.errorCode,
    errorMessage: operation.errorMessage,
  };
}

/** 조직의 마지막 Wing 검색 소싱(계정·용도 무관 — 발행 대상 'catalog'는 조직에 하나다). */
export function latestWingCatalogAttempt(status: OperationListResponse | undefined): WingCatalogAttempt | null {
  return toWingCatalogAttempt(status?.operations[0] ?? null);
}

export function wingCatalogScopeLabel(plan: WingCatalogAttempt['plan'], accountName?: string | null): string {
  const [first, ...rest] = plan.keywords;
  const keywords = first ? (rest.length > 0 ? `${first} 외 ${rest.length}개` : first) : '';
  return [PURPOSE_LABELS[plan.purpose] ?? plan.purpose, keywords, accountName ?? '']
    .filter(Boolean)
    .join(' · ');
}

/**
 * 소싱 Wing 검색(`sourcing.wing_catalog`, KID-360)을 공용 컨트롤에 건다. 화면이 키워드·쪽수·용도를 주고, 계정은
 * `pickWingSearchAccount`가 고른 것을 scope에 싣는다(잠금 `account:<id>` — 그 계정의 카탈로그 동기화와 서로 막는다).
 * 완료는 소싱 읽기만 다시 읽는다 — 추천·검증은 각자의 명시적 버튼이 다시 계산한다.
 */
export function sourcingWingCatalogCollection(
  account: WingCatalogAccount | null,
): CollectionSourceAdapter<OperationListResponse, SourcingWingCatalogBatchInput> {
  return sourcingOperationCollection<SourcingWingCatalogBatchInput>({
    kind: SOURCING_OPERATION_KINDS.wingCatalog,
    sourceKey: SOURCING_OPERATION_KINDS.wingCatalog,
    label: 'Wing 카탈로그 수집',
    scope: (input) => {
      if (!account) throw new Error(WING_ACCOUNT_MISSING);
      return { ...input, channelAccountId: account.id };
    },
    scopeLabel: (operation) => {
      const attempt = toWingCatalogAttempt(operation);
      if (!attempt) return null;
      const accountName = operation.plan?.channelAccountId === account?.id ? account?.name : null;
      return wingCatalogScopeLabel(attempt.plan, accountName);
    },
    onNewComplete: invalidateSourcingReads,
  });
}
