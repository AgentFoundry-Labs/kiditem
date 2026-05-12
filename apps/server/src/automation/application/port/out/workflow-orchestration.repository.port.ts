// Outgoing port for workflow template CRUD + workflow run lifecycle reads
// used by `WorkflowOrchestrationService`. Run-time execution mutations
// live behind `WorkflowRunnerService` until the executor framework is ported.

import type { WorkflowTemplate as SharedWorkflowTemplate } from '@kiditem/shared/workflow';
import type {
  JsonValue,
  WorkflowRunRecord,
  WorkflowTemplateRecord,
} from '../persistence-records';

export const WORKFLOW_ORCHESTRATION_REPOSITORY_PORT = Symbol(
  'WorkflowOrchestrationRepositoryPort',
);

export interface CreateWorkflowTemplateInput {
  organizationId: string;
  name: string;
  description?: string;
  module?: string;
  triggerType?: string;
  schedule?: string | null;
  nodesJson: unknown[];
  edgesJson: unknown[];
}

export interface UpdateWorkflowTemplateInput {
  name?: string;
  description?: string;
  module?: string;
  isActive?: boolean;
  triggerType?: string;
  schedule?: string | null;
  nodesJson?: unknown[];
  edgesJson?: unknown[];
}

export interface TemplateListFilters {
  module?: string;
  isActive?: string;
}

export interface CreateWorkflowRunInput {
  templateId: string;
  organizationId: string;
  triggeredBy: string;
  triggeredByUserId: string | null;
  contextData?: JsonValue;
}

export interface PanelItemEnvelope {
  /** Pre-mapped panel item ready for SSE emission. Shape stays opaque at
   *  the port level because the mapper lives in `mapper/panel-event/`. */
  item: unknown;
  organizationId: string;
}

export interface WorkflowOrchestrationRepositoryPort {
  createTemplate(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplateRecord>;

  findTemplates(
    organizationId: string,
    filters: TemplateListFilters,
  ): Promise<SharedWorkflowTemplate[]>;

  findTemplateScopedWithRunCount(
    id: string,
    organizationId: string,
  ): Promise<(WorkflowTemplateRecord & { _count: { runs: number } }) | null>;

  /** Returns the existing scoped template or null. */
  findTemplateScoped(
    id: string,
    organizationId: string,
  ): Promise<WorkflowTemplateRecord | null>;

  updateTemplate(
    id: string,
    organizationId: string,
    data: UpdateWorkflowTemplateInput,
  ): Promise<WorkflowTemplateRecord>;

  deleteTemplate(id: string, organizationId: string): Promise<WorkflowTemplateRecord>;

  /** Returns scoped templates ordered by input array order. */
  findTemplatesByIds(
    organizationId: string,
    templateIds: string[],
  ): Promise<Pick<WorkflowTemplateRecord, 'id' | 'organizationId'>[]>;

  createRun(input: CreateWorkflowRunInput): Promise<WorkflowRunRecord>;

  findRunsByTemplate(
    templateId: string,
    organizationId: string,
  ): Promise<WorkflowRunRecord[]>;

  findRunScoped(
    runId: string,
    organizationId: string,
  ): Promise<WorkflowRunRecord | null>;

  /**
   * Build the SSE panel envelope for a workflow run. Returns null when the
   * run is missing or its template was deleted (mapper short-circuit).
   */
  fetchPanelEnvelope(
    runId: string,
    organizationId: string,
  ): Promise<PanelItemEnvelope | null>;
}
