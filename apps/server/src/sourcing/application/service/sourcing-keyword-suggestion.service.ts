import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingKeywordSuggestionInputSchema,
  SourcingKeywordSuggestionObservationBatchSchema,
  SourcingKeywordSuggestionSnapshotSchema,
  SourcingWingCatalogKeywordSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  sourcingWingCatalogKeywordIdentity,
  type SourcingKeywordSuggestionObservationBatch,
  type SourcingKeywordSuggestionSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import {
  type AuthorizedCollectionOutput,
  type SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT,
  type SourcingKeywordSuggestionRepositoryPort,
} from '../port/out/repository/sourcing-keyword-suggestion.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';

const SOURCE = SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY;
const BatchSchema = SourcingKeywordSuggestionObservationBatchSchema.extend({
  warnings: z.array(z.string()).optional(),
});
const PlanSchema = SourcingKeywordSuggestionInputSchema.extend({ source: z.literal(SOURCE) });

function scope(keyword: string) {
  return { sourceKey: SOURCE, scopeKey: 'default',
    targetKey: `keyword:${sourcingWingCatalogKeywordIdentity(keyword)}` };
}

function failureAlert(targetKey: string) {
  return { sourceType: SOURCE, dedupeKey: `source:coupang-keyword-suggestion:${targetKey}`,
    title: '쿠팡 키워드 제안 수집 실패', href: '/sourcing-ai/market' };
}

@Injectable()
export class SourcingKeywordSuggestionService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT)
    private readonly snapshots: SourcingKeywordSuggestionRepositoryPort,
  ) {}

  async begin(input: {
    organizationId: string; requestedByUserId: string | null;
    idempotencyKey: string; input: unknown;
  }) {
    const parsed = SourcingKeywordSuggestionInputSchema.safeParse(input.input);
    if (!parsed.success) throw new BadRequestException('INVALID_KEYWORD_SUGGESTION_REQUEST');
    const plan = { source: SOURCE, ...parsed.data };
    const sourceScope = scope(plan.keyword);
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId, ...sourceScope,
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      requestFingerprint: hashCollectionRequest({ ...plan,
        keyword: sourcingWingCatalogKeywordIdentity(plan.keyword) }),
      plan,
      // Coverage identifies the keyword; maxResults is a per-request collection bound.
      planChecksum: hashCollectionRequest(sourceScope),
      requestedByUserId: input.requestedByUserId,
      collectorKey: 'extension-coupang-keyword-suggestion',
      collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      expiresInMs: 15 * 60_000,
      failureAlert: failureAlert(sourceScope.targetKey),
    });
    return attempt;
  }

  async read(input: { organizationId: string; attemptId: string }) {
    const attempt = await this.attempts.readAttempt(input);
    if (!attempt || attempt.sourceKey !== SOURCE || attempt.scopeKey !== 'default') {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    const parsed = PlanSchema.safeParse(attempt.plan);
    if (!parsed.success || attempt.targetKey !== scope(parsed.data.keyword).targetKey) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  async status(input: { organizationId: string; keyword: string }) {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const sourceScope = scope(keyword);
    return this.attempts.readSourceStatus({ organizationId: input.organizationId,
      ...sourceScope, currentPlanChecksum: hashCollectionRequest(sourceScope) });
  }

  async complete(input: {
    organizationId: string; attemptId: string; attemptToken: string; batch: unknown;
  }) {
    const attempt = await this.read(input);
    assertToken(attempt, input.attemptToken);
    const plan = PlanSchema.parse(attempt.plan);
    const parsed = BatchSchema.safeParse(input.batch);
    if (!parsed.success) return this.fail({ ...input, code: 'SOURCE_BATCH_INVALID',
      message: 'The submitted keyword suggestion evidence is malformed.' });
    const { warnings = [], ...batch } = parsed.data;
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(batch.keyword);
    if (normalizedKeyword !== sourcingWingCatalogKeywordIdentity(plan.keyword)
      || batch.items.length > plan.maxResults || batch.productNameTokens.length > plan.maxResults
      || batch.items.some((item) => item.rank > plan.maxResults)) {
      return this.fail({ ...input, code: 'SOURCE_PLAN_INCOMPLETE',
        message: 'The submitted keyword suggestions do not match the frozen source plan.' });
    }
    const output = buildOutput({ organizationId: input.organizationId,
      permit: toPermit(attempt, input.organizationId), normalizedKeyword, batch });
    output.qualityReport = { ...output.qualityReport, warnings, completeSnapshot: true };
    return this.attempts.completeAttempt({
      organizationId: input.organizationId, attemptId: input.attemptId,
      attemptToken: input.attemptToken, planChecksum: attempt.planChecksum,
      contentChecksum: hashCollectionRequest({ batch: { ...batch, keyword: normalizedKeyword }, warnings }),
      output, sourceWindowStartAt: null, sourceWindowEndAt: new Date(batch.capturedAt),
      failureAlert: failureAlert(attempt.targetKey),
    });
  }

  async fail(input: {
    organizationId: string; attemptId: string; attemptToken: string; code: string; message: string;
  }) {
    const attempt = await this.read(input);
    assertToken(attempt, input.attemptToken);
    return this.attempts.failAttempt({
      organizationId: input.organizationId, attemptId: input.attemptId, attemptToken: input.attemptToken,
      code: boundedText(input.code, 100) || 'keyword_suggestion_collection_failed',
      message: boundedText(input.message, 1_000) || 'Keyword suggestion collection failed.',
      failureAlert: failureAlert(attempt.targetKey),
    });
  }

  async snapshot(input: {
    organizationId: string;
    keyword: string;
  }): Promise<SourcingKeywordSuggestionSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(keyword);
    const latest = await this.snapshots.findLatest({
      organizationId: input.organizationId,
      normalizedKeyword,
    });
    return SourcingKeywordSuggestionSnapshotSchema.parse({
      keyword,
      generatedAt: latest?.capturedAt.toISOString() ?? null,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      items: latest?.items ?? [],
      productNameTokens: latest?.productNameTokens ?? [],
    });
  }
}

function buildOutput(input: {
  organizationId: string;
  permit: SourcingCollectionPermit;
  normalizedKeyword: string;
  batch: SourcingKeywordSuggestionObservationBatch;
}): AuthorizedCollectionOutput {
  const capturedAt = new Date(input.batch.capturedAt);
  const payloadHash = hashCollectionRequest(input.batch);
  return {
    observations: [{
      organizationId: input.organizationId,
      ingestionRunId: input.permit.runId,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      platform: 'coupang',
      evidenceFamily: 'keyword_suggestion',
      signalRole: 'demand',
      granularity: 'inferred_observation',
      conceptKey: input.normalizedKeyword,
      sourceEntityType: 'keyword_suggestion_snapshot',
      sourceEntityId: input.normalizedKeyword,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      observationKey: hashCollectionRequest({
        ingestionRunId: input.permit.runId,
        normalizedKeyword: input.normalizedKeyword,
        capturedAt: input.batch.capturedAt,
      }),
      revision: 1,
      supportsCandidate: false,
      sourceUrl: null,
      eventAt: capturedAt,
      observedAt: capturedAt,
      availableAt: capturedAt,
      revisionAt: null,
      payloadHash,
      rawPayload: input.batch,
      ingestedAt: capturedAt,
    }],
    typedRecords: [],
    discoveredCount: input.batch.items.length,
    rejectedCount: 0,
    qualityReport: {
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      keyword: input.normalizedKeyword,
      suggestionCount: input.batch.items.length,
      productNameTokenCount: input.batch.productNameTokens.length,
    },
  };
}
