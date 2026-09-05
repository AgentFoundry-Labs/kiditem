import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttempt, type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT, type SourcingCandidateRepositoryPort } from '../port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_BROWSER_SCRAPE_PORT, type SourcingBrowserScrapePort } from '../port/out/runtime/sourcing-browser-scrape.port';
import { parseAllowedSupplierUrl } from '../../domain/supplier-source-url-policy';
import { hashCollectionRequest } from './sourcing-collection-mappers';
import { requireIdempotencyKey } from './sourcing-source-attempt-primitives';
import { prepareSourcingScrapeResult } from './sourcing-scrape-result.service';
import type { AuthorizedCollectionOutput } from '../port/out/repository/sourcing-collection.repository.port';

@Injectable()
export class SourcingScrapeUrlService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT) private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT) private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_BROWSER_SCRAPE_PORT) private readonly browser: SourcingBrowserScrapePort,
  ) {}

  async collect(input: { organizationId: string; userId: string | null; sourceUrl: string; idempotencyKey: string }) {
    const plan = scrapePlan(input.sourceUrl);
    const checksum = hashCollectionRequest(plan);
    const failureAlert = scrapeAlert(plan.source);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const replay = await this.attempts.readScrapeUrlAttemptByKey({ organizationId: input.organizationId,
      sourceKey: plan.source, idempotencyKey, requestFingerprint: checksum });
    if (replay) return scrapeResponse(replay);
    const existing = await this.candidates.findActiveBySourceUrl({ organizationId: input.organizationId, sourceUrl: plan.sourceUrl });
    if (existing) return { ok: true, skipped: true, message: '이미 수집된 URL입니다. 기존 수집 상품으로 이동할 수 있습니다.',
      candidateId: existing.id, product_id: existing.id, href: `/product-pipeline/collected-products/${encodeURIComponent(existing.id)}`, attempt: null };
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
      const candidate = prepareSourcingScrapeResult({ organizationId: input.organizationId, triggeredByUserId: input.userId, output });
      if (candidate.sourceUrl !== plan.sourceUrl) throw new BadRequestException('SOURCE_SCRAPE_CANDIDATE_MISMATCH');
      const capturedAt = new Date();
      const evidence: AuthorizedCollectionOutput = { observations: [{
        organizationId: input.organizationId, ingestionRunId: attempt.attemptId, sourceKey: plan.source,
        platform: plan.platform, evidenceFamily: 'supplier_product_scrape', signalRole: 'supply', granularity: 'supply_catalog',
        conceptKey: null, sourceEntityType: 'supplier_offer', sourceEntityId: candidate.externalOfferId ?? plan.sourceUrl,
        schemaVersion: 'sourcing-scrape-url/v1', observationKey: attempt.attemptId, revision: 1, supportsCandidate: true,
        sourceUrl: plan.sourceUrl, eventAt: capturedAt, observedAt: capturedAt, availableAt: capturedAt,
        revisionAt: null, ingestedAt: capturedAt, payloadHash: hashCollectionRequest(candidate.rawData), rawPayload: candidate.rawData,
      }], typedRecords: [], discoveredCount: 1, rejectedCount: 0, qualityReport: {} };
      return scrapeResponse(await this.attempts.completeScrapeUrlAttempt({ ...terminal, candidate,
        contentChecksum: hashCollectionRequest(output), output: evidence, sourceWindowEndAt: capturedAt }));
    } catch (error) {
      // Provider IO is never retried here. Only a new explicit request may retry a failed owner attempt.
      const failed = await this.attempts.failAttempt({ organizationId: input.organizationId, attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken, code: 'SOURCE_SCRAPE_FAILED',
        message: (error instanceof Error ? error.message : 'URL 수집에 실패했습니다.').slice(0, 1000), failureAlert });
      return scrapeResponse(failed);
    }
  }

  async status(organizationId: string, sourceUrl: string) {
    const plan = scrapePlan(sourceUrl);
    const [source, candidate] = await Promise.all([
      this.attempts.readSourceStatus({ organizationId, sourceKey: plan.source, scopeKey: 'product-url',
        targetKey: hashCollectionRequest(plan.sourceUrl), currentPlanChecksum: hashCollectionRequest(plan) }),
      this.candidates.findActiveBySourceUrl({ organizationId, sourceUrl: plan.sourceUrl }),
    ]);
    return { status: candidate ? 'collected' : 'available', candidateId: candidate?.id ?? null,
      href: candidate ? `/product-pipeline/collected-products/${encodeURIComponent(candidate.id)}` : null,
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
  return { ok: attempt.state !== 'FAILED', skipped: false,
    message: attempt.state === 'FAILED' ? attempt.errorMessage ?? 'URL 수집에 실패했습니다.' : attempt.state === 'RUNNING' ? 'URL을 수집하고 있습니다.'
      : '상품 수집이 완료되었습니다.',
    candidateId: result?.candidateId ?? null, product_id: result?.candidateId ?? null, href: result?.href ?? null,
    attempt: publicAttempt(attempt) };
}
