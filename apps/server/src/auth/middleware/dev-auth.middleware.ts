/**
 * 🚨 DEV ONLY — 프로덕션 배포 전 JWT/세션 기반 인증 미들웨어로 교체 필수.
 *
 * `x-dev-user-id` 헤더(또는 `DEV_DEFAULT_USER_ID` env)의 UUID 로
 * `users` 테이블을 조회해 `req.authUser` 를 채운다. 값이 없거나 row 가
 * 없으면 그냥 next() — Guard 에서 401 처리.
 *
 * 🚫 `ALLOW_DEV_AUTH_IN_PROD` 는 절대 prod 환경에 설정하지 말 것.
 *    이 escape hatch 는 긴급 롤백 또는 격리된 스테이징 디버깅 용도로만 허용된다.
 */
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DevAuthMiddleware.name);

  constructor(private readonly prisma: PrismaService) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_DEV_AUTH_IN_PROD !== 'true'
    ) {
      throw new Error(
        'DevAuthMiddleware is forbidden in production. Replace with real auth or set ALLOW_DEV_AUTH_IN_PROD=true explicitly.',
      );
    }
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers['x-dev-user-id'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    // SSE용 쿼리 파라미터 fallback — EventSource 는 커스텀 헤더를 보낼 수 없다.
    // dev 전용: 프로덕션에서는 생성자가 throw 하므로 이 코드 경로 자체가 prod 에서 살아있지 않음.
    const queryValue = req.query?.devUserId;
    const queryUserId = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    const userId =
      (headerValue as string | undefined)
      ?? (typeof queryUserId === 'string' ? queryUserId : undefined)
      ?? process.env.DEV_DEFAULT_USER_ID;

    if (!userId) {
      // 인증 정보 없음 — Guard 에서 401 처리
      return next();
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        // 존재하지 않는 user — 마찬가지로 Guard 에서 401 (403 아님, 식별 실패)
        this.logger.warn(`dev-auth: unknown user id=${userId}`);
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
      this.logger.error(`dev-auth: lookup failed id=${userId}`, err as Error);
    }
    next();
  }
}
