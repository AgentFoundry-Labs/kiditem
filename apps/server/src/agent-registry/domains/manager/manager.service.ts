import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry.service';

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
      resultApiBase: '/api/manager/results',
    });
  }

  async receiveResults(
    taskId: string,
    body: {
      answer?: string;
      data?: Record<string, unknown>;
      recommendations?: Array<{
        action: string;
        target: string;
        reason: string;
        priority: string;
      }>;
      tokensUsed?: number;
    },
  ): Promise<{ ok: boolean }> {
    const task = await this.agentRegistry.completeTask(taskId, body);

    try {
      if (task.companyId) {
        const recCount = body.recommendations?.length ?? 0;
        const title = recCount > 0
          ? `운영 매니저: ${recCount}건 액션 추천`
          : '운영 매니저: 분석 완료';

        await this.prisma.activityEvent.create({
          data: {
            companyId: task.companyId,
            objectType: 'company',
            objectId: task.companyId,
            eventType: 'manager_response',
            source: 'agent:claude_cli',
            title,
            data: body as any,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Manager post-processing failed for task ${taskId}: ${err}`);
    }

    return { ok: true };
  }

  async getConversations(companyId: string, limit = 20) {
    return this.prisma.agentTask.findMany({
      where: { agentType: 'manager', companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
