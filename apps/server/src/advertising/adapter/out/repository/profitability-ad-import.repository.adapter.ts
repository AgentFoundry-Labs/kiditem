import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import { deriveSourceReadiness } from '@kiditem/shared/source-readiness';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { resolveCoupangVendorId } from '../../../../channels/domain/coupang-account-identity';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import {
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  inclusiveDayCount,
  kstMonthEnd,
  kstMonthRange,
  parseBusinessDate,
  shiftBusinessDateKey,
} from '../../../../common/kst';
import {
  effectiveSourceImportRunState as effectiveState,
  sourceImportRunDbState as sourceDbState,
} from './source-import-run-state';
import { readMonthlyAdAllocationPublication } from '../../../read/monthly-ad-allocation.reader';
import type {
  AdvertisingProfitabilityGeneration,
  AdvertisingProfitabilityPlan,
  AdvertisingProfitabilityProviderRow,
  AdvertisingProfitabilitySliceUpload,
  AdvertisingProfitabilitySourceSnapshot,
  AdvertisingProfitabilitySourceView,
} from '../../../application/port/in/profitability-ad-import.port';
import type { AttemptFence } from '../../../application/port/in/profitability-ad-import.port';
import type { ProfitabilityAdImportRepositoryPort } from '../../../application/port/out/repository/profitability-ad-import.repository.port';
import { clampProfitabilityMonthCoverage } from '../../../domain/profitability-month-coverage';
import {
  adReportEvidenceCutoff,
  confirmedAdReportEnd,
  type ObservedDaySpend,
} from '../../../domain/ad-report-confirmation';

export const PROFITABILITY_SOURCE_TYPE = 'coupang_ad_profitability';
export const PROFITABILITY_PARSER_VERSION = 'profitability-report-v1';
export const PROFITABILITY_REPORT_URL =
  'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa';
export const PROFITABILITY_ATTEMPT_TTL_MS = 30 * 60_000;
export const PROFITABILITY_TRANSACTION_TIMEOUT_MS = 30_000;
export const PROFITABILITY_ALERT_DEDUPE_KEY = 'source:coupang-ad-profitability';
export const PROFITABILITY_RECIPE_POLICY_VERSION = 'WHOLE_RECIPE_QUANTITY_V1';
export const PROFITABILITY_ALLOCATION_POLICY = 'INTEGER_KRW_LARGEST_REMAINDER';
export const PROFITABILITY_ALLOCATION_TIE_BREAK =
  'MASTER_PRODUCT_ID_ASC_LOWERCASE';
const MAX_SNAPSHOT_GENERATIONS = 12;
const PROFITABILITY_EVALUATION_MONTH_COUNT = 12;
const MAX_REPORT_COUNT = 100_000;
const MAX_RESPONSE_BYTES = 50_000_000;
const INSERT_CHUNK_SIZE = 1_000;
const SOURCE_DB_RUNNING = 'running';
const SOURCE_DB_COMPLETE = 'completed';
const SOURCE_DB_FAILED = 'failed';
const SOURCE_STATE_RUNNING = 'RUNNING';
const SOURCE_STATE_FAILED = 'FAILED';
const RECEIPT_DB_RUNNING = 'running';
const RECEIPT_DB_COMPLETE = 'complete';
const RECEIPT_STATE_COMPLETE = 'COMPLETE';
const INT4_MAX = 2_147_483_647;
const MAX_SAFE_KRW_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

type RecipeShare = Readonly<{
  masterProductId: string;
  weight: number;
}>;

/**
 * Deterministic whole-KRW largest-remainder allocation. The sort uses
 * lower-case byte ordering rather than locale ordering so a bundle produces
 * the same result on every server locale.
 */
