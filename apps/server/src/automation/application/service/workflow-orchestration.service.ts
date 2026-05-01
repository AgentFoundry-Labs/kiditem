import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { WorkflowTemplate } from '@kiditem/shared/workflow';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowRunnerService } from './workflow-runner.service';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import { buildWorkflowPanelItem } from '../../mapper/panel-event/workflow-run.mapper';

interface CreateWorkflowInput {
  name: string;
  description?: string;
  module?: string;
  triggerType?: string;
  schedule?: string | null;
  nodesJson: unknown[];
  edgesJson: unknown[];
}

interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  module?: string;
  isActive?: boolean;
  triggerType?: string;
  schedule?: string | null;
  nodesJson?: unknown[];
  edgesJson?: unknown[];
}

interface TriggerOptions {
  triggeredBy?: string;
  context?: Record<string, any>;
  triggeredByUserId?: string;
}

@Injectable()
export class WorkflowOrchestrationService {
  private readonly logger = new Logger(WorkflowOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunnerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async emitPanelUpsert(runId: string, organizationId: string): Promise<void> {
    try {
      const result = await buildWorkflowPanelItem(this.prisma, runId, organizationId);
      if (!result) return;
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, result);
    } catch (err) {
      this.logger.warn(`[workflows] Panel emit failed for run ${runId}: ${err}`);
    }
  }

  async create(input: CreateWorkflowInput, organizationId: string) {
    return this.prisma.workflowTemplate.create({
      data: {
        name: input.name,
        organizationId,
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
    organizationId: string,
    filters: { module?: string; isActive?: string } = {},
  ): Promise<WorkflowTemplate[]> {
    const templates = await this.prisma.workflowTemplate.findMany({
      where: {
        organizationId,
        ...(filters.module && { module: filters.module }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive === 'true' }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map((t) => t satisfies WorkflowTemplate);
  }

  async findOne(id: string, organizationId: string) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { runs: true } } },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    return template;
  }

  async update(id: string, organizationId: string, data: UpdateWorkflowInput) {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);

    const { count } = await this.prisma.workflowTemplate.updateMany({
      where: { id, organizationId },
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
    if (count === 0) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    return this.prisma.workflowTemplate.findFirstOrThrow({ where: { id, organizationId } });
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    const { count } = await this.prisma.workflowTemplate.deleteMany({ where: { id, organizationId } });
    if (count === 0) throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    return existing;
  }

  async triggerRun(templateId: string, organizationId: string, options: TriggerOptions = {}) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);

    const triggeredBy = options.triggeredBy ?? 'manual';
    const run = await this.prisma.workflowRun.create({
      data: {
        templateId,
        status: 'pending',
        triggeredBy,
        triggeredByUserId: options.triggeredByUserId ?? null,
        organizationId: template.organizationId,
        contextData: options.context ?? undefined,
      },
    });
    await this.emitPanelUpsert(run.id, template.organizationId);

    this.runner.runWorkflow(run.id, templateId, template.organizationId).catch((err) => {
      this.logger.error(`Workflow run ${run.id} failed: ${err.message}`);
    });

    return run;
  }

  async batchRun(templateIds: string[], organizationId: string, options: TriggerOptions = {}) {
    const uniqueTemplateIds = [...new Set(templateIds)];
    const templates = await this.prisma.workflowTemplate.findMany({
      where: { id: { in: uniqueTemplateIds }, organizationId },
      select: { id: true, organizationId: true },
    });
    if (templates.length !== uniqueTemplateIds.length) {
      const owned = new Set(templates.map((t) => t.id));
      const missing = uniqueTemplateIds.filter((id) => !owned.has(id));
      throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${missing.join(', ')}`);
    }
    const organizationIdByTemplateId = new Map(templates.map((t) => [t.id, t.organizationId]));

    const triggeredBy = options.triggeredBy ?? 'manual';
    const runs = await Promise.all(
      templateIds.map((templateId) => {
        const templateOrganizationId = organizationIdByTemplateId.get(templateId);
        if (!templateOrganizationId) {
          throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${templateId}`);
        }
        return this.prisma.workflowRun.create({
          data: {
            templateId,
            status: 'pending',
            triggeredBy,
            triggeredByUserId: options.triggeredByUserId ?? null,
            organizationId: templateOrganizationId,
            contextData: options.context ?? undefined,
          },
        });
      }),
    );
    await Promise.all(
      runs.map((r) => {
        const templateOrganizationId = organizationIdByTemplateId.get(r.templateId);
        if (!templateOrganizationId) {
          throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${r.templateId}`);
        }
        return this.emitPanelUpsert(r.id, templateOrganizationId);
      }),
    );

    this.runner
      .runBatch(
        runs.map((r) => {
          const templateOrganizationId = organizationIdByTemplateId.get(r.templateId);
          if (!templateOrganizationId) {
            throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${r.templateId}`);
          }
          return { runId: r.id, templateId: r.templateId, organizationId: templateOrganizationId };
        }),
      )
      .catch((err: Error) => {
        this.logger.error(`Batch run failed: ${err.message}`);
      });

    return runs;
  }

  async findRuns(templateId: string, organizationId: string) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);

    return this.prisma.workflowRun.findMany({
      where: { templateId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRunDetail(runId: string, organizationId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundException(`워크플로우 실행(${runId})을 찾을 수 없습니다`);
    return run;
  }
}
