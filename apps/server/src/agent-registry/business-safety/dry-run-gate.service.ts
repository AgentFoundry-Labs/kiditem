import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DryRunGateService {
  private readonly logger = new Logger(DryRunGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  check(trustLevel: number, requestedDryRun?: boolean): { forced: boolean; reason?: string } {
    if (trustLevel === 0 && requestedDryRun === false) {
      return { forced: true, reason: 'trustLevel=0, dry-run forced' };
    }
    return { forced: false };
  }

  /**
   * Adjust trust level after a heartbeat run.
   * Caller must pass the verified organizationId from the run context (HeartbeatRun.organizationId
   * or wakeup.organizationId). The mutation is scoped via updateMany so a stale or
   * cross-tenant agentId cannot escalate trust on another organization's agent.
   */
  async adjustTrust(
    agentId: string,
    organizationId: string,
    success: boolean,
  ): Promise<{ oldLevel: number; newLevel: number } | null> {
    // Tenant-scoped read: AgentDefinition can be tenant-owned (organizationId=<uuid>)
    // or a global catalog entry (organizationId=null). Both are legitimate adjust
    // targets for a run executed under `organizationId`.
    const agent = await this.prisma.agentDefinition.findFirst({
      where: {
        id: agentId,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    if (!agent) return null;

    const trustLevel = (agent as any).trustLevel ?? 0;
    const stateJson = ((agent as any).rtStateJson as Record<string, unknown>) ?? {};
    const successCount = (stateJson.successCount as number) ?? 0;
    const failStreak = (agent as any).rtConsecutiveFailCount ?? 0;

    let newLevel = trustLevel;

    if (success) {
      const newCount = successCount + 1;
      if (trustLevel === 0 && newCount >= 5) newLevel = 1;
      if (trustLevel === 1 && newCount >= 20) newLevel = 2;

      await this.prisma.agentDefinition.updateMany({
        where: {
          id: agentId,
          OR: [{ organizationId }, { organizationId: null }],
        },
        data: { rtStateJson: { ...stateJson, successCount: newCount } } as any,
      });
    } else {
      if (failStreak >= 2 && trustLevel > 0) {
        newLevel = trustLevel - 1;
      }
    }

    if (newLevel !== trustLevel) {
      await this.prisma.agentDefinition.updateMany({
        where: {
          id: agentId,
          OR: [{ organizationId }, { organizationId: null }],
        },
        data: { trustLevel: newLevel } as any,
      });
      this.logger.log(`TrustLevel: ${agent.name} ${trustLevel} → ${newLevel}`);
      return { oldLevel: trustLevel, newLevel };
    }

    return null;
  }
}
