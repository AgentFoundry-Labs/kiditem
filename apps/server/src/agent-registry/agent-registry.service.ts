import { Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import type { AgentListItem, DailyCost, AgentCostSummary, CostAnalytics } from '@kiditem/shared';
import { validateAllowedTools } from './safety/dangerous-patterns';
import type { OrgNode } from './types';

export type { OrgNode } from './types';

@Injectable()
export class AgentRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AgentRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => HeartbeatService))
    private readonly heartbeat: HeartbeatService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.heartbeat.syncTimers();
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

  async list(companyId: string, query: { isActive?: string } = {}): Promise<AgentListItem[]> {
    const items = await this.prisma.agentDefinition.findMany({
      where: {
        companyId,
        ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      },
      omit: { promptTemplate: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((a) => ({
      ...a,
      adapterConfig: (a.adapterConfig ?? {}) as Record<string, unknown>,
      runtimeConfig: (a.runtimeConfig ?? {}) as Record<string, unknown>,
      permissions: (a.permissions ?? {}) as Record<string, unknown>,
      actionCap: (a.actionCap ?? {}) as Record<string, unknown>,
      metadata: a.metadata as Record<string, unknown> | null,
    }) satisfies AgentListItem);
  }

  async getById(id: string, companyId?: string) {
    const def = await this.prisma.agentDefinition.findUnique({
      where: { id },
    });
    if (!def) throw new NotFoundException(`Agent definition ${id} not found`);

    // Company isolation check
    if (companyId && def.companyId && def.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this agent');
    }

    return def;
  }

  async create(data: {
    companyId: string;
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
    // #13 Dangerous Pattern Detection — validate on create
    if (data.allowedTools) {
      const toolCheck = validateAllowedTools(data.allowedTools);
      if (!toolCheck.valid) {
        throw new BadRequestException(`Blocked tool patterns: ${toolCheck.blocked.join(', ')}`);
      }
    }

    const created = await this.prisma.agentDefinition.create({
      data: {
        ...data,
        adapterConfig: data.adapterConfig as Prisma.InputJsonValue | undefined,
        permissions: data.permissions as Prisma.InputJsonValue | undefined,
        runtimeConfig: data.runtimeConfig as Prisma.InputJsonValue | undefined,
      },
    });
    await this.heartbeat.syncTimers();
    return created;
  }

  async update(id: string, data: Record<string, unknown>) {
    // #13 Dangerous Pattern Detection — validate on update
    if (typeof data.allowedTools === 'string') {
      const toolCheck = validateAllowedTools(data.allowedTools);
      if (!toolCheck.valid) {
        throw new BadRequestException(`Blocked tool patterns: ${toolCheck.blocked.join(', ')}`);
      }
    }

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

  /**
   * Type 기반 실행. 도메인 서비스에서 agentType만 알 때 사용.
   * findByType + run 을 합친 편의 메서드.
   */
  async runByType(type: string, input?: {
    companyId?: string;
    dryRun?: boolean;
    extra?: Record<string, unknown>;
  }) {
    const def = await this.findByType(type);
    return this.run(def.id, input);
  }

  async run(id: string, input?: {
    companyId?: string;
    dryRun?: boolean;
    extra?: Record<string, unknown>;
  }) {
    const def = await this.getById(id);
    const dryRun = input?.dryRun ?? def.requiresApproval;

    // Company isolation check
    if (input?.companyId && def.companyId && def.companyId !== input.companyId) {
      throw new ForbiddenException('Access denied to this agent');
    }

    // 예산 체크 (task 생성 전) — 4단계 비용 경고
    if (def.monthlyTokenBudget > 0) {
      const usageRatio = def.tokensUsed / def.monthlyTokenBudget;
      if (usageRatio >= 1.0) {
        this.logger.error(`Agent ${def.name} budget exceeded: ${def.tokensUsed}/${def.monthlyTokenBudget}`);
        throw new BadRequestException(`월간 토큰 예산 초과 (${def.tokensUsed}/${def.monthlyTokenBudget})`);
      }
      if (usageRatio >= 0.95) {
        this.logger.error(`Agent ${def.name} budget critical: ${Math.round(usageRatio * 100)}% used`);
      } else if (usageRatio >= 0.80) {
        this.logger.warn(`Agent ${def.name} budget warning: ${Math.round(usageRatio * 100)}% used`);
      }
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
    try {
      await this.heartbeat.wakeAgent({
        agentId: def.id,
        companyId: input?.companyId ?? def.companyId ?? undefined,
        source: 'on_demand',
        reason: `run() call for ${def.type}`,
        payload: {
          dry_run: dryRun,
          _legacy_task_id: task.id,
          ...input?.extra,
        },
        requestedByType: 'system',
      });
    } catch (err) {
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { status: 'failed', error: `Wakeup failed: ${err instanceof Error ? err.message : err}`, completedAt: new Date() },
      });
      throw err;
    }

    this.logger.log(`Agent wakeup: ${def.name} (task=${task.id}), dry_run=${dryRun}`);
    return { ok: true, taskId: task.id, agentType: def.type, dryRun };
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

  async getRunById(runId: string) {
    return this.prisma.heartbeatRun.findUnique({ where: { id: runId } });
  }

  async getRunHistory(agentId: string, limit = 20) {
    return this.prisma.heartbeatRun.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRuntimeState(agentId: string) {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) {
      return {
        agentId,
        rtTotalInputTokens: 0,
        rtTotalOutputTokens: 0,
        rtTotalCostCents: 0,
        rtConsecutiveFailCount: 0,
        rtSessionId: null,
        rtLastRunId: null,
        rtLastRunStatus: null,
        rtLastError: null,
        rtLastFailedAt: null,
      };
    }
    return {
      agentId,
      rtSessionId: (agent as any).rtSessionId ?? null,
      rtStateJson: (agent as any).rtStateJson ?? null,
      rtLastRunId: (agent as any).rtLastRunId ?? null,
      rtLastRunStatus: (agent as any).rtLastRunStatus ?? null,
      rtTotalInputTokens: (agent as any).rtTotalInputTokens ?? 0,
      rtTotalOutputTokens: (agent as any).rtTotalOutputTokens ?? 0,
      rtTotalCostCents: (agent as any).rtTotalCostCents ?? 0,
      rtLastError: (agent as any).rtLastError ?? null,
      rtConsecutiveFailCount: (agent as any).rtConsecutiveFailCount ?? 0,
      rtLastFailedAt: (agent as any).rtLastFailedAt ?? null,
    };
  }

  async resetSession(agentId: string): Promise<{ ok: boolean }> {
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { rtSessionId: null } as any,
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
    // 에러 복구 캐스케이드: resume 시 연속 실패 카운터 리셋
    await this.prisma.agentDefinition.updateMany({
      where: { id: agentId },
      data: { rtConsecutiveFailCount: 0, rtLastFailedAt: null } as any,
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

  async getOrgTree(companyId: string): Promise<OrgNode[]> {
    // 마켓플레이스 전체 카탈로그 (claude_local만 — 조직도 대상)
    const catalog = await this.prisma.marketplace.findMany({
      where: { type: 'agent', isPublished: true, adapterType: 'claude_local' },
      orderBy: { name: 'asc' },
    });

    // 해당 company에서 고용한 에이전트
    const hired = await this.prisma.agentDefinition.findMany({
      where: { companyId, adapterType: 'claude_local', isActive: true },
    });
    const hiredByMarketplaceId = new Map(
      hired.filter(h => h.marketplaceId).map(h => [h.marketplaceId!, h]),
    );

    // 카탈로그 기반으로 트리 구성 (manager → specialist)
    const managerCatalog = catalog.find((c) => c.role === 'manager');
    const specialistCatalog = catalog.filter((c) => c.role !== 'manager');

    const toNode = (c: typeof catalog[number]): OrgNode => {
      const agent = hiredByMarketplaceId.get(c.id);
      return {
        id: agent?.id ?? c.id,
        name: c.name,
        type: agent?.type ?? c.role ?? 'specialist',
        role: c.role ?? 'specialist',
        title: agent?.title ?? c.name,
        status: agent?.status ?? 'not_hired',
        adapterType: c.adapterType ?? 'claude_local',
        lastHeartbeatAt: agent?.lastHeartbeatAt?.toISOString() ?? null,
        hired: !!agent,
        marketplaceId: c.id,
        reports: [],
      };
    };

    if (!managerCatalog) return specialistCatalog.map(toNode);

    const managerNode = toNode(managerCatalog);
    managerNode.reports = specialistCatalog.map(toNode);
    return [managerNode];
  }
}
