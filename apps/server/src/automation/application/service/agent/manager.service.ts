import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../port/in/agent-runner.port';
import {
  AGENT_EVENTS,
  AgentResultReadyEvent,
} from '../../../../agent-registry/events/agent-events';

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
  ) {}

  async ask(input: {
    companyId: string;
    request: string;
    productId?: string;
    context?: Record<string, unknown>;
  }) {
    const extra: Record<string, unknown> = {
      company_id: input.companyId,
      user_request: input.request,
    };

    // 상품 컨텍스트가 있으면 추가
    if (input.productId) {
      extra.product_id = input.productId;
      extra.user_request = `${input.request}\n\n(대상 상품 ID: ${input.productId})`;
    }

    return this.agentRunner.runByType('manager', {
      companyId: input.companyId,
      dryRun: false,
      extra,
    });
  }

  @OnEvent(AGENT_EVENTS.RESULT_READY)
  async onResultReady(event: AgentResultReadyEvent): Promise<void> {
    if (event.agentType !== 'manager') return;

    try {
      const recommended = event.resultJson.recommended_agents as string[] | undefined;
      if (recommended?.length) {
        for (const agentType of recommended) {
          try {
            await this.agentRunner.runByType(agentType, { companyId: event.companyId });
            this.logger.log(`Manager dispatched agent: ${agentType}`);
          } catch (err) {
            this.logger.error(`Manager failed to dispatch agent ${agentType}: ${err}`);
          }
        }
      }

      const recCount = recommended?.length ?? 0;
      const title = recCount > 0
        ? `운영 매니저: ${recCount}건 에이전트 실행`
        : '운영 매니저: 분석 완료';

      await this.prisma.activityEvent.create({
        data: {
          companyId: event.companyId,
          objectType: 'company',
          objectId: event.companyId,
          eventType: 'manager_response',
          source: 'agent:claude_cli',
          title,
          data: event.resultJson as any,
        },
      });
    } catch (err) {
      this.logger.error(`Manager post-processing failed for run ${event.runId}: ${err}`);
    }
  }

  async getConversations(companyId: string, limit = 20) {
    return this.prisma.agentTask.findMany({
      where: { agentType: 'manager', companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
