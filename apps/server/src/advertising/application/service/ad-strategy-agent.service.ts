import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../automation/application/port/in/agent-runner.port';
import { AGENT_EVENTS, AgentResultReadyEvent } from '../../../agent-registry/events/agent-events';

@Injectable()
export class AdStrategyAgentService {
  private readonly logger = new Logger(AdStrategyAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
  ) {}

  async run(input: {
    organizationId: string;
    dryRun?: boolean;
  }) {
    return this.agentRunner.runByType('ad_strategy', {
      organizationId: input.organizationId,
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
          organizationId: event.organizationId,
          objectType: 'organization',
          objectId: event.organizationId,
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

  async getStatus(taskId: string, organizationId: string) {
    return this.prisma.agentTask.findFirst({
      where: { id: taskId, organizationId },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
  }

  async getLatestRun(organizationId?: string) {
    return this.prisma.agentTask.findFirst({
      where: {
        agentType: 'ad_strategy',
        ...(organizationId && { organizationId }),
      },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRuns(query: { organizationId: string; limit?: number | string }) {
    return this.prisma.agentTask.findMany({
      where: {
        agentType: 'ad_strategy',
        organizationId: query.organizationId,
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(query.limit ?? 10)),
    });
  }
}
