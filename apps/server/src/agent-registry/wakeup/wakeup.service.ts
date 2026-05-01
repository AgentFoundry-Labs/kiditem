import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type WakeupSource = 'timer' | 'assignment' | 'on_demand' | 'automation';

@Injectable()
export class WakeupService {
  private readonly logger = new Logger(WakeupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wakeup 요청 생성. 이미 queued인 같은 에이전트 요청이 있으면 coalescing.
   *
   * Trusted-internal: callers (HeartbeatService, DelegationService, controller
   * `service.run()` path) supply the verified organizationId from @CurrentOrganization()
   * or from a previously-validated context. Each `findFirst` / `updateMany`
   * in this service binds organizationId so even a stale agentId cannot resurrect
   * a row from another tenant.
   */
  async requestWakeup(input: {
    agentId: string;
    organizationId: string;
    source: WakeupSource;
    reason?: string;
    payload?: Record<string, unknown>;
    triggerDetail?: string;
    requestedByType?: string;
    requestedById?: string;
  }) {
    const legacyTaskId = typeof input.payload?._legacy_task_id === 'string'
      ? input.payload._legacy_task_id
      : undefined;

    // Coalescing: 같은 에이전트의 queued 요청이 있으면 카운트만 증가
    const existing = await this.prisma.agentWakeupRequest.findFirst({
      where: {
        agentId: input.agentId,
        organizationId: input.organizationId,
        status: 'queued',
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (existing) {
      await this.prisma.agentWakeupRequest.updateMany({
        where: { id: existing.id, organizationId: input.organizationId },
        data: {
          coalescedCount: { increment: 1 },
          reason: input.reason ?? existing.reason,
          legacyTaskId: legacyTaskId ?? existing.legacyTaskId,
          payload: input.payload ?? (existing.payload as any),
        },
      });
      this.logger.debug(`Wakeup coalesced for agent ${input.agentId} (count: ${existing.coalescedCount + 1})`);
      return existing;
    }

    const request = await this.prisma.agentWakeupRequest.create({
      data: {
        agent: { connect: { id: input.agentId } },
        organization: { connect: { id: input.organizationId } },
        source: input.source,
        reason: input.reason,
        legacyTaskId,
        payload: input.payload as any,
        triggerDetail: input.triggerDetail,
        requestedByType: input.requestedByType,
        requestedById: input.requestedById,
        status: 'queued',
      },
    });

    this.logger.log(`Wakeup requested: agent=${input.agentId} source=${input.source}`);
    return request;
  }

  /**
   * 다음 처리할 wakeup 요청을 claim. 호출자가 받은 row.organizationId 는 신뢰 가능 —
   * findFirst 결과에 의존해서 그 row 의 status 만 업데이트한다.
   */
  async claimNext(agentId: string) {
    const request = await this.prisma.agentWakeupRequest.findFirst({
      where: { agentId, status: 'queued' },
      orderBy: { requestedAt: 'asc' },
    });

    if (!request) return null;

    await this.prisma.agentWakeupRequest.updateMany({
      where: { id: request.id, organizationId: request.organizationId },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    return request;
  }

  /**
   * Wakeup 완료 처리. organizationId 는 호출자(HeartbeatService) 가 wakeup row 에서
   * 직접 가져온 값이므로 신뢰 가능. updateMany 에 묶어 cross-tenant 가 finish
   * 호출로 다른 회사 wakeup 상태를 변조하지 못하도록 방어한다.
   */
  async finish(
    requestId: string,
    organizationId: string,
    runId: string,
    error?: string,
  ): Promise<void> {
    await this.prisma.agentWakeupRequest.updateMany({
      where: { id: requestId, organizationId },
      data: {
        status: error ? 'failed' : 'finished',
        runId,
        finishedAt: new Date(),
        error,
      },
    });
  }
}
