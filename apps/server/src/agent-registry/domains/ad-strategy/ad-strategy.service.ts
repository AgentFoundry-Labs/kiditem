import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry.service';

@Injectable()
export class AdStrategyService {
  private readonly logger = new Logger(AdStrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async run(input: {
    companyId?: string;
    dryRun?: boolean;
    dailyBudgetLimit?: number;
  }) {
    const def = await this.agentRegistry.findByType('ad_strategy');
    const budgetLimit = input.dailyBudgetLimit ?? 500_000;

    return this.agentRegistry.run(def.id, {
      companyId: input.companyId,
      dryRun: input.dryRun,
      extra: { daily_budget_limit: budgetLimit.toLocaleString() },
      resultApiBase: '/api/ad-agent/results',
    });
  }

  async receiveResults(
    taskId: string,
    body: { actions?: unknown[]; summary?: Record<string, unknown>; tokensUsed?: number },
  ): Promise<{ ok: boolean }> {
    const task = await this.agentRegistry.completeTask(taskId, body);

    try {
      if (task.companyId) {
        const actions = (body.actions as any[]) || [];
        const stopCount = actions.filter(
          (a: any) => a.action === 'stop_ad',
        ).length;
        const title = `광고 전략 실행: ${actions.length}건 (중단 ${stopCount})`;

        await this.prisma.activityEvent.create({
          data: {
            companyId: task.companyId,
            objectType: 'company',
            objectId: task.companyId,
            eventType: 'ad_strategy',
            source: 'agent:claude_cli',
            title,
            data: body as any,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Ad strategy post-processing failed for task ${taskId}: ${err}`);
    }

    return { ok: true };
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

  async getRuns(query: { companyId?: string; limit?: string }) {
    return this.prisma.agentTask.findMany({
      where: {
        agentType: 'ad_strategy',
        ...(query.companyId && { companyId: query.companyId }),
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(query.limit || '10'),
    });
  }
}
