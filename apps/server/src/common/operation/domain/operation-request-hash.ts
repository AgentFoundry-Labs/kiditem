import { createHash } from 'node:crypto';
import { canonicalOwnerInputJson } from '../../owner-idempotency-key';

export interface OperationRequestIdentity {
  kind: string;
  scope: Record<string, unknown>;
  fileHash?: string;
}

/**
 * begin 요청의 지문. 같은 idempotencyKey로 다시 온 요청이 같은 내용인지 가른다.
 * kind·scope·fileHash를 키 순서와 무관하게 직렬화해 SHA-256 hex로.
 */
export function operationRequestHash(identity: OperationRequestIdentity): string {
  const canonical = canonicalOwnerInputJson({
    kind: identity.kind,
    scope: identity.scope,
    fileHash: identity.fileHash ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
