import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { collectedDraftHref } from '../../domain/collected-draft-href';
import { SourceRecordDuplicateError } from '../../domain/source-record-admission';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttempt, type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { SOURCE_RECORD_REPOSITORY_PORT, type SourceRecordRepositoryPort } from '../port/out/repository/source-record.repository.port';
import { SALES_PRODUCT_DRAFT_PORT, type SalesProductDraftPort } from '../port/out/cross-domain/sales-product-draft.port';
import { SOURCING_BROWSER_SCRAPE_PORT, type SourcingBrowserScrapePort } from '../port/out/runtime/sourcing-browser-scrape.port';
import { parseAllowedSupplierUrl } from '../../domain/supplier-source-url-policy';
import { hashCollectionRequest } from './sourcing-collection-mappers';
import { requireIdempotencyKey } from './sourcing-source-attempt-primitives';
import { prepareSourcingScrapeResult } from './sourcing-scrape-result.service';
import { ALREADY_COLLECTED_CODE, refusalForSourceUrl } from './source-record-refusal';
import type { AuthorizedCollectionOutput } from '../port/out/repository/sourcing-collection.repository.port';

@Injectable()
export class SourcingScrapeUrlService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT) private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCE_RECORD_REPOSITORY_PORT) private readonly records: SourceRecordRepositoryPort,
    @Inject(SALES_PRODUCT_DRAFT_PORT) private readonly drafts: SalesProductDraftPort,
    @Inject(SOURCING_BROWSER_SCRAPE_PORT) private readonly browser: SourcingBrowserScrapePort,
  ) {}

  /**
   * 공급사 URL 하나를 수집한다. 원본 기록과 그 초안은 수집 종료 트랜잭션에서 함께 생긴다(KID-313).
   * 같은 원본을 이미 수집했으면 수집을 시작하지 않고 409 로 기존 초안 · 판매 상품을 알린다.
   */
  async collect(input: { organizationId: string; userId: string | null; sourceUrl: string; idempotencyKey: string }) {
    const plan = scrapePlan(input.sourceUrl);
    const checksum = hashCollectionRequest(plan);
    const failureAlert = scrapeAlert(plan.source);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const replay = await this.attempts.readScrapeUrlAttemptByKey({ organizationId: input.organizationId,
      sourceKey: plan.source, idempotencyKey, requestFingerprint: checksum });
    if (replay) return scrapeResponse(replay);
    const refusal = await refusalForSourceUrl(this.records, this.drafts, input.organizationId, plan.sourceUrl);
    if (refusal) throw new SourceRecordDuplicateError(refusal);
    const { attempt, created } = await this.attempts.beginAttempt({ organizationId: input.organizationId,
      sourceKey: plan.source, scopeKey: 'product-url', targetKey: hashCollectionRequest(plan.sourceUrl),
      idempotencyKey, requestFingerprint: checksum,
      plan, planChecksum: checksum, requestedByUserId: input.userId, collectorKey: 'sourcing-playwright',
      collectorVersion: 'sourcing-scrape-url/v1', triggerKind: 'manual', expiresInMs: 15 * 60_000, failureAlert });
    if (!created) return scrapeResponse(attempt);
    try {
      const terminal = { organizationId: input.organizationId, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
        planChecksum: checksum, failureAlert };
      const output = await this.browser.scrapeProductUrl({ sourceUrl: plan.sourceUrl });
      const sourceRecord = prepareSourcingScrapeResult({ organizationId: input.organizationId, triggeredByUserId: input.userId, output });
      if (sourceRecord.sourceUrl !== plan.sourceUrl) throw new BadRequestException('SOURCE_SCRAPE_CANDIDATE_MISMATCH');
      const capturedAt = new Date();
      const evidence: AuthorizedCollectionOutput = { observations: [{
        organizationId: input.organizationId, operationId: attempt.attemptId, sourceKey: plan.source,
        platform: plan.platform, evidenceFamily: 'supplier_product_scrape', signalRole: 'supply', granularity: 'supply_catalog',
        conceptKey: null, sourceEntityType: 'supplier_offer', sourceEntityId: sourceRecord.externalOfferId ?? plan.sourceUrl,
        schemaVersion: 'sourcing-scrape-url/v1', observationKey: attempt.attemptId, revision: 1, supportsCandidate: true,
        sourceUrl: plan.sourceUrl, eventAt: capturedAt, observedAt: capturedAt, availableAt: capturedAt,
        revisionAt: null, ingestedAt: capturedAt, payloadHash: hashCollectionRequest(sourceRecord.rawData), rawPayload: sourceRecord.rawData,
      }], typedRecords: [], discoveredCount: 1, rejectedCount: 0, qualityReport: {} };
      return scrapeResponse(await this.attempts.completeScrapeUrlAttempt({ ...terminal, sourceRecord,
        contentChecksum: hashCollectionRequest(output), output: evidence, sourceWindowEndAt: capturedAt }));
    } catch (error) {
      // Provider IO is never retried here. Only a new explicit request may retry a failed owner attempt.
      // 이미 수집한 원본이면 원천 실패가 아니다 — 알림 없이 수집을 멈추고 같은 409 로 답한다.
      const duplicate = error instanceof SourceRecordDuplicateError;
      const failed = await this.attempts.failAttempt({ organizationId: input.organizationId, attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken, code: duplicate ? ALREADY_COLLECTED_CODE : 'SOURCE_SCRAPE_FAILED',
        message: (error instanceof Error ? error.message : 'URL 수집에 실패했습니다.').slice(0, 1000) });
      if (duplicate) throw error;
      return scrapeResponse(failed);
    }
  }

  /** 수집 화면의 상태 한 줄. 이미 수집한 원본이면 그 초안 주소를 함께 준다. */
  async status(organizationId: string, sourceUrl: string) {
    const plan = scrapePlan(sourceUrl);
    const [source, refusal] = await Promise.all([
      this.attempts.readSourceStatus({ organizationId, sourceKey: plan.source, scopeKey: 'product-url',
        targetKey: hashCollectionRequest(plan.sourceUrl), currentPlanChecksum: hashCollectionRequest(plan) }),
      refusalForSourceUrl(this.records, this.drafts, organizationId, plan.sourceUrl),
    ]);
    const salesProductId = refusal?.existing.salesProductId ?? null;
    return { status: refusal ? 'collected' : 'available', sourceRecordId: refusal?.existing.sourceRecordId ?? null,
      salesProductId, href: salesProductId ? collectedDraftHref(salesProductId) : null,
      platform: plan.platform, source: { ...source, latestAttempt: publicAttempt(source.latestAttempt), latestComplete: publicAttempt(source.latestComplete) } };
  }
}

