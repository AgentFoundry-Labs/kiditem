import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { WorkflowTemplate } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowRunnerService } from './workflow-runner.service';
import { PANEL_EVENTS } from '../../panel/events/panel-events';
import { buildWorkflowPanelItem } from '../../panel/adapters/workflow-run-mapper';
import type { CreateWorkflowBodyDto, UpdateWorkflowBodyDto } from '../dto';

interface TriggerOptions {
  triggeredBy?: string;
  context?: Record<string, any>;
  triggeredByUserId?: string;
}

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunnerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async emitPanelUpsert(runId: string): Promise<void> {
    try {
      const result = await buildWorkflowPanelItem(this.prisma, runId);
      if (!result) return;
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, result);
    } catch (err) {
      this.logger.warn(`[workflows] Panel emit failed for run ${runId}: ${err}`);
    }
  }

  async create(input: CreateWorkflowBodyDto, companyId: string) {
    return this.prisma.workflowTemplate.create({
      data: {
        name: input.name,
        companyId,
        nodesJson: input.nodesJson as any,
        edgesJson: input.edgesJson as any,
        description: input.description ?? '',
        module: input.module ?? 'order',
        triggerType: input.triggerType ?? 'manual',
        schedule: input.schedule ?? null,
      },
    });
  }

  async findAll(
    companyId: string,
    filters: { module?: string; isActive?: string } = {},
  ): Promise<WorkflowTemplate[]> {
    const templates = await this.prisma.workflowTemplate.findMany({
      where: {
        companyId,
        ...(filters.module && { module: filters.module }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive === 'true' }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map((t) => t satisfies WorkflowTemplate);
  }

  async findOne(id: string, companyId: string) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id, companyId },
      include: { _count: { select: { runs: true } } },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    return template;
  }

  async update(id: string, companyId: string, data: UpdateWorkflowBodyDto) {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.module !== undefined && { module: data.module }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.nodesJson !== undefined && { nodesJson: data.nodesJson as any }),
        ...(data.edgesJson !== undefined && { edgesJson: data.edgesJson as any }),
        version: { increment: 1 },
      },
    });
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    return this.prisma.workflowTemplate.delete({ where: { id } });
  }

  async triggerRun(templateId: string, companyId: string, options: TriggerOptions = {}) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, companyId },
      select: { id: true, companyId: true },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);

    const triggeredBy = options.triggeredBy ?? 'manual';
    const run = await this.prisma.workflowRun.create({
      data: {
        templateId,
        status: 'pending',
        triggeredBy,
        triggeredByUserId: options.triggeredByUserId ?? null,
        companyId: template.companyId ?? null,
        contextData: options.context ?? undefined,
      },
    });
    await this.emitPanelUpsert(run.id);

    this.runner.runWorkflow(run.id, templateId).catch((err) => {
      this.logger.error(`Workflow run ${run.id} failed: ${err.message}`);
    });

    return run;
  }

  async batchRun(templateIds: string[], companyId: string, options: TriggerOptions = {}) {
    const uniqueTemplateIds = [...new Set(templateIds)];
    const templates = await this.prisma.workflowTemplate.findMany({
      where: { id: { in: uniqueTemplateIds }, companyId },
      select: { id: true, companyId: true },
    });
    if (templates.length !== uniqueTemplateIds.length) {
      const owned = new Set(templates.map((t) => t.id));
      const missing = uniqueTemplateIds.filter((id) => !owned.has(id));
      throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${missing.join(', ')}`);
    }
    const companyIdByTemplateId = new Map(templates.map((t) => [t.id, t.companyId]));

    const triggeredBy = options.triggeredBy ?? 'manual';
    const runs = await Promise.all(
      templateIds.map((templateId) =>
        this.prisma.workflowRun.create({
          data: {
            templateId,
            status: 'pending',
            triggeredBy,
            triggeredByUserId: options.triggeredByUserId ?? null,
            companyId: companyIdByTemplateId.get(templateId) ?? null,
            contextData: options.context ?? undefined,
          },
        }),
      ),
    );
    await Promise.all(runs.map((r) => this.emitPanelUpsert(r.id)));

    this.runner
      .runBatch(
        runs.map((r) => ({ runId: r.id, templateId: r.templateId })),
      )
      .catch((err: Error) => {
        this.logger.error(`Batch run failed: ${err.message}`);
      });

    return runs;
  }

  async findRuns(templateId: string, companyId: string) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, companyId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);

    return this.prisma.workflowRun.findMany({
      where: { templateId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRunDetail(runId: string, companyId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, companyId },
    });
    if (!run) throw new NotFoundException(`워크플로우 실행(${runId})을 찾을 수 없습니다`);
    return run;
  }
}
