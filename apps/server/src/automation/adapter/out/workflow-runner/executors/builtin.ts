import { registerNode, recordActivity } from './index';

// ─── Workflow executor surface (slim core) ───────────────────────────────
// The workflow engine is a DAG runner + run/panel recorder. It is NOT a
// generic database, HTTP, transform, Agent, or LLM engine. LLM work starts in
// Agent OS, which may call deterministic workflows through automation-owned
// ports or registered workflow capabilities.
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
