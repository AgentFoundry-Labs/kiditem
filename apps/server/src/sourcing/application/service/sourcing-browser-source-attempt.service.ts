import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceStatus,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import { hashCollectionRequest, map1688HotProductsToAuthorizedOutput } from './sourcing-collection-mappers';
import {
  build1688SourcePlan,
  normalize1688SourceBatch,
  parse1688SourcePlan,
  sameFrozenKeywordSet,
  SOURCE_1688_HOT_PRODUCT,
  type Browser1688SourceBatch,
} from './sourcing-1688-source-attempt.mapper';
import { TrendCollectService } from './trend-collect.service';

const ATTEMPT_TTL_MS = 15 * 60_000;
const SOURCE_KEY = SOURCE_1688_HOT_PRODUCT;
const SOURCE_ALERT = {
  sourceType: SOURCE_KEY,
  dedupeKey: 'source:1688-hot-product',
  title: '1688 인기상품 수집 실패',
  href: '/sourcing-ai/market',
} as const;

type Complete1688Input = {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  batch: Browser1688SourceBatch;
};

export type { Browser1688SourceBatch } from './sourcing-1688-source-attempt.mapper';

/**
 * The direct owner seam for browser-collected Sourcing facts.
 *
 * It intentionally exposes source-named methods rather than a reusable
 * attempt runtime. The shared persistence is the existing Sourcing evidence
 * owner and remains the only canonical writer.
 */
@Injectable()
export class SourcingBrowserSourceAttemptService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    private readonly trends: TrendCollectService,
  ) {}

  async begin1688(input: {
    organizationId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    const plan = await this.current1688Plan(input.organizationId);
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId,
      sourceKey: SOURCE_KEY,
      scopeKey: 'default',
      targetKey: 'all',
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      // The fingerprint describes the user request only. The owner preserves
      // the first frozen plan for a same-key replay even if targets change.
      requestFingerprint: hashCollectionRequest({ source: SOURCE_KEY }),
      plan,
      planChecksum: hashCollectionRequest(plan),
      requestedByUserId: input.requestedByUserId,
      collectorKey: 'extension-1688-trend',
      collectorVersion: 'source-owner/v1',
      expiresInMs: ATTEMPT_TTL_MS,
      failureAlert: SOURCE_ALERT,
    });
    return attempt;
  }

  async read1688(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    return this.require1688Attempt(input.organizationId, input.attemptId);
  }

  async read1688Status(input: {
    organizationId: string;
  }): Promise<SourcingBrowserSourceStatus> {
    const plan = await this.current1688Plan(input.organizationId);
    return this.attempts.readSourceStatus({
      organizationId: input.organizationId,
      sourceKey: SOURCE_KEY,
      scopeKey: 'default',
      targetKey: 'all',
      currentPlanChecksum: hashCollectionRequest(plan),
    });
  }

  async complete1688(input: Complete1688Input): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.require1688Attempt(input.organizationId, input.attemptId);
    assertToken(attempt, input.attemptToken);
    let plan: ReturnType<typeof parse1688SourcePlan>;
    try {
      plan = parse1688SourcePlan(attempt.plan);
    } catch {
      return this.terminalize1688Failure(
        input,
        'SOURCE_PLAN_MALFORMED',
        'The stored 1688 source plan is malformed.',
      );
    }
    let normalized: ReturnType<typeof normalize1688SourceBatch>;
    try {
      normalized = normalize1688SourceBatch(input.organizationId, input.batch);
    } catch {
      return this.terminalize1688Failure(
        input,
        'SOURCE_BATCH_INVALID',
        'The submitted 1688 collection evidence is malformed.',
      );
    }

    if (normalized.errorCount > 0) {
      return this.terminalize1688Failure(
        input,
        'SOURCE_PLAN_INCOMPLETE',
        'A frozen 1688 target did not produce a complete collection result.',
      );
    }
    if (!sameFrozenKeywordSet(plan.keywords, normalized.keywords)) {
      return this.terminalize1688Failure(
        input,
        'SOURCE_PLAN_MISMATCH',
        'The submitted 1688 keywords do not match the frozen source plan.',
      );
    }

    const permit = toPermit(attempt, input.organizationId);
    const output = map1688HotProductsToAuthorizedOutput({
      permit,
      rows: normalized.rows,
      qualityReport: {
        source: SOURCE_KEY,
        planChecksum: attempt.planChecksum,
        expectedKeywordCount: plan.keywords.length,
        observedKeywordCount: normalized.keywords.length,
        completeSnapshot: true,
      },
    });
    const contentChecksum = hashCollectionRequest({
      planChecksum: attempt.planChecksum,
      // This is the extension's one-shot terminal payload checksum. It must
      // not include server-assigned capture timestamps, or a response-loss
      // replay would look like a conflicting terminal write.
      batch: input.batch,
    });
    return this.attempts.completeAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      planChecksum: attempt.planChecksum,
      contentChecksum,
      output,
      sourceWindowStartAt: null,
      sourceWindowEndAt: new Date(),
    });
  }

  async fail1688(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    await this.require1688Attempt(input.organizationId, input.attemptId);
    return this.attempts.failAttempt({
      ...input,
      code: boundedText(input.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(input.message, 1_000) || '1688 collection failed.',
    });
  }

  /** Operator stop without the attempt token; only a 1688 hot-product attempt of this organization. */
  async cancel1688(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    await this.require1688Attempt(input.organizationId, input.attemptId);
    return this.attempts.cancelAttempt(input);
  }

  private async require1688Attempt(
    organizationId: string,
    attemptId: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (!attempt || attempt.sourceKey !== SOURCE_KEY) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  private terminalize1688Failure(
    input: Pick<Complete1688Input, 'organizationId' | 'attemptId' | 'attemptToken'>,
    code: string,
    message: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    return this.attempts.failAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      code,
      message,
    });
  }

  private async current1688Plan(organizationId: string) {
    const targets = await this.trends.list1688Targets(organizationId);
    return build1688SourcePlan(targets.map((target) => target.keyword));
  }
}
