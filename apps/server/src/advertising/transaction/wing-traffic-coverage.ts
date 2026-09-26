import type { Prisma } from '@prisma/client';
import {
  WING_TRAFFIC_KIND,
  WingTrafficPlanSchema,
  WingTrafficResultSchema,
  type AdTrafficSourceAccountDaily,
  type WingTrafficPeriodSummary,
} from '@kiditem/shared/advertising-operations';
import { readSucceededOperationWindows } from '../../common/operation/transaction/succeeded-operation-windows';

/** 성공한 Wing 트래픽 실행 하나가 확정한 것(Advertising이 해석한 모양 — 소비자는 plan·result JSON을 읽지 않는다). */
export interface WingTrafficConfirmedRun {
  operationId: string;
  channelAccountId: string;
  /** 이 실행이 확정한 날짜(오름차순). */
  confirmedDates: readonly string[];
  /** Wing이 0개라고 답한 확정 날짜. */
  providerBackedEmptyDates: readonly string[];
  /** 날짜마다 그 실행의 카탈로그에 맞지 않은 Wing 옵션 id(KID-217). */
  unmatchedOptionIdsByDate: Readonly<Record<string, readonly string[]>>;
  accountDaily: readonly AdTrafficSourceAccountDaily[];
  periodSummary: WingTrafficPeriodSummary;
  /** 실행이 시작된 시각 — owner의 0 채우기 기준과 같은 plan 시각이다. */
  startedAt: Date;
  finishedAt: Date;
}

/**
 * 호출자 트랜잭션 안에서 도는 평범한 함수(`<owner>/transaction/` 규칙, KID-362). 업무일 창 [from, to]와 겹치는
 * 성공한 `advertising.wing_traffic` 실행을 계정별로 읽는다. Channels의 트래픽 창과 Advertising의 원장 읽기가 같은
 * 해석을 쓴다. 날짜는 KST 달력 키(`YYYY-MM-DD`), 없으면 열린 끝이다.
 */
export async function readWingTrafficConfirmedRuns(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; accountIds?: readonly string[]; from?: string; to?: string }>,
): Promise<WingTrafficConfirmedRun[]> {
  if (input.accountIds?.length === 0) return [];
  const accounts = input.accountIds ? new Set(input.accountIds) : null;
  const rows = await readSucceededOperationWindows(tx, {
    organizationId: input.organizationId,
    kinds: [WING_TRAFFIC_KIND],
    firstDate: input.from ?? '0001-01-01',
    lastDate: input.to ?? '9999-12-31',
  });
  return rows.flatMap((row): WingTrafficConfirmedRun[] => {
    const plan = WingTrafficPlanSchema.safeParse(row.plan);
    const result = WingTrafficResultSchema.safeParse(row.result);
    if (!plan.success || !result.success) return [];
    if (accounts && !accounts.has(plan.data.channelAccountId)) return [];
    return [{
      operationId: row.id,
      channelAccountId: plan.data.channelAccountId,
      confirmedDates: [...new Set(result.data.confirmedDates)].sort(),
      providerBackedEmptyDates: result.data.providerBackedEmptyDates,
      unmatchedOptionIdsByDate: result.data.unmatchedOptionIdsByDate,
      accountDaily: result.data.accountDaily,
      periodSummary: result.data.periodSummary,
      startedAt: new Date(plan.data.startedAt),
      finishedAt: row.finishedAt ?? row.startedAt,
    }];
  });
}
