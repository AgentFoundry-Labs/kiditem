import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Sourcing1688KeywordBatchInputSchema, type Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
import { kstBusinessDate } from '../../../common/kst';
import { SOURCING_1688_KEYWORD_SEARCH_PORT, Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError, type Search1688KeywordSession,
  type Sourcing1688KeywordSearchPort } from '../port/out/provider/1688-keyword-search.port';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT, SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
  type Sourcing1688SearchResultRepositoryPort } from '../port/out/repository/sourcing-1688-search-result.repository.port';
import { hashCollectionRequest, map1688HotProductsToAuthorizedOutput, normalizeCollectionTarget } from './sourcing-collection-mappers';
import { requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import { batchResult, failedUnit, searchUnit, sourceAlert, stopsKeywordBatch } from './sourcing-1688-search-result';

const SOURCE = '1688.hot_product';
const RESULT_LIMIT = 6;

@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT) private readonly provider: Sourcing1688KeywordSearchPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT) private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT) private readonly searchResults: Sourcing1688SearchResultRepositoryPort,
  ) {}

  async read(input: { organizationId: string; attemptId: string }) {
    const attempt = await this.attempts.readAttempt(input);
    if (!attempt || attempt.sourceKey !== SOURCE || attempt.scopeKey !== 'default'
      || typeof attempt.plan.keyword !== 'string' || attempt.plan.maxResults !== RESULT_LIMIT) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    const unit = attempt.state === 'RUNNING' ? null
      : await this.searchResults.findUnitResult({ ...input, sourceKey: SOURCE });
    return { attempt, unit };
  }

  async search(input: { organizationId: string; requestedByUserId: string | null; idempotencyKey: string; input: unknown; signal?: AbortSignal }) {
    const parsed = Sourcing1688KeywordBatchInputSchema.safeParse(input.input);
    if (!parsed.success) throw new BadRequestException('INVALID_1688_KEYWORD_REQUEST');
    const key = requireIdempotencyKey(input.idempotencyKey);
    const signal = input.signal ?? AbortSignal.timeout(15 * 60_000);
    const attempts: SourcingBrowserSourceAttempt[] = [];
    const units: Sourcing1688BatchUnitResult[] = [];
    let session: Search1688KeywordSession | null = null;
    try {
      for (const keyword of parsed.data.keywords) {
        signal.throwIfAborted();
        const targetKey = normalizeCollectionTarget(keyword);
        const plan = { source: SOURCE, keyword, maxResults: RESULT_LIMIT };
        const { attempt, created } = await this.attempts.beginAttempt({
          organizationId: input.organizationId, sourceKey: SOURCE, scopeKey: 'default', targetKey,
          idempotencyKey: hashCollectionRequest({ key, targetKey }),
          requestFingerprint: hashCollectionRequest({ keyword: targetKey, maxResults: RESULT_LIMIT }),
          plan, planChecksum: hashCollectionRequest(plan), requestedByUserId: input.requestedByUserId,
          collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY, collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
          triggerKind: 'manual', expiresInMs: 15 * 60_000, failureAlert: sourceAlert(SOURCE, targetKey),
        });
        if (!created) {
          attempts.push(attempt);
          if (attempt.state === 'RUNNING') return { attempts, result: null };
          const unit = await this.searchResults.findUnitResult({ organizationId: input.organizationId, attemptId: attempt.attemptId, sourceKey: SOURCE });
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
          output = map1688HotProductsToAuthorizedOutput({ permit: toPermit(attempt, input.organizationId),
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
        const terminal = await this.attempts.completeAttempt({ organizationId: input.organizationId,
          attemptId: attempt.attemptId, attemptToken: attempt.attemptToken, planChecksum: attempt.planChecksum,
          contentChecksum: hashCollectionRequest(output), output, failureAlert: sourceAlert(SOURCE, targetKey) });
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
