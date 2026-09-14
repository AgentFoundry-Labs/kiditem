import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import {
  type SellpiaProfitabilityGenerationFacts,
  type SellpiaProfitabilitySourceCatalog,
  type SellpiaProfitabilitySourceReadPort,
} from '../application/port/in/sellpia-profitability-source-read.port';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDateKey } from '../../common/kst';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../common/operator-cancel';
import { readInventorySkuIdentities } from '../../inventory/read/inventory-availability';
import {
  ALERT_DEDUPE_KEY,
  ATTEMPT_TTL_MS,
  PARSER_VERSION,
  SOURCE_TYPE,
  TRANSACTION_TIMEOUT_MS,
  assertAttemptToken,
  assertAttemptWritable,
  assertCoveredMonths,
  assertMappingGeneration,
  assertStagedReplay,
  buildSellpiaProfitabilityPlan,
  boundedCatalogLimit,
  dateOnly,
  failureAlert,
  findAttempt,
  freezeFacts,
  generationMetadata,
  hashJson,
  insertFacts,
  isExpiredRunning,
  lockMapping,
  lockSource,
  MAX_GENERATION_FACT_ROWS,
  normalizeIdempotencyKey,
  normalizeSubmission,
  parsePlan,
  readMappingGeneration,
  toAttemptSummary,
  toAttemptView,
  toCompleteGeneration,
  type InventoryCandidate,
  type SourceAttemptRecord,
} from './sellpia-profitability-source.internal';
import type {
  SellpiaProfitabilityAttempt,
  SellpiaProfitabilityAttemptControl,
  SellpiaProfitabilityAttemptSummary,
  SellpiaProfitabilityCompleteGeneration,
  SellpiaProfitabilitySourceStatus,
} from '@kiditem/shared/source-import';
import type {
  SellpiaProfitabilityFailureBodyDto,
  SellpiaProfitabilitySubmitBodyDto,
} from './dto/sellpia-product-sales.dto';
import {
  readCurrentSellpiaProfitabilityGeneration,
  readExactSellpiaProductMonthlyFacts,
} from './read/sellpia-product-monthly-facts';

export { buildSellpiaProfitabilityPlan } from './sellpia-profitability-source.internal';

