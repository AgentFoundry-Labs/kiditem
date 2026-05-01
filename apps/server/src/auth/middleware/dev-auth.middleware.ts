/**
 * 🚨 DEV ONLY — 프로덕션 배포 전 JWT/세션 기반 인증 미들웨어로 교체 필수.
 *
 * `x-dev-user-id` 헤더(또는 `DEV_DEFAULT_USER_ID` env)의 UUID 로
 * `users` 테이블을 조회하고 활성 OrganizationMembership 으로 `req.authUser` 를 채운다.
 * `x-dev-organization-id` 헤더(또는 `devOrganizationId` query / `DEV_DEFAULT_ORGANIZATION_ID`)
 * 가 있으면 해당 조직 멤버십만 선택한다. 값이 없거나 row 가 없으면 그냥 next()
 * — Guard 에서 401 처리.
 *
 * 🚫 `ALLOW_DEV_AUTH_IN_PROD` 는 절대 prod 환경에 설정하지 말 것.
 *    이 escape hatch 는 긴급 롤백 또는 격리된 스테이징 디버깅 용도로만 허용된다.
 */
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

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
    // SSE용 쿼리 파라미터 fallback — EventSource 는 커스텀 헤더를 보낼 수 없다.
    // dev 전용: 프로덕션에서는 생성자가 throw 하므로 이 코드 경로 자체가 prod 에서 살아있지 않음.
    const userId =
      firstString(req.headers['x-dev-user-id'])
      ?? firstString(req.query?.devUserId)
      ?? process.env.DEV_DEFAULT_USER_ID;
    const requestedOrganizationId =
      firstString(req.headers['x-dev-organization-id'])
      ?? firstString(req.query?.devOrganizationId)
      ?? process.env.DEV_DEFAULT_ORGANIZATION_ID;

    if (!userId) {
      // 인증 정보 없음 — Guard 에서 401 처리
      return next();
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          memberships: {
            where: {
              status: 'active',
              ...(requestedOrganizationId ? { organizationId: requestedOrganizationId } : {}),
            },
            orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
            take: 1,
          },
        },
      });
      if (!user) {
        // 존재하지 않는 user — 마찬가지로 Guard 에서 401 (403 아님, 식별 실패)
        this.logger.warn(`dev-auth: unknown user id=${userId}`);
        return next();
      }
      const membership = user.memberships[0] ?? null;
      if (requestedOrganizationId && !membership) {
        this.logger.warn(
          `dev-auth: user id=${userId} has no active membership for organization id=${requestedOrganizationId}`,
        );
      }
      req.authUser = {
        id: user.id,
        organizationId: membership?.organizationId ?? null,
        membershipId: membership?.id ?? null,
        role: membership?.role ?? user.role,
        type: user.type,
        email: user.email,
      };
    } catch (err) {
      this.logger.error(`dev-auth: lookup failed id=${userId}`, err as Error);
    }
    next();
  }
}
