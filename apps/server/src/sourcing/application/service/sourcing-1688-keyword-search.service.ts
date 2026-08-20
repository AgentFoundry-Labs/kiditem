import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  canonicalizeSourcingWingCatalogKeyword,
  type Sourcing1688BatchUnitResult,
} from '@kiditem/shared/sourcing';
import { kstBusinessDate } from '../../../common/kst';
import type { Search1688KeywordSession } from '../port/out/provider/1688-keyword-search.port';
import {
  SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
  type Sourcing1688CompletedKeywordRunInput,
  type Sourcing1688SearchResultRepositoryPort,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import {
  SourcingCollectionCoordinator,
  type ActiveOperationAttemptCommitFence,
} from './sourcing-collection-coordinator.service';

const OPERATION_KEYWORD_RESULT_LIMIT = 6;

/**
 * Persists one operation-owned 1688 keyword result. Browser ownership stays
 * with the caller's batch session; this service only claims and commits the
 * typed, fenced canonical observation.
 */
@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT)
    private readonly searchResults: Sourcing1688SearchResultRepositoryPort,
  ) {}

  async searchForOperation(input: {
    organizationId: string;
    operationRunId: string;
    actorUserId: string | null;
    keyword: string;
    session: Search1688KeywordSession;
    signal: AbortSignal;
    operationCheckpoint: () => Promise<void>;
    commitWithinActiveOperationAttempt: ActiveOperationAttemptCommitFence;
  }): Promise<Sourcing1688BatchUnitResult> {
    const keyword = canonicalizeSourcingWingCatalogKeyword(input.keyword);
    const targetKey = normalizeCollectionTarget(keyword);
    const idempotencyKey = `1688-keyword-operation:${input.operationRunId}:${hashCollectionRequest(
      targetKey,
    )}`;
    const requestHash = hashCollectionRequest({
      operationRunId: input.operationRunId,
      keyword,
      maxResults: OPERATION_KEYWORD_RESULT_LIMIT,
    });
    let discovered = 0;
    let rejected = 0;
    const execution = await this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey,
        idempotencyKey,
        requestHash,
        collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        triggerKind: 'manual',
        triggeredByUserId: input.actorUserId,
        leaseDurationMs: 15 * 60_000,
        signal: input.signal,
        operationCheckpoint: input.operationCheckpoint,
        commitWithinActiveOperationAttempt: input.commitWithinActiveOperationAttempt,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        await input.operationCheckpoint();
        input.signal.throwIfAborted();
        const items = (await input.session.searchKeyword({ keyword, signal: input.signal }))
          .slice(0, OPERATION_KEYWORD_RESULT_LIMIT);
        discovered = items.length;
        const acceptedItems = items.filter((item) => item.offerId);
        rejected = items.length - acceptedItems.length;
        input.signal.throwIfAborted();
        await input.operationCheckpoint();
        await checkpoint();
        const capturedAt = new Date();
        return map1688HotProductsToAuthorizedOutput({
          permit,
          rows: acceptedItems.map((item, index) => ({
            organizationId: input.organizationId,
            businessDate: kstBusinessDate(capturedAt),
            offerId: item.offerId as string,
            sourceKeyword: keyword,
            rank: index + 1,
            title: item.title,
            priceCny: item.priceCny,
            monthlySales: item.monthlySales,
            repurchaseRate: item.repurchaseRate,
            tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
            supplierName: item.supplierName,
            imageUrl: item.imageUrl,
            sourceUrl: item.sourceUrl,
            capturedAt,
            searchMetadata: { score: item.score },
          })),
          rejectedCount: rejected,
          qualityReport: {
            resultSchemaVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
            keyword,
            targetId: null,
            operationRunId: input.operationRunId,
          },
        });
      },
    );
    if (execution.kind === 'existing') {
      return this.replayExisting({
        organizationId: input.organizationId,
        runId: execution.runId,
        operationRunId: input.operationRunId,
        keyword,
        targetKey,
        idempotencyKey,
        requestHash,
      });
    }

    const persisted = execution.acceptedCount + execution.duplicateCount;
    const allRejected = discovered > 0 && persisted === 0 && rejected > 0;
    return {
      keyword,
      targetId: null,
      outcome: allRejected ? 'failed' : discovered > 0 ? 'complete' : 'no_change',
      discovered,
      accepted: execution.acceptedCount,
      duplicate: execution.duplicateCount,
      failed: rejected,
    };
  }

  private async replayExisting(
    input: Sourcing1688CompletedKeywordRunInput,
  ): Promise<Sourcing1688BatchUnitResult> {
    const observation = await this.searchResults.findCompletedKeywordRun(input);
    if (!observation) {
      throw new BadRequestException('Completed keyword search result is unavailable.');
    }
    return {
      keyword: input.keyword,
      targetId: null,
      outcome: observation.items.length > 0 ? 'complete' : 'no_change',
      discovered: observation.items.length,
      accepted: 0,
      duplicate: observation.items.length,
      failed: 0,
    };
  }
}
