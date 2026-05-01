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
 * Input contract for Agent OS execution. `organizationId` is the trusted tenant
 * scope from `@CurrentOrganization()` or an explicit internal hand-off.
 */
export interface AgentRunInput {
  organizationId?: string;
  dryRun?: boolean;
  workflowRunId?: string;
  workflowNodeId?: string;
  sourceDataId?: string;
  extra?: Record<string, unknown>;
}

export const tenantScopeFilter = (organizationId: string) => ({
  OR: [{ organizationId }, { organizationId: null }],
});

export const tenantOwnedFilter = (organizationId: string) => ({ organizationId });
