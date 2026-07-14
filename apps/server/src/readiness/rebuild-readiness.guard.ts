import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const REBUILD_STATUS_KEY = 'inventory.rebuild.status';
const REPLAY_KEY_PATTERN =
  /^authoritative-rebuild:([1-9][0-9]*):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (isCurrentAuthoritativeReplay(request, method, path, status)) return true;

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

function isCurrentAuthoritativeReplay(
  request: Request,
  method: string,
  path: string,
  status: Record<string, unknown>,
): boolean {
  if (method !== 'POST' || !/^\/api\/ads\/extension\/sync\/?$/.test(path)) return false;
  const body = toRecord(request.body);
  const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  const match = key.match(REPLAY_KEY_PATTERN);
  return match?.[1] === status.originRunId;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