function scrapePlan(sourceUrl: string) {
  try { const supplier = parseAllowedSupplierUrl(sourceUrl);
    return { source: `${supplier.platform}.scrape_url`, sourceUrl: supplier.normalizedUrl, platform: supplier.platform };
  } catch { throw new BadRequestException('지원하지 않는 공급사 상품 URL입니다.'); }
}

function scrapeAlert(source: string) {
  return { sourceType: source, dedupeKey: `source:${source}`, title: '공급사 URL 수집 실패', href: '/product-pipeline/collected-products' };
}

function publicAttempt(attempt: SourcingBrowserSourceAttempt | null) {
  if (!attempt) return null;
  const { attemptToken: _attemptToken, ...publicValue } = attempt;
  return publicValue;
}

function scrapeResponse(attempt: SourcingBrowserSourceAttempt) {
  const result = attempt.scrapeUrlResult;
  const salesProductId = result?.salesProductId ?? null;
  return { ok: attempt.state !== 'FAILED', skipped: false,
    message: attempt.state === 'FAILED' ? attempt.errorMessage ?? 'URL 수집에 실패했습니다.' : attempt.state === 'RUNNING' ? 'URL을 수집하고 있습니다.'
      : '상품 수집이 완료되었습니다.',
    sourceRecordId: result?.sourceRecordId ?? null, salesProductId,
    href: salesProductId ? collectedDraftHref(salesProductId) : null,
    attempt: publicAttempt(attempt) };
}
