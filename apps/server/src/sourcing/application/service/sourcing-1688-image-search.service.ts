import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Sourcing1688ImageMatchInputSchema, type Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
import { kstBusinessDate } from '../../../common/kst';
import { extractSupplierOfferId, parseAllowedSupplierUrl } from '../../domain/supplier-source-url-policy';
import { SOURCING_1688_IMAGE_SEARCH_PORT, type Sourcing1688ImageSearchPort } from '../port/out/provider/1688-image-search.port';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { SOURCING_1688_IMAGE_COLLECTOR_KEY, SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION, type Sourcing1688SearchResultRepositoryPort } from '../port/out/repository/sourcing-1688-search-result.repository.port';
import { hashCollectionRequest, map1688HotProductsToAuthorizedOutput } from './sourcing-collection-mappers';
import { requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import { batchResult, failedUnit, searchUnit, sourceAlert } from './sourcing-1688-search-result';

const SOURCE = '1688.image_search';
const RESULT_LIMIT = 18;

@Injectable()
export class Sourcing1688ImageSearchService {
  constructor(
    @Inject(SOURCING_1688_IMAGE_SEARCH_PORT) private readonly imageSearch: Sourcing1688ImageSearchPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT) private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT) private readonly searchResults: Sourcing1688SearchResultRepositoryPort,
  ) {}

  async read(input: { organizationId: string; attemptId: string }) {
    const attempt = await this.attempts.readAttempt(input);
    if (!attempt || attempt.sourceKey !== SOURCE || attempt.scopeKey !== 'default'
      || typeof attempt.plan.targetId !== 'string' || attempt.plan.maxResults !== RESULT_LIMIT) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    const unit = attempt.state === 'RUNNING' ? null
      : await this.searchResults.findUnitResult({ ...input, sourceKey: SOURCE });
    return { attempt, unit };
  }

  async search(input: { organizationId: string; requestedByUserId: string | null; idempotencyKey: string; input: unknown; signal?: AbortSignal }) {
    const parsed = Sourcing1688ImageMatchInputSchema.safeParse(input.input);
    if (!parsed.success) throw new BadRequestException('INVALID_1688_IMAGE_REQUEST');
    const key = requireIdempotencyKey(input.idempotencyKey);
    const signal = input.signal ?? AbortSignal.timeout(15 * 60_000);
    const resolved = await this.searchResults.resolveImageTargets({ organizationId: input.organizationId, targetIds: parsed.data.targetIds });
    const targets = new Map(resolved.targets.map((target) => [target.targetId, target]));
    const attempts: SourcingBrowserSourceAttempt[] = [];
    const units: Sourcing1688BatchUnitResult[] = [];
    for (const targetId of parsed.data.targetIds) {
      signal.throwIfAborted();
      const target = targets.get(targetId);
      const keyword = target?.searchQuery.trim() || 'unauthorized-target';
      const targetKey = `image-target:${hashCollectionRequest(targetId)}`;
      const plan = { source: SOURCE, targetId, imageUrl: target?.imageUrl ?? null, keyword, maxResults: RESULT_LIMIT };
      const { attempt, created } = await this.attempts.beginAttempt({
        organizationId: input.organizationId, sourceKey: SOURCE, scopeKey: 'default', targetKey,
        idempotencyKey: hashCollectionRequest({ key, targetId }),
        requestFingerprint: hashCollectionRequest({ targetId, maxResults: RESULT_LIMIT }),
        plan, planChecksum: hashCollectionRequest(plan), requestedByUserId: input.requestedByUserId,
        collectorKey: SOURCING_1688_IMAGE_COLLECTOR_KEY, collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        triggerKind: 'manual', expiresInMs: 15 * 60_000, failureAlert: sourceAlert(SOURCE, targetKey),
      });
      if (!created) {
        attempts.push(attempt);
        if (attempt.state === 'RUNNING') return { attempts, result: null };
        const unit = await this.searchResults.findUnitResult({ organizationId: input.organizationId, attemptId: attempt.attemptId, sourceKey: SOURCE });
        if (!unit) throw new BadRequestException('1688 search result is not yet available.');
        units.push(unit);
        continue;
      }
      let unit: Sourcing1688BatchUnitResult;
      let output;
      if (!target || resolved.missingTargetIds.includes(targetId)) {
        unit = { keyword, targetId, outcome: 'failed', discovered: 0, accepted: 0, duplicate: 0, failed: 1, errorCode: 'target_not_authorized' };
        output = { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 1, qualityReport: {} };
      } else {
        try {
          const result = await this.imageSearch.searchByImage({ imageUrl: target.imageUrl, keyword, maxResults: RESULT_LIMIT, signal });
          signal.throwIfAborted();
          const capturedAt = new Date();
          let rejectedCount = 0;
          const rows = result.items.flatMap((item, index) => {
            try {
              const supplier = parseAllowedSupplierUrl(item.sourceUrl);
              const offerId = extractSupplierOfferId(supplier);
              if (!offerId) { rejectedCount += 1; return []; }
              return [{ organizationId: input.organizationId, businessDate: kstBusinessDate(capturedAt), offerId,
                sourceKeyword: keyword, rank: index + 1, title: item.title, priceCny: item.priceCny,
                monthlySales: item.salesNum ?? null, repurchaseRate: item.repurchaseRate ?? null,
                tradeScore: item.serviceScore == null ? null : String(item.serviceScore), supplierName: item.supplierName ?? null,
                imageUrl: item.imageUrl, sourceUrl: supplier.normalizedUrl, capturedAt,
                searchMetadata: { score: item.score, salesText: item.salesText ?? null,
                  supplierFactoryUrl: item.supplierFactoryUrl ?? null, supplierTags: item.supplierTags ?? [],
                  purchaseTags: item.purchaseTags ?? [], minOrderQuantity: item.minOrderQuantity ?? null,
                  shippingFulfillmentRate: item.shippingFulfillmentRate ?? null, shippingPickupRate: item.shippingPickupRate ?? null,
                  shipFrom: item.shipFrom ?? null, serviceScore: item.serviceScore ?? null } }];
            } catch { rejectedCount += 1; return []; }
          });
          unit = searchUnit(keyword, targetId, result.items.length, rejectedCount);
          output = map1688HotProductsToAuthorizedOutput({ permit: toPermit(attempt, input.organizationId), rows,
            discoveredCount: result.items.length, rejectedCount });
        } catch (error) {
          signal.throwIfAborted();
          unit = failedUnit(keyword, targetId, error);
          output = { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 1, qualityReport: {} };
        }
      }
      output.qualityReport = { resultSchemaVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION, keyword, targetId, unitResult: unit };
      const terminal = await this.attempts.completeAttempt({ organizationId: input.organizationId,
        attemptId: attempt.attemptId, attemptToken: attempt.attemptToken, planChecksum: attempt.planChecksum,
        contentChecksum: hashCollectionRequest(output), output });
      attempts.push(terminal);
      units.push(unit);
    }
    return { attempts, result: batchResult(units, '1688_image_match', attempts) };
  }
}
