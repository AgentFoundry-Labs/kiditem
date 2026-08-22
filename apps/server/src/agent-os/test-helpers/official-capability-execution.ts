export function officialCapabilityExecution(
  input: Record<string, unknown>,
  options: { organizationId?: string; actor?: string | null; requestId?: string } = {},
) {
  const organizationId = options.organizationId ?? 'org-1';
  return {
    organization: `organizations/${organizationId}`,
    actor: options.actor === null ? null : (options.actor ?? 'users/user-1'),
    agentVersion: 'agentDefinitions/operator/versions/1',
    session: `organizations/${organizationId}/agentSessions/session-1`,
    task: `organizations/${organizationId}/agentSessions/session-1/tasks/task-1`,
    execution: `organizations/${organizationId}/agentSessions/session-1/executions/execution-1`,
    attempt: `organizations/${organizationId}/agentSessions/session-1/executions/execution-1/attempts/attempt-1`,
    operation: `organizations/${organizationId}/operations/operation-1`,
    requestId: options.requestId ?? '00000000-0000-4000-8000-000000000001',
    input,
  };
}