export function allocateIntegerKrw(
  totalSpend: number,
  recipe: readonly RecipeShare[],
): Array<{ masterProductId: string; allocatedSpend: number }> {
  if (!Number.isSafeInteger(totalSpend) || totalSpend < 0) {
    throw new UnprocessableEntityException('ADVERTISING_SPEND_INVALID');
  }
  const unique = new Map<string, number>();
  for (const share of recipe) {
    if (!share.masterProductId || !Number.isSafeInteger(share.weight) || share.weight <= 0) {
      throw new UnprocessableEntityException('ADVERTISING_RECIPE_INVALID');
    }
    const weight = (unique.get(share.masterProductId) ?? 0) + share.weight;
    if (!Number.isSafeInteger(weight) || weight > INT4_MAX) {
      throw new UnprocessableEntityException('ADVERTISING_RECIPE_INVALID');
    }
    unique.set(share.masterProductId, weight);
  }
  const normalized = [...unique.entries()]
    .map(([masterProductId, weight]) => ({ masterProductId, weight }));
  if (normalized.length === 0) {
    throw new UnprocessableEntityException('ADVERTISING_RECIPE_INVALID');
  }
  const totalWeight = normalized.reduce((sum, share) => sum + BigInt(share.weight), 0n);
  const allocations = normalized.map((share) => {
    const numerator = BigInt(totalSpend) * BigInt(share.weight);
    return {
      masterProductId: share.masterProductId,
      amount: Number(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });
  let remaining = totalSpend - allocations.reduce((sum, share) => sum + share.amount, 0);
  allocations.sort((left, right) =>
    right.remainder > left.remainder ? 1
      : right.remainder < left.remainder ? -1
        : compareLowercase(left.masterProductId, right.masterProductId));
  for (let index = 0; remaining > 0; index += 1) {
    allocations[index % allocations.length]!.amount += 1;
    remaining -= 1;
  }
  return allocations
    .sort((left, right) => compareLowercase(left.masterProductId, right.masterProductId))
    .map(({ masterProductId, amount }) => ({ masterProductId, allocatedSpend: amount }));
}

type StoredSlice = Readonly<{
  sliceId: string;
  channelAccountId: string;
  from: string;
  to: string;
  businessDates: readonly string[];
}>;

type CoveragePeriod = Readonly<{
  month: string;
  from: string;
  to: string;
  businessDates: readonly string[];
}>;

type ProfitabilityCoverage = Readonly<{
  months: readonly string[];
  from: string;
  to: string;
  periods: readonly CoveragePeriod[];
}>;

type StoredPlan = Readonly<{
  mappingGeneration: string;
  adSourcePolicyHash: string;
  accounts: readonly {
    channelAccountId: string;
    externalAccountId: string;
    expectedAdvertiserId: string;
    slices: readonly StoredSlice[];
  }[];
}>;

type ApplicableAccountProof = Readonly<{
  channelAccountId: string;
  externalAccountId: string;
  expectedAdvertiserId: string;
}>;

type SourceAttempt = Prisma.SourceImportRunGetPayload<{}>;
type Receipt = Prisma.ChannelScrapeRunGetPayload<{}>;
type Target = Prisma.ChannelAdTargetDailySnapshotGetPayload<{}>;
type MonthlyFact = Prisma.ChannelAdListingProductMonthlyFactGetPayload<{}>;
type GenerationMonthlyFact = Pick<MonthlyFact,
  'channelAccountId'
  | 'channelListingId'
  | 'masterProductId'
  | 'month'
  | 'coveredStartDate'
  | 'coveredEndDate'
  | 'wholeRecipeWeight'
  | 'allocatedSpend'
  | 'observedTargetDayCount'
  | 'mappingGeneration'>;
type Transaction = Prisma.TransactionClient;
type TargetAllocationStatus = 'ALLOCATABLE' | 'UNMATCHED' | 'UNALLOCATABLE';
type TargetAllocationSummary = Readonly<{
  matchedTargetCount: number;
  unmatchedTargetCount: number;
  allocatableTargetCount: number;
  unallocatableTargetCount: number;
  providerSpendKrw: bigint;
  allocatedSpendKrw: bigint;
  unmatchedSpendKrw: bigint;
  unallocatableSpendKrw: bigint;
}>;

@Injectable()
export class ProfitabilityAdImportRepositoryAdapter
  implements ProfitabilityAdImportRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<AdvertisingProfitabilityPlan> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const existing = await findAttemptByIdempotency(tx, input.organizationId, input.idempotencyKey);
      if (existing) {
        assertIdempotencyFingerprint(existing);
        if (sourceDbState(existing.status) === SOURCE_DB_RUNNING
          && existing.expiresAt
          && existing.expiresAt.getTime() <= now.getTime()) {
          await this.expireAttempt(tx, existing);
        }
        return publicPlan(existing);
      }

      const expired = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_RUNNING,
          expiresAt: { lte: now },
        },
      });
      if (expired) await this.expireAttempt(tx, expired);

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_RUNNING,
        },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: running.id,
        });
      }

      await lockProductMapping(tx, input.organizationId);
      const mappingGeneration = await readMappingGeneration(tx, input.organizationId);
      const accounts = await readApplicableAccounts(tx, input.organizationId);
      const coverage = profitabilityCoverageForKstYesterday(now);
      const storedPlan = buildStoredPlan(accounts, coverage, mappingGeneration);
      const attemptToken = randomUUID();
      const expiresAt = new Date(now.getTime() + PROFITABILITY_ATTEMPT_TTL_MS);
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_RUNNING,
          attemptToken,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: hashJson({
            sourceType: PROFITABILITY_SOURCE_TYPE,
            parserVersion: PROFITABILITY_PARSER_VERSION,
            plan: storedPlan,
          }),
          expiresAt,
          plan: storedPlan,
          parserVersion: PROFITABILITY_PARSER_VERSION,
          mappingGeneration,
          adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
          rowCount: storedPlan.accounts.reduce((count, account) => count + account.slices.length, 0),
          coveredMonths: [...coverage.months],
          coverageStartDate: dateOnly(coverage.from),
          coverageEndDate: dateOnly(coverage.to),
          qualityReport: initialQualityReport(storedPlan, coverage.months),
        },
      });

      const listings = await this.listFrozenListings(tx, input.organizationId, accounts.map((account) => account.channelAccountId));
      const facts = freezeMonthlyFacts(
        input.organizationId,
        run.id,
        mappingGeneration,
        coverage.periods,
        listings,
      );
      for (let offset = 0; offset < facts.length; offset += INSERT_CHUNK_SIZE) {
        await tx.channelAdListingProductMonthlyFact.createMany({
          data: facts.slice(offset, offset + INSERT_CHUNK_SIZE),
        });
      }
      for (const account of storedPlan.accounts) {
        for (const slice of account.slices) {
          await tx.channelScrapeRun.create({
            data: {
              organizationId: input.organizationId,
              channelAccountId: account.channelAccountId,
              clientRunKey: randomUUID(),
              sourceImportRunId: run.id,
              channel: 'coupang',
              source: 'advertising',
              pageType: 'profitability',
              periodStart: dateOnly(slice.from),
              periodEnd: dateOnly(slice.to),
              status: RECEIPT_DB_RUNNING,
              targetUrl: PROFITABILITY_REPORT_URL,
              period: 'custom',
              parserVersion: PROFITABILITY_PARSER_VERSION,
              metaJson: {
                sourceType: PROFITABILITY_SOURCE_TYPE,
                sliceId: slice.sliceId,
                expectedAdvertiserId: account.expectedAdvertiserId,
                expectedExternalAccountId: account.externalAccountId,
                businessDates: slice.businessDates,
              },
            },
          });
        }
      }
      return publicPlan(run);
    }, mutationTransactionOptions());
  }

  async readSourceStatus(input: {
    organizationId: string;
  }): Promise<AdvertisingProfitabilitySourceView> {
    return this.prisma.$transaction(async (tx) => {
      const latestAttempt = await latestAttemptForOrganization(tx, input.organizationId);
      const candidate = await latestCompleteAttempt(tx, input.organizationId);
      const applicableAccounts = candidate
        ? await readApplicableAccountProof(tx, input.organizationId)
        : null;
      const latestComplete = candidate && applicableAccounts
        && sameApplicableAccountProof(parseStoredPlan(candidate.plan).accounts, applicableAccounts)
          ? candidate
          : null;
      return sourceView(latestAttempt, latestComplete, new Date());
    }, snapshotTransactionOptions());
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdvertisingProfitabilityPlan | null> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
        },
      });
      if (!attempt) return null;
      const state = effectiveState(attempt, new Date());
      if (state !== SOURCE_STATE_RUNNING) {
        throw new ConflictException(
          sourceDbState(attempt.status) === SOURCE_DB_RUNNING
            ? 'ATTEMPT_EXPIRED'
            : 'ATTEMPT_TERMINAL',
        );
      }
      return publicPlan(attempt);
    }, snapshotTransactionOptions());
  }

  async uploadSlice(
    input: AdvertisingProfitabilitySliceUpload,
  ): Promise<{ replayed: boolean }> {
    assertChecksum(input.checksum);
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      assertWritable(attempt);
      await assertMappingGeneration(tx, attempt);
      const plan = parseStoredPlan(attempt.plan);
      const expected = findSlice(plan, input.sliceId);
      if (!expected) throw new UnprocessableEntityException('ADVERTISING_SLICE_NOT_PLANNED');
      const account = plan.accounts.find(({ channelAccountId }) => channelAccountId === expected.channelAccountId);
      if (!account || input.providerAdvertiserId !== account.expectedAdvertiserId) {
        throw new UnprocessableEntityException('ADVERTISER_IDENTITY_MISMATCH');
      }
      await assertAccountIdentity(tx, input.organizationId, account);
      const receipt = await tx.channelScrapeRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: attempt.id,
          channelAccountId: expected.channelAccountId,
          source: 'advertising',
          pageType: 'profitability',
          periodStart: dateOnly(expected.from),
          periodEnd: dateOnly(expected.to),
        },
      });
      if (!receipt) throw new ConflictException('ADVERTISING_RECEIPT_NOT_PLANNED');

      const normalizedRows = canonicalProviderRows(input.rows);
      if (!validReportProofFields(input, normalizedRows.length)) {
        throw new UnprocessableEntityException('INVALID_PROFITABILITY_REPORT_PROOF');
      }
      const checksum = input.checksum.toLowerCase();
      if (checksum !== canonicalProviderRowsChecksum(normalizedRows)) {
        throw new UnprocessableEntityException('ADVERTISING_CHECKSUM_MISMATCH');
      }
      const payloadHash = hashJson({
        sequence: input.sequence,
        checksum,
        providerAdvertiserId: input.providerAdvertiserId,
        reportId: input.reportId,
        campaignCount: input.campaignCount,
        expectedRowCount: input.expectedRowCount,
        collectedRowCount: input.collectedRowCount,
        responseBytes: input.responseBytes,
        rows: normalizedRows,
      });
      const existingPayload = receiptPayload(receipt.metaJson);
      if (receipt.status.toUpperCase() === RECEIPT_STATE_COMPLETE) {
        if (!sameReceiptPayload(existingPayload, {
          sourceType: PROFITABILITY_SOURCE_TYPE,
          sliceId: expected.sliceId,
          sequence: input.sequence,
          checksum,
          providerAdvertiserId: input.providerAdvertiserId,
          payloadHash,
          reportId: input.reportId,
          campaignCount: input.campaignCount,
          expectedRowCount: input.expectedRowCount,
          collectedRowCount: input.collectedRowCount,
          responseBytes: input.responseBytes,
        })) {
          throw new ConflictException('RECEIPT_REPLAY_CONFLICT');
        }
        return { replayed: true };
      }
      if (existingPayload.payloadHash && !sameReceiptPayload(existingPayload, {
        sourceType: PROFITABILITY_SOURCE_TYPE,
        sliceId: expected.sliceId,
        sequence: input.sequence,
        checksum,
        providerAdvertiserId: input.providerAdvertiserId,
        payloadHash,
        reportId: input.reportId,
        campaignCount: input.campaignCount,
        expectedRowCount: input.expectedRowCount,
        collectedRowCount: input.collectedRowCount,
        responseBytes: input.responseBytes,
      })) {
        throw new ConflictException('RECEIPT_REPLAY_CONFLICT');
      }
      for (const row of normalizedRows) {
        if (!expected.businessDates.includes(row.businessDate)) {
          throw new UnprocessableEntityException('ADVERTISING_DATE_OUTSIDE_SLICE');
        }
      }
      const targetRows = await this.resolveTargetRows(
        tx,
        input.organizationId,
        attempt.id,
        expected,
        normalizedRows,
      );
      await tx.channelAdTargetDailySnapshot.deleteMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: attempt.id,
          channelAccountId: expected.channelAccountId,
          targetType: 'product',
          businessDate: { gte: dateOnly(expected.from), lte: dateOnly(expected.to) },
        },
      });
      for (let offset = 0; offset < targetRows.length; offset += INSERT_CHUNK_SIZE) {
        await tx.channelAdTargetDailySnapshot.createMany({
          data: targetRows.slice(offset, offset + INSERT_CHUNK_SIZE),
        });
      }
      await allocateSlice(tx, {
        organizationId: input.organizationId,
        sourceImportRunId: attempt.id,
        accountId: expected.channelAccountId,
        from: expected.from,
        to: expected.to,
        mappingGeneration: attempt.mappingGeneration ?? 0n,
      });
      const matchedCount = targetRows.filter((row) => row.listingId !== null).length;
      const receiptMeta = {
        sourceType: PROFITABILITY_SOURCE_TYPE,
        sliceId: expected.sliceId,
        sequence: input.sequence,
        checksum,
        payloadHash,
        providerAdvertiserId: input.providerAdvertiserId,
        reportId: input.reportId,
        campaignCount: input.campaignCount,
        expectedRowCount: input.expectedRowCount,
        collectedRowCount: input.collectedRowCount,
        responseBytes: input.responseBytes,
        inputRowCount: normalizedRows.length,
        businessDates: expected.businessDates,
      };
      const updated = await tx.channelScrapeRun.updateMany({
        where: {
          id: receipt.id,
          organizationId: input.organizationId,
          sourceImportRunId: attempt.id,
          channelAccountId: expected.channelAccountId,
          status: RECEIPT_DB_RUNNING,
        },
        data: {
          status: RECEIPT_DB_COMPLETE,
          rowCount: targetRows.length,
          matchedCount,
          unmatchedCount: targetRows.length - matchedCount,
          finishedAt: new Date(),
          metaJson: receiptMeta,
        },
      });
      if (updated.count !== 1) throw new ConflictException('RECEIPT_TERMINAL_CONFLICT');
      return { replayed: false };
    }, mutationTransactionOptions());
  }

  async finalizeAttempt(input: AttemptFence): Promise<AdvertisingProfitabilitySourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      await lockProductMapping(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      if (sourceDbState(attempt.status) === SOURCE_DB_COMPLETE) return;
      assertWritable(attempt);
      await assertMappingGeneration(tx, attempt);
      const plan = parseStoredPlan(attempt.plan);
      for (const account of plan.accounts) await assertAccountIdentity(tx, input.organizationId, account);
      const applicableAccounts = await readApplicableAccounts(tx, input.organizationId);
      if (!sameApplicableAccountProof(plan.accounts, applicableAccounts)) {
        throw new ConflictException('ADVERTISING_ACCOUNT_SET_CHANGED');
      }
      const receipts = await tx.channelScrapeRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: attempt.id,
          source: 'advertising',
          pageType: 'profitability',
        },
      });
      const expectedSlices = plan.accounts.flatMap((account) => account.slices);
      if (receipts.length !== expectedSlices.length) throw incompleteImport();
      const receiptBySlice = new Map<string, Receipt>();
      for (const receipt of receipts) {
        const sliceId = receiptPayload(receipt.metaJson).sliceId;
        if (!sliceId || receiptBySlice.has(sliceId)) throw incompleteImport();
        receiptBySlice.set(sliceId, receipt);
      }
      for (const expected of expectedSlices) {
        const receipt = receiptBySlice.get(expected.sliceId);
        const payload = receipt ? receiptPayload(receipt.metaJson) : null;
        if (!receipt || receipt.channelAccountId !== expected.channelAccountId
          || receipt.channel !== 'coupang'
          || receipt.pageType !== 'profitability'
          || receipt.parserVersion !== PROFITABILITY_PARSER_VERSION
          || receipt.targetUrl !== PROFITABILITY_REPORT_URL
          || receipt.status.toUpperCase() !== RECEIPT_STATE_COMPLETE
          || !payload || payload.sliceId !== expected.sliceId
          || payload.sourceType !== PROFITABILITY_SOURCE_TYPE
          || payload.sequence === null
          || payload.checksum === null
          || payload.payloadHash === null
          || payload.providerAdvertiserId !== expectedAdvertiserId(plan, expected)
          || payload.inputRowCount === null
          || payload.inputRowCount !== receipt.rowCount
          || !validReceiptProof(payload, receipt.rowCount)
          || receipt.matchedCount + receipt.unmatchedCount !== receipt.rowCount
          || !sameStringList(payload.businessDates, expected.businessDates)
          || (receipt.periodStart && businessDateKey(receipt.periodStart)) !== expected.from
          || (receipt.periodEnd && businessDateKey(receipt.periodEnd)) !== expected.to) {
          throw incompleteImport();
        }
      }

      const targets = await tx.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: attempt.id,
          targetType: 'product',
        },
      });
      const targetByReceipt = new Map<string, Target[]>();
      for (const target of targets) {
        const expected = expectedSlices.find((slice) =>
          slice.channelAccountId === target.channelAccountId
          && target.businessDate >= dateOnly(slice.from)
          && target.businessDate <= dateOnly(slice.to));
        if (!expected || target.channel !== 'coupang') throw incompleteImport();
        const rows = targetByReceipt.get(expected.sliceId) ?? [];
        rows.push(target);
        targetByReceipt.set(expected.sliceId, rows);
      }
      for (const expected of expectedSlices) {
        const receipt = receiptBySlice.get(expected.sliceId)!;
        const rows = targetByReceipt.get(expected.sliceId) ?? [];
        if (rows.length !== receipt.rowCount
          || rows.filter((row) => row.listingId !== null).length !== receipt.matchedCount
          || rows.filter((row) => row.listingId === null).length !== receipt.unmatchedCount) {
          throw incompleteImport();
        }
      }

      const facts = await tx.channelAdListingProductMonthlyFact.findMany({
        where: { organizationId: input.organizationId, sourceImportRunId: attempt.id },
      });
      if (facts.some((fact) => fact.mappingGeneration !== (attempt.mappingGeneration ?? 0n)
        || fact.observedTargetDayCount === null
        || fact.observedTargetDayCount <= 0)) throw incompleteImport();
      const allocationSummary = await assertConservation(targets, facts, expectedSlices);
      const requestedEnd = businessDateKey(attempt.coverageEndDate!);
      const confirmedEnd = confirmedAdReportEnd({
        requestedEnd,
        closedDay: requestedEnd,
        daySpend: observedDaySpend(plan, targets),
      });
      const publishedFacts = confirmedEnd === requestedEnd
        ? facts
        : await holdUnreportedDay(tx, attempt, facts, confirmedEnd);
      const coveredMonths = attempt.coveredMonths.filter((month) => `${month}-01` <= confirmedEnd);

      const importedAt = new Date();
      const publication = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_COMPLETE,
          publicationSequence: { not: null },
        },
        orderBy: { publicationSequence: 'desc' },
        select: { publicationSequence: true },
      });
      const publicationSequence = (publication?.publicationSequence ?? 0n) + 1n;
      const receiptDigest = hashJson(receipts
        .map((receipt) => receiptPayload(receipt.metaJson))
        .sort((left, right) => compareLowercase(left.sliceId ?? '', right.sliceId ?? '')));
      const qualityReport = completedQualityReport(
        { ...attempt, coveredMonths },
        plan,
        receipts,
        publishedFacts,
        receiptDigest,
        allocationSummary,
      );
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: attempt.id,
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: SOURCE_DB_COMPLETE,
          importedAt,
          lastVerifiedAt: importedAt,
          verificationCount: { increment: 1 },
          contentChecksum: receiptDigest,
          contentByteCount: Buffer.byteLength(JSON.stringify(receipts.map((receipt) => receipt.metaJson))),
          providerBackedEmptyProof: targets.length === 0 || targets.every((target) => target.adSpend === 0),
          publicationSequence,
          qualityReport,
          coverageEndDate: dateOnly(confirmedEnd),
          coveredMonths,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: PROFITABILITY_ALERT_DEDUPE_KEY,
        attemptId: attempt.id,
      });
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  async failAttempt(input: AttemptFence & {
    code: string;
    message: string;
  }): Promise<AdvertisingProfitabilitySourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      const currentState = sourceDbState(attempt.status);
      if (currentState === SOURCE_DB_COMPLETE) {
        throw new ConflictException('ATTEMPT_TERMINAL');
      }
      if (currentState === SOURCE_DB_FAILED) {
        if (attempt.errorCode !== input.code || attempt.errorMessage !== input.message) {
          throw new ConflictException('ATTEMPT_TERMINAL');
        }
        return;
      }
      assertWritable(attempt);
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: SOURCE_DB_FAILED,
          errorCode: input.code,
          errorMessage: input.message,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.recordTerminalOutcome(tx, {
        code: input.code,
        organizationId: input.organizationId,
        dedupeKey: PROFITABILITY_ALERT_DEDUPE_KEY,
        sourceType: PROFITABILITY_SOURCE_TYPE,
        attemptId: input.attemptId,
        title: 'Coupang 광고 수익성 수집 실패',
        message: input.message,
        href: '/ad-ops',
      });
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  async readGeneration(input: {
    organizationId: string;
    sourceImportRunId: string;
  }): Promise<AdvertisingProfitabilityGeneration | null> {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.sourceImportRun.findFirst({
        where: {
          id: input.sourceImportRunId,
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_COMPLETE,
          publicationSequence: { not: null },
        },
      });
      if (!run) return null;
      const applicableAccounts = await readApplicableAccountProof(tx, input.organizationId);
      if (!applicableAccounts
        || !sameApplicableAccountProof(parseStoredPlan(run.plan).accounts, applicableAccounts)) {
        return null;
      }
      return generationFromRun(tx, run);
    }, snapshotTransactionOptions());
  }

  async readSourceSnapshot(input: {
    organizationId: string;
    limit?: number;
  }): Promise<AdvertisingProfitabilitySourceSnapshot> {
    const limit = boundedSnapshotLimit(input.limit);
    return this.prisma.$transaction(async (tx) => {
      const latestAttempt = await latestAttemptForOrganization(tx, input.organizationId);
      const completeRuns = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: PROFITABILITY_SOURCE_TYPE,
          status: SOURCE_DB_COMPLETE,
          publicationSequence: { not: null },
        },
        orderBy: [{ publicationSequence: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      const applicableAccounts = completeRuns.length > 0
        ? await readApplicableAccountProof(tx, input.organizationId)
        : null;
      const applicableRuns = applicableAccounts
        ? completeRuns.filter((run) =>
          sameApplicableAccountProof(parseStoredPlan(run.plan).accounts, applicableAccounts))
        : [];
      const generations = applicableRuns.map((run) => generationSummaryFromRun(run));
      const latestComplete = generations[0] ?? null;
      // Terminal runs stay immutable. The catalog exposes only generations
      // whose frozen retained-account proof still matches, then Finance picks
      // a compatible generation from the bounded typed history.
      const source = sourceView(latestAttempt, applicableRuns[0] ?? null, new Date());
      return {
        latestAttempt: latestAttempt ? attemptSummary(latestAttempt) : null,
        latestComplete,
        completeGenerations: generations,
        ready: source.ready,
      };
    }, snapshotTransactionOptions());
  }

  private async listFrozenListings(tx: Transaction, organizationId: string, accountIds: readonly string[]) {
    if (accountIds.length === 0) return [];
    return tx.channelListing.findMany({
      where: {
        organizationId,
        channelAccountId: { in: [...accountIds] },
        isActive: true,
      },
      orderBy: [{ channelAccountId: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        channelAccountId: true,
        options: {
          where: { isActive: true },
          select: {
            inventoryComponents: {
              select: {
                quantity: true,
                sellpiaInventorySku: { select: { masterProductId: true } },
              },
            },
          },
        },
      },
    });
  }

  private async resolveTargetRows(
    tx: Transaction,
    organizationId: string,
    sourceImportRunId: string,
    slice: StoredSlice,
    rows: readonly AdvertisingProfitabilityProviderRow[],
  ): Promise<Prisma.ChannelAdTargetDailySnapshotCreateManyInput[]> {
    const externalIds = [...new Set(rows.map((row) => row.externalOptionId))];
    const options = externalIds.length === 0 ? [] : await tx.channelListingOption.findMany({
      where: {
        organizationId,
        externalOptionId: { in: externalIds },
        isActive: true,
        listing: {
          is: {
            organizationId,
            channelAccountId: slice.channelAccountId,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        listingId: true,
        externalOptionId: true,
        listing: { select: { externalId: true } },
      },
    });
    const optionByExternal = uniqueBy(options, (option) => option.externalOptionId);
    const listings = externalIds.length === 0 ? [] : await tx.channelListing.findMany({
      where: {
        organizationId,
        channelAccountId: slice.channelAccountId,
        externalId: { in: externalIds },
        isActive: true,
      },
      select: { id: true, externalId: true },
    });
    const listingByExternal = uniqueBy(listings, (listing) => listing.externalId);
    return rows.map((row) => {
      const option = optionByExternal.get(row.externalOptionId);
      const listing = option ? null : listingByExternal.get(row.externalOptionId) ?? null;
      const listingId = option?.listingId ?? listing?.id ?? null;
      const externalId = option?.listing.externalId ?? listing?.externalId ?? null;
      return {
        organizationId,
        sourceImportRunId,
        channelAccountId: slice.channelAccountId,
        channel: 'coupang',
        businessDate: dateOnly(row.businessDate),
        listingId,
        listingOptionId: option?.id ?? null,
        externalId,
        externalOptionId: row.externalOptionId,
        targetType: 'product',
        targetKey: `${slice.sliceId}:${row.businessDate}:${row.externalOptionId}`,
        spend: row.adSpend,
        revenue: row.adRevenue,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        orders: row.orders,
        adSpend: row.adSpend,
        adRevenue: row.adRevenue,
        metaJson: {
          sourceType: PROFITABILITY_SOURCE_TYPE,
          sliceId: slice.sliceId,
          externalOptionId: row.externalOptionId,
        },
      };
    });
  }

  private async expireAttempt(tx: Transaction, attempt: SourceAttempt): Promise<void> {
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: PROFITABILITY_SOURCE_TYPE,
        status: SOURCE_DB_RUNNING,
      },
      data: {
        status: SOURCE_DB_FAILED,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: 'Advertising profitability collection expired before publication.',
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.recordTerminalOutcome(tx, {
      code: 'ATTEMPT_EXPIRED',
      organizationId: attempt.organizationId,
      dedupeKey: PROFITABILITY_ALERT_DEDUPE_KEY,
      sourceType: PROFITABILITY_SOURCE_TYPE,
      attemptId: attempt.id,
      title: 'Coupang 광고 수익성 수집 만료',
      message: '광고 수익성 수집이 결과를 저장하기 전에 만료되었습니다. 다시 수집해주세요.',
      href: '/ad-ops',
    });
  }
}

function mutationTransactionOptions() {
  return {
    timeout: PROFITABILITY_TRANSACTION_TIMEOUT_MS,
    maxWait: 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  } as const;
}

function snapshotTransactionOptions() {
  return {
    timeout: PROFITABILITY_TRANSACTION_TIMEOUT_MS,
    maxWait: 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  } as const;
}

async function lockSource(tx: Transaction, organizationId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped source-owner advisory lock.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.coupang-ad-profitability:${organizationId}`}, 0)
    )::text AS "lock"
  `);
}

async function findAttempt(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttempt> {
  const attempt = await tx.sourceImportRun.findFirst({
    where: { id: attemptId, organizationId, sourceType: PROFITABILITY_SOURCE_TYPE },
  });
  if (!attempt) throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
  return attempt;
}

async function findAttemptByIdempotency(
  tx: Transaction,
  organizationId: string,
  idempotencyKey: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: PROFITABILITY_SOURCE_TYPE,
      idempotencyKey,
    },
  });
}

