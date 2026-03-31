import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type WakeupSource = 'timer' | 'assignment' | 'on_demand' | 'automation';

@Injectable()
export class WakeupService {
  private readonly logger = new Logger(WakeupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wakeup 요청 생성. 이미 queued인 같은 에이전트 요청이 있으면 coalescing.
   */
  async requestWakeup(input: {
    agentId: string;
    companyId: string;
    source: WakeupSource;
    reason?: string;
    payload?: Record<string, unknown>;
    triggerDetail?: string;
    requestedByType?: string;
    requestedById?: string;
  }) {
    // Coalescing: 같은 에이전트의 queued 요청이 있으면 카운트만 증가
    const existing = await this.prisma.agentWakeupRequest.findFirst({
      where: {
        agentId: input.agentId,
        status: 'queued',
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (existing) {
      await this.prisma.agentWakeupRequest.update({
        where: { id: existing.id },
        data: {
          coalescedCount: { increment: 1 },
          reason: input.reason ?? existing.reason,
          payload: input.payload ?? (existing.payload as any),
        },
      });
      this.logger.debug(`Wakeup coalesced for agent ${input.agentId} (count: ${existing.coalescedCount + 1})`);
      return existing;
    }

    const request = await this.prisma.agentWakeupRequest.create({
      data: {
        agent: { connect: { id: input.agentId } },
        company: { connect: { id: input.companyId } },
        source: input.source,
        reason: input.reason,
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
   * 다음 처리할 wakeup 요청을 claim.
   */
  async claimNext(agentId: string) {
    const request = await this.prisma.agentWakeupRequest.findFirst({
      where: { agentId, status: 'queued' },
      orderBy: { requestedAt: 'asc' },
    });

    if (!request) return null;

    await this.prisma.agentWakeupRequest.update({
      where: { id: request.id },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    return request;
  }

  /**
   * Wakeup 완료 처리.
   */
  async finish(requestId: string, runId: string, error?: string) {
    await this.prisma.agentWakeupRequest.update({
      where: { id: requestId },
      data: {
        status: error ? 'failed' : 'finished',
        runId,
        finishedAt: new Date(),
        error,
      },
    });
  }
}
