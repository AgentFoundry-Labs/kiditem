import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { clampProfitabilityMonthCoverage } from '../domain/profitability-month-coverage';
import type { Prisma } from '@prisma/client';

export const MAX_MONTHLY_AD_ALLOCATION_ROWS = 100_000;

export type MonthlyAdAllocationFact = Readonly<{
  channelAccountId: string;
  channelListingId: string;
  masterProductId: string;
  month: string;
  coveredStartDate: string;
  coveredEndDate: string;
  wholeRecipeWeight: number;
  allocatedSpend: number;
  observedTargetDayCount: number;
  mappingGeneration: string;
}>;

export type MonthlyAdAllocationPublication = Readonly<{
  sourceImportRunId: string;
  publicationSequence: string;
  coverageStartDate: string;
  coveredThrough: string;
  capturedAt: string;
  mappingGeneration: string;
  adSourcePolicyHash: string;
  allocations: readonly MonthlyAdAllocationFact[];
}>;

/** Read one immutable, completed Advertising monthly-allocation publication. */
export async function readMonthlyAdAllocationPublication(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceImportRunId: string },
): Promise<MonthlyAdAllocationPublication | null> {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      id: input.sourceImportRunId,
      organizationId: input.organizationId,
      sourceType: 'coupang_ad_profitability',
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      publicationSequence: { not: null },
    },
    select: {
      id: true,
      publicationSequence: true,
      mappingGeneration: true,
      coverageStartDate: true,
      coverageEndDate: true,
      importedAt: true,
      adSourcePolicyHash: true,
      plan: true,
    },
  });
  if (!run) return null;
  if (run.publicationSequence === null || run.mappingGeneration === null
    || !run.coverageStartDate || !run.coverageEndDate || !run.importedAt
    || !run.adSourcePolicyHash || run.publicationSequence <= 0n) {
    return null;
  }
  const rows = await tx.channelAdListingProductMonthlyFact.findMany({
    where: { organizationId: input.organizationId, sourceImportRunId: run.id },
    orderBy: [
      { month: 'asc' },
      { channelAccountId: 'asc' },
      { channelListingId: 'asc' },
      { masterProductId: 'asc' },
    ],
    take: MAX_MONTHLY_AD_ALLOCATION_ROWS + 1,
    select: {
      channelAccountId: true,
      channelListingId: true,
      masterProductId: true,
      month: true,
      coveredStartDate: true,
      coveredEndDate: true,
      wholeRecipeWeight: true,
      allocatedSpend: true,
      observedTargetDayCount: true,
      mappingGeneration: true,
    },
  });
  if (rows.length > MAX_MONTHLY_AD_ALLOCATION_ROWS) {
    throw new Error('SOURCE_FACTS_OVERFLOW');
  }
  const coverageStartDate = calendarDate(run.coverageStartDate);
  const coveredThrough = calendarDate(run.coverageEndDate);
  if (coverageStartDate > coveredThrough) return null;
  const mappingGeneration = run.mappingGeneration.toString();
  const allocations: MonthlyAdAllocationFact[] = [];
  for (const row of rows) {
    const month = calendarDate(row.month);
    const coveredStartDate = calendarDate(row.coveredStartDate);
    const coveredEndDate = calendarDate(row.coveredEndDate);
    const allocatedSpend = Number(row.allocatedSpend);
    const observedDayLimit = inclusiveDayCount(coveredStartDate, coveredEndDate);
    if (row.mappingGeneration.toString() !== mappingGeneration
      || month !== `${coveredStartDate.slice(0, 7)}-01`
      || coveredEndDate.slice(0, 7) !== month.slice(0, 7)
      || coveredStartDate > coveredEndDate
      || row.wholeRecipeWeight <= 0
      || row.observedTargetDayCount <= 0
      || row.observedTargetDayCount > observedDayLimit
      || !Number.isSafeInteger(allocatedSpend)
      || allocatedSpend < 0) {
      return null;
    }
    const frozenSlice = run.plan === null
      ? null
      : findFrozenMonthSlice(run.plan, {
        channelAccountId: row.channelAccountId,
        month: month.slice(0, 7),
        mappingGeneration,
        adSourcePolicyHash: run.adSourcePolicyHash,
      });
    if (run.plan === null) {
      if (coveredStartDate < coverageStartDate || coveredEndDate > coveredThrough) return null;
    } else if (!frozenSlice || frozenSlice.from < coverageStartDate) {
      // A frozen slice may request a closed day the import held back as
      // unreported; the clamped fact coverage below still ends in the window.
      return null;
    }
    const normalizedCoverage = frozenSlice
      ? clampProfitabilityMonthCoverage({
        factFrom: coveredStartDate,
        factTo: coveredEndDate,
        sliceFrom: frozenSlice.from,
        sliceTo: frozenSlice.to,
      })
      : { from: coveredStartDate, to: coveredEndDate, coveredDays: observedDayLimit };
    if (!normalizedCoverage
      || normalizedCoverage.from < coverageStartDate
      || normalizedCoverage.to > coveredThrough) {
      return null;
    }
    allocations.push({
      channelAccountId: row.channelAccountId,
      channelListingId: row.channelListingId,
      masterProductId: row.masterProductId,
      month,
      coveredStartDate: normalizedCoverage.from,
      coveredEndDate: normalizedCoverage.to,
      wholeRecipeWeight: row.wholeRecipeWeight,
      allocatedSpend,
      observedTargetDayCount: Math.min(
        row.observedTargetDayCount,
        normalizedCoverage.coveredDays,
      ),
      mappingGeneration,
    });
  }
  return {
    sourceImportRunId: run.id,
    publicationSequence: run.publicationSequence.toString(),
    coverageStartDate,
    coveredThrough,
    capturedAt: run.importedAt.toISOString(),
    mappingGeneration,
    adSourcePolicyHash: run.adSourcePolicyHash,
    allocations,
  };
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function inclusiveDayCount(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`)
    - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function findFrozenMonthSlice(
  value: Prisma.JsonValue,
  expected: Readonly<{
    channelAccountId: string;
    month: string;
    mappingGeneration: string;
    adSourcePolicyHash: string;
  }>,
): Readonly<{ from: string; to: string }> | null {
  if (!isRecord(value)
    || value.mappingGeneration !== expected.mappingGeneration
    || value.adSourcePolicyHash !== expected.adSourcePolicyHash
    || !Array.isArray(value.accounts)) {
    return null;
  }
  const accounts = value.accounts.filter((account) => isRecord(account)
    && account.channelAccountId === expected.channelAccountId);
  const account = accounts[0];
  if (accounts.length !== 1 || !isRecord(account) || !Array.isArray(account.slices)) return null;
  const slices = account.slices.filter((slice) => isRecord(slice)
    && typeof slice.from === 'string'
    && slice.from.slice(0, 7) === expected.month);
  if (slices.length !== 1) return null;
  const slice = slices[0]!;
  if (!isRecord(slice)
    || typeof slice.from !== 'string'
    || typeof slice.to !== 'string'
    || slice.channelAccountId !== expected.channelAccountId
    || slice.sliceId !== `${expected.channelAccountId}:${slice.from}_${slice.to}`
    || slice.to.slice(0, 7) !== expected.month) {
    return null;
  }
  const coverage = clampProfitabilityMonthCoverage({
    factFrom: slice.from,
    factTo: slice.to,
    sliceFrom: slice.from,
    sliceTo: slice.to,
  });
  return coverage ? { from: coverage.from, to: coverage.to } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