function assertIdempotencyFingerprint(attempt: SourceAttempt): void {
  const expected = hashJson({
    sourceType: PROFITABILITY_SOURCE_TYPE,
    parserVersion: PROFITABILITY_PARSER_VERSION,
    plan: parseStoredPlan(attempt.plan),
  });
  if (attempt.requestFingerprint !== expected) {
    throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
  }
}

async function latestAttemptForOrganization(
  tx: Transaction,
  organizationId: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: PROFITABILITY_SOURCE_TYPE },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async function latestCompleteAttempt(
  tx: Transaction,
  organizationId: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: PROFITABILITY_SOURCE_TYPE,
      status: SOURCE_DB_COMPLETE,
      publicationSequence: { not: null },
    },
    orderBy: [{ publicationSequence: 'desc' }, { id: 'desc' }],
  });
}

function publicPlan(attempt: SourceAttempt): AdvertisingProfitabilityPlan {
  const stored = parseStoredPlan(attempt.plan);
  return {
    attemptId: attempt.id,
    attemptToken: attempt.attemptToken,
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    mappingGeneration: stored.mappingGeneration,
    adSourcePolicyHash: stored.adSourcePolicyHash,
    accounts: stored.accounts,
  };
}

function sourceView(
  latestAttempt: SourceAttempt | null,
  latestComplete: SourceAttempt | null,
  now: Date,
): AdvertisingProfitabilitySourceView {
  const latestCompleteQuality = latestComplete
    ? generationSummaryFromRun(latestComplete).qualitySummary
    : null;
  const latestCompleteView = latestComplete && latestComplete.publicationSequence !== null
    && latestComplete.mappingGeneration !== null && latestComplete.coverageEndDate !== null
    && latestCompleteQuality !== null
    ? {
      sourceImportRunId: latestComplete.id,
      publicationSequence: latestComplete.publicationSequence.toString(),
      mappingGeneration: latestComplete.mappingGeneration.toString(),
      coveredThrough: businessDateKey(latestComplete.coverageEndDate),
      capturedAt: (latestComplete.importedAt ?? latestComplete.updatedAt).toISOString(),
      qualitySummary: latestCompleteQuality,
    }
    : null;
  const coveredThrough = latestComplete?.coverageEndDate ?? null;
  const latestAttemptView = latestAttempt ? {
    attemptId: latestAttempt.id,
    state: effectiveState(latestAttempt, now),
    startedAt: latestAttempt.createdAt.toISOString(),
    capturedAt: latestAttempt.importedAt?.toISOString() ?? null,
    expiresAt: latestAttempt.expiresAt?.toISOString() ?? latestAttempt.createdAt.toISOString(),
    errorCode: effectiveState(latestAttempt, now) === SOURCE_STATE_FAILED
      && sourceDbState(latestAttempt.status) === SOURCE_DB_RUNNING
      ? 'ATTEMPT_EXPIRED'
      : latestAttempt.errorCode,
    errorMessage: boundedErrorMessage(latestAttempt.errorMessage),
  } : null;
  const ready = deriveSourceReadiness({
    latestAttempt: latestAttemptView,
    latestComplete: latestCompleteView
      ? { actualCutoff: latestCompleteView.coveredThrough }
      : null,
    requiredCutoff: adReportEvidenceCutoff({
      closedDay: businessDateKey(evidenceCutoffDate(now)),
      collections: [latestCompleteView && latestComplete
        ? {
          requestedEnd: requestedCoverageEnd(latestComplete),
          confirmedEnd: latestCompleteView.coveredThrough,
        }
        : null],
    }),
  }).ready;
  return {
    latestAttempt: latestAttemptView,
    latestComplete: latestCompleteView,
    ready,
  };
}

