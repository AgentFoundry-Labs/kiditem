import { registerNode, recordActivity } from './index';

// ─── Workflow executor surface (slim core) ───────────────────────────────
// The workflow engine is a DAG runner + run/panel recorder + Agent
// delegation shell. It is NOT a generic database, HTTP, transform, or LLM
// engine. AI/LLM work goes through `agent_task.create` → Agent OS via
// `AgentRunnerPort`.
//
// Removed (intentionally): internal.db_query, api_call, action,
// data.filter, data_transform, ai_process, and the legacy aliases
// `trigger`, `trigger.event`, `condition`, `notification`. Templates that
// still reference any of those types must fail with "No executor for node
// type: ..." so the regression is visible in WorkflowRun.error.

registerNode('trigger.manual', async () => {
  return { triggeredAt: new Date().toISOString() };
}, true);

registerNode('trigger.schedule', async () => {
  return { triggeredAt: new Date().toISOString() };
}, true);

registerNode('condition.evaluate', async (_prisma, config, context) => {
  const rawField = config.field as string;
  const operator = config.operator as string;
  const threshold = Number(config.value);

  const resolved = context.resolve(rawField);
  const actual = Number(resolved) || 0;

  const ops: Record<string, boolean> = {
    lt: actual < threshold,
    gt: actual > threshold,
    eq: actual === threshold,
    gte: actual >= threshold,
    lte: actual <= threshold,
  };
  const result = ops[operator] ?? false;
  const branch = result
    ? (config.true_label as string) ?? 'true'
    : (config.false_label as string) ?? 'false';

  return { result, branch, actual, threshold };
}, true);

registerNode('notification.alert', async (prisma, config, context) => {
  const title = context.resolve((config.title as string) ?? '');
  const message = context.resolve((config.message as string) ?? '');
  // The runner injects `organization_id` from the verified template owner.
  // Any caller-supplied `organization_id` in the node config is overwritten
  // before this executor runs, so this value is the trusted tenant scope.
  const organizationId = config.organization_id as string;

  await prisma.alert.create({
    data: {
      organizationId,
      type: (config.alert_type as string) ?? 'workflow',
      severity: (config.severity as string) ?? 'info',
      title,
      message,
    },
  });

  if (config.product_id) {
    await recordActivity(prisma, {
      organizationId,
      objectType: 'product',
      objectId: config.product_id as string,
      eventType: 'alert_created',
      source: `workflow:${config._workflow_node_id}`,
      title,
      data: { message, severity: config.severity ?? 'info' },
    });
  }

  return { sent: true, title };
});

registerNode('agent_task.create', async (_prisma, config, _context, services) => {
  if (!services?.agentRunner) {
    throw new Error('AgentRunnerPort is required for agent_task.create');
  }
  const organizationId = config.organization_id as string | undefined;
  if (!organizationId) {
    throw new Error('agent_task.create requires runner-injected organization_id');
  }
  const agentType = config.agent_type as string;
  if (!agentType || typeof agentType !== 'string') {
    throw new Error('agent_task.create requires agent_type');
  }

  const workflowRunId = config._workflow_run_id as string | undefined;
  const workflowNodeId = config._workflow_node_id as string | undefined;
  const sourceDataId = config.source_data_id as string | undefined;
  const inputPayload = (config.input as Record<string, unknown> | undefined) ?? {};

  const result = await services.agentRunner.runByType(agentType, {
    organizationId,
    sourceType: 'workflow',
    sourceId: workflowRunId,
    sourceWorkflowRunId: workflowRunId,
    sourceWorkflowNodeId: workflowNodeId,
    sourceResourceType: sourceDataId ? 'data' : undefined,
    sourceResourceId: sourceDataId,
    payload: {
      ...inputPayload,
      _workflow_run_id: workflowRunId,
      _workflow_node_id: workflowNodeId,
      source_data_id: sourceDataId,
    },
  });

  return {
    requestId: result.requestId,
    runId: result.runId,
    agentType,
    status: result.status,
  };
});
