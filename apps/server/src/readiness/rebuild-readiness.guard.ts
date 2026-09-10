import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

const REBUILD_STATUS_KEY = 'inventory.rebuild.status';

@Injectable()
export class RebuildReadinessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path || request.originalUrl.split('?')[0] || '';
    const method = request.method?.toUpperCase() ?? '';
    if (isRebuildCriticalRequest(method, path)) return true;

    const organizationId = request.authUser?.organizationId;
    if (!organizationId) return true;
    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: REBUILD_STATUS_KEY },
      },
      select: { value: true },
    });
    const status = toRecord(setting?.value);
    if (status.state !== 'snapshot_required') return true;

    throw new ServiceUnavailableException({
      code: 'inventory_snapshot_required',
      message: 'Sellpia 재고와 Wing 상품 가져오기가 완료될 때까지 일반 작업이 잠겨 있습니다.',
      target: status.target ?? null,
      originRunId: status.originRunId ?? null,
    });
  }
}

function isRebuildCriticalRequest(method: string, path: string): boolean {
  if (/^\/api\/(?:auth|health|readiness)(?:\/|$)/.test(path)) return true;
  if (method === 'POST' && /^\/api\/inventory\/sellpia-sync\/import\/?$/.test(path)) {
    return true;
  }
  if (method === 'GET' && /^\/api\/inventory\/sellpia-sync\/import-runs\/?$/.test(path)) {
    return true;
  }
  if (method === 'GET' && /^\/api\/channels\/accounts\/?$/.test(path)) return true;
  return method === 'POST' &&
    /^\/api\/channels\/accounts\/[^/]+\/catalog-imports\/coupang-wing\/?$/.test(path);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
