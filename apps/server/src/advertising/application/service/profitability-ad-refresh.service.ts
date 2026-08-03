import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ProfitabilityAdReportSlice,
  ProfitabilityAdRefreshNext,
  ProfitabilityAdRefreshPort,
} from '../port/in/profitability-ad-refresh.port';
import {
  PROFITABILITY_AD_REFRESH_REPOSITORY_PORT,
  type ProfitabilityAdRefreshRepositoryPort,
} from '../port/out/repository/profitability-ad-refresh.repository.port';

const EVIDENCE_LOOKBACK_DAYS = 400;
const REFRESH_WINDOW_DAYS = 31;
const SLICE_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
const DEFAULT_PROFITABILITY_TARGET = {
  id: '',
  url: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
  label: '쿠팡 상품별 광고 보고서',
  category: 'advertising',
} as const;

@Injectable()
export class ProfitabilityAdRefreshService implements ProfitabilityAdRefreshPort {
  constructor(
    @Inject(PROFITABILITY_AD_REFRESH_REPOSITORY_PORT)
    private readonly repository: ProfitabilityAdRefreshRepositoryPort,
  ) {}

  async nextSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<ProfitabilityAdRefreshNext> {
    const context = await this.context(input);
    return this.planNext(context);
  }

  async ingestReportSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    sliceId: string;
    report: ProfitabilityAdReportSlice;
  }) {
    const context = await this.context(input);
    const planned = await this.planNext(context);
    if (planned.complete || planned.sliceId !== input.sliceId) {
      throw new ConflictException('profitability_ad_slice_changed');
    }
    if (input.report.expectedRowCount !== input.report.collectedRowCount) {
      throw new UnprocessableEntityException('profitability_ad_report_incomplete');
    }
    if (!sameStrings(planned.businessDates, input.report.businessDates)) {
      throw new UnprocessableEntityException('profitability_ad_report_dates_mismatch');
    }
    const expectedDates = new Set(planned.businessDates);
    if (input.report.rows.some((row) => !expectedDates.has(row.businessDate))) {
      throw new UnprocessableEntityException('profitability_ad_report_row_out_of_range');
    }
    return this.repository.replaceReportSlice({
      organizationId: input.organizationId,
      collectionRunId: input.report.collectionRunId,
      advertiserId: input.report.advertiserId,
      startDate: utcDate(planned.startDate),
      endDate: utcDate(planned.endDate),
      report: input.report,
      observedAt: new Date(),
    });
  }

  async finalizeSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    sliceId: string;
    collectionRunId: string;
    completedTargetCount: number;
  }): Promise<ProfitabilityAdRefreshNext> {
    const context = await this.context(input);
    const planned = await this.planNext(context);
    if (planned.complete) return planned;
    if (planned.sliceId !== input.sliceId || !SLICE_PATTERN.test(input.sliceId)) {
      throw new ConflictException('profitability_ad_slice_changed');
    }
    if (input.completedTargetCount !== planned.targets.length) {
      throw new UnprocessableEntityException('profitability_ad_targets_incomplete');
    }
    const markerComplete = await this.repository.hasCompleteCollectionMarker({
      organizationId: input.organizationId,
      collectionRunId: input.collectionRunId,
      startedAt: context.startedAt,
      startDate: planned.startDate,
      endDate: planned.endDate,
      expectedTargetCount: planned.targets.length,
    });
    if (!markerComplete) {
      throw new UnprocessableEntityException('profitability_ad_collection_incomplete');
    }
    await this.repository.publishSlice({
      organizationId: input.organizationId,
      startDate: utcDate(planned.startDate),
      endDate: utcDate(planned.endDate),
      observedAt: new Date(),
    });
    return this.nextSlice(input);
  }

  async finalizeRun(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<Extract<ProfitabilityAdRefreshNext, { complete: true }>> {
    const result = await this.nextSlice(input);
    if (!result.complete) throw new ConflictException('profitability_ad_refresh_incomplete');
    return result;
  }

  private async context(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }) {
    const run = await this.repository.findClaimedRun(input);
    if (!run) throw new ConflictException('browser_runtime_fence_lost');
    const cutoffDate = yesterdayKst();
    const startDate = addDays(cutoffDate, -EVIDENCE_LOOKBACK_DAYS);
    const activeListingCount = await this.repository.countActiveListings(input.organizationId);
    const targets = [DEFAULT_PROFITABILITY_TARGET];
    const coverage = activeListingCount === 0
      ? []
      : await this.repository.listCoverageDays({
          organizationId: input.organizationId,
          startDate: utcDate(startDate),
          endDate: utcDate(cutoffDate),
        });
    return { ...input, ...run, cutoffDate, startDate, activeListingCount, targets, coverage };
  }

  private async planNext(context: Awaited<ReturnType<ProfitabilityAdRefreshService['context']>>): Promise<ProfitabilityAdRefreshNext> {
    const businessDates = inclusiveDates(context.startDate, context.cutoffDate);
    if (context.activeListingCount === 0) {
      return completed(context.startDate, context.cutoffDate, businessDates.length);
    }
    const evidence = new Map(context.coverage.map((row) => [calendarDate(row.businessDate), row]));
    const refreshStart = addDays(context.cutoffDate, -(REFRESH_WINDOW_DAYS - 1));
    const due = businessDates.map((date) => {
      const row = evidence.get(date);
      const hasCompleteCoverage =
        row?.authoritativeListingCount === context.activeListingCount;
      const needsInitialCoverage = !hasCompleteCoverage;
      const needsCorrectionRefresh = date >= refreshStart && (
        !hasCompleteCoverage || !row || row.oldestObservedAt < context.startedAt
      );
      return needsInitialCoverage || needsCorrectionRefresh;
    });
    // The operator-facing ABC and strategy views need current advertising
    // evidence before their historical calibration backfill.  Work from the
    // newest missing business day, then consume that calendar month before
    // moving backwards through older months.  A report still carries every
    // day in its selected month, so existing days are corrected atomically.
    const firstDueIndex = latestDueIndex(due);
    const completedDayCount = due.filter((value) => !value).length;
    if (firstDueIndex < 0) {
      return completed(context.startDate, context.cutoffDate, businessDates.length);
    }
    const firstDate = businessDates[firstDueIndex]!;
    const firstMonth = firstDate.slice(0, 7);
    const monthDates = businessDates
      .filter((date) => date.startsWith(firstMonth));
    const startDate = monthDates[0]!;
    const endDate = monthDates[monthDates.length - 1]!;
    return {
      complete: false,
      sliceId: `${startDate}_${endDate}`,
      startDate,
      endDate,
      businessDates: monthDates,
      targets: context.targets,
      completedDayCount,
      totalDayCount: businessDates.length,
    };
  }
}

function latestDueIndex(due: readonly boolean[]): number {
  for (let index = due.length - 1; index >= 0; index -= 1) {
    if (due[index]) return index;
  }
  return -1;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function completed(startDate: string, endDate: string, totalDayCount: number) {
  return {
    complete: true as const,
    coverageStartDate: startDate,
    coverageEndDate: endDate,
    completedDayCount: totalDayCount,
    totalDayCount,
  };
}

function yesterdayKst(now = new Date()): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return calendarDate(new Date(Date.UTC(
    seoul.getUTCFullYear(),
    seoul.getUTCMonth(),
    seoul.getUTCDate() - 1,
  )));
}

function inclusiveDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let date = utcDate(startDate); date <= utcDate(endDate); date = addUtcDays(date, 1)) {
    dates.push(calendarDate(date));
  }
  return dates;
}

function addDays(date: string, days: number): string {
  return calendarDate(addUtcDays(utcDate(date), days));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
