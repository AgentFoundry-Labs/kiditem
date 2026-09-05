import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceStatus,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import { hashCollectionRequest, mapTrendTypedRecordsToAuthorizedOutput } from './sourcing-collection-mappers';
import {
  buildBrowserLiveCommercePlan,
  normalizeBrowserLiveCommerceBatch,
  parseBrowserLiveCommercePlan,
  sourceKeyForBrowserLiveCommerce,
  SOURCE_LIVE_COMMERCE_SCOPE,
  type BrowserLiveCommerceSourceBatch,
} from './sourcing-live-commerce-source-attempt.mapper';

// Preserve the existing browser Live Commerce Operation execution deadline.
const ATTEMPT_TTL_MS = 15 * 60_000;

export type { BrowserLiveCommerceSourceBatch } from './sourcing-live-commerce-source-attempt.mapper';

/** Direct owner seam for browser live-commerce facts and their frozen URL plan. */
@Injectable()
export class SourcingLiveCommerceSourceAttemptService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async beginBrowser(input: {
    organizationId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    url: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    const plan = buildBrowserLiveCommercePlan(input.url);
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId,
      sourceKey: sourceKeyForBrowserLiveCommerce(plan.source),
      scopeKey: SOURCE_LIVE_COMMERCE_SCOPE,
      targetKey: targetKeyForBrowserLiveCommercePlan(plan),
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      requestFingerprint: hashCollectionRequest({ source: plan.source, pageUrl: plan.pageUrl }),
      plan,
      planChecksum: hashCollectionRequest(plan),
      requestedByUserId: input.requestedByUserId,
      collectorKey: 'extension-live-commerce',
      collectorVersion: 'source-owner/v1',
      expiresInMs: ATTEMPT_TTL_MS,
      failureAlert: failureAlertFor(plan.source),
    });
    return attempt;
  }

  async readBrowser(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    return this.requireBrowserAttempt(input.organizationId, input.attemptId);
  }

  async readBrowserStatus(input: {
    organizationId: string;
    url: string;
  }): Promise<SourcingBrowserSourceStatus> {
    const plan = buildBrowserLiveCommercePlan(input.url);
    return this.attempts.readSourceStatus({
      organizationId: input.organizationId,
      sourceKey: sourceKeyForBrowserLiveCommerce(plan.source),
      scopeKey: SOURCE_LIVE_COMMERCE_SCOPE,
      targetKey: targetKeyForBrowserLiveCommercePlan(plan),
      currentPlanChecksum: hashCollectionRequest(plan),
    });
  }

  async completeBrowser(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    batch: BrowserLiveCommerceSourceBatch;
  }): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.requireBrowserAttempt(input.organizationId, input.attemptId);
    assertToken(attempt, input.attemptToken);
    let plan: ReturnType<typeof parseBrowserLiveCommercePlan>;
    try {
      plan = parseBrowserLiveCommercePlan(attempt.plan);
    } catch {
      return this.terminalizeBrowserFailure(
        input,
        attempt.sourceKey,
        'SOURCE_PLAN_MALFORMED',
        'The stored live-commerce source plan is malformed.',
      );
    }
    if (attempt.sourceKey !== sourceKeyForBrowserLiveCommerce(plan.source)) {
      return this.terminalizeBrowserFailure(
        input,
        attempt.sourceKey,
        'SOURCE_PLAN_MALFORMED',
        'The frozen live-commerce plan does not match its source owner.',
      );
    }
    let normalized: ReturnType<typeof normalizeBrowserLiveCommerceBatch>;
    try {
      normalized = normalizeBrowserLiveCommerceBatch({
        organizationId: input.organizationId,
        ingestionRunId: attempt.attemptId,
        plan,
        batch: input.batch,
      });
    } catch (error) {
      const code = error instanceof ConflictException && error.message === 'SOURCE_PLAN_MISMATCH'
        ? 'SOURCE_PLAN_MISMATCH'
        : 'SOURCE_BATCH_INVALID';
      return this.terminalizeBrowserFailure(
        input,
        attempt.sourceKey,
        code,
        code === 'SOURCE_PLAN_MISMATCH'
          ? 'The submitted live-commerce page does not match the frozen source plan.'
          : 'The submitted live-commerce evidence is malformed.',
      );
    }
    const permit = toPermit(attempt, input.organizationId);
    const output = mapTrendTypedRecordsToAuthorizedOutput({
      permit,
      typedRecords: [
        { kind: 'live_commerce_broadcast' as const, row: normalized.broadcast },
        ...normalized.products.map((row) => ({ kind: 'live_commerce_product' as const, row })),
      ],
      qualityReport: {
        source: normalized.source,
        pageUrl: normalized.pageUrl,
        productCount: normalized.products.length,
        completeSnapshot: true,
      },
    });
    return this.attempts.completeAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      planChecksum: attempt.planChecksum,
      contentChecksum: hashCollectionRequest({ planChecksum: attempt.planChecksum, batch: input.batch }),
      output,
      sourceWindowStartAt: null,
      sourceWindowEndAt: new Date(),
      failureAlert: failureAlertFor(plan.source),
    });
  }

  async failBrowser(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.requireBrowserAttempt(input.organizationId, input.attemptId);
    return this.attempts.failAttempt({
      ...input,
      code: boundedText(input.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(input.message, 1_000) || 'Live-commerce collection failed.',
      failureAlert: failureAlertForSourceKey(attempt.sourceKey),
    });
  }

  private async requireBrowserAttempt(
    organizationId: string,
    attemptId: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (!attempt || !isBrowserLiveCommerceSourceKey(attempt.sourceKey)) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  private terminalizeBrowserFailure(
    input: Pick<Parameters<SourcingLiveCommerceSourceAttemptService['completeBrowser']>[0], 'organizationId' | 'attemptId' | 'attemptToken'>,
    sourceKey: string,
    code: string,
    message: string,
  ): Promise<SourcingBrowserSourceAttempt> {
    return this.attempts.failAttempt({
      ...input,
      code,
      message,
      failureAlert: failureAlertForSourceKey(sourceKey),
    });
  }
}

function isBrowserLiveCommerceSourceKey(value: string): boolean {
  return value === '1688.live_commerce' || value === 'douyin.live_commerce';
}

function targetKeyForBrowserLiveCommercePlan(
  plan: ReturnType<typeof buildBrowserLiveCommercePlan>,
): string {
  const url = new URL(plan.pageUrl);
  // The complete URL is intentionally frozen in the plan/checksum. The source
  // scope key is only the safe room identity, so query/fragment/userinfo never
  // become durable target metadata or Alert context.
  return `room:${hashCollectionRequest({
    source: plan.source,
    room: `${url.origin}${url.pathname}`,
  })}`;
}

function failureAlertFor(source: '1688' | 'douyin') {
  return {
    sourceType: `${source}.live_commerce`,
    dedupeKey: `source:${source}-live-commerce`,
    title: `${source === '1688' ? '1688' : '도우인'} 라이브 수집 실패`,
    href: '/sourcing-ai/market',
  } as const;
}

function failureAlertForSourceKey(sourceKey: string) {
  return sourceKey === '1688.live_commerce'
    ? failureAlertFor('1688')
    : failureAlertFor('douyin');
}
