import { registerNode, recordActivity } from './index';

registerNode('trigger.manual', async () => {
  return { triggeredAt: new Date().toISOString() };
});

registerNode('trigger.schedule', async () => {
  return { triggeredAt: new Date().toISOString() };
});

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
});

registerNode('data.filter', async (_prisma, config, context) => {
  const sourceNode = config.source_node as string;
  const sourceKey = (config.source_key as string) ?? 'rows';
  const field = config.filter_field as string;
  const operator = config.filter_operator as string;
  const value = config.filter_value;

  const sourceData = context.getOutput(sourceNode) ?? {};
  const items = (sourceData[sourceKey] as any[]) ?? [];

  const ops: Record<string, (a: any, b: any) => boolean> = {
    lt: (a, b) => Number(a) < Number(b),
    gt: (a, b) => Number(a) > Number(b),
    eq: (a, b) => a == b,
    contains: (a, b) => String(a).includes(String(b)),
  };
  const opFn = ops[operator] ?? (() => false);
  const filtered = items.filter((item) => opFn(item[field], value));

  return {
    rows: filtered,
    count: filtered.length,
    filteredOut: items.length - filtered.length,
  };
});

registerNode('notification.alert', async (prisma, config, context) => {
  const title = context.resolve((config.title as string) ?? '');
  const message = context.resolve((config.message as string) ?? '');
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

registerNode('internal.db_query', async (prisma, config) => {
  const model = config.model as string;
  const where = (config.where as Record<string, any>) ?? {};
  const take = Number(config.limit) || 100;

  const ctx = (config._context as Record<string, any>) ?? {};
  if (ctx.productId) {
    where.productId = ctx.productId;
  }
  if (config.company_id && !where.companyId) {
    where.companyId = config.company_id;
  }

  const prismaModel = (prisma as any)[model];
  if (!prismaModel) {
    throw new Error(`Unknown model: ${model}`);
  }

  const rows = await prismaModel.findMany({ where, take });
  return { rows, count: rows.length };
});

registerNode('agent_task.create', async (prisma, config) => {
  const task = await prisma.agentTask.create({
    data: {
      agentType: config.agent_type as string,
      input: (config.input as any) ?? {},
      workflowRunId: (config._workflow_run_id as string) ?? null,
      workflowNodeId: (config._workflow_node_id as string) ?? null,
      sourceDataId: (config.source_data_id as string) ?? null,
    },
  });

  await (prisma as any).$executeRawUnsafe(
    `SELECT pg_notify('new_agent_task', $1)`,
    task.id,
  );

  return { taskId: task.id, agentType: config.agent_type };
});
