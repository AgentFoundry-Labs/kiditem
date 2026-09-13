import { ConflictException } from '@nestjs/common';
import type { SourcingBrowserSourceAttempt } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import type { SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';

export function toPermit(
  attempt: SourcingBrowserSourceAttempt,
  organizationId: string,
): SourcingCollectionPermit {
  return {
    runId: attempt.attemptId,
    organizationId,
    sourceKey: attempt.sourceKey,
    scopeKey: attempt.scopeKey,
    targetKey: attempt.targetKey,
    leaseToken: attempt.attemptToken,
    generation: attempt.generation,
    leaseExpiresAt: attempt.expiresAt,
  };
}

export function assertToken(attempt: SourcingBrowserSourceAttempt, token: string): void {
  if (attempt.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
}

export function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 300) throw new ConflictException('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

export function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
