import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { Sourcing1688KeywordBatchInputSchema, type Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
import { kstBusinessDate } from '../../../common/kst';
import { SOURCING_1688_KEYWORD_SEARCH_PORT, Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError, type Search1688KeywordSession,
  type Sourcing1688KeywordSearchPort } from '../port/out/provider/1688-keyword-search.port';
import { SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION } from '../port/out/repository/sourcing-1688-search-result.repository.port';
import { hashCollectionRequest, map1688HotProductsToAuthorizedOutput, normalizeCollectionTarget } from './sourcing-collection-mappers';
import { boundedKey, SourcingServerOperationRunner, type SourcingSourceAttempt } from './sourcing-server-operation.runner';
import { batchResult, failedUnit, searchUnit, sourceAlert, stopsKeywordBatch, unitResultOf } from './sourcing-1688-search-result';

const SOURCE = '1688.hot_product';
const KIND = SOURCING_OPERATION_KINDS.keywordSearch1688;
const RESULT_LIMIT = 6;

@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT) private readonly provider: Sourcing1688KeywordSearchPort,
    private readonly runs: SourcingServerOperationRunner,
  ) {}

  async read(input: { organizationId: string; attemptId: string }) {
    const attempt = await this.runs.read(input.organizationId, input.attemptId, [KIND]);
    if (!attempt || attempt.sourceKey !== SOURCE || attempt.scopeKey !== 'default'
      || typeof attempt.plan.keyword !== 'string' || attempt.plan.maxResults !== RESULT_LIMIT) {
      throw new KiditemNotFoundError('OPERATION_NOT_FOUND', { details: { attemptId: input.attemptId } });
    }
    return { attempt, unit: unitResultOf(attempt, SOURCE) };
  }

  async search(input: { organizationId: string; requestedByUserId: string | null; idempotencyKey: string; input: unknown; signal?: AbortSignal }) {
    const parsed = Sourcing1688KeywordBatchInputSchema.safeParse(input.input);
    if (!parsed.success) throw new BadRequestException('INVALID_1688_KEYWORD_REQUEST');
    const key = boundedKey(input.idempotencyKey);
    const signal = input.signal ?? AbortSignal.timeout(15 * 60_000);
    const attempts: SourcingSourceAttempt[] = [];
    const units: Sourcing1688BatchUnitResult[] = [];
    let session: Search1688KeywordSession | null = null;
    try {
      for (const keyword of parsed.data.keywords) {
        signal.throwIfAborted();
        const targetKey = normalizeCollectionTarget(keyword);
        const plan = { source: SOURCE, keyword, maxResults: RESULT_LIMIT };
        const run = await this.runs.begin({
          organizationId: input.organizationId, userId: input.requestedByUserId, kind: KIND,
          requestIdempotencyKey: hashCollectionRequest({ key, targetKey }),
          scope: { sourceKey: SOURCE, scopeKey: 'default', targetKey,
            requestFingerprint: hashCollectionRequest({ keyword: targetKey, maxResults: RESULT_LIMIT }),
            attemptPlan: plan, planChecksum: hashCollectionRequest(plan),
            collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY, collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
            failureAlert: sourceAlert(SOURCE, targetKey) },
        });
        const { attempt } = run;
        if (!run.created) {
          attempts.push(attempt);
          if (attempt.state === 'RUNNING') return { attempts, result: null };
          const unit = unitResultOf(attempt, SOURCE);
          if (!unit) throw new BadRequestException('1688 search result is not yet available.');
          units.push(unit);
          if (stopsKeywordBatch(unit)) break;
          continue;
        }
        let unit: Sourcing1688BatchUnitResult;
        let output;
        let unexpected: unknown;
        try {
          session ??= await this.provider.openSession({ signal });
          const items = (await session.searchKeyword({ keyword, signal })).slice(0, RESULT_LIMIT);
          signal.throwIfAborted();
          const accepted = items.filter((item) => item.offerId);
          const capturedAt = new Date();
          unit = searchUnit(keyword, null, items.length, items.length - accepted.length);
          output = map1688HotProductsToAuthorizedOutput({ permit: this.runs.permit(input.organizationId, run),
            rows: accepted.map((item, index) => ({ organizationId: input.organizationId,
              businessDate: kstBusinessDate(capturedAt), offerId: item.offerId as string, sourceKeyword: keyword,
              rank: index + 1, title: item.title, priceCny: item.priceCny, monthlySales: item.monthlySales,
              repurchaseRate: item.repurchaseRate, tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
              supplierName: item.supplierName, imageUrl: item.imageUrl, sourceUrl: item.sourceUrl,
              capturedAt, searchMetadata: { score: item.score } })),
            discoveredCount: items.length, rejectedCount: unit.failed,
          });
        } catch (error) {
          unit = failedUnit(keyword, null, error);
          output = { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 1, qualityReport: {} };
          if (!(error instanceof Sourcing1688KeywordAttentionError) && !(error instanceof Sourcing1688KeywordProviderError)) unexpected = error;
        }
        output.qualityReport = { resultSchemaVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
          keyword, targetId: null, unitResult: unit };
        const terminal = await this.runs.complete(input.organizationId, run, output, {
          contentChecksum: hashCollectionRequest(output), windowStartAt: null, windowEndAt: null });
        attempts.push(terminal);
        units.push(unit);
        if (unexpected) throw unexpected;
        if (stopsKeywordBatch(unit)) break;
      }
    } finally {
      await session?.close();
    }
    return { attempts, result: batchResult(units, '1688_keyword_search', attempts) };
  }
}
