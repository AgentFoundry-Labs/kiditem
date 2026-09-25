import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingExtensionV1ProductSchema,
  type SourcingExtensionV1Product,
} from '@kiditem/shared/sourcing';
import { parseAllowedSupplierUrl, extractSupplierOfferId } from '../../domain/supplier-source-url-policy';
import { canonicalSourceRecordIdentity } from '../../domain/source-record-identity';
import { SourceRecordDuplicateError } from '../../domain/source-record-admission';
import { ALREADY_COLLECTED_CODE } from './source-record-refusal';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import type {
  AuthorizedCollectionOutput,
  SourcingExtensionSourceRecordProjection,
  SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';

const EXTENSION_LEASE_MS = 2 * 60_000;

export interface AuthenticatedSourcingContext {
  organizationId: string;
  userId: string | null;
}

import {
  buildExtensionOutput,
  extensionSourceRecordProjection,
  ProductExtensionDocumentSchema as CompleteSchema,
  parseSupplierUrl,
  productAlert,
  productPlan,
  toV1Command,
} from './sourcing-product-extension.mapper';

const BeginSchema = z.object({ sourceUrl: z.string().min(1).max(2000) }).strict();

/**
 * Maps the deployed extension wire payload into Sourcing source-record evidence. The source record
 * and its draft are admitted in the attempt's terminal transaction (KID-313).
 */
@Injectable()
export class SourcingExtensionIngestService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async begin(context: AuthenticatedSourcingContext, raw: unknown, idempotencyKey: string) {
    const parsed = BeginSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('INVALID_PRODUCT_SOURCE_PLAN');
    const plan = productPlan(parsed.data.sourceUrl);
    return (await this.attempts.beginAttempt({ organizationId: context.organizationId,
      sourceKey: plan.source, scopeKey: 'current-tab', targetKey: hashCollectionRequest(parseSupplierUrl(plan.sourceUrl).normalizedUrl),
      idempotencyKey: requireIdempotencyKey(idempotencyKey), requestFingerprint: hashCollectionRequest(plan),
      plan, planChecksum: hashCollectionRequest(plan), requestedByUserId: context.userId,
      collectorKey: 'kiditem-os-product-extension', collectorVersion: 'kiditem-os/v1',
      triggerKind: 'extension', expiresInMs: EXTENSION_LEASE_MS, failureAlert: productAlert(plan.source),
    })).attempt;
  }

  async read(organizationId: string, attemptId: string) {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (!attempt || !['1688.product_extension', 'alibaba.product_extension'].includes(attempt.sourceKey)) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  status(organizationId: string, sourceUrl: string) {
    const plan = productPlan(sourceUrl);
    return this.attempts.readSourceStatus({ organizationId, sourceKey: plan.source,
      scopeKey: 'current-tab', targetKey: hashCollectionRequest(parseSupplierUrl(plan.sourceUrl).normalizedUrl), currentPlanChecksum: hashCollectionRequest(plan) });
  }

  async complete(context: AuthenticatedSourcingContext, attemptId: string, attemptToken: string, raw: unknown) {
    const attempt = await this.read(context.organizationId, attemptId);
    assertToken(attempt, attemptToken);
    let outputs: AuthorizedCollectionOutput[];
    let content: unknown;
    try {
      const parsed = CompleteSchema.safeParse(raw);
      if (!parsed.success) throw new BadRequestException('INVALID_PRODUCT_SOURCE_BATCH');
      const { product, description, hadDescription } = parsed.data;
      const plan = productPlan(product.source_url);
      if (hashCollectionRequest(plan) !== attempt.planChecksum || plan.source !== attempt.sourceKey
        || product.source_platform && product.source_platform.toLowerCase() !== plan.platform
        || hadDescription !== Boolean(description) || product.page_type === 'description'
        || description && (product.page_type === 'search' || description.source_url !== product.source_url
          || description.product_id !== product.product_id)) {
        throw new BadRequestException('PRODUCT_SOURCE_PLAN_MISMATCH');
      }
      const commands = product.page_type === 'search' ? [] : [toV1Command(product),
        ...(description ? [toV1Command({ ...description, page_type: 'description' })] : [])];
      const permit = toPermit(attempt, context.organizationId);
      outputs = commands.map((command) => buildExtensionOutput(permit, command, extensionSourceRecordProjection(command, context.organizationId, context.userId)));
      content = parsed.data;
    } catch (error) {
      await this.fail(context.organizationId, attemptId, attemptToken, { code: 'INVALID_PRODUCT_SOURCE_BATCH', message: 'The extracted product does not match the complete frozen source plan.' });
      throw error;
    }
    const output: AuthorizedCollectionOutput = {
      observations: outputs.flatMap((output) => output.observations),
      typedRecords: outputs.flatMap((output) => output.typedRecords),
      discoveredCount: outputs.length, rejectedCount: 0,
      qualityReport: { schemaVersion: 'v1', completeSnapshot: true, searchArtifact: outputs.length === 0 },
    };
    try {
      return await this.attempts.completeAttempt({ organizationId: context.organizationId, attemptId, attemptToken,
        planChecksum: attempt.planChecksum, contentChecksum: hashCollectionRequest(content), output,
        sourceWindowStartAt: null, sourceWindowEndAt: new Date() });
    } catch (error) {
      // 이미 수집한 원본이다. 원천 실패가 아니니 알림 없이 이 수집을 멈추고 같은 409 로 답한다(KID-313).
      if (error instanceof SourceRecordDuplicateError) {
        await this.attempts.failAttempt({ organizationId: context.organizationId, attemptId, attemptToken,
          code: ALREADY_COLLECTED_CODE, message: error.message.slice(0, 1000) });
      }
      throw error;
    }
  }

  async fail(organizationId: string, attemptId: string, attemptToken: string, raw: unknown) {
    const attempt = await this.read(organizationId, attemptId);
    const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return this.attempts.failAttempt({ organizationId, attemptId, attemptToken,
      code: boundedText(body.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(body.message, 1000) || 'Product extraction failed.',});
  }
}
