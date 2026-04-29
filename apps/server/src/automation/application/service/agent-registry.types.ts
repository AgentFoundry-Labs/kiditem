import type { UpdateAgentBodyDto } from '../../../agent-registry/dto';

export type AgentDefinitionUpdateData = Omit<UpdateAgentBodyDto, 'schedule'> & {
  schedule?: string | null;
  trustLevel?: number;
};

/**
 * Input contract for Agent OS execution. `companyId` is the trusted tenant
 * scope from `@CurrentCompany()` or an explicit internal hand-off.
 */
export interface AgentRunInput {
  companyId?: string;
  dryRun?: boolean;
  workflowRunId?: string;
  workflowNodeId?: string;
  sourceDataId?: string;
  extra?: Record<string, unknown>;
}

export const tenantScopeFilter = (companyId: string) => ({
  OR: [{ companyId }, { companyId: null }],
});

export const tenantOwnedFilter = (companyId: string) => ({ companyId });
