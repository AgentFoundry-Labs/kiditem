import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowRunnerService } from './workflow-runner.service';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunnerService,
  ) {}

  async create(data: {
    name: string;
    companyId: string;
    nodesJson: any;
    edgesJson: any;
    description?: string;
    module?: string;
    triggerType?: string;
    schedule?: string;
  }) {
    return this.prisma.workflowTemplate.create({
      data: {
        name: data.name,
        companyId: data.companyId,
        nodesJson: data.nodesJson,
        edgesJson: data.edgesJson,
        description: data.description ?? '',
        module: data.module ?? 'order',
        triggerType: data.triggerType ?? 'manual',
        schedule: data.schedule ?? null,
      },
    });
  }

  async findAll(query: { companyId: string; module?: string; isActive?: string }) {
    return this.prisma.workflowTemplate.findMany({
      where: {
        companyId: query.companyId,
        ...(query.module && { module: query.module }),
        ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.workflowTemplate.findUnique({
      where: { id },
      include: { _count: { select: { runs: true } } },
    });
  }

  async update(id: string, data: Record<string, any>) {
    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.module !== undefined && { module: data.module }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.nodesJson !== undefined && { nodesJson: data.nodesJson }),
        ...(data.edgesJson !== undefined && { edgesJson: data.edgesJson }),
        version: { increment: 1 },
      },
    });
  }

  async remove(id: string) {
    return this.prisma.workflowTemplate.delete({ where: { id } });
  }

  async triggerRun(templateId: string, triggeredBy = 'manual', context?: Record<string, any>) {
    const run = await this.prisma.workflowRun.create({
      data: {
        templateId,
        status: 'pending',
        triggeredBy,
        contextData: context ?? undefined,
      },
    });

    this.runner.runWorkflow(run.id, templateId).catch((err) => {
      this.logger.error(`Workflow run ${run.id} failed: ${err.message}`);
    });

    return run;
  }

  async batchRun(templateIds: string[], triggeredBy = 'manual', context?: Record<string, any>) {
    const runs = await Promise.all(
      templateIds.map((templateId) =>
        this.prisma.workflowRun.create({
          data: { templateId, status: 'pending', triggeredBy, contextData: context ?? undefined },
        }),
      ),
    );

    this.runner
      .runBatch(
        runs.map((r) => ({ runId: r.id, templateId: r.templateId })),
      )
      .catch((err: Error) => {
        this.logger.error(`Batch run failed: ${err.message}`);
      });

    return runs;
  }

  async findRuns(templateId: string) {
    return this.prisma.workflowRun.findMany({
      where: { templateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRunDetail(runId: string) {
    return this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { startedAt: 'asc' } } },
    });
  }
}
