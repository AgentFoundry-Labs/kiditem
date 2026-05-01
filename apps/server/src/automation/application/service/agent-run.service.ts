import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { scrubSecrets } from '@kiditem/shared/security';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeartbeatService } from '../../../agent-registry/heartbeat/heartbeat.service';
import { AgentCrudService } from './agent-crud.service';
import type { AgentRunInput } from './agent-registry.types';

@Injectable()
export class AgentRunService {
  private readonly logger = new Logger(AgentRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentCrudService,
    @Inject(forwardRef(() => HeartbeatService))
    private readonly heartbeat: HeartbeatService,
  ) {}

  async runByType(type: string, input?: AgentRunInput) {
    const def = await this.agents.findByType(type);
    return this.run(def.id, input);
  }

  async run(id: string, input?: AgentRunInput) {
    const def = await this.agents.getById(id, input?.organizationId);
    const dryRun = input?.dryRun ?? def.requiresApproval;

    if (input?.organizationId && def.organizationId && def.organizationId !== input.organizationId) {
      throw new ForbiddenException('Access denied to this agent');
    }

    if (def.monthlyTokenBudget > 0) {
      const usageRatio = def.tokensUsed / def.monthlyTokenBudget;
      if (usageRatio >= 1.0) {
        this.logger.error(`Agent ${def.name} budget exceeded: ${def.tokensUsed}/${def.monthlyTokenBudget}`);
        throw new BadRequestException(`월간 토큰 예산 초과 (${def.tokensUsed}/${def.monthlyTokenBudget})`);
      }
      if (usageRatio >= 0.95) {
        this.logger.error(`Agent ${def.name} budget critical: ${Math.round(usageRatio * 100)}% used`);
      } else if (usageRatio >= 0.80) {
        this.logger.warn(`Agent ${def.name} budget warning: ${Math.round(usageRatio * 100)}% used`);
      }
    }

    const taskOrganizationId = input?.organizationId ?? def.organizationId ?? null;

    const task = await this.prisma.agentTask.create({
      data: {
        agentType: def.type,
        organizationId: taskOrganizationId,
        workflowRunId: input?.workflowRunId ?? null,
        workflowNodeId: input?.workflowNodeId ?? null,
        sourceDataId: input?.sourceDataId ?? null,
        status: 'running',
        startedAt: new Date(),
        input: {
          definitionId: def.id,
          dry_run: dryRun,
          runtime: def.adapterType,
          ...input?.extra,
        } as any,
      },
    });

    try {
      await this.heartbeat.wakeAgent({
        agentId: def.id,
        organizationId: input?.organizationId ?? def.organizationId ?? undefined,
        source: 'on_demand',
        reason: `run() call for ${def.type}`,
        payload: {
          dry_run: dryRun,
          _legacy_task_id: task.id,
          ...input?.extra,
        },
        requestedByType: 'system',
      });
    } catch (err) {
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          error: `Wakeup failed: ${scrubSecrets(err instanceof Error ? err.message : String(err))}`,
          completedAt: new Date(),
        },
      });
      throw err;
    }

    this.logger.log(`Agent wakeup: ${def.name} (task=${task.id}), dry_run=${dryRun}`);
    return { ok: true, taskId: task.id, agentType: def.type, dryRun };
  }
}
