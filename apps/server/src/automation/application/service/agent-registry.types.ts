export interface AgentDefinitionUpdateData {
  name?: string;
  type?: string;
  description?: string;
  promptTemplate?: string;
  allowedTools?: string;
  permissionMode?: string;
  monthlyTokenBudget?: number;
  schedule?: string | null;
  timeoutSeconds?: number;
  requiresApproval?: boolean;
  trustLevel?: number;
}

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
