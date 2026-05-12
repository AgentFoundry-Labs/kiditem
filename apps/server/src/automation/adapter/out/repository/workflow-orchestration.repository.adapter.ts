// Persistence adapter for workflow template CRUD + workflow run lifecycle
// reads (orchestration side). Run-time execution mutations live behind the
// transitional `WorkflowRunnerService` carve-out.
//
// Panel envelope hydration delegates to `buildWorkflowPanelItem` mapper so
// the SSE projection shape stays in one place. The application service
// emits the envelope through EventEmitter2.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WorkflowRun, WorkflowTemplate } from '@prisma/client';
import type { WorkflowTemplate as SharedWorkflowTemplate } from '@kiditem/shared/workflow';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildWorkflowPanelItem } from '../../../mapper/panel-event/workflow-run.mapper';
import type {
  CreateWorkflowRunInput,
  CreateWorkflowTemplateInput,
  PanelItemEnvelope,
  TemplateListFilters,
  UpdateWorkflowTemplateInput,
  WorkflowOrchestrationRepositoryPort,
} from '../../../application/port/out/workflow-orchestration.repository.port';

@Injectable()
export class WorkflowOrchestrationRepositoryAdapter
  implements WorkflowOrchestrationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  createTemplate(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplate> {
    return this.prisma.workflowTemplate.create({
      data: {
        name: input.name,
        organizationId: input.organizationId,
        nodesJson: input.nodesJson as Prisma.InputJsonValue,
        edgesJson: input.edgesJson as Prisma.InputJsonValue,
        description: input.description ?? '',
        module: input.module ?? 'order',
        triggerType: input.triggerType ?? 'manual',
        schedule: input.schedule ?? null,
      },
    });
  }

  async findTemplates(
    organizationId: string,
    filters: TemplateListFilters,
  ): Promise<SharedWorkflowTemplate[]> {
    const templates = await this.prisma.workflowTemplate.findMany({
      where: {
        organizationId,
        ...(filters.module && { module: filters.module }),
        ...(filters.isActive !== undefined && {
          isActive: filters.isActive === 'true',
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return templates as unknown as SharedWorkflowTemplate[];
  }

  findTemplateScopedWithRunCount(
    id: string,
    organizationId: string,
  ): Promise<(WorkflowTemplate & { _count: { runs: number } }) | null> {
    return this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { runs: true } } },
    });
  }

  findTemplateScoped(
    id: string,
    organizationId: string,
  ): Promise<WorkflowTemplate | null> {
    return this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
    });
  }

  async updateTemplate(
    id: string,
    organizationId: string,
    data: UpdateWorkflowTemplateInput,
  ): Promise<WorkflowTemplate> {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    }

    const { count } = await this.prisma.workflowTemplate.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.module !== undefined && { module: data.module }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.nodesJson !== undefined && {
          nodesJson: data.nodesJson as Prisma.InputJsonValue,
        }),
        ...(data.edgesJson !== undefined && {
          edgesJson: data.edgesJson as Prisma.InputJsonValue,
        }),
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    }
    return this.prisma.workflowTemplate.findFirstOrThrow({
      where: { id, organizationId },
    });
  }

  async deleteTemplate(
    id: string,
    organizationId: string,
  ): Promise<WorkflowTemplate> {
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    }
    const { count } = await this.prisma.workflowTemplate.deleteMany({
      where: { id, organizationId },
    });
    if (count === 0) {
      throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    }
    return existing;
  }

  findTemplatesByIds(
    organizationId: string,
    templateIds: string[],
  ): Promise<Pick<WorkflowTemplate, 'id' | 'organizationId'>[]> {
    return this.prisma.workflowTemplate.findMany({
      where: { id: { in: templateIds }, organizationId },
      select: { id: true, organizationId: true },
    });
  }

  createRun(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    return this.prisma.workflowRun.create({
      data: {
        templateId: input.templateId,
        status: 'pending',
        triggeredBy: input.triggeredBy,
        triggeredByUserId: input.triggeredByUserId,
        organizationId: input.organizationId,
        contextData: input.contextData ?? undefined,
      },
    });
  }

  findRunsByTemplate(
    templateId: string,
    organizationId: string,
  ): Promise<WorkflowRun[]> {
    return this.prisma.workflowRun.findMany({
      where: { templateId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findRunScoped(
    runId: string,
    organizationId: string,
  ): Promise<WorkflowRun | null> {
    return this.prisma.workflowRun.findFirst({
      where: { id: runId, organizationId },
    });
  }

  async fetchPanelEnvelope(
    runId: string,
    organizationId: string,
  ): Promise<PanelItemEnvelope | null> {
    const result = await buildWorkflowPanelItem(this.prisma, runId, organizationId);
    return result ?? null;
  }
}
