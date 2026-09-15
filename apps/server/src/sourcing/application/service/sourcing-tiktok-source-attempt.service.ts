import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceStatus,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import { hashCollectionRequest, mapTrendTypedRecordsToAuthorizedOutput } from './sourcing-collection-mappers';
import {
  buildTiktokSourcePlan,
  hasCompleteTiktokCoverage,
  normalizeTiktokSourceBatch,
  parseTiktokSourcePlan,
  plannedTiktokTargetIds,
  SOURCE_TIKTOK_CREATIVE,
  TIKTOK_SOURCE_SCOPE,
  TIKTOK_SOURCE_TARGET,
  tiktokPlanChecksumInput,
  tiktokRequestFingerprintInput,
  type BrowserTiktokSourceBatch,
} from './sourcing-tiktok-source-attempt.mapper';
import { TrendCollectService } from './trend-collect.service';

const ATTEMPT_TTL_MS = 15 * 60_000;
const SOURCE_ALERT = {
  sourceType: SOURCE_TIKTOK_CREATIVE,
  dedupeKey: 'source:tiktok-creative',
  title: 'TikTok 크리에이티브 트렌드 수집 실패',
  href: '/sourcing-ai/market',
} as const;

export type { BrowserTiktokSourceBatch } from './sourcing-tiktok-source-attempt.mapper';

/** Direct source-owner seam for the existing TikTok Creative Center collector. */
@Injectable()
export class SourcingTiktokSourceAttemptService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    private readonly trends: TrendCollectService,
  ) {}

  async beginTiktok(input: {
    organizationId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    maxItems?: unknown;
    region?: unknown;
  }): Promise<SourcingBrowserSourceAttempt> {
    const plan = await this.currentTiktokPlan(input.organizationId, input.maxItems, input.region);
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId,
      sourceKey: SOURCE_TIKTOK_CREATIVE,
      scopeKey: TIKTOK_SOURCE_SCOPE,
      targetKey: TIKTOK_SOURCE_TARGET,
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      // Option drift conflicts, while a same-key replay preserves the first
      // target plan even if its underlying seed list later changes.
      requestFingerprint: hashCollectionRequest(tiktokRequestFingerprintInput(plan)),
      plan,
      // Status freshness is about source target coverage, not a prior valid
      // request's user-selected max/region collection options.
      planChecksum: hashCollectionRequest(tiktokPlanChecksumInput(plan)),
      requestedByUserId: input.requestedByUserId,
      collectorKey: 'extension-tiktok-creative',
      collectorVersion: 'source-owner/v1',
      expiresInMs: ATTEMPT_TTL_MS,
      failureAlert: SOURCE_ALERT,
    });
    return attempt;
  }

  async readTiktok(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    return this.requireTiktokAttempt(input.organizationId, input.attemptId);
  }

  async readTiktokStatus(input: {
    organizationId: string;
  }): Promise<SourcingBrowserSourceStatus> {
    const plan = await this.currentTiktokPlan(input.organizationId);
    return this.attempts.readSourceStatus({
      organizationId: input.organizationId,
      sourceKey: SOURCE_TIKTOK_CREATIVE,
      scopeKey: TIKTOK_SOURCE_SCOPE,
      targetKey: TIKTOK_SOURCE_TARGET,
      currentPlanChecksum: hashCollectionRequest(tiktokPlanChecksumInput(plan)),
    });
  }

  async completeTiktok(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    batch: BrowserTiktokSourceBatch;
  }): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.requireTiktokAttempt(input.organizationId, input.attemptId);
    assertToken(attempt, input.attemptToken);
    let plan: ReturnType<typeof parseTiktokSourcePlan>;
    try {
      plan = parseTiktokSourcePlan(attempt.plan);
    } catch {
      return this.terminalizeFailure(
        input,
        'SOURCE_PLAN_MALFORMED',
        'The stored TikTok source plan is malformed.',
      );
    }

    let normalized: ReturnType<typeof normalizeTiktokSourceBatch>;
    try {
      normalized = normalizeTiktokSourceBatch({
        organizationId: input.organizationId,
        ingestionRunId: attempt.attemptId,
        batch: input.batch,
      });
    } catch {
      return this.terminalizeFailure(
        input,
        'SOURCE_BATCH_INVALID',
        'The submitted TikTok collection evidence is malformed.',
      );
    }
    if (!hasCompleteTiktokCoverage(plan, normalized)) {
      return this.terminalizeFailure(
        input,
        'SOURCE_PLAN_INCOMPLETE',
        'The submitted TikTok evidence does not prove the frozen source plan was complete.',
      );
    }

    const permit = toPermit(attempt, input.organizationId);
    const output = mapTrendTypedRecordsToAuthorizedOutput({
      permit,
      typedRecords: normalized.rows.map((row) => ({ kind: 'tiktok_creative' as const, row })),
      qualityReport: {
        source: SOURCE_TIKTOK_CREATIVE,
        planChecksum: attempt.planChecksum,
        expectedTargetCount: plannedTiktokTargetIds(plan).length,
        visitedTargetCount: normalized.visitedTargetIds.length,
        completeSnapshot: true,
      },
    });
    return this.attempts.completeAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      planChecksum: attempt.planChecksum,
      contentChecksum: hashCollectionRequest({
        planChecksum: attempt.planChecksum,
        batch: input.batch,
      }),
      output,
      sourceWindowStartAt: null,
      sourceWindowEndAt: new Date(),
    });
  }

  async failTiktok(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    await this.requireTiktokAttempt(input.organizationId, input.attemptId);
    return this.attempts.failAttempt({
      ...input,
      code: boundedText(input.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(input.message, 1_000) || 'TikTok collection failed.',
    });
  }

  /** Operator stop without the attempt token; only a TikTok Creative Center attempt of this organization. */
  async cancelTiktok(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    await this.requireTiktokAttempt(input.organizationId, input.attemptId);
    return this.attempts.cancelAttempt(input);
  }

  private async currentTiktokPlan(
    organizationId: string,
    maxItems?: unknown,
    region?: unknown,
  ) {
    const targetSeeds = await this.trends.listTiktokCcTargets(organizationId);
    return buildTiktokSourcePlan({ targetSeeds, maxItems, region });
  }

  private async requireTiktokAttempt(
    organizationId: string,
    attemptId: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (!attempt || attempt.sourceKey !== SOURCE_TIKTOK_CREATIVE) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  private terminalizeFailure(
    input: Pick<Parameters<SourcingTiktokSourceAttemptService['completeTiktok']>[0], 'organizationId' | 'attemptId' | 'attemptToken'>,
    code: string,
    message: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    return this.attempts.failAttempt({
      ...input,
      code,
      message,
    });
  }
}
