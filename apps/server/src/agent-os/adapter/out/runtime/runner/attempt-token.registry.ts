import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AttemptMcpBinding } from '../../../../application/port/in/mcp/attempt-mcp-actions.port';

export const ATTEMPT_TOKEN_TTL_MS = 30 * 60_000;

export type AttemptTokenBinding =
  | { kind: 'business'; digest: Buffer; expiresAt: Date; binding: AttemptMcpBinding }
  | { kind: 'readiness'; digest: Buffer; expiresAt: Date; canaryId: string };

type StoredToken = AttemptTokenBinding & { leaseId: string };

export interface AttemptTokenRegistryOptions {
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}

/** In-memory only Attempt MCP bearer bindings. Raw tokens are never retained. */
export class AttemptTokenRegistry {
  private readonly now: () => Date;
  private readonly issueBytes: (size: number) => Buffer;
  private readonly tokens = new Map<string, StoredToken>();

  constructor(options: AttemptTokenRegistryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.issueBytes = options.randomBytes ?? randomBytes;
  }

  get size(): number {
    this.prune();
    return this.tokens.size;
  }

  issueBusiness(input: { binding: AttemptMcpBinding; leaseId: string; deadline: Date }): { raw: string; expiresAt: Date } {
    const issued = this.issue(input.deadline);
    const binding = Object.freeze({ ...input.binding, capabilityKeys: Object.freeze([...input.binding.capabilityKeys]) }) as AttemptMcpBinding;
    this.tokens.set(issued.digest.toString('hex'), {
      kind: 'business', digest: issued.digest, expiresAt: issued.expiresAt, binding, leaseId: input.leaseId,
    });
    return { raw: issued.raw, expiresAt: issued.expiresAt };
  }

  issueReadiness(input: { canaryId: string; leaseId: string; deadline: Date }): { raw: string; expiresAt: Date } {
    const issued = this.issue(input.deadline);
    this.tokens.set(issued.digest.toString('hex'), {
      kind: 'readiness', digest: issued.digest, expiresAt: issued.expiresAt, canaryId: input.canaryId, leaseId: input.leaseId,
    });
    return { raw: issued.raw, expiresAt: issued.expiresAt };
  }

  requireBusiness(input: { raw: string; attemptId: string; leaseId: string }): AttemptMcpBinding {
    const token = this.require(input.raw, input.leaseId);
    if (token.kind !== 'business' || token.binding.attemptId !== input.attemptId) throw new Error('attempt_token_invalid');
    return token.binding;
  }

  requireReadiness(input: { raw: string; canaryId: string; leaseId: string }): { canaryId: string } {
    const token = this.require(input.raw, input.leaseId);
    if (token.kind !== 'readiness' || token.canaryId !== input.canaryId) throw new Error('attempt_token_invalid');
    return { canaryId: token.canaryId };
  }

  revokeAttempt(attemptId: string): void {
    for (const [key, token] of this.tokens) {
      if (token.kind === 'business' && token.binding.attemptId === attemptId) this.tokens.delete(key);
    }
  }

  revokeReadiness(canaryId: string): void {
    for (const [key, token] of this.tokens) {
      if (token.kind === 'readiness' && token.canaryId === canaryId) this.tokens.delete(key);
    }
  }

  revokeLease(leaseId: string): void {
    for (const [key, token] of this.tokens) if (token.leaseId === leaseId) this.tokens.delete(key);
  }

  revokeAll(): void {
    this.tokens.clear();
  }

  inspectDigest(raw: string): string {
    return tokenDigest(raw)?.toString('hex') ?? '';
  }

  private issue(deadline: Date): { raw: string; digest: Buffer; expiresAt: Date } {
    const now = this.now();
    const expiresAt = new Date(Math.min(deadline.getTime(), now.getTime() + ATTEMPT_TOKEN_TTL_MS));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new Error('attempt_token_deadline_invalid');
    const raw = this.issueBytes(32).toString('base64url');
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new Error('attempt_token_random_invalid');
    return { raw, digest: createHash('sha256').update(raw).digest(), expiresAt };
  }

  private require(raw: string, leaseId: string): StoredToken {
    this.prune();
    const digest = tokenDigest(raw);
    const token = digest ? this.tokens.get(digest.toString('hex')) : undefined;
    if (!digest || !token || token.leaseId !== leaseId || !timingSafeEqual(token.digest, digest)) {
      throw new Error('attempt_token_invalid');
    }
    return token;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, token] of this.tokens) if (token.expiresAt <= now) this.tokens.delete(key);
  }
}

function tokenDigest(raw: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== raw) return null;
  return createHash('sha256').update(raw).digest();
}