function attemptSummary(attempt: SourceAttempt) {
  const stored = parseStoredPlan(attempt.plan);
  const state = effectiveState(attempt, new Date());
  return {
    attemptId: attempt.id,
    sourceImportRunId: attempt.id,
    state,
    startedAt: attempt.createdAt.toISOString(),
    capturedAt: attempt.importedAt?.toISOString() ?? null,
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    errorCode: state === SOURCE_STATE_FAILED && sourceDbState(attempt.status) === SOURCE_DB_RUNNING
      ? 'ATTEMPT_EXPIRED'
      : attempt.errorCode,
    errorMessage: boundedErrorMessage(attempt.errorMessage),
    mappingGeneration: attempt.mappingGeneration?.toString() ?? stored.mappingGeneration,
    adSourcePolicyHash: attempt.adSourcePolicyHash ?? stored.adSourcePolicyHash,
    coverageStartDate: attempt.coverageStartDate ? businessDateKey(attempt.coverageStartDate) : null,
    coverageEndDate: attempt.coverageEndDate ? businessDateKey(attempt.coverageEndDate) : null,
  };
}

function boundedErrorMessage(value: string | null): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value.slice(0, 300);
}

function generationSummaryFromRun(
  run: SourceAttempt,
): import('../../../application/port/in/profitability-ad-import.port').AdvertisingProfitabilityGenerationSummary {
  if (run.publicationSequence === null || run.mappingGeneration === null
    || !run.coverageStartDate || !run.coverageEndDate || !run.importedAt
    || !run.adSourcePolicyHash) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MISSING');
  }
  const plan = parseStoredPlan(run.plan);
  const quality = qualityCounts(run.qualityReport);
  if (run.parserVersion !== PROFITABILITY_PARSER_VERSION
    || quality.contract !== PROFITABILITY_PARSER_VERSION
    || quality.parserVersion !== PROFITABILITY_PARSER_VERSION
    || quality.sourceType !== PROFITABILITY_SOURCE_TYPE
    || quality.reportProduct !== 'billboard_product'
    || quality.reportUrl !== PROFITABILITY_REPORT_URL
    || quality.mappingGeneration !== run.mappingGeneration.toString()
    || quality.adSourcePolicyHash !== run.adSourcePolicyHash
    || !sameStringList(quality.coveredMonths, run.coveredMonths)
    || quality.receiptCount !== run.rowCount
    || quality.plannedAccountCount !== plan.accounts.length
    || quality.plannedSliceCount !== plan.accounts.reduce(
      (count, account) => count + account.slices.length,
      0,
    )
    || quality.reportIdCount !== quality.receiptCount
    || quality.expectedRowCount !== quality.collectedRowCount
    || quality.collectedRowCount < quality.targetFactCount
    || BigInt(quality.matchedTargetCount) + BigInt(quality.unmatchedTargetCount)
      !== BigInt(quality.targetFactCount)
    || BigInt(quality.allocatableTargetCount) + BigInt(quality.unallocatableTargetCount)
      !== BigInt(quality.matchedTargetCount)
    || BigInt(quality.providerSpendKrw) !== BigInt(quality.allocatedSpendKrw)
      + BigInt(quality.unmatchedSpendKrw) + BigInt(quality.unallocatableSpendKrw)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  return {
    sourceImportRunId: run.id,
    sourceType: PROFITABILITY_SOURCE_TYPE,
    organizationId: run.organizationId,
    publicationSequence: run.publicationSequence.toString(),
    coverageStartDate: businessDateKey(run.coverageStartDate),
    coveredThrough: businessDateKey(run.coverageEndDate),
    capturedAt: run.importedAt.toISOString(),
    mappingGeneration: run.mappingGeneration.toString(),
    adSourcePolicyHash: run.adSourcePolicyHash,
    frozenRecipePolicy: frozenRecipePolicy(
      run.mappingGeneration.toString(),
      run.adSourcePolicyHash,
    ),
    qualitySummary: {
      contract: quality.contract,
      parserVersion: run.parserVersion,
      plannedAccountCount: quality.plannedAccountCount,
      plannedSliceCount: quality.plannedSliceCount,
      receiptCount: quality.receiptCount,
      targetFactCount: quality.targetFactCount,
      matchedTargetCount: quality.matchedTargetCount,
      unmatchedTargetCount: quality.unmatchedTargetCount,
      allocatableTargetCount: quality.allocatableTargetCount,
      unallocatableTargetCount: quality.unallocatableTargetCount,
      monthlyAllocationFactCount: quality.monthlyAllocationFactCount,
      reportIdCount: quality.reportIdCount,
      campaignCount: quality.campaignCount,
      expectedRowCount: quality.expectedRowCount,
      collectedRowCount: quality.collectedRowCount,
      responseBytes: quality.responseBytes,
      providerSpendKrw: quality.providerSpendKrw,
      allocatedSpendKrw: quality.allocatedSpendKrw,
      unmatchedSpendKrw: quality.unmatchedSpendKrw,
      unallocatableSpendKrw: quality.unallocatableSpendKrw,
    },
  };
}

