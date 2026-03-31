import { registerNode, getExecutor, recordActivity } from './index';

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

// ─── trigger 위임 ───

registerNode('trigger', async () => ({ triggeredAt: new Date().toISOString() }));

registerNode('trigger.event', async (_prisma, config) => ({
  triggeredAt: new Date().toISOString(),
  event: (config.event as string) ?? 'unknown',
}));

// ─── condition / notification 위임 ───

registerNode('condition', async (_prisma, config, context) => {
  const field = config.field as string | undefined;
  if (!field) {
    // field 미설정 시 기본 통과 (true branch)
    const branch = (config.true_label as string) ?? 'true';
    return { result: true, branch, message: `조건 체크: ${config.check ?? 'default'}` };
  }
  // field 있으면 condition.evaluate 로직
  const resolved = context.resolve(field);
  const actual = Number(resolved) || 0;
  const operator = (config.operator as string) ?? 'gt';
  const threshold = Number(config.value) || 0;
  const ops: Record<string, boolean> = {
    lt: actual < threshold, gt: actual > threshold, eq: actual === threshold,
    gte: actual >= threshold, lte: actual <= threshold,
  };
  const result = ops[operator] ?? false;
  const branch = result ? (config.true_label as string) ?? 'true' : (config.false_label as string) ?? 'false';
  return { result, branch, actual, threshold };
});

registerNode('notification', async (_prisma, config, context) => {
  const channel = (config.channel as string) ?? 'default';
  const title = config.title ? context.resolve(config.title as string) : `알림 (${channel})`;
  const message = config.message ? context.resolve(config.message as string) : '';
  return { sent: true, channel, title, message, timestamp: new Date().toISOString() };
});

// ─── api_call ───

registerNode('api_call', async (_prisma, config, context) => {
  const url = context.resolve((config.url ?? config.endpoint ?? '') as string);
  const method = ((config.method as string) ?? 'GET').toUpperCase();
  const headers = (config.headers as Record<string, string>) ?? { 'Content-Type': 'application/json' };
  const timeout = Number(config.timeout) || 30000;
  const body = config.body ? JSON.stringify(context.resolveConfig(config.body as Record<string, any>)) : undefined;

  if (!url || !url.startsWith('http')) {
    return { stub: true, message: `API 호출 미설정 (${(config.api as string) ?? 'unknown'})`, data: {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`API 응답 에러: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return { data, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`API 호출 실패: ${err instanceof Error ? err.message : err}`);
  }
});

// ─── data_transform ───

registerNode('data_transform', async (_prisma, config, context) => {
  const sourceNodes = ((config.source_nodes ?? [config.source_node]) as string[]).filter(Boolean);
  const operation = ((config.operation as string) ?? 'merge');

  const allRows: any[] = [];
  for (const nodeId of sourceNodes) {
    const output = context.getOutput(nodeId) ?? {};
    const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
    const items = arrayKey ? (output[arrayKey] as any[]) : output.data ? [output.data] : [];
    allRows.push(...items);
  }

  if (operation === 'deduplicate') {
    const field = (config.dedup_field as string) ?? 'id';
    const seen = new Set<any>();
    const deduped = allRows.filter((r) => {
      const v = r[field];
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    return { rows: deduped, count: deduped.length };
  }

  if (operation === 'pick') {
    const fields = (config.fields as string[]) ?? [];
    const picked = allRows.map((r) => {
      const o: Record<string, any> = {};
      fields.forEach((f) => { if (r[f] !== undefined) o[f] = r[f]; });
      return o;
    });
    return { rows: picked, count: picked.length };
  }

  return { rows: allRows, count: allRows.length };
});

// ─── action ───

registerNode('action', async (_prisma, config) => {
  const actionType = ((config.action ?? config.action_type) as string) ?? 'log';
  const params = (config.params as Record<string, any>) ?? {};

  return {
    executed: true,
    actionType,
    params,
    message: `액션 실행: ${actionType}`,
    timestamp: new Date().toISOString(),
  };
});

// ─── ai_process ───

registerNode('ai_process', async (_prisma, config, context) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
  const GEMINI_MODEL = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';

  if (!GEMINI_API_KEY) {
    return { stub: true, message: 'GEMINI_API_KEY 미설정', result: '' };
  }

  const sourceNodes = (config.source_nodes as string[]) ?? [];
  const sourceData: Record<string, any> = {};
  for (const nodeId of sourceNodes) {
    const output = context.getOutput(nodeId);
    if (output) sourceData[nodeId] = output;
  }

  const promptTemplate = ((config.prompt_template ?? config.prompt) as string) ?? '다음 데이터를 분석하고 요약해주세요:\n{{data}}';
  const prompt = promptTemplate.replace('{{data}}', JSON.stringify(sourceData, null, 2));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!res.ok) throw new Error(`AI 처리 실패: ${res.status}`);
  const data = await res.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return { result, model: GEMINI_MODEL };
});
