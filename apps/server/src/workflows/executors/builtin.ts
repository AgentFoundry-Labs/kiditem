import { registerNode, recordActivity } from './index';

// ─── Workflow executor surface (slim core) ───────────────────────────────
// The workflow engine is a DAG runner + run/panel recorder + Agent
// delegation shell. It is NOT a generic database, HTTP, transform, or LLM
// engine. AI/LLM work goes through `agent_task.create` → AgentRegistry.
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
  // The runner injects `company_id` from the verified template owner.
  // Any caller-supplied `company_id` in the node config is overwritten
  // before this executor runs, so this value is the trusted tenant scope.
  const companyId = config.company_id as string;

  await prisma.alert.create({
    data: {
      companyId,
      type: (config.alert_type as string) ?? 'workflow',
      severity: (config.severity as string) ?? 'info',
      title,
      message,
    },
  });

  if (config.product_id) {
    await recordActivity(prisma, {
      companyId,
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
  if (!services?.agentRegistry) {
    throw new Error('AgentRegistryService is required for agent_task.create');
  }
  const companyId = config.company_id as string | undefined;
  if (!companyId) {
    throw new Error('agent_task.create requires runner-injected company_id');
  }
  const result = await services.agentRegistry.runByType(config.agent_type as string, {
    companyId,
    workflowRunId: config._workflow_run_id as string | undefined,
    workflowNodeId: config._workflow_node_id as string | undefined,
    sourceDataId: config.source_data_id as string | undefined,
    extra: {
      ...(config.input as any) ?? {},
      _workflow_run_id: config._workflow_run_id,
      _workflow_node_id: config._workflow_node_id,
      source_data_id: config.source_data_id,
    },
  });
  return { taskId: result.taskId, agentType: config.agent_type };
});