function frozenRecipePolicy(
  mappingGeneration: string,
  adSourcePolicyHash: string,
) {
  return {
    version: PROFITABILITY_RECIPE_POLICY_VERSION as 'WHOLE_RECIPE_QUANTITY_V1',
    allocation: PROFITABILITY_ALLOCATION_POLICY as 'INTEGER_KRW_LARGEST_REMAINDER',
    tieBreak: PROFITABILITY_ALLOCATION_TIE_BREAK as 'MASTER_PRODUCT_ID_ASC_LOWERCASE',
    mappingGeneration,
    adSourcePolicyHash,
  };
}

function qualityCounts(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const quality = value as Record<string, unknown>;
  const contract = requiredQualityText(quality.contract);
  const parserVersion = requiredQualityText(quality.parserVersion);
  const sourceType = requiredQualityText(quality.sourceType);
  const reportProduct = requiredQualityText(quality.reportProduct);
  const reportUrl = requiredQualityText(quality.reportUrl);
  const mappingGeneration = requiredQualityText(quality.mappingGeneration);
  const adSourcePolicyHash = requiredQualityText(quality.adSourcePolicyHash);
  if (!/^\d+$/.test(mappingGeneration) || !/^[a-f0-9]{64}$/i.test(adSourcePolicyHash)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const coveredMonths = quality.coveredMonths;
  if (!Array.isArray(coveredMonths) || coveredMonths.length === 0
    || coveredMonths.some((month) => typeof month !== 'string'
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const numbers = [
    quality.plannedAccountCount,
    quality.plannedSliceCount,
    quality.receiptCount,
    quality.targetFactCount,
    quality.matchedTargetCount,
    quality.unmatchedTargetCount,
    quality.allocatableTargetCount,
    quality.unallocatableTargetCount,
    quality.monthlyAllocationFactCount,
    quality.reportIdCount,
    quality.campaignCount,
    quality.expectedRowCount,
    quality.collectedRowCount,
    quality.responseBytes,
    quality.providerSpendKrw,
    quality.allocatedSpendKrw,
    quality.unmatchedSpendKrw,
    quality.unallocatableSpendKrw,
  ];
  if (numbers.some((number) => !Number.isSafeInteger(number) || (number as number) < 0)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  return {
    contract,
    parserVersion,
    sourceType,
    reportProduct,
    reportUrl,
    mappingGeneration,
    adSourcePolicyHash,
    coveredMonths,
    plannedAccountCount: quality.plannedAccountCount as number,
    plannedSliceCount: quality.plannedSliceCount as number,
    receiptCount: quality.receiptCount as number,
    targetFactCount: quality.targetFactCount as number,
    matchedTargetCount: quality.matchedTargetCount as number,
    unmatchedTargetCount: quality.unmatchedTargetCount as number,
    allocatableTargetCount: quality.allocatableTargetCount as number,
    unallocatableTargetCount: quality.unallocatableTargetCount as number,
    monthlyAllocationFactCount: quality.monthlyAllocationFactCount as number,
    reportIdCount: quality.reportIdCount as number,
    campaignCount: quality.campaignCount as number,
    expectedRowCount: quality.expectedRowCount as number,
    collectedRowCount: quality.collectedRowCount as number,
    responseBytes: quality.responseBytes as number,
    providerSpendKrw: quality.providerSpendKrw as number,
    allocatedSpendKrw: quality.allocatedSpendKrw as number,
    unmatchedSpendKrw: quality.unmatchedSpendKrw as number,
    unallocatableSpendKrw: quality.unallocatableSpendKrw as number,
  };
}

function requiredQualityText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  return value;
}

async function generationFromRun(
  tx: Transaction,
  run: SourceAttempt,
): Promise<AdvertisingProfitabilityGeneration> {
  if (run.publicationSequence === null || run.mappingGeneration === null
    || !run.coverageStartDate || !run.coverageEndDate || !run.importedAt
    || !run.adSourcePolicyHash) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MISSING');
  }
  const monthlyPublication = await readMonthlyAdAllocationPublication(tx, {
    organizationId: run.organizationId,
    sourceImportRunId: run.id,
  });
  if (!monthlyPublication) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MISSING');
  }
  const facts: GenerationMonthlyFact[] = monthlyPublication.allocations.map((fact) => ({
    ...fact,
    month: dateOnly(fact.month),
    coveredStartDate: dateOnly(fact.coveredStartDate),
    coveredEndDate: dateOnly(fact.coveredEndDate),
    allocatedSpend: BigInt(fact.allocatedSpend),
    mappingGeneration: BigInt(fact.mappingGeneration),
  }));
  const summary = generationSummaryFromRun(run);
  const slices = parseStoredPlan(run.plan).accounts.flatMap((account) => account.slices);
  return {
    summary,
    allocations: facts.map((fact) => {
      const month = businessDateKey(fact.month).slice(0, 7);
      const slice = slices.find((candidate) =>
        candidate.channelAccountId === fact.channelAccountId
        && candidate.from.slice(0, 7) === month);
      const coverage = slice ? clampProfitabilityMonthCoverage({
        factFrom: businessDateKey(fact.coveredStartDate),
        factTo: businessDateKey(fact.coveredEndDate),
        sliceFrom: slice.from,
        sliceTo: slice.to,
      }) : null;
      if (!coverage) throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
      return {
        channelAccountId: fact.channelAccountId,
        channelListingId: fact.channelListingId,
        masterProductId: fact.masterProductId,
        month,
        coveredStartDate: coverage.from,
        coveredEndDate: coverage.to,
        wholeRecipeWeight: fact.wholeRecipeWeight,
        allocatedSpend: safeKrwNumber(fact.allocatedSpend),
        observedTargetDayCount: coverage.coveredDays,
        mappingGeneration: fact.mappingGeneration.toString(),
      };
    }),
  };
}

async function readMappingGeneration(tx: Transaction, organizationId: string): Promise<bigint> {
  const state = await tx.masterProductAbcFormulaState.findUnique({
    where: { organizationId },
    select: { mappingGeneration: true },
  });
  return state?.mappingGeneration ?? 0n;
}

async function assertMappingGeneration(tx: Transaction, attempt: SourceAttempt): Promise<void> {
  const current = await readMappingGeneration(tx, attempt.organizationId);
  if (current !== (attempt.mappingGeneration ?? 0n)) {
    throw new ConflictException('MAPPING_GENERATION_CHANGED');
  }
}

async function assertAccountIdentity(
  tx: Transaction,
  organizationId: string,
  expected: Pick<StoredPlan['accounts'][number], 'channelAccountId' | 'externalAccountId' | 'expectedAdvertiserId'>,
): Promise<void> {
  const account = await tx.channelAccount.findFirst({
    where: {
      id: expected.channelAccountId,
      organizationId,
      channel: 'coupang',
    },
    select: { externalAccountId: true, vendorId: true },
  });
  if (!account) throw new UnprocessableEntityException('ADVERTISING_ACCOUNT_NOT_FOUND');
  const identity = resolveCoupangVendorId(account);
  const external = account.externalAccountId?.trim() || identity;
  if (identity !== expected.expectedAdvertiserId || external !== expected.externalAccountId) {
    throw new ConflictException('ADVERTISING_ACCOUNT_IDENTITY_CHANGED');
  }
}

async function readApplicableAccounts(
  tx: Transaction,
  organizationId: string,
): Promise<readonly ApplicableAccountProof[]> {
  const proof = await readApplicableAccountProof(tx, organizationId);
  if (!proof) {
    throw new UnprocessableEntityException('ADVERTISING_ACCOUNT_IDENTITY_MISSING');
  }
  return proof;
}

async function readApplicableAccountProof(
  tx: Transaction,
  organizationId: string,
): Promise<readonly ApplicableAccountProof[] | null> {
  const accounts = await tx.channelAccount.findMany({
    where: { organizationId, channel: 'coupang' },
    orderBy: { id: 'asc' },
    select: { id: true, externalAccountId: true, vendorId: true },
  });
  const proof = accounts.map((account) => {
    const expectedAdvertiserId = resolveCoupangVendorId(account);
    const externalAccountId = account.externalAccountId?.trim() || expectedAdvertiserId;
    if (!externalAccountId || !expectedAdvertiserId) {
      return null;
    }
    return {
      channelAccountId: account.id,
      externalAccountId,
      expectedAdvertiserId,
    };
  });
  if (proof.some((account) => account === null)) return null;
  return proof.filter((account): account is ApplicableAccountProof => account !== null);
}

function sameApplicableAccountProof(
  planned: readonly Pick<StoredPlan['accounts'][number],
    'channelAccountId' | 'externalAccountId' | 'expectedAdvertiserId'>[],
  current: readonly ApplicableAccountProof[],
): boolean {
  if (planned.length !== current.length) return false;
  return planned.every((account, index) => {
    const candidate = current[index];
    return candidate?.channelAccountId === account.channelAccountId
      && candidate.externalAccountId === account.externalAccountId
      && candidate.expectedAdvertiserId === account.expectedAdvertiserId;
  });
}

function assertAttemptToken(attempt: SourceAttempt, token: string): void {
  if (attempt.attemptToken !== token) throw new ConflictException('ATTEMPT_TOKEN_MISMATCH');
}

function assertWritable(attempt: SourceAttempt): void {
  if (sourceDbState(attempt.status) !== SOURCE_DB_RUNNING) {
    throw new ConflictException('ATTEMPT_TERMINAL');
  }
  if (attempt.expiresAt && attempt.expiresAt.getTime() <= Date.now()) {
    throw new ConflictException('ATTEMPT_EXPIRED');
  }
}

function buildStoredPlan(
  accounts: readonly { channelAccountId: string; externalAccountId: string; expectedAdvertiserId: string }[],
  coverage: ProfitabilityCoverage,
  mappingGeneration: bigint,
): StoredPlan {
  return {
    mappingGeneration: mappingGeneration.toString(),
    adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
    accounts: accounts.map((account) => ({
      ...account,
      slices: coverage.periods.map(({ from, to, businessDates: periodDates }) => {
        return {
          sliceId: `${account.channelAccountId}:${from}_${to}`,
          channelAccountId: account.channelAccountId,
          from,
          to,
          businessDates: periodDates,
        };
      }),
    })),
  };
}

function parseStoredPlan(value: unknown): StoredPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
  }
  const plan = value as Record<string, unknown>;
  const mappingGeneration = plan.mappingGeneration;
  const policyHash = plan.adSourcePolicyHash;
  if (typeof mappingGeneration !== 'string' || !/^\d+$/.test(mappingGeneration)
    || policyHash !== PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH
    || !Array.isArray(plan.accounts)) {
    throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
  }
  const accounts = plan.accounts.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
    }
    const account = value as Record<string, unknown>;
    const channelAccountId = boundedPlanText(account.channelAccountId);
    const externalAccountId = boundedPlanText(account.externalAccountId);
    const expectedAdvertiserId = boundedPlanText(account.expectedAdvertiserId);
    if (!Array.isArray(account.slices)) throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
    const slices = account.slices.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
      }
      const slice = value as Record<string, unknown>;
      const sliceId = boundedPlanText(slice.sliceId);
      const from = boundedPlanDate(slice.from);
      const to = boundedPlanDate(slice.to);
      if (from > to || sliceId !== `${channelAccountId}:${from}_${to}`
        || slice.channelAccountId !== channelAccountId || !Array.isArray(slice.businessDates)
        || slice.businessDates.some((date) => typeof date !== 'string' || !parseDate(date))
        || !sameStringList(slice.businessDates as string[], businessDates(from, to))) {
        throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
      }
      return {
        sliceId,
        channelAccountId,
        from,
        to,
        businessDates: [...slice.businessDates] as string[],
      };
    });
    return { channelAccountId, externalAccountId, expectedAdvertiserId, slices };
  });
  return {
    mappingGeneration,
    adSourcePolicyHash: policyHash,
    accounts,
  };
}

