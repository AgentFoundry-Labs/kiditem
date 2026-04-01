import { Injectable, Logger, OnModuleInit, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { DEFAULT_AGENT_DEFINITIONS } from './seed-agents';
import type { DailyCost, AgentCostSummary, CostAnalytics } from '@kiditem/shared';

export interface OrgNode {
  id: string;
  name: string;
  type: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  lastHeartbeatAt: string | null;
  reports: OrgNode[];
}

@Injectable()
export class AgentRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AgentRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => HeartbeatService))
    private readonly heartbeat: HeartbeatService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
    await this.heartbeat.syncTimers();
  }

  private async seedDefaults(): Promise<void> {
    for (const def of DEFAULT_AGENT_DEFINITIONS) {
      const existing = await this.prisma.agentDefinition.findUnique({
        where: { type: def.type },
      });
      if (!existing) {
        await this.prisma.agentDefinition.create({ data: def });
        this.logger.log(`Seeded agent definition: ${def.name}`);
      }
    }
  }

  // ── 조회 ──

  async findByType(type: string) {
    const def = await this.prisma.agentDefinition.findUnique({
      where: { type },
    });
    if (!def) throw new NotFoundException(`Agent definition with type '${type}' not found`);
    return def;
  }

  // ── CRUD ──

  async list(query: { companyId: string; isActive?: string }) {
    return this.prisma.agentDefinition.findMany({
      where: {
        OR: [{ companyId: query.companyId }, { companyId: null }],
        ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      },
      include: { runtimeState: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const def = await this.prisma.agentDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException(`Agent definition ${id} not found`);
    return def;
  }

  async create(data: {
    companyId?: string;
    name: string;
    type: string;
    description?: string;
    promptTemplate: string;
    allowedTools?: string;
    permissionMode?: string;
    monthlyTokenBudget?: number;
    schedule?: string;
    timeoutSeconds?: number;
    requiresApproval?: boolean;
    adapterType?: string;
    adapterConfig?: Record<string, unknown>;
    role?: string;
    title?: string;
    skills?: string[];
    permissions?: Record<string, unknown>;
    runtimeConfig?: Record<string, unknown>;
  }) {
    const created = await this.prisma.agentDefinition.create({ data: data as any });
    await this.heartbeat.syncTimers();
    return created;
  }

  async update(id: string, data: Record<string, unknown>) {
    const updated = await this.prisma.agentDefinition.update({
      where: { id },
      data: data as any,
    });
    await this.heartbeat.syncTimers();
    return updated;
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentDefinition.delete({ where: { id } });
    await this.heartbeat.syncTimers();
    return { ok: true };
  }

  // ── 실행 (하위 호환 — heartbeat 위임) ──

  async run(id: string, input?: {
    companyId?: string;
    dryRun?: boolean;
    extra?: Record<string, unknown>;
    resultApiBase?: string;
  }) {
    const def = await this.getById(id);
    const dryRun = input?.dryRun ?? def.requiresApproval;

    // 예산 체크 (task 생성 전)
    if (def.monthlyTokenBudget > 0 && def.tokensUsed >= def.monthlyTokenBudget) {
      this.logger.warn(`Agent ${def.name} budget exceeded: ${def.tokensUsed}/${def.monthlyTokenBudget}`);
      return { ok: false, error: 'monthly_budget_exceeded', tokensUsed: def.tokensUsed, budget: def.monthlyTokenBudget };
    }

    // AgentTask 생성 (기존 도메인 콜백 호환)
    const task = await this.prisma.agentTask.create({
      data: {
        agentType: def.type,
        companyId: input?.companyId ?? def.companyId,
        status: 'running',
        startedAt: new Date(),
        input: {
          definitionId: def.id,
          dry_run: dryRun,
          runtime: def.adapterType,
          ...input?.extra,
        } as any,
      },
    });

    // Heartbeat wakeup으로 위임
    await this.heartbeat.wakeAgent({
      agentId: def.id,
      companyId: input?.companyId ?? def.companyId ?? undefined,
      source: 'on_demand',
      reason: `run() call for ${def.type}`,
      payload: {
        dry_run: dryRun,
        result_api_base: input?.resultApiBase,
        _legacy_task_id: task.id,
        ...input?.extra,
      },
      requestedByType: 'system',
    });

    this.logger.log(`Agent wakeup: ${def.name} (task=${task.id}), dry_run=${dryRun}`);
    return { ok: true, taskId: task.id, agentType: def.type, dryRun };
  }

  // ── 결과 수신 (하위 호환) ──

  /**
   * 공통 태스크 완료 처리.
   */
  async completeTask(
    taskId: string,
    body: { actions?: unknown[]; summary?: Record<string, unknown>; tokensUsed?: number; products?: unknown[] },
  ) {
    const task = await this.prisma.agentTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);

    await this.prisma.agentTask.update({
      where: { id: taskId },
      data: {
        output: body as any,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    const input = task.input as any;
    if (input?.definitionId && body.tokensUsed) {
      await this.prisma.agentDefinition.update({
        where: { id: input.definitionId },
        data: { tokensUsed: { increment: body.tokensUsed } },
      });
    }

    return task;
  }

  /**
   * 범용 결과 수신: completeTask + activity_event.
   */
  async receiveResults(
    taskId: string,
    body: { actions?: unknown[]; summary?: Record<string, unknown>; tokensUsed?: number },
  ): Promise<{ ok: boolean }> {
    const task = await this.completeTask(taskId, body);

    if (task.companyId) {
      await this.prisma.activityEvent.create({
        data: {
          companyId: task.companyId,
          objectType: 'company',
          objectId: task.companyId,
          eventType: task.agentType,
          source: `agent:${task.agentType}`,
          title: `${task.agentType} 실행 완료`,
          data: body as any,
        },
      });
    }

    return { ok: true };
  }

  // ── 월간 예산 리셋 ──

  async resetMonthlyBudgets(): Promise<void> {
    await this.prisma.agentDefinition.updateMany({
      where: { monthlyTokenBudget: { gt: 0 } },
      data: { tokensUsed: 0, budgetResetAt: new Date() },
    });
    this.logger.log('Monthly token budgets reset');
  }

  // ── Heartbeat 관리 API ──

  async getRunHistory(agentId: string, limit = 20) {
    return this.prisma.heartbeatRun.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRuntimeState(agentId: string) {
    return this.prisma.agentRuntimeState.findUnique({ where: { agentId } });
  }

  async resetSession(agentId: string): Promise<{ ok: boolean }> {
    await this.prisma.agentRuntimeState.update({
      where: { agentId },
      data: { sessionId: null },
    });
    return { ok: true };
  }

  async pauseAgent(agentId: string, reason?: string): Promise<{ ok: boolean }> {
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { status: 'paused', pauseReason: reason, pausedAt: new Date() },
    });
    return { ok: true };
  }

  async resumeAgent(agentId: string): Promise<{ ok: boolean }> {
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { status: 'idle', pauseReason: null, pausedAt: null },
    });
    return { ok: true };
  }

  // ── Cost Analytics ──

  async getCostAnalytics(query: { from?: string; to?: string; agentId?: string }) {
    const from = query.from ? new Date(query.from) : new Date('2020-01-01');
    const to = query.to ? new Date(query.to) : new Date();

    // daily 집계
    const dailyParams: unknown[] = [from, to];
    let dailyAgentFilter = '';
    if (query.agentId) {
      dailyParams.push(query.agentId);
      dailyAgentFilter = `AND agent_id = $${dailyParams.length}`;
    }

    const daily: Array<{
      date: Date | string;
      total_cost_cents: bigint | number;
      total_input_tokens: bigint | number;
      total_output_tokens: bigint | number;
      run_count: bigint | number;
    }> = await this.prisma.$queryRawUnsafe(
      `SELECT DATE(started_at) as date,
        COALESCE(SUM((usage_json->>'costCents')::int), 0) as total_cost_cents,
        COALESCE(SUM((usage_json->>'inputTokens')::int), 0) as total_input_tokens,
        COALESCE(SUM((usage_json->>'outputTokens')::int), 0) as total_output_tokens,
        COUNT(*)::int as run_count
      FROM heartbeat_runs
      WHERE started_at >= $1 AND started_at <= $2
        AND status IN ('succeeded', 'failed', 'timed_out')
        AND usage_json IS NOT NULL
        ${dailyAgentFilter}
      GROUP BY DATE(started_at) ORDER BY date ASC`,
      ...dailyParams,
    );

    // byAgent 집계
    const agentParams: unknown[] = [from, to];
    let agentFilter = '';
    if (query.agentId) {
      agentParams.push(query.agentId);
      agentFilter = `AND h.agent_id = $${agentParams.length}`;
    }

    const byAgent: Array<{
      agent_id: string;
      agent_name: string | null;
      total_cost_cents: bigint | number;
      total_input_tokens: bigint | number;
      total_output_tokens: bigint | number;
      run_count: bigint | number;
    }> = await this.prisma.$queryRawUnsafe(
      `SELECT h.agent_id, d.name as agent_name,
        COALESCE(SUM((h.usage_json->>'costCents')::int), 0) as total_cost_cents,
        COALESCE(SUM((h.usage_json->>'inputTokens')::int), 0) as total_input_tokens,
        COALESCE(SUM((h.usage_json->>'outputTokens')::int), 0) as total_output_tokens,
        COUNT(*)::int as run_count
      FROM heartbeat_runs h
      LEFT JOIN agent_definitions d ON h.agent_id = d.id
      WHERE h.started_at >= $1 AND h.started_at <= $2
        AND h.status IN ('succeeded', 'failed', 'timed_out')
        AND h.usage_json IS NOT NULL
        ${agentFilter}
      GROUP BY h.agent_id, d.name ORDER BY total_cost_cents DESC`,
      ...agentParams,
    );

    // 결과 변환 (BigInt → Number, Date → string)
    const dailyResult = daily.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      totalCostCents: Number(row.total_cost_cents),
      totalInputTokens: Number(row.total_input_tokens),
      totalOutputTokens: Number(row.total_output_tokens),
      runCount: Number(row.run_count),
    } satisfies DailyCost));

    const byAgentResult = byAgent.map((row) => ({
      agentId: row.agent_id,
      agentName: row.agent_name ?? 'Unknown',
      totalCostCents: Number(row.total_cost_cents),
      totalInputTokens: Number(row.total_input_tokens),
      totalOutputTokens: Number(row.total_output_tokens),
      runCount: Number(row.run_count),
    } satisfies AgentCostSummary));

    // summary
    const summary = {
      totalCostCents: dailyResult.reduce((s, r) => s + r.totalCostCents, 0),
      totalInputTokens: dailyResult.reduce((s, r) => s + r.totalInputTokens, 0),
      totalOutputTokens: dailyResult.reduce((s, r) => s + r.totalOutputTokens, 0),
      totalRuns: dailyResult.reduce((s, r) => s + r.runCount, 0),
    } satisfies CostAnalytics['summary'];

    return { daily: dailyResult, byAgent: byAgentResult, summary } satisfies CostAnalytics;
  }

  // ── Org Chart ──

  async getOrgTree(): Promise<OrgNode[]> {
    const agents = await this.prisma.agentDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const agentMap = new Map(agents.map(a => [a.id, a]));
    const childMap = new Map<string | null, typeof agents>();

    for (const agent of agents) {
      const parentId = agent.reportsTo || null;
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId)!.push(agent);
    }

    function buildTree(parentId: string | null): OrgNode[] {
      const children = childMap.get(parentId) || [];
      return children.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        role: a.role,
        title: a.title,
        status: a.status,
        adapterType: a.adapterType,
        lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
        reports: buildTree(a.id),
      }));
    }

    return buildTree(null);
  }
}
