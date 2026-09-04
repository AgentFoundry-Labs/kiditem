import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  AdvertisingCompetitorCatalogBatchSchema,
  AdvertisingCompetitorCatalogInputSchema,
  sourcingWingCatalogKeywordIdentity,
  type AdvertisingCompetitorCatalogBatch,
} from '@kiditem/shared/sourcing';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import {
  AD_INGEST_TRANSACTION_PORT,
  type AdIngestTransactionPort,
} from '../port/out/transaction/ad-ingest-transaction.port';
import { CompetitorTrackingService } from './competitor-tracking.service';
import { KeywordRankIngestHandler } from './keyword-rank-ingest.handler';

const OPERATION_KEY = 'advertising.collect_competitor_catalog';

@Injectable()
export class CompetitorCatalogOperationService {
  constructor(
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
    private readonly tracking: CompetitorTrackingService,
    private readonly keywordRankHandler: KeywordRankIngestHandler,
    @Inject(AD_INGEST_TRANSACTION_PORT)
    private readonly ingestTransaction: AdIngestTransactionPort,
  ) {}

  async ingest(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: AdvertisingCompetitorCatalogBatch;
  }): Promise<{
    captured: number;
    ignored: number;
    ignoredReasons: {
      missingSerpSnapshot: number;
      newerCatalogPreserved: number;
    };
    replayed: boolean;
  }> {
    const batch = AdvertisingCompetitorCatalogBatchSchema.parse(input.batch);
    return this.attemptVerifier.withActiveBrowserAttemptFence(
      {
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: OPERATION_KEY,
        attemptToken: input.attemptToken,
      },
      async (attempt, transaction) => {
        const operationInput = AdvertisingCompetitorCatalogInputSchema.safeParse(
          attempt.input,
        );
        if (!operationInput.success) {
          throw new ConflictException('competitor_catalog_operation_input_invalid');
        }
        const { targets } = await this.tracking.getSellerTargets(
          input.organizationId,
          30,
          200,
        );
        const targetBySellerId = new Map(
          targets.map((target) => [target.sellerId, target]),
        );
        if (
          operationInput.data.target === 'seller_id' &&
          (batch.catalogs.length !== 1 ||
            batch.catalogs[0]?.sellerId !== operationInput.data.sellerId)
        ) {
          throw new ConflictException('competitor_catalog_target_mismatch');
        }
        for (const catalog of batch.catalogs) {
          const target = targetBySellerId.get(catalog.sellerId);
          if (
            !target ||
            target.sellerStoreUrl !== catalog.sellerStoreUrl ||
            sourcingWingCatalogKeywordIdentity(target.keyword) !==
              sourcingWingCatalogKeywordIdentity(catalog.keyword)
          ) {
            throw new ConflictException('competitor_catalog_target_mismatch');
          }
        }
        const latestCapturedAt = batch.catalogs
          .map((catalog) => catalog.capturedAt)
          .sort()
          .at(-1)!;
        const markerHash = createHash('sha256')
          .update(JSON.stringify(batch))
          .digest('hex');
        const persisted = await this.ingestTransaction.runIdempotentInAttempt(
          transaction,
          {
            organizationId: input.organizationId,
            idempotencyKey:
              `competitor-catalog-operation:${input.operationRunId}:${markerHash}`,
          },
          async () => {
            const result = await this.keywordRankHandler.executeSellerCatalogs(
              {
                type: 'competitor_seller_catalog',
                source: 'coupang-seller-shop',
                timestamp: latestCapturedAt,
                data: batch.catalogs,
              },
              input.organizationId,
            );
            const ignoredReasons = {
              missingSerpSnapshot: result.ignored.filter(
                (item) => item.reason === 'serp_snapshot_missing',
              ).length,
              newerCatalogPreserved: result.ignored.filter(
                (item) => item.reason === 'newer_catalog_preserved',
              ).length,
            };
            return {
              captured: result.results.length,
              ignored: result.ignored.length,
              ignoredReasons,
            };
          },
        );
        return { ...persisted.value, replayed: persisted.replayed };
      },
    );
  }
}
