/**
 * SupabaseAuthMiddleware — Bearer JWT 또는 Supabase SSR auth-token 쿠키를 Supabase JWKS(ES256) 로 검증하고,
 * `payload.sub` (= Supabase auth.users.id) 로 local `users` 테이블을 조회해
 * `req.authUser` 를 채운다. 토큰 없거나 검증 실패 시 silent pass → Guard 가 401.
 *
 * Organization 컨텍스트는 `OrganizationMembership` 에서 1개만 자동 선택한다
 * (활성 + lastSelectedAt desc, joinedAt asc). 멀티 organization 멤버의 명시적 선택 UI 는
 * 별도 PR scope.
 *
 * NOTE: jose 6.x 는 ESM-only — NestJS CJS 빌드에서 정적 require 가 깨진다.
 * 모듈 자체를 async dynamic import 로 lazy-load 하고, 첫 호출 시 JWKS 캐시.
 */
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SupabaseAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SupabaseAuthMiddleware.name);
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly issuer =
    this.supabaseUrl != null ? `${this.supabaseUrl}/auth/v1` : undefined;
  private joseModule: typeof import('jose') | null = null;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureJose(): Promise<typeof import('jose') | null> {
    if (!this.supabaseUrl) return null;
    if (this.joseModule) return this.joseModule;
    this.joseModule = await import('jose');
    this.jwks = this.joseModule.createRemoteJWKSet(
      new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
    return this.joseModule;
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (req.authUser) return next();
    const token = extractBearerToken(req);
    if (!token) return next();

    const jose = await this.ensureJose();
    if (!jose || !this.jwks) return next();

    let payload: JWTPayload;
    try {
      const result = await jose.jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn(`jwt verify failed: ${(err as Error).message}`);
      return next();
    }

    const userId = payload.sub;
    if (!userId) return next();

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          memberships: {
            where: { status: 'active' },
            orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
            take: 1,
          },
        },
      });
      if (!user) {
        this.logger.warn(`supabase user not mirrored locally: id=${userId}`);
        req.authFailureReason = 'auth_user_not_mirrored';
        return next();
      }
      const membership = user.memberships[0] ?? null;
      req.authUser = {
        id: user.id,
        organizationId: membership?.organizationId ?? null,
        membershipId: membership?.id ?? null,
        role: membership?.role ?? user.role,
        type: user.type,
        email: user.email,
      };
    } catch (err) {
      this.logger.error(`user lookup failed id=${userId}`, err as Error);
    }
    next();
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (cookie && typeof cookie['sb-access-token'] === 'string') {
    return cookie['sb-access-token'];
  }
  if (cookie) {
    return extractSupabaseSsrCookieToken(cookie);
  }
  return null;
}

function extractSupabaseSsrCookieToken(cookies: Record<string, string>): string | null {
  for (const baseName of findSupabaseAuthCookieBaseNames(cookies)) {
    const encodedSession = combineCookieChunks(cookies, baseName);
    if (!encodedSession) continue;
    const sessionJson = decodeSupabaseCookieValue(encodedSession);
    if (!sessionJson) continue;
    try {
      const session = JSON.parse(sessionJson) as unknown;
      if (
        session &&
        typeof session === 'object' &&
        typeof (session as Record<string, unknown>).access_token === 'string'
      ) {
        return (session as { access_token: string }).access_token;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findSupabaseAuthCookieBaseNames(cookies: Record<string, string>): string[] {
  const baseNames = new Set<string>();
  for (const name of Object.keys(cookies)) {
    const baseName = name.replace(/\.[0-9]+$/, '');
    if (baseName === 'supabase.auth.token' || /^sb-.+-auth-token$/.test(baseName)) {
      baseNames.add(baseName);
    }
  }
  return [...baseNames].sort();
}

function combineCookieChunks(cookies: Record<string, string>, baseName: string): string | null {
  if (cookies[baseName]) return cookies[baseName];

  const chunks: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = cookies[`${baseName}.${index}`];
    if (!chunk) break;
    chunks.push(chunk);
  }
  return chunks.length > 0 ? chunks.join('') : null;
}

function decodeSupabaseCookieValue(value: string): string | null {
  const base64Prefix = 'base64-';
  if (!value.startsWith(base64Prefix)) return value;
  try {
    return Buffer.from(value.slice(base64Prefix.length), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
