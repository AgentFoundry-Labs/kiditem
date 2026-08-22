import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const CredentialPayloadSchema = z.object({
  organizationId: z.string().min(1).max(128),
  sessionId: z.string().uuid(),
  executionId: z.string().min(1).max(128),
  attemptId: z.string().min(1).max(128),
  startIntentId: z.string().uuid(),
  runtimeCredentialGeneration: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

export interface RuntimeCredentialBrokerOptions {
  secret: string;
  ttlMs?: number;
  now?: () => Date;
}

export interface LazyRuntimeCredentialBrokerOptions {
  secretResolver: () => string | undefined;
  ttlMs?: number;
  now?: () => Date;
}

export interface RuntimeCredentialBrokerEnvironment {
  AGENT_RUNTIME_CREDENTIAL_HMAC_KEY?: string;
  AGENT_RUNTIME_CREDENTIAL_TTL_MS?: string;
}

export class RuntimeCredentialBroker {
  private readonly resolveSecret: () => string;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(options: RuntimeCredentialBrokerOptions | LazyRuntimeCredentialBrokerOptions) {
    if ('secret' in options) {
      if (options.secret.length < 32) throw new Error('RUNTIME_CREDENTIAL_SECRET_TOO_SHORT');
      this.resolveSecret = () => options.secret;
    } else {
      this.resolveSecret = () => {
        const secret = options.secretResolver()?.trim();
        if (!secret) throw new Error('AGENT_RUNTIME_CREDENTIAL_HMAC_KEY_REQUIRED');
        if (secret.length < 32) throw new Error('RUNTIME_CREDENTIAL_SECRET_TOO_SHORT');
        return secret;
      };
    }
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1_000 || this.ttlMs > 15 * 60_000) {
      throw new Error('RUNTIME_CREDENTIAL_TTL_INVALID');
    }
  }

  issue(scope: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    startIntentId: string;
    runtimeCredentialGeneration: number;
  }): {
    token: string;
    expiresAt: Date;
  } {
    const issuedAt = this.now().getTime();
    const payload = CredentialPayloadSchema.parse({
      ...scope,
      issuedAt,
      expiresAt: issuedAt + this.ttlMs,
    });
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token: `${encoded}.${this.sign(encoded)}`,
      expiresAt: new Date(payload.expiresAt),
    };
  }

  verify(token: string, scope?: { executionId: string; attemptId: string }) {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra !== undefined) throw new Error('RUNTIME_CREDENTIAL_INVALID');
    const expected = this.sign(encoded);
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      throw new Error('RUNTIME_CREDENTIAL_INVALID');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new Error('RUNTIME_CREDENTIAL_INVALID');
    }
    const payload = CredentialPayloadSchema.parse(raw);
    if (scope && (payload.executionId !== scope.executionId || payload.attemptId !== scope.attemptId)) {
      throw new Error('RUNTIME_CREDENTIAL_SCOPE_INVALID');
    }
    if (payload.expiresAt <= this.now().getTime()) throw new Error('RUNTIME_CREDENTIAL_EXPIRED');
    return payload;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.resolveSecret()).update(value).digest('base64url');
  }
}

export function runtimeCredentialBrokerFromEnvironment(
  env: RuntimeCredentialBrokerEnvironment = process.env,
): RuntimeCredentialBroker {
  const secret = env.AGENT_RUNTIME_CREDENTIAL_HMAC_KEY?.trim();
  if (!secret) {
    throw new Error('AGENT_RUNTIME_CREDENTIAL_HMAC_KEY_REQUIRED');
  }
  const rawTtl = env.AGENT_RUNTIME_CREDENTIAL_TTL_MS?.trim();
  return new RuntimeCredentialBroker({
    secret,
    ...(rawTtl ? { ttlMs: Number(rawTtl) } : {}),
  });
}