function findSlice(plan: StoredPlan, sliceId: string): StoredSlice | null {
  for (const account of plan.accounts) {
    const slice = account.slices.find((candidate) => candidate.sliceId === sliceId);
    if (slice) return slice;
  }
  return null;
}

function expectedAdvertiserId(plan: StoredPlan, slice: StoredSlice): string {
  return plan.accounts.find((account) => account.channelAccountId === slice.channelAccountId)!.expectedAdvertiserId;
}

function parseReceiptMeta(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function receiptPayload(value: Prisma.JsonValue | null) {
  const meta = parseReceiptMeta(value);
  const businessDates = Array.isArray(meta.businessDates)
    && meta.businessDates.every((date): date is string => typeof date === 'string')
    ? [...meta.businessDates]
    : null;
  return {
    sourceType: typeof meta.sourceType === 'string' ? meta.sourceType : null,
    sliceId: typeof meta.sliceId === 'string' ? meta.sliceId : null,
    sequence: typeof meta.sequence === 'number' ? meta.sequence : null,
    checksum: typeof meta.checksum === 'string' ? meta.checksum : null,
    payloadHash: typeof meta.payloadHash === 'string' ? meta.payloadHash : null,
    providerAdvertiserId: typeof meta.providerAdvertiserId === 'string' ? meta.providerAdvertiserId : null,
    reportId: typeof meta.reportId === 'string' ? meta.reportId : null,
    campaignCount: typeof meta.campaignCount === 'number' ? meta.campaignCount : null,
    expectedRowCount: typeof meta.expectedRowCount === 'number' ? meta.expectedRowCount : null,
    collectedRowCount: typeof meta.collectedRowCount === 'number' ? meta.collectedRowCount : null,
    responseBytes: typeof meta.responseBytes === 'number' ? meta.responseBytes : null,
    inputRowCount: typeof meta.inputRowCount === 'number' ? meta.inputRowCount : null,
    businessDates,
  };
}

function validReceiptProof(
  payload: ReturnType<typeof receiptPayload>,
  normalizedRowCount: number,
): boolean {
  if (payload.reportId === null
    || payload.campaignCount === null
    || payload.expectedRowCount === null
    || payload.collectedRowCount === null
    || payload.responseBytes === null) {
    return false;
  }
  return validReportProofFields({
    reportId: payload.reportId,
    campaignCount: payload.campaignCount,
    expectedRowCount: payload.expectedRowCount,
    collectedRowCount: payload.collectedRowCount,
    responseBytes: payload.responseBytes,
  }, normalizedRowCount);
}

function validReportProofFields(
  input: Pick<AdvertisingProfitabilitySliceUpload, 'reportId' | 'campaignCount' | 'expectedRowCount' | 'collectedRowCount' | 'responseBytes'>,
  normalizedRowCount: number,
): boolean {
  return typeof input.reportId === 'string'
    && input.reportId.trim().length > 0
    && input.reportId.length <= 128
    && Number.isSafeInteger(input.campaignCount)
    && input.campaignCount >= 0
    && input.campaignCount <= MAX_REPORT_COUNT
    && Number.isSafeInteger(input.expectedRowCount)
    && input.expectedRowCount >= 0
    && input.expectedRowCount <= MAX_REPORT_COUNT
    && Number.isSafeInteger(input.collectedRowCount)
    && input.collectedRowCount >= 0
    && input.collectedRowCount <= MAX_REPORT_COUNT
    && Number.isSafeInteger(input.responseBytes)
    && input.responseBytes >= 0
    && input.responseBytes <= MAX_RESPONSE_BYTES
    && input.expectedRowCount === input.collectedRowCount
    && input.collectedRowCount === normalizedRowCount;
}

function sameReceiptPayload(
  left: ReturnType<typeof receiptPayload>,
  right: {
    sourceType: string;
    sliceId: string;
    sequence: number;
    checksum: string;
    providerAdvertiserId: string;
    payloadHash: string;
    reportId: string;
    campaignCount: number;
    expectedRowCount: number;
    collectedRowCount: number;
    responseBytes: number;
  },
): boolean {
  return left.sourceType === right.sourceType
    && left.sliceId === right.sliceId
    && left.sequence === right.sequence
    && left.checksum === right.checksum
    && left.providerAdvertiserId === right.providerAdvertiserId
    && left.payloadHash === right.payloadHash
    && left.reportId === right.reportId
    && left.campaignCount === right.campaignCount
    && left.expectedRowCount === right.expectedRowCount
    && left.collectedRowCount === right.collectedRowCount
    && left.responseBytes === right.responseBytes;
}

function canonicalProviderRows(rows: readonly AdvertisingProfitabilityProviderRow[]): AdvertisingProfitabilityProviderRow[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${row.businessDate}\u0000${row.externalOptionId}`;
    if (seen.has(identity)) {
      throw new UnprocessableEntityException('DUPLICATE_PROVIDER_ROW');
    }
    seen.add(identity);
  }
  return [...rows]
    .map((row) => ({
      businessDate: row.businessDate,
      externalOptionId: row.externalOptionId,
      adSpend: row.adSpend,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      conversions: row.conversions,
      adRevenue: row.adRevenue,
    }))
    .sort((left, right) => compareLowercase(left.businessDate, right.businessDate)
      || compareLowercase(left.externalOptionId, right.externalOptionId)
      || left.adSpend - right.adSpend
      || left.adRevenue - right.adRevenue
      || left.impressions - right.impressions
      || left.clicks - right.clicks
      || left.orders - right.orders
      || left.conversions - right.conversions);
}

/**
 * Receipt checksums cover the same canonical row sequence that the owner
 * stores. Sorting and stable key ordering make the checksum independent of
 * provider row order or object insertion order.
 */
export function canonicalProviderRowsChecksum(
  rows: readonly AdvertisingProfitabilityProviderRow[],
): string {
  return createHash('sha256').update(stableStringify(canonicalProviderRows(rows))).digest('hex');
}

function sameStringList(left: readonly string[] | null, right: readonly string[]): boolean {
  return left !== null && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function uniqueBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  const groups = new Map<string, T | null>();
  for (const row of rows) {
    const identity = key(row);
    if (!groups.has(identity)) groups.set(identity, row);
    else groups.set(identity, null);
  }
  return new Map([...groups.entries()].filter((entry): entry is [string, T] => entry[1] !== null));
}

async function allocateSlice(
  tx: Transaction,
  input: {
    organizationId: string;
    sourceImportRunId: string;
    accountId: string;
    from: string;
    to: string;
    mappingGeneration: bigint;
  },
): Promise<void> {
  const months = monthsBetween(input.from, input.to);
  const monthDates = months.map((month) => dateOnly(`${month}-01`));
  const [targets, facts] = await Promise.all([
    tx.channelAdTargetDailySnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        sourceImportRunId: input.sourceImportRunId,
        channelAccountId: input.accountId,
        businessDate: { gte: dateOnly(input.from), lte: dateOnly(input.to) },
      },
    }),
    tx.channelAdListingProductMonthlyFact.findMany({
      where: {
        organizationId: input.organizationId,
        sourceImportRunId: input.sourceImportRunId,
        channelAccountId: input.accountId,
        month: { in: monthDates },
      },
    }),
  ]);
  const byListingMonth = new Map<string, MonthlyFact[]>();
  for (const fact of facts) {
    const key = `${fact.channelListingId}\u0000${businessDateKey(fact.month).slice(0, 7)}`;
    const group = byListingMonth.get(key) ?? [];
    group.push(fact);
    byListingMonth.set(key, group);
  }
  const spendByListingDay = new Map<string, bigint>();
  for (const target of targets) {
    if (!target.listingId) continue;
    if (!Number.isSafeInteger(target.adSpend) || target.adSpend < 0) {
      throw new UnprocessableEntityException('ADVERTISING_SPEND_INVALID');
    }
    const key = `${target.listingId}\u0000${businessDateKey(target.businessDate)}`;
    const previous = spendByListingDay.get(key) ?? 0n;
    const sum = previous + BigInt(target.adSpend);
    if (sum > MAX_SAFE_KRW_BIGINT) throw new UnprocessableEntityException('ADVERTISING_SPEND_OVERFLOW');
    spendByListingDay.set(key, sum);
  }
  const allocated = new Map<string, { spend: bigint; days: number }>();
  for (const [listingDay, spend] of spendByListingDay.entries()) {
    const [listingId, businessDate] = listingDay.split('\u0000');
    const peers = byListingMonth.get(`${listingId}\u0000${businessDate!.slice(0, 7)}`) ?? [];
    if (peers.length === 0) continue;
    if (peers.some((fact) => businessDate! < businessDateKey(fact.coveredStartDate)
      || businessDate! > businessDateKey(fact.coveredEndDate))) continue;
    const shares = allocateIntegerKrw(safeKrwNumber(spend), peers.map((fact) => ({
      masterProductId: fact.masterProductId,
      weight: fact.wholeRecipeWeight,
    })));
    for (const share of shares) {
      const fact = peers.find((candidate) => candidate.masterProductId === share.masterProductId)!;
      const current = allocated.get(fact.id) ?? { spend: 0n, days: 0 };
      current.spend += BigInt(share.allocatedSpend);
      if (current.spend > MAX_SAFE_KRW_BIGINT) {
        throw new UnprocessableEntityException('ADVERTISING_SPEND_OVERFLOW');
      }
      current.days += 1;
      allocated.set(fact.id, current);
    }
  }
  const factUpdates: FactAllocationUpdate[] = [];
  for (const fact of facts) {
    const coverage = clampProfitabilityMonthCoverage({
      factFrom: businessDateKey(fact.coveredStartDate),
      factTo: businessDateKey(fact.coveredEndDate),
      sliceFrom: input.from,
      sliceTo: input.to,
    });
    if (!coverage) throw incompleteImport();
    const result = allocated.get(fact.id) ?? { spend: 0n, days: 0 };
    factUpdates.push({
      id: fact.id,
      allocatedSpend: result.spend,
      observedTargetDayCount: coverage.coveredDays,
    });
  }
  await batchUpdateFactAllocations(tx, input, factUpdates);
}

type FactAllocationUpdate = Readonly<{
  id: string;
  allocatedSpend: bigint;
  observedTargetDayCount: number;
}>;

export async function batchUpdateFactAllocations(
  tx: Transaction,
  input: {
    organizationId: string;
    sourceImportRunId: string;
    mappingGeneration: bigint;
  },
  updates: readonly FactAllocationUpdate[],
): Promise<void> {
  for (let offset = 0; offset < updates.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = updates.slice(offset, offset + INSERT_CHUNK_SIZE);
    const values = chunk.map((update) => Prisma.sql`(
      ${update.id}::uuid,
      ${input.organizationId}::uuid,
      ${input.sourceImportRunId}::uuid,
      ${input.mappingGeneration}::bigint,
      ${update.allocatedSpend}::bigint,
      ${update.observedTargetDayCount}::integer
    )`);
    const updatedCount = await tx.$executeRaw(Prisma.sql`
      UPDATE channel_ad_listing_product_monthly_facts AS fact
      SET allocated_spend = updates.allocated_spend,
          observed_target_day_count = updates.observed_target_day_count,
          updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS updates(
        id,
        organization_id,
        source_import_run_id,
        mapping_generation,
        allocated_spend,
        observed_target_day_count
      )
      WHERE fact.id = updates.id
        AND fact.organization_id = updates.organization_id
        AND fact.source_import_run_id = updates.source_import_run_id
        AND fact.mapping_generation = updates.mapping_generation
    `);
    if (updatedCount !== chunk.length) {
      throw new ConflictException('ADVERTISING_ALLOCATION_REPLAY_CONFLICT');
    }
  }
}

function indexFactsByListingMonth(
  facts: readonly GenerationMonthlyFact[],
): Map<string, GenerationMonthlyFact[]> {
  const factsByListingMonth = new Map<string, GenerationMonthlyFact[]>();
  for (const fact of facts) {
    const key = `${fact.channelAccountId}\u0000${fact.channelListingId}\u0000${businessDateKey(fact.month).slice(0, 7)}`;
    const group = factsByListingMonth.get(key) ?? [];
    group.push(fact);
    factsByListingMonth.set(key, group);
  }
  return factsByListingMonth;
}

function targetAllocationStatus(
  target: Pick<Target, 'channelAccountId' | 'listingId' | 'businessDate'>,
  factsByListingMonth: ReadonlyMap<string, readonly GenerationMonthlyFact[]>,
): TargetAllocationStatus {
  if (!target.listingId) return 'UNMATCHED';
  const key = `${target.channelAccountId}\u0000${target.listingId}\u0000${businessDateKey(target.businessDate).slice(0, 7)}`;
  const peers = factsByListingMonth.get(key) ?? [];
  if (peers.length === 0 || peers.some((fact) =>
    businessDateKey(target.businessDate) < businessDateKey(fact.coveredStartDate)
    || businessDateKey(target.businessDate) > businessDateKey(fact.coveredEndDate))) {
    return 'UNALLOCATABLE';
  }
  return 'ALLOCATABLE';
}

async function assertConservation(
  targets: readonly Target[],
  facts: readonly MonthlyFact[],
  slices: readonly StoredSlice[],
): Promise<TargetAllocationSummary> {
  const factsByListingMonth = indexFactsByListingMonth(facts);
  let matchedTargetCount = 0;
  let unmatchedTargetCount = 0;
  let allocatableTargetCount = 0;
  let unallocatableTargetCount = 0;
  let providerSpendKrw = 0n;
  let unmatchedSpendKrw = 0n;
  let unallocatableSpendKrw = 0n;
  for (const fact of facts) {
    const slice = slices.find((candidate) => candidate.channelAccountId === fact.channelAccountId
      && fact.month >= dateOnly(candidate.from) && fact.month <= dateOnly(candidate.to));
    const coverage = slice ? clampProfitabilityMonthCoverage({
      factFrom: businessDateKey(fact.coveredStartDate),
      factTo: businessDateKey(fact.coveredEndDate),
      sliceFrom: slice.from,
      sliceTo: slice.to,
    }) : null;
    if (!coverage || fact.observedTargetDayCount !== coverage.coveredDays) throw incompleteImport();
  }
  const spendByListingDay = new Map<string, bigint>();
  const providerSpendByListingMonth = new Map<string, bigint>();
  for (const target of targets) {
    if (!Number.isSafeInteger(target.adSpend) || target.adSpend < 0) {
      throw incompleteImport();
    }
    const adSpend = BigInt(target.adSpend);
    providerSpendKrw += adSpend;
    const status = targetAllocationStatus(target, factsByListingMonth);
    if (status === 'UNMATCHED') {
      unmatchedTargetCount += 1;
      unmatchedSpendKrw += adSpend;
      continue;
    }
    matchedTargetCount += 1;
    if (status === 'UNALLOCATABLE') {
      unallocatableTargetCount += 1;
      unallocatableSpendKrw += adSpend;
      continue;
    }
    allocatableTargetCount += 1;
    const key = `${target.channelAccountId}\u0000${target.listingId}\u0000${businessDateKey(target.businessDate)}`;
    const daySpend = (spendByListingDay.get(key) ?? 0n) + adSpend;
    spendByListingDay.set(key, daySpend);
    const monthKey = `${target.channelAccountId}\u0000${target.listingId}\u0000${businessDateKey(target.businessDate).slice(0, 7)}`;
    const monthSpend = (providerSpendByListingMonth.get(monthKey) ?? 0n) + adSpend;
    providerSpendByListingMonth.set(monthKey, monthSpend);
  }
  const allocatedSpendByListingMonth = new Map<string, bigint>();
  for (const fact of facts) {
    if (typeof fact.allocatedSpend !== 'bigint' || fact.allocatedSpend < 0n) {
      throw incompleteImport();
    }
    const key = `${fact.channelAccountId}\u0000${fact.channelListingId}\u0000${businessDateKey(fact.month).slice(0, 7)}`;
    const total = (allocatedSpendByListingMonth.get(key) ?? 0n) + fact.allocatedSpend;
    allocatedSpendByListingMonth.set(key, total);
  }
  for (const [key, spend] of spendByListingDay) {
    const [accountId, listingId, date] = key.split('\u0000');
    const peers = factsByListingMonth.get(`${accountId}\u0000${listingId}\u0000${date!.slice(0, 7)}`) ?? [];
    if (peers.length === 0 || peers.some((fact) => date! < businessDateKey(fact.coveredStartDate) || date! > businessDateKey(fact.coveredEndDate))) {
      throw incompleteImport();
    }
    const expected = allocateIntegerKrw(safeKrwNumber(spend), peers.map((fact) => ({
      masterProductId: fact.masterProductId,
      weight: fact.wholeRecipeWeight,
    })));
    const allocatedForDay = expected.reduce((sum, share) => sum + share.allocatedSpend, 0);
    if (BigInt(allocatedForDay) !== spend) throw incompleteImport();
  }
  const listingMonthKeys = new Set([
    ...providerSpendByListingMonth.keys(),
    ...allocatedSpendByListingMonth.keys(),
  ]);
  for (const key of listingMonthKeys) {
    if ((providerSpendByListingMonth.get(key) ?? 0n)
      !== (allocatedSpendByListingMonth.get(key) ?? 0n)) {
      throw incompleteImport();
    }
  }
  let allocatedSpendKrw = 0n;
  for (const total of allocatedSpendByListingMonth.values()) {
    allocatedSpendKrw += total;
  }
  if (providerSpendKrw !== allocatedSpendKrw + unmatchedSpendKrw + unallocatableSpendKrw) {
    throw incompleteImport();
  }
  return {
    matchedTargetCount,
    unmatchedTargetCount,
    allocatableTargetCount,
    unallocatableTargetCount,
    providerSpendKrw,
    allocatedSpendKrw,
    unmatchedSpendKrw,
    unallocatableSpendKrw,
  };
}

function freezeMonthlyFacts(
  organizationId: string,
  sourceImportRunId: string,
  mappingGeneration: bigint,
  periods: readonly CoveragePeriod[],
  listings: readonly {
    id: string;
    channelAccountId: string;
    options: readonly {
      inventoryComponents: readonly {
        quantity: number;
        sellpiaInventorySku: { masterProductId: string | null };
      }[];
    }[];
  }[],
): Prisma.ChannelAdListingProductMonthlyFactCreateManyInput[] {
  const facts: Prisma.ChannelAdListingProductMonthlyFactCreateManyInput[] = [];
  for (const listing of listings) {
    const recipe = freezeRecipe(listing.options);
    if (!recipe) continue;
    for (const { month, from, to } of periods) {
      // The V1 historical policy applies an attempt-frozen recipe to every
      // provider business date in the plan. Listing timestamps are not used
      // to truncate the basis because the provider may report an older
      // business date than the local catalog creation timestamp.
      if (from > to) continue;
      for (const [masterProductId, wholeRecipeWeight] of recipe.entries()) {
        facts.push({
          organizationId,
          sourceImportRunId,
          channelAccountId: listing.channelAccountId,
          channelListingId: listing.id,
          masterProductId,
          month: dateOnly(`${month}-01`),
          coveredStartDate: dateOnly(from),
          coveredEndDate: dateOnly(to),
          wholeRecipeWeight,
          mappingGeneration,
          observedTargetDayCount: 0,
          allocatedSpend: 0n,
        });
      }
    }
  }
  return facts;
}

function freezeRecipe(
  options: readonly { inventoryComponents: readonly { quantity: number; sellpiaInventorySku: { masterProductId: string | null } }[] }[],
): Map<string, number> | null {
  if (options.length === 0) return null;
  const recipe = new Map<string, number>();
  for (const option of options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) {
      if (!component.sellpiaInventorySku.masterProductId
        || !Number.isSafeInteger(component.quantity)
        || component.quantity <= 0
        || component.quantity > INT4_MAX) return null;
      const nextWeight = (recipe.get(component.sellpiaInventorySku.masterProductId) ?? 0)
        + component.quantity;
      if (!Number.isSafeInteger(nextWeight) || nextWeight > INT4_MAX) return null;
      recipe.set(
        component.sellpiaInventorySku.masterProductId,
        nextWeight,
      );
    }
  }
  return recipe.size > 0 ? recipe : null;
}

function initialQualityReport(plan: StoredPlan, months: readonly string[]) {
  return {
    contract: PROFITABILITY_PARSER_VERSION,
    parserVersion: PROFITABILITY_PARSER_VERSION,
    sourceType: PROFITABILITY_SOURCE_TYPE,
    reportProduct: 'billboard_product',
    reportUrl: PROFITABILITY_REPORT_URL,
    mappingGeneration: plan.mappingGeneration,
    adSourcePolicyHash: plan.adSourcePolicyHash,
    coveredMonths: [...months],
    plannedAccountCount: plan.accounts.length,
    plannedSliceCount: plan.accounts.reduce((count, account) => count + account.slices.length, 0),
    allocatableTargetCount: 0,
    unallocatableTargetCount: 0,
    unmatchedSpendKrw: 0,
    unallocatableSpendKrw: 0,
  };
}

function completedQualityReport(
  attempt: SourceAttempt,
  plan: StoredPlan,
  receipts: readonly Receipt[],
  facts: readonly MonthlyFact[],
  receiptDigest: string,
  allocationSummary: TargetAllocationSummary,
) {
  const proofTotals = receipts.reduce((summary, receipt) => {
    const payload = receiptPayload(receipt.metaJson);
    if (!validReceiptProof(payload, receipt.rowCount)) {
      throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
    }
    return {
      reportIdCount: summary.reportIdCount + 1n,
      campaignCount: summary.campaignCount + BigInt(payload.campaignCount!),
      expectedRowCount: summary.expectedRowCount + BigInt(payload.expectedRowCount!),
      collectedRowCount: summary.collectedRowCount + BigInt(payload.collectedRowCount!),
      responseBytes: summary.responseBytes + BigInt(payload.responseBytes!),
    };
  }, {
    reportIdCount: 0n,
    campaignCount: 0n,
    expectedRowCount: 0n,
    collectedRowCount: 0n,
    responseBytes: 0n,
  });
  const proof = {
    reportIdCount: safeQualityNumber(proofTotals.reportIdCount),
    campaignCount: safeQualityNumber(proofTotals.campaignCount),
    expectedRowCount: safeQualityNumber(proofTotals.expectedRowCount),
    collectedRowCount: safeQualityNumber(proofTotals.collectedRowCount),
    responseBytes: safeQualityNumber(proofTotals.responseBytes),
  };
  const coveredMonths = [...attempt.coveredMonths];
  return {
    ...initialQualityReport(plan, coveredMonths),
    contentChecksum: receiptDigest,
    receiptCount: receipts.length,
    ...proof,
    targetFactCount: allocationSummary.matchedTargetCount + allocationSummary.unmatchedTargetCount,
    matchedTargetCount: allocationSummary.matchedTargetCount,
    unmatchedTargetCount: allocationSummary.unmatchedTargetCount,
    allocatableTargetCount: allocationSummary.allocatableTargetCount,
    unallocatableTargetCount: allocationSummary.unallocatableTargetCount,
    monthlyAllocationFactCount: facts.length,
    providerSpendKrw: safeKrwNumber(allocationSummary.providerSpendKrw),
    allocatedSpendKrw: safeKrwNumber(allocationSummary.allocatedSpendKrw),
    unmatchedSpendKrw: safeKrwNumber(allocationSummary.unmatchedSpendKrw),
    unallocatableSpendKrw: safeKrwNumber(allocationSummary.unallocatableSpendKrw),
    sourceImportRunId: attempt.id,
  };
}

function incompleteImport(): ConflictException {
  return new ConflictException('ADVERTISING_IMPORT_INCOMPLETE');
}

function parseDate(value: string): Date | null {
  return parseBusinessDate(value);
}

/**
 * The import's organization-wide spend on each business date its slices
 * requested. An organization with no retained account requested nothing and
 * observed no advertising, so every day reads zero.
 */
function observedDaySpend(plan: StoredPlan, targets: readonly Target[]): ObservedDaySpend {
  if (plan.accounts.length === 0) return () => 0;
  const requested = new Set(plan.accounts.flatMap((account) =>
    account.slices.flatMap((slice) => slice.businessDates)));
  const spend = new Map<string, number>();
  for (const target of targets) {
    const date = businessDateKey(target.businessDate);
    spend.set(date, (spend.get(date) ?? 0) + target.adSpend);
  }
  return (date) => (requested.has(date) ? spend.get(date) ?? 0 : undefined);
}

/**
 * Withdraw a held closed day from the frozen monthly facts. Its spend was zero,
 * so allocations stay as they are and only covered dates move: facts ending on
 * the held day now end the day before, and a month that held only that day is
 * dropped.
 */
async function holdUnreportedDay(
  tx: Transaction,
  attempt: SourceAttempt,
  facts: readonly MonthlyFact[],
  confirmedEnd: string,
): Promise<MonthlyFact[]> {
  const heldDay = dateOnly(shiftBusinessDateKey(confirmedEnd, 1));
  const end = dateOnly(confirmedEnd);
  const endingOnHeldDay = {
    organizationId: attempt.organizationId,
    sourceImportRunId: attempt.id,
    coveredEndDate: heldDay,
  };
  await tx.channelAdListingProductMonthlyFact.deleteMany({
    where: { ...endingOnHeldDay, coveredStartDate: heldDay },
  });
  const starts = [...new Set(facts
    .filter((fact) => fact.coveredEndDate.getTime() === heldDay.getTime()
      && fact.coveredStartDate.getTime() < heldDay.getTime())
    .map((fact) => businessDateKey(fact.coveredStartDate)))];
  for (const start of starts) {
    await tx.channelAdListingProductMonthlyFact.updateMany({
      where: { ...endingOnHeldDay, coveredStartDate: dateOnly(start) },
      data: { coveredEndDate: end, observedTargetDayCount: inclusiveDayCount(dateOnly(start), end) },
    });
  }
  return facts.flatMap((fact) => {
    if (fact.coveredEndDate.getTime() !== heldDay.getTime()) return [fact];
    if (fact.coveredStartDate.getTime() === heldDay.getTime()) return [];
    return [{
      ...fact,
      coveredEndDate: end,
      observedTargetDayCount: inclusiveDayCount(fact.coveredStartDate, end),
    }];
  });
}

/** The last business date a generation's plan requested; its confirmed end when the plan has no slices. */
function requestedCoverageEnd(run: SourceAttempt): string {
  const ends = parseStoredPlan(run.plan).accounts
    .flatMap((account) => account.slices.map((slice) => slice.to))
    .sort();
  return ends.at(-1) ?? businessDateKey(run.coverageEndDate!);
}

function dateOnly(value: string): Date {
  const parsed = parseDate(value);
  if (!parsed) throw new UnprocessableEntityException('ADVERTISING_DATE_INVALID');
  return parsed;
}

function monthEnd(month: string): string {
  return kstMonthEnd(month);
}

function monthsBetween(from: string, to: string): string[] {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || start > end) throw new UnprocessableEntityException('ADVERTISING_COVERAGE_INVALID');
  const values: string[] = [];
  for (let cursor = start.getUTCFullYear() * 12 + start.getUTCMonth();
    cursor <= end.getUTCFullYear() * 12 + end.getUTCMonth(); cursor += 1) {
    values.push(`${Math.floor(cursor / 12)}-${String((cursor % 12) + 1).padStart(2, '0')}`);
  }
  return values;
}

export function profitabilityCoverageForKstYesterday(
  now: Date,
): ProfitabilityCoverage {
  const to = businessDateKey(evidenceCutoffDate(now));
  const months = calendarMonthsThrough(to, PROFITABILITY_EVALUATION_MONTH_COUNT);
  const periods = months.map((month) => ({
    month,
    from: `${month}-01`,
    to: month === to.slice(0, 7) ? to : monthEnd(month),
    businessDates: businessDates(
      `${month}-01`,
      month === to.slice(0, 7) ? to : monthEnd(month),
    ),
  }));
  return {
    months,
    from: periods[0]!.from,
    to,
    periods,
  };
}

function calendarMonthsThrough(to: string, count: number): string[] {
  return kstMonthRange(kstMonthEnd(to.slice(0, 7)), count);
}

function businessDates(from: string, to: string): string[] {
  const start = dateOnly(from);
  const end = dateOnly(to);
  return datesInclusive(start, end).map(businessDateKey);
}

function boundedPlanText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
  }
  return value.trim();
}

function boundedPlanDate(value: unknown): string {
  if (typeof value !== 'string' || !parseDate(value)) throw new UnprocessableEntityException('ADVERTISING_PLAN_INVALID');
  return value;
}

function boundedSnapshotLimit(value: number | undefined): number {
  const limit = value ?? MAX_SNAPSHOT_GENERATIONS;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SNAPSHOT_GENERATIONS) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_CATALOG_OVERFLOW');
  }
  return limit;
}

function compareLowercase(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}

function safeKrwNumber(value: bigint | number): number {
  const normalized = typeof value === 'bigint'
    ? value
    : Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : null;
  if (normalized === null || normalized < 0n || normalized > MAX_SAFE_KRW_BIGINT) {
    throw new UnprocessableEntityException('ADVERTISING_SPEND_OVERFLOW');
  }
  return Number(normalized);
}

function safeQualityNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE_KRW_BIGINT) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  return Number(value);
}

function assertChecksum(value: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new UnprocessableEntityException('INVALID_RECEIPT_CHECKSUM');
  }
}
