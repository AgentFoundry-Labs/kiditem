import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry.service';
import { AGENT_EVENTS, AgentResultReadyEvent } from '../../events/agent-events';

@Injectable()
export class AdStrategyService {
  private readonly logger = new Logger(AdStrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async run(input: {
    companyId: string;
    dryRun?: boolean;
  }) {
    const def = await this.agentRegistry.findByType('ad_strategy');

    return this.agentRegistry.run(def.id, {
      companyId: input.companyId,
      dryRun: input.dryRun,
    });
  }

  @OnEvent(AGENT_EVENTS.RESULT_READY)
  async onResultReady(event: AgentResultReadyEvent): Promise<void> {
    if (event.agentType !== 'ad_strategy') return;

    try {
      const actions = (event.resultJson.actions as any[]) || [];
      const stopCount = actions.filter(
        (a: any) => a.action === 'stop_ad',
      ).length;
      const title = `광고 전략 실행: ${actions.length}건 (중단 ${stopCount})`;

      await this.prisma.activityEvent.create({
        data: {
          companyId: event.companyId,
          objectType: 'company',
          objectId: event.companyId,
          eventType: 'ad_strategy',
          source: 'agent:claude_cli',
          title,
          data: event.resultJson as any,
        },
      });
    } catch (err) {
      this.logger.error(`Ad strategy post-processing failed for run ${event.runId}: ${err}`);
    }
  }

  async getStatus(taskId: string) {
    return this.prisma.agentTask.findUnique({
      where: { id: taskId },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
  }

  async getLatestRun(companyId?: string) {
    return this.prisma.agentTask.findFirst({
      where: {
        agentType: 'ad_strategy',
        ...(companyId && { companyId }),
      },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRuns(query: { companyId: string; limit?: number | string }) {
    return this.prisma.agentTask.findMany({
      where: {
        agentType: 'ad_strategy',
        companyId: query.companyId,
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(query.limit ?? 10)),
    });
  }
}
