import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from './auth.types';

export const SOURCING_EXTENSION_TOKEN_PREFIX = 'kiditem_sourcing_ext_';
export const SOURCING_EXTENSION_TOKEN_SCOPE = 'sourcing:extension:ingest';

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_MAX_SECONDS = 24 * 60 * 60;
const DEV_SECRET = randomBytes(32).toString('base64url');

export interface SourcingExtensionTokenClaims {
  v: 1;
  typ: 'sourcing_extension_token';
  scope: typeof SOURCING_EXTENSION_TOKEN_SCOPE;
  sub: string;
  organizationId: string;
  membershipId: string | null;
  role: string;
  type: string;
  email: string;
  iat: number;
  exp: number;
  maxExp: number;
}

export interface SourcingExtensionTokenResult {
  token: string;
  expiresAt: string;
  maxExpiresAt: string;
}

@Injectable()
export class SourcingExtensionTokenService {
  issue(
    authUser: AuthUser,
    options: { now?: Date; maxExpiresAt?: Date } = {},
  ): SourcingExtensionTokenResult {
    if (!authUser.organizationId) {
      throw new UnauthorizedException('no_organization_context');
    }

    const now = options.now ?? new Date();
    const iat = toEpochSeconds(now);
    const maxExp =
      options.maxExpiresAt != null
        ? toEpochSeconds(options.maxExpiresAt)
        : iat + readPositiveIntEnv('SOURCING_EXTENSION_TOKEN_MAX_SECONDS', DEFAULT_MAX_SECONDS);
    const exp = Math.min(
      iat + readPositiveIntEnv('SOURCING_EXTENSION_TOKEN_TTL_SECONDS', DEFAULT_TTL_SECONDS),
      maxExp,
    );

    if (exp <= iat) {
      throw new UnauthorizedException('extension_token_max_expired');
    }

    const claims: SourcingExtensionTokenClaims = {
      v: 1,
      typ: 'sourcing_extension_token',
      scope: SOURCING_EXTENSION_TOKEN_SCOPE,
      sub: authUser.id,
      organizationId: authUser.organizationId,
      membershipId: authUser.membershipId,
      role: authUser.role,
      type: authUser.type,
      email: authUser.email,
      iat,
      exp,
      maxExp,
    };

    return {
      token: this.signClaims(claims),
      expiresAt: new Date(exp * 1000).toISOString(),
      maxExpiresAt: new Date(maxExp * 1000).toISOString(),
    };
  }

  renew(
    authUser: AuthUser,
    previous: SourcingExtensionTokenClaims,
    options: { now?: Date } = {},
  ): SourcingExtensionTokenResult {
    return this.issue(authUser, {
      now: options.now,
      maxExpiresAt: new Date(previous.maxExp * 1000),
    });
  }

  verify(
    token: string | null | undefined,
    options: { now?: Date } = {},
  ): SourcingExtensionTokenClaims {
    if (!token?.startsWith(SOURCING_EXTENSION_TOKEN_PREFIX)) {
      throw new UnauthorizedException('extension_token_required');
    }

    const raw = token.slice(SOURCING_EXTENSION_TOKEN_PREFIX.length);
    const [payload, signature] = raw.split('.');
    if (!payload || !signature) {
      throw new UnauthorizedException('extension_token_invalid');
    }

    const expected = this.signature(payload);
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedException('extension_token_invalid');
    }

    let claims: SourcingExtensionTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('extension_token_invalid');
    }

    validateClaimsShape(claims);

    const now = toEpochSeconds(options.now ?? new Date());
    if (claims.exp <= now) {
      throw new UnauthorizedException('extension_token_expired');
    }
    if (claims.maxExp <= now) {
      throw new UnauthorizedException('extension_token_max_expired');
    }
    return claims;
  }

  private signClaims(claims: SourcingExtensionTokenClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `${SOURCING_EXTENSION_TOKEN_PREFIX}${payload}.${this.signature(payload)}`;
  }

  private signature(payload: string): string {
    return createHmac('sha256', this.secret()).update(payload).digest('base64url');
  }

  private secret(): string {
    const configured = process.env.SOURCING_EXTENSION_TOKEN_SECRET;
    if (configured?.trim()) return configured;
    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException('SOURCING_EXTENSION_TOKEN_SECRET_required');
    }
    return DEV_SECRET;
  }
}

function validateClaimsShape(claims: SourcingExtensionTokenClaims): void {
  if (
    claims?.v !== 1 ||
    claims.typ !== 'sourcing_extension_token' ||
    claims.scope !== SOURCING_EXTENSION_TOKEN_SCOPE ||
    typeof claims.sub !== 'string' ||
    typeof claims.organizationId !== 'string' ||
    typeof claims.role !== 'string' ||
    typeof claims.type !== 'string' ||
    typeof claims.email !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    typeof claims.maxExp !== 'number'
  ) {
    throw new UnauthorizedException('extension_token_invalid');
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