@Injectable()
export class SellpiaProfitabilitySourceService
  implements SellpiaProfitabilitySourceReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(
    organizationId: string,
    idempotencyKey: string | undefined,
    request: { normalizedSourceAvailabilityDate?: string } = {},
  ): Promise<SellpiaProfitabilityAttempt> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const now = new Date();
    const plan = buildSellpiaProfitabilityPlan(
      now,
      request.normalizedSourceAvailabilityDate,
    );
    const fingerprint = hashJson({
      normalizedSourceAvailabilityDate:
        request.normalizedSourceAvailabilityDate?.trim() || null,
    });

    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      const existing = await tx.sourceImportRun.findFirst({
        where: { organizationId, sourceType: SOURCE_TYPE, idempotencyKey: key },
      }) as SourceAttemptRecord | null;
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (isExpiredRunning(existing, now)) {
          return toAttemptView(await this.expireAttempt(tx, existing));
        }
        return toAttemptView(existing);
      }

      const expired = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          expiresAt: { lte: now },
        },
      }) as SourceAttemptRecord | null;
      if (expired) await this.expireAttempt(tx, expired);

      const active = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
        select: { id: true },
      });
      if (active) {
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
        });
      }

      const mappingGeneration = await readMappingGeneration(tx, organizationId);
      const created = await tx.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: randomUUID(),
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          expiresAt: new Date(now.getTime() + ATTEMPT_TTL_MS),
          plan,
          parserVersion: PARSER_VERSION,
          mappingGeneration,
          coverageStartDate: dateOnly(plan.from),
          coverageEndDate: dateOnly(plan.to),
        },
      }) as SourceAttemptRecord;
      return toAttemptView(created);
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  async submitAttempt(
    organizationId: string,
    attemptId: string,
    body: SellpiaProfitabilitySubmitBodyDto,
  ): Promise<SellpiaProfitabilityAttempt> {
    const normalized = normalizeSubmission(body);
    const canonicalContent = JSON.stringify(normalized);
    const checksum = createHash('sha256').update(canonicalContent).digest('hex');
    const byteCount = Buffer.byteLength(canonicalContent);

    await this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      await lockMapping(tx, organizationId);
      const attempt = await findAttempt(tx, organizationId, attemptId);
      assertAttemptToken(attempt, body.attemptToken);
      if (attempt.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) {
        assertStagedReplay(attempt, checksum, byteCount);
        return;
      }
      assertAttemptWritable(attempt, body.attemptToken);
      const plan = parsePlan(attempt.plan);
      assertCoveredMonths(plan, normalized.coveredMonths);
      await assertMappingGeneration(tx, attempt);

      const identities = await readInventorySkuIdentities(tx, {
        organizationId,
        selector: { kind: 'all' },
      });
      const candidates: InventoryCandidate[] = identities.map((identity) => ({
        id: identity.sellpiaInventorySkuId,
        code: identity.code,
        barcode: identity.barcode,
        isActive: identity.isActive,
        masterProductId: identity.masterProductId,
      }));
      const facts = freezeFacts(attemptId, plan, normalized.products, candidates);
      if (facts.length === 0 && !normalized.providerBackedEmptyProof) {
        throw new UnprocessableEntityException('EMPTY_COVERAGE_NOT_PROVEN');
      }

      if (attempt.contentChecksum !== null) {
        assertStagedReplay(attempt, checksum, byteCount, facts.length);
        return;
      }

      await insertFacts(tx, organizationId, facts);
      const persistedCount = await tx.sellpiaProductMonthlySales.count({
        where: { organizationId, sourceImportRunId: attemptId },
      });
      if (persistedCount !== facts.length) {
        throw new ConflictException('STAGED_ROW_COUNT_MISMATCH');
      }
      const mappedCount = facts.filter((fact) => fact.masterProductId !== null).length;
      const update = await tx.sourceImportRun.updateMany({
        where: {
          id: attemptId,
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: body.attemptToken,
          contentChecksum: null,
        },
        data: {
          rowCount: persistedCount,
          contentChecksum: checksum,
          contentByteCount: byteCount,
          providerBackedEmptyProof: normalized.providerBackedEmptyProof,
          coveredMonths: normalized.coveredMonths,
          qualityReport: {
            contract: PARSER_VERSION,
            parserVersion: PARSER_VERSION,
            correctedCostEvidence: true,
            provenance: {
              source: 'sellpia_stat_prd_profit',
              costBasis: 'ORDER_TIME_SUPPLY_COST',
              vatIncluded: true,
            },
            contentChecksum: checksum,
            contentByteCount: byteCount,
            mappingGeneration: attempt.mappingGeneration?.toString() ?? '0',
            includedRowCount: facts.length,
            excludedRowCount: 0,
            mappedRowCount: mappedCount,
            unmappedRowCount: facts.length - mappedCount,
            warningCount: facts.length - mappedCount,
            identityHash: hashJson(facts.map((fact) => [
              fact.productCode,
              fact.optionCode,
              fact.yearMonth,
            ])),
          },
        },
      });
      if (update.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });

    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      await lockMapping(tx, organizationId);
      const attempt = await findAttempt(tx, organizationId, attemptId);
      assertAttemptToken(attempt, body.attemptToken);
      if (attempt.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) return toAttemptView(attempt);
      assertAttemptWritable(attempt, body.attemptToken);
      await assertMappingGeneration(tx, attempt);
      if (attempt.contentChecksum === null || attempt.contentByteCount === null) {
        throw new ConflictException('CONTENT_NOT_STAGED');
      }
      const persistedCount = await tx.sellpiaProductMonthlySales.count({
        where: { organizationId, sourceImportRunId: attemptId },
      });
      if (persistedCount !== attempt.rowCount) {
        throw new ConflictException('STAGED_ROW_COUNT_MISMATCH');
      }

      const latest = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          publicationSequence: { not: null },
        },
        orderBy: { publicationSequence: 'desc' },
        select: { publicationSequence: true },
      });
      const publicationSequence = (latest?.publicationSequence ?? 0n) + 1n;
      const importedAt = new Date();
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: attemptId,
          organizationId,
          sourceType: SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: body.attemptToken,
        },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          importedAt,
          publicationSequence,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId,
        dedupeKey: ALERT_DEDUPE_KEY,
        attemptId,
      });
      return toAttemptView({
        ...attempt,
        status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
        importedAt,
        publicationSequence,
        updatedAt: importedAt,
      });
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  async failAttempt(
    organizationId: string,
    attemptId: string,
    body: SellpiaProfitabilityFailureBodyDto,
  ): Promise<SellpiaProfitabilityAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      const attempt = await findAttempt(tx, organizationId, attemptId);
      assertAttemptToken(attempt, body.attemptToken);
      if (attempt.status === SOURCE_IMPORT_RUN_FAILED_STATUS) return toAttemptView(attempt);
      assertAttemptWritable(attempt, body.attemptToken);
      return toAttemptView(await this.failIn(tx, attempt, body.errorCode, body.errorMessage));
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  /**
   * Operator stop without the attempt token. The token-free status view is
   * returned; a terminal attempt is left as it is.
   */
  async cancelAttempt(
    organizationId: string,
    attemptId: string,
  ): Promise<SellpiaProfitabilityAttemptSummary> {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      const attempt = await findAttempt(tx, organizationId, attemptId);
      if (attempt.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return toAttemptSummary(attempt, new Date());
      const settled = isExpiredRunning(attempt, new Date())
        ? await this.expireAttempt(tx, attempt)
        : await this.failIn(tx, attempt, OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE);
      return toAttemptSummary(settled, new Date());
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  private async failIn(
    tx: Prisma.TransactionClient,
    attempt: SourceAttemptRecord,
    errorCode: string,
    errorMessage: string,
  ): Promise<SourceAttemptRecord> {
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: SOURCE_TYPE,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        attemptToken: attempt.attemptToken,
      },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        errorCode,
        errorMessage,
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.recordTerminalOutcome(tx, failureAlert(
      attempt.organizationId,
      attempt.id,
      errorCode,
      errorMessage,
    ));
    return {
      ...attempt,
      status: SOURCE_IMPORT_RUN_FAILED_STATUS,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    };
  }

  /**
   * Owner-control rehydration for an extension restart.  This is intentionally
   * separate from every status/read capability: only an exact, same-org,
   * effective RUNNING attempt can disclose its write fence.
   */
  async readAttemptControl(
    organizationId: string,
    attemptId: string,
  ): Promise<SellpiaProfitabilityAttemptControl> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, organizationId);
      const attempt = await findAttempt(tx, organizationId, attemptId);
      if (isExpiredRunning(attempt, now)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }
      if (attempt.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        throw new ConflictException('ATTEMPT_TERMINAL');
      }
      const plan = parsePlan(attempt.plan);
      return {
        attemptId: attempt.id,
        attemptToken: attempt.attemptToken,
        state: 'RUNNING' as const,
        expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
        plan: {
          from: plan.from,
          to: plan.to,
          coveredMonths: [...plan.coveredMonths],
        },
      };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /**
   * Token-free exact-attempt read for the browser owner after a lost terminal
   * response. The write fence remains available only through control reads.
   */
  async readAttemptStatus(
    organizationId: string,
    attemptId: string,
  ): Promise<SellpiaProfitabilityAttemptSummary> {
    const attempt = await this.prisma.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
    }) as SourceAttemptRecord | null;
    if (!attempt) throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    return toAttemptSummary(attempt, new Date());
  }

  /**
   * Finance-facing read seam. The attempt and completed catalog are read from
   * one repeatable snapshot so a new publication cannot be mixed into an
   * in-flight evidence load.
   */
  async readGenerationCatalog(input: {
    organizationId: string;
    limit?: number;
  }): Promise<SellpiaProfitabilitySourceCatalog> {
    const limit = boundedCatalogLimit(input.limit);
    return this.prisma.$transaction(async (tx) => {
      const [latestAttempt, completed] = await Promise.all([
        tx.sourceImportRun.findFirst({
          where: { organizationId: input.organizationId, sourceType: SOURCE_TYPE },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        tx.sourceImportRun.findMany({
          where: {
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
            publicationSequence: { not: null },
          },
          orderBy: { publicationSequence: 'desc' },
          take: limit,
        }),
      ]);
      const boundedCompleted = completed.slice(0, limit);
      return {
        latestAttempt: latestAttempt
          ? toAttemptSummary(latestAttempt as SourceAttemptRecord, new Date())
          : null,
        completeGenerations: boundedCompleted.map((run) =>
          generationMetadata(run as SourceAttemptRecord)),
      };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /** Reads only the immutable facts belonging to the exact published run ID. */
  async readGenerationFacts(input: {
    organizationId: string;
    sourceImportRunId: string;
    masterProductIds?: readonly string[];
    yearMonths?: readonly string[];
  }): Promise<SellpiaProfitabilityGenerationFacts> {
    return this.prisma.$transaction(async (tx) => {
      const { generation: run, facts: rows } = await readExactSellpiaProductMonthlyFacts(tx, {
        organizationId: input.organizationId,
        sourceImportRunId: input.sourceImportRunId,
        scope: { limit: MAX_GENERATION_FACT_ROWS + 1 },
      });
      if (!run) throw new UnprocessableEntityException('SOURCE_GENERATION_NOT_FOUND');
      const generation = generationMetadata(run);
      if (rows.length > MAX_GENERATION_FACT_ROWS) {
        throw new UnprocessableEntityException('SOURCE_FACTS_OVERFLOW');
      }
      if (rows.length !== generation.quality.includedRowCount) {
        throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
      }
      const facts = [] as SellpiaProfitabilityGenerationFacts['facts'][number][];
      const unmappedFacts = [] as SellpiaProfitabilityGenerationFacts['unmappedFacts'][number][];
      const requestedMasterProductIds = input.masterProductIds
        ? new Set(input.masterProductIds)
        : null;
      const requestedYearMonths = input.yearMonths
        ? new Set(input.yearMonths)
        : null;
      for (const row of rows) {
        assertFactProvenance(row);
        if (row.sourceImportRunId !== input.sourceImportRunId) {
          throw new UnprocessableEntityException('SOURCE_GENERATION_MISMATCH');
        }
        if (!row.coverageStartDate || !row.coverageEndDate) {
          throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
        }
        const coverageStartDate = businessDateKey(row.coverageStartDate);
        const coverageEndDate = businessDateKey(row.coverageEndDate);
        const base = {
          sourceImportRunId: row.sourceImportRunId ?? input.sourceImportRunId,
          productCode: row.productCode,
          optionCode: row.optionCode,
          yearMonth: row.yearMonth,
          coverageStartDate,
          coverageEndDate,
          revenue: row.orderAmount,
          orderTimeSupplyCost: row.inAmount,
          costBasis: 'ORDER_TIME_SUPPLY_COST' as const,
          vatIncluded: true as const,
          capturedAt: row.capturedAt.toISOString(),
        };
        if (requestedYearMonths && !requestedYearMonths.has(row.yearMonth)) continue;
        if (row.masterProductId === null || row.sellpiaInventorySkuId === null) {
          unmappedFacts.push({
            ...base,
            sellpiaInventorySkuId: row.sellpiaInventorySkuId,
            masterProductId: row.masterProductId,
            reason: 'SOURCE_UNMAPPED',
          });
        } else if (!requestedMasterProductIds || requestedMasterProductIds.has(row.masterProductId)) {
          facts.push({
            ...base,
            sellpiaInventorySkuId: row.sellpiaInventorySkuId,
            masterProductId: row.masterProductId,
          });
        }
      }
      return { generation, facts, unmappedFacts };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  async readCanonicalGeneration(
    organizationId: string,
  ): Promise<SellpiaProfitabilityCompleteGeneration | null> {
    return this.prisma.$transaction(async (tx) => {
      const run = await readCurrentSellpiaProfitabilityGeneration(tx, organizationId);
      return run ? toCompleteGeneration(run) : null;
    });
  }

  async readSourceStatus(
    organizationId: string,
  ): Promise<SellpiaProfitabilitySourceStatus> {
    return this.prisma.$transaction(async (tx) => {
      const latestAttempt = await tx.sourceImportRun.findFirst({
        where: { organizationId, sourceType: SOURCE_TYPE },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }) as SourceAttemptRecord | null;
      const latestCompleteRun = await readCurrentSellpiaProfitabilityGeneration(
        tx,
        organizationId,
      );
      const latestComplete = latestCompleteRun
        ? toCompleteGeneration(latestCompleteRun)
        : null;
      const attemptView = latestAttempt
        ? toAttemptSummary(latestAttempt, new Date())
        : null;
      if (!latestComplete) {
        return { latestAttempt: attemptView, latestComplete: null, ready: false };
      }
      const currentTarget = buildSellpiaProfitabilityPlan(new Date()).to;
      return {
        latestAttempt: attemptView,
        latestComplete,
        ready: latestComplete.coveredThrough === currentTarget,
      };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async expireAttempt(
    tx: Prisma.TransactionClient,
    attempt: SourceAttemptRecord,
  ): Promise<SourceAttemptRecord> {
    const message = 'Sellpia profitability collection expired before publication.';
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: SOURCE_TYPE,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        attemptToken: attempt.attemptToken,
      },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: message,
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.recordTerminalOutcome(tx, failureAlert(
      attempt.organizationId,
      attempt.id,
      'ATTEMPT_EXPIRED',
      message,
    ));
    return {
      ...attempt,
      status: SOURCE_IMPORT_RUN_FAILED_STATUS,
      errorCode: 'ATTEMPT_EXPIRED',
      errorMessage: message,
      updatedAt: new Date(),
    };
  }
}

function assertFactProvenance(row: {
  costBasis: string;
  vatIncluded: boolean | null;
}): void {
  if (row.costBasis !== 'ORDER_TIME_SUPPLY_COST' || row.vatIncluded !== true) {
    throw new UnprocessableEntityException('SOURCE_PROVENANCE_MALFORMED');
  }
}
