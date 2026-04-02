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

  async adjustTrust(agentId: string, success: boolean): Promise<{ oldLevel: number; newLevel: number } | null> {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) return null;

    const trustLevel = (agent as any).trustLevel ?? 0;
    const runtimeState = await this.prisma.agentRuntimeState.findUnique({ where: { agentId } });
    const stateJson = (runtimeState?.stateJson as Record<string, unknown>) ?? {};
    const successCount = (stateJson.successCount as number) ?? 0;
    const failStreak = runtimeState?.consecutiveFailCount ?? 0;

    let newLevel = trustLevel;

    if (success) {
      const newCount = successCount + 1;
      if (trustLevel === 0 && newCount >= 5) newLevel = 1;
      if (trustLevel === 1 && newCount >= 20) newLevel = 2;

      if (runtimeState) {
        await this.prisma.agentRuntimeState.update({
          where: { agentId },
          data: { stateJson: { ...stateJson, successCount: newCount } },
        });
      }
    } else {
      if (failStreak >= 2 && trustLevel > 0) {
        newLevel = trustLevel - 1;
      }
    }

    if (newLevel !== trustLevel) {
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: { trustLevel: newLevel } as any,
      });
      this.logger.log(`TrustLevel: ${agent.name} ${trustLevel} → ${newLevel}`);
      return { oldLevel: trustLevel, newLevel };
    }

    return null;
  }
}
