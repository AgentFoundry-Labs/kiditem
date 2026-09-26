import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { businessDateKey, evidenceCutoffDate, parseBusinessDate, shiftBusinessDateKey } from '@kiditem/shared/common';
import {
  AdTrafficSourcePublishedSchema,
  WING_TRAFFIC_KIND,
  WingTrafficPlanSchema,
  WingTrafficResultSchema,
  type AdTrafficSourceAccountDaily,
  type AdTrafficSourcePublished,
  type WingTrafficPeriodSummary,
  type WingTrafficResult,
} from '@kiditem/shared/advertising-operations';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { readSucceededOperationWindows } from '../../../../common/operation/transaction/succeeded-operation-windows';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AdTrafficReadPort } from '../../../application/port/in/ad-traffic-source.port';

const FIRST_DATE = '0001-01-01';
const LAST_DATE = '9999-12-31';
const RECONCILED_METRICS = ['views', 'cartAdds', 'orders', 'salesQty', 'revenue'] as const;

type PublishedRun = { id: string; startedAt: Date; result: WingTrafficResult };

/**
 * Wing 트래픽 원장 읽기(KID-362). 원장은 성공한 `advertising.wing_traffic` 실행의 결과다: 날짜마다 그 날을 확정한
 * 가장 최근 실행의 계정 요약을 고르고, 창과 정확히 같은 기간 요약이 있으면 일별 합과 대조한다. 실행 표는 실행 계약의
 * 트랜잭션 reader(`readSucceededOperationWindows`)로만 읽는다.
 */
@Injectable()
export class WingTrafficReadRepository implements AdTrafficReadPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    private readonly prisma: PrismaService,
  ) {}

  async readPublished(input: {
    organizationId: string;
    channelAccountId?: string;
    from?: string;
    to?: string;
  }): Promise<AdTrafficSourcePublished> {
    const from = readDate(input.from, 'from');
    const to = readDate(input.to, 'to');
    if (from && to && from > to) throw invalidRange({ from, to });
    return this.prisma.$transaction(async (tx) => {
      const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(tx), {
        organizationId: input.organizationId,
        channel: 'coupang',
        accountId: input.channelAccountId,
      });
      if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
      const runs = (await readSucceededOperationWindows(tx, {
        organizationId: input.organizationId,
        kinds: [WING_TRAFFIC_KIND],
        firstDate: from ?? FIRST_DATE,
        lastDate: to ?? LAST_DATE,
      })).flatMap((row): PublishedRun[] => {
        const plan = WingTrafficPlanSchema.safeParse(row.plan);
        const result = WingTrafficResultSchema.safeParse(row.result);
        return plan.success && result.success && plan.data.channelAccountId === account.id
          ? [{ id: row.id, startedAt: row.startedAt, result: result.data }]
          : [];
      }).sort(newestFirst);
      return publishedOf(account.id, runs, from, to);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

function publishedOf(channelAccountId: string, runs: readonly PublishedRun[], from: string | null, to: string | null): AdTrafficSourcePublished {
  const confirmed = runs.flatMap((run) => run.result.confirmedDates).sort();
  const cutoff = businessDateKey(evidenceCutoffDate());
  const rangeFrom = from ?? confirmed[0] ?? cutoff;
  const rangeTo = to ?? confirmed[confirmed.length - 1] ?? cutoff;
  const targetDates = runs.length === 0 && !from && !to ? [] : datesBetween(rangeFrom, rangeTo);
  const selected = new Map<string, PublishedRun>();
  for (const run of runs) {
    for (const date of run.result.confirmedDates) {
      if (date >= rangeFrom && date <= rangeTo && !selected.has(date)) selected.set(date, run);
    }
  }
  const accountDaily: AdTrafficSourceAccountDaily[] = [];
  for (const date of targetDates) {
    const daily = selected.get(date)?.result.accountDaily.find((entry) => entry.businessDate === date);
    if (daily) accountDaily.push(daily);
  }
  const completed = new Set(accountDaily.map((entry) => entry.businessDate));
  // 창과 정확히 같은 기간 요약만 대조 근거다. 그 뒤 더 새 실행이 창의 날을 바꿨으면 그 요약은 낡았다.
  const exact = runs.find((run) => run.result.periodSummary.startDate === rangeFrom && run.result.periodSummary.endDate === rangeTo) ?? null;
  const periodStale = exact !== null && [...selected.values()].some((run) => newestFirst(run, exact) < 0);
  const periodApplies = exact !== null && !periodStale && completed.size === targetDates.length;
  const periodSummary: WingTrafficPeriodSummary | null = exact ? exact.result.periodSummary : null;
  return AdTrafficSourcePublishedSchema.parse({
    channelAccountId,
    accountDaily,
    periodSummary,
    coverage: {
      from: rangeFrom,
      to: rangeTo,
      targetDays: targetDates.length,
      completedDays: completed.size,
      missingDates: targetDates.filter((date) => !completed.has(date)),
    },
    reconciliation: Object.fromEntries(RECONCILED_METRICS.map((metric) => [metric, {
      // 옛 규칙 그대로: 일별 합은 읽은 날의 합이다. 창을 다 덮는지는 coverage가 말한다.
      dailySum: accountDaily.reduce((sum, entry) => sum + entry[metric], 0),
      periodValue: periodApplies ? exact!.result.periodSummary.accountSummary[metric] : null,
    }])),
  });
}

function newestFirst(left: PublishedRun, right: PublishedRun): number {
  const byStart = right.startedAt.getTime() - left.startedAt.getTime();
  return byStart !== 0 ? byStart : right.id.localeCompare(left.id);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to && dates.length <= 366; date = shiftBusinessDateKey(date, 1)) dates.push(date);
  return dates;
}

function readDate(value: string | undefined, field: string): string | null {
  if (value === undefined) return null;
  const parsed = parseBusinessDate(value);
  if (!parsed || businessDateKey(parsed) !== value) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'traffic_date_invalid', field } });
  }
  return value;
}

function invalidRange(details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'traffic_date_range_invalid', ...details } });
}
