import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Supabase Auth 미들웨어 — Bearer JWT 를 Supabase JWKS(ES256) 로 검증하고,
 * token.sub (= Supabase auth.users.id) 로 local `users` 테이블을 조회해
 * `req.authUser` 를 채운다. 토큰 없거나 검증 실패 시 silent pass → Guard 가 401.
 *
 * 뒤이어 실행되는 DevAuthMiddleware 는 `req.authUser` 가 이미 채워져 있으면 skip.
 */
@Injectable()
export class SupabaseAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SupabaseAuthMiddleware.name);
  private readonly supabaseUrl = process.env.SUPABASE_URL;
  private readonly jwks =
    this.supabaseUrl != null
      ? createRemoteJWKSet(new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`))
      : null;
  private readonly issuer =
    this.supabaseUrl != null ? `${this.supabaseUrl}/auth/v1` : undefined;

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!this.jwks) return next();

    const token = extractBearerToken(req);
    if (!token) return next();

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
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
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`supabase user not mirrored locally: id=${userId}`);
        return next();
      }
      req.authUser = {
        id: user.id,
        companyId: user.companyId,
        role: user.role,
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
  return null;
}
