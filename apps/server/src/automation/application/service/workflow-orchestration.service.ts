import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { WorkflowTemplate } from '@kiditem/shared/workflow';
import { WorkflowRunnerService } from './workflow-runner.service';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import {
  WORKFLOW_ORCHESTRATION_REPOSITORY_PORT,
  type WorkflowOrchestrationRepositoryPort,
} from '../port/out/repository/workflow-orchestration.repository.port';
import type { JsonValue } from '../port/persistence-records';

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
  context?: Record<string, unknown>;
  triggeredByUserId?: string;
}

@Injectable()
export class WorkflowOrchestrationService {
  private readonly logger = new Logger(WorkflowOrchestrationService.name);

  constructor(
    @Inject(WORKFLOW_ORCHESTRATION_REPOSITORY_PORT)
    private readonly repository: WorkflowOrchestrationRepositoryPort,
    private readonly runner: WorkflowRunnerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async emitPanelUpsert(runId: string, organizationId: string): Promise<void> {
    try {
      const envelope = await this.repository.fetchPanelEnvelope(runId, organizationId);
      if (!envelope) return;
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, envelope);
    } catch (err) {
      this.logger.warn(`[workflows] Panel emit failed for run ${runId}: ${err}`);
    }
  }

  create(input: CreateWorkflowInput, organizationId: string) {
    return this.repository.createTemplate({ organizationId, ...input });
  }

  findAll(
    organizationId: string,
    filters: { module?: string; isActive?: string } = {},
  ): Promise<WorkflowTemplate[]> {
    return this.repository.findTemplates(organizationId, filters);
  }

  async findOne(id: string, organizationId: string) {
    const template = await this.repository.findTemplateScopedWithRunCount(id, organizationId);
    if (!template) {
      throw new NotFoundException(`워크플로우 템플릿(${id})을 찾을 수 없습니다`);
    }
    return template;
  }

  update(id: string, organizationId: string, data: UpdateWorkflowInput) {
    return this.repository.updateTemplate(id, organizationId, data);
  }

  remove(id: string, organizationId: string) {
    return this.repository.deleteTemplate(id, organizationId);
  }

  async triggerRun(templateId: string, organizationId: string, options: TriggerOptions = {}) {
    const template = await this.repository.findTemplateScoped(templateId, organizationId);
    if (!template) {
      throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);
    }

    const triggeredBy = options.triggeredBy ?? 'manual';
    const run = await this.repository.createRun({
      templateId,
      organizationId: template.organizationId,
      triggeredBy,
      triggeredByUserId: options.triggeredByUserId ?? null,
      contextData: options.context as JsonValue | undefined,
    });
    await this.emitPanelUpsert(run.id, template.organizationId);

    this.runner.runWorkflow(run.id, templateId, template.organizationId).catch((err) => {
      this.logger.error(`Workflow run ${run.id} failed: ${err.message}`);
    });

    return run;
  }

  async batchRun(templateIds: string[], organizationId: string, options: TriggerOptions = {}) {
    const uniqueTemplateIds = [...new Set(templateIds)];
    const templates = await this.repository.findTemplatesByIds(
      organizationId,
      uniqueTemplateIds,
    );
    if (templates.length !== uniqueTemplateIds.length) {
      const owned = new Set(templates.map((t) => t.id));
      const missing = uniqueTemplateIds.filter((id) => !owned.has(id));
      throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${missing.join(', ')}`);
    }
    const organizationIdByTemplateId = new Map(
      templates.map((t) => [t.id, t.organizationId]),
    );

    const triggeredBy = options.triggeredBy ?? 'manual';
    const runs = await Promise.all(
      templateIds.map((templateId) => {
        const templateOrganizationId = organizationIdByTemplateId.get(templateId);
        if (!templateOrganizationId) {
          throw new NotFoundException(`워크플로우 템플릿을 찾을 수 없습니다: ${templateId}`);
        }
        return this.repository.createRun({
          templateId,
          organizationId: templateOrganizationId,
          triggeredBy,
          triggeredByUserId: options.triggeredByUserId ?? null,
          contextData: options.context as JsonValue | undefined,
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
    const template = await this.repository.findTemplateScoped(templateId, organizationId);
    if (!template) {
      throw new NotFoundException(`워크플로우 템플릿(${templateId})을 찾을 수 없습니다`);
    }
    return this.repository.findRunsByTemplate(templateId, organizationId);
  }

  async findRunDetail(runId: string, organizationId: string) {
    const run = await this.repository.findRunScoped(runId, organizationId);
    if (!run) {
      throw new NotFoundException(`워크플로우 실행(${runId})을 찾을 수 없습니다`);
    }
    return run;
  }
}
