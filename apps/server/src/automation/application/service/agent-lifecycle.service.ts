import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { tenantOwnedFilter, tenantScopeFilter } from './agent-registry.types';

@Injectable()
export class AgentLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async getRunById(runId: string, organizationId: string) {
    const run = await this.prisma.heartbeatRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundException(`HeartbeatRun ${runId} not found`);
    return run;
  }

  async getRunHistory(agentId: string, organizationId: string, limit = 20) {
    const owned = await this.prisma.agentDefinition.findFirst({
      where: { id: agentId, ...tenantScopeFilter(organizationId) },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException(`Agent definition ${agentId} not found`);

    return this.prisma.heartbeatRun.findMany({
      where: { agentId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRuntimeState(agentId: string, organizationId: string) {
    const agent = await this.prisma.agentDefinition.findFirst({
      where: { id: agentId, ...tenantScopeFilter(organizationId) },
    });
    if (!agent) {
      return {
        agentId,
        rtTotalInputTokens: 0,
        rtTotalOutputTokens: 0,
        rtTotalCostCents: 0,
        rtConsecutiveFailCount: 0,
        rtSessionId: null,
        rtLastRunId: null,
        rtLastRunStatus: null,
        rtLastError: null,
        rtLastFailedAt: null,
      };
    }
    return {
      agentId,
      rtSessionId: (agent as any).rtSessionId ?? null,
      rtStateJson: (agent as any).rtStateJson ?? null,
      rtLastRunId: (agent as any).rtLastRunId ?? null,
      rtLastRunStatus: (agent as any).rtLastRunStatus ?? null,
      rtTotalInputTokens: (agent as any).rtTotalInputTokens ?? 0,
      rtTotalOutputTokens: (agent as any).rtTotalOutputTokens ?? 0,
      rtTotalCostCents: (agent as any).rtTotalCostCents ?? 0,
      rtLastError: (agent as any).rtLastError ?? null,
      rtConsecutiveFailCount: (agent as any).rtConsecutiveFailCount ?? 0,
      rtLastFailedAt: (agent as any).rtLastFailedAt ?? null,
    };
  }

  async resetSession(agentId: string, organizationId: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.agentDefinition.updateMany({
      where: { id: agentId, ...tenantOwnedFilter(organizationId) },
      data: { rtSessionId: null } as any,
    });
    if (result.count === 0) throw new NotFoundException(`Agent definition ${agentId} not found`);
    return { ok: true };
  }

  async pauseAgent(agentId: string, organizationId: string, reason?: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.agentDefinition.updateMany({
      where: { id: agentId, ...tenantOwnedFilter(organizationId) },
      data: { status: 'paused', pauseReason: reason, pausedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException(`Agent definition ${agentId} not found`);
    return { ok: true };
  }

  async resumeAgent(agentId: string, organizationId: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.agentDefinition.updateMany({
      where: { id: agentId, ...tenantOwnedFilter(organizationId) },
      data: { status: 'idle', pauseReason: null, pausedAt: null },
    });
    if (result.count === 0) throw new NotFoundException(`Agent definition ${agentId} not found`);

    await this.prisma.agentDefinition.updateMany({
      where: { id: agentId, ...tenantOwnedFilter(organizationId) },
      data: { rtConsecutiveFailCount: 0, rtLastFailedAt: null } as any,
    });
    return { ok: true };
  }
}
