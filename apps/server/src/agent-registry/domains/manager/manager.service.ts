import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry.service';
import { AGENT_EVENTS, AgentResultReadyEvent } from '../../events/agent-events';

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async ask(input: {
    companyId: string;
    request: string;
    productId?: string;
    context?: Record<string, unknown>;
  }) {
    const def = await this.agentRegistry.findByType('manager');

    const extra: Record<string, unknown> = {
      company_id: input.companyId,
      user_request: input.request,
    };

    // 상품 컨텍스트가 있으면 추가
    if (input.productId) {
      extra.product_id = input.productId;
      extra.user_request = `${input.request}\n\n(대상 상품 ID: ${input.productId})`;
    }

    return this.agentRegistry.run(def.id, {
      companyId: input.companyId,
      dryRun: false,
      extra,
    });
  }

  @OnEvent(AGENT_EVENTS.RESULT_READY)
  async onResultReady(event: AgentResultReadyEvent): Promise<void> {
    if (event.agentType !== 'manager') return;

    try {
      // 추천 에이전트 실행
      const recommended = event.resultJson.recommended_agents as string[] | undefined;
      if (recommended?.length) {
        for (const agentType of recommended) {
          try {
            await this.agentRegistry.runByType(agentType, { companyId: event.companyId });
            this.logger.log(`Manager dispatched agent: ${agentType}`);
          } catch (err) {
            this.logger.error(`Manager failed to dispatch agent ${agentType}: ${err}`);
          }
        }
      }

      // Activity event
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
