import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type SourceGenerationView,
} from '../../../../finance/application/port/in/master-product-profitability-read.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readListingTrafficWindowFacts,
} from '../../../../channels/read/channel-listing-daily-facts';
import { readOrderWindowFacts } from '../../../../orders/read/order-facts.reader';
import { productAbcEvidenceCutoff } from '../../../domain/product-abc-display-status';
import {
  businessDateKey,
  kstDayStart,
  parseBusinessDate,
  shiftBusinessDateKey,
} from '../../../../common/kst';
import { readProductAbcPublication } from '../../../read/product-abc-publication.reader';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type {
  ProductOperationsDataStatusFacts,
  ProductOperationsDataStatusRepositoryPort,
} from '../../../application/port/out/repository/product-operations-data-status.repository.port';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';
import { deriveSourceReadiness } from '@kiditem/shared/source-readiness';

@Injectable()
export class ProductOperationsDataStatusRepositoryAdapter
implements ProductOperationsDataStatusRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly evidence: ProfitabilityEvidence,
  ) {}

  async read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts> {
    const cutoffDate = productAbcEvidenceCutoff(new Date());
    const periodStart = utcCalendarDate(addCalendarDays(cutoffDate, -(periodDays - 1)));
    // Read the cheap status inputs first, then open the profitability snapshot.
    // The latter fans out to repeatable-read source transactions; keeping it
    // out of this batch prevents one list request from occupying every pool
    // connection with independent read snapshots.
    const [traffic, orders, published, sellingMasterProductIds] = await this.prisma.$transaction(
      async (tx) => Promise.all([
        readListingTrafficWindowFacts(tx, {
          organizationId,
          from: periodStart,
          to: utcCalendarDate(addCalendarDays(cutoffDate, 1)),
          requireMasterProductLink: true,
        }),
        readOrderWindowFacts(tx, {
          organizationId,
          from: kstDayStart(periodStart),
          to: kstDayStart(utcCalendarDate(addCalendarDays(cutoffDate, 1))),
        }),
        readProductAbcPublication(tx, { organizationId }),
        listSellingMasterProductIds(tx, organizationId),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const evidence = await this.evidence.load({ organizationId, targetCutoff: cutoffDate });
    const trafficStatus = sourceStatus({
      includedDates: traffic.coverage.includedDates,
      complete: traffic.coverage.invalidDates.length === 0
        && traffic.coverage.missingDates.length === 0,
      observedAt: traffic.latestObservedAt,
    }, cutoffDate);
    const ordersStatus = sourceStatus({
      includedDates: orders.includedDates,
      complete: orders.orderCount !== null,
      observedAt: orders.observedAt,
    }, cutoffDate);
    const publication = published.publication;
    const sellingMasterProductIdSet = new Set(sellingMasterProductIds);
    const productEvidence = new Map(evidence.products.map((product) => [product.masterProductId, product]));
    const actualCutoff = evidence.actualCutoff;
    return {
      displayDataAsOf: minimumCutoff(
        minimumCutoff(
          trafficStatus.latestComplete?.actualCutoff ?? null,
          ordersStatus.latestComplete?.actualCutoff ?? null,
        ),
        actualCutoff,
      ),
      traffic: trafficStatus,
      orders: ordersStatus,
      actualCutoff,
      sellpia: profitabilitySourceStatus(evidence, 'sellpia'),
      advertising: profitabilitySourceStatus(evidence, 'advertising'),
      sourceVector: {
        sellpia: sourceManifest(evidence.sourceVector.sellpia),
        advertising: sourceManifest(evidence.sourceVector.advertising),
      },
      mappingReady: evidence.mappingGeneration === published.currentMappingGeneration,
      contributionBasis: evidence.contributionBasis,
      formulaState: {
        formulaRevision: publication?.formulaRevision ?? published.currentFormulaRevision,
        publicationRevision: publication?.publicationRevision ?? 0,
        officialCutoff: publication?.officialCutoffDate ?? null,
        publishedAt: publication?.publishedAt ?? null,
        mappingGeneration: published.currentMappingGeneration,
      },
      products: published.products.map((product) => ({
        masterProductId: product.masterProductId,
        abcGrade: product.evaluation?.abcGrade ?? null,
        evaluation: product.evaluation,
        mappingValid: sellingMasterProductIdSet.has(product.masterProductId)
          ? productEvidence.get(product.masterProductId)?.mappingValid ?? false
          : true,
        saleStartDate: productEvidence.get(product.masterProductId)?.saleStartDate ?? null,
      })),
    };
  }
}

function sourceStatus(
  facts: { includedDates: readonly string[]; complete: boolean; observedAt: Date | null },
  cutoffDate: string,
): ProductOperationsDataSourceStatus {
  const includedDates = facts.includedDates;
  if (includedDates.length === 0) {
    return {
      ready: false,
      requiredCutoff: cutoffDate,
      actualCutoff: null,
      latestAttempt: null,
      latestComplete: null,
    };
  }
  const actualCutoff = includedDates[includedDates.length - 1]!;
  const latestComplete = facts.complete && facts.observedAt
    ? { actualCutoff, capturedAt: facts.observedAt.toISOString() }
    : null;
  return {
    ...deriveSourceReadiness({ latestAttempt: null, latestComplete, requiredCutoff: cutoffDate }),
    actualCutoff,
  };
}

/** The evidence owner's readiness for one source, against the cutoff it requires of that source. */
function profitabilitySourceStatus(
  evidence: Awaited<ReturnType<ProfitabilityEvidence['load']>>,
  source: 'sellpia' | 'advertising',
): ProductOperationsDataSourceStatus {
  const status = evidence.sources[source];
  return deriveSourceReadiness({
    latestAttempt: status.latestAttempt,
    latestComplete: status.latestComplete,
    requiredCutoff: status.requiredCutoff,
  });
}

function sourceManifest(source: SourceGenerationView) {
  if (!source.sourceImportRunId || source.publicationSequence === null
    || source.mappingGeneration === null || !source.coverageStartDate
    || !source.coverageEndDate || !source.capturedAt) return null;
  return {
    sourceImportRunId: source.sourceImportRunId,
    generation: source.publicationSequence,
    mappingGeneration: source.mappingGeneration,
    coverageStartDate: source.coverageStartDate,
    coverageEndDate: source.coverageEndDate,
    capturedAt: source.capturedAt,
  };
}

function minimumCutoff(left: string | null, right: string | null): string | null {
  if (!left || !right) return null;
  return left < right ? left : right;
}

function addCalendarDays(date: string, days: number): string {
  return shiftBusinessDateKey(date, days);
}

function utcCalendarDate(date: string): Date {
  const parsed = parseBusinessDate(date);
  if (!parsed) throw new Error(`invalid business date ${date}`);
  return parsed;
}

function calendarDate(date: Date): string {
  return businessDateKey(date);
}
