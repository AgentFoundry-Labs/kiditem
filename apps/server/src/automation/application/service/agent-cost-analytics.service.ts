import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AgentCostSummary, CostAnalytics, DailyCost } from '@kiditem/shared/agent';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AgentCostAnalyticsService {
  private readonly logger = new Logger(AgentCostAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resetMonthlyBudgets(): Promise<void> {
    await this.prisma.agentDefinition.updateMany({
      where: { monthlyTokenBudget: { gt: 0 } },
      data: { tokensUsed: 0, budgetResetAt: new Date() },
    });
    this.logger.log('Monthly token budgets reset');
  }

  async getCostAnalytics(companyId: string, query: { from?: string; to?: string; agentId?: string }) {
    const from = query.from ? new Date(query.from) : new Date('2020-01-01');
    const to = query.to ? new Date(query.to) : new Date();

    const dailyAgentFilter = query.agentId
      ? Prisma.sql`AND agent_id = ${query.agentId}::uuid`
      : Prisma.empty;

    const daily: Array<{
      date: Date | string;
      total_cost_cents: bigint | number;
      total_input_tokens: bigint | number;
      total_output_tokens: bigint | number;
      run_count: bigint | number;
    }> = await this.prisma.$queryRaw`
      SELECT DATE(started_at) as date,
        COALESCE(SUM((usage_json->>'costCents')::int), 0) as total_cost_cents,
        COALESCE(SUM((usage_json->>'inputTokens')::int), 0) as total_input_tokens,
        COALESCE(SUM((usage_json->>'outputTokens')::int), 0) as total_output_tokens,
        COUNT(*)::int as run_count
      FROM heartbeat_runs
      WHERE company_id = ${companyId}::uuid
        AND started_at >= ${from} AND started_at <= ${to}
        AND status IN ('succeeded', 'failed')
        AND usage_json IS NOT NULL
        ${dailyAgentFilter}
      GROUP BY DATE(started_at) ORDER BY date ASC
    `;

    const agentFilter = query.agentId
      ? Prisma.sql`AND h.agent_id = ${query.agentId}::uuid`
      : Prisma.empty;

    const byAgent: Array<{
      agent_id: string;
      agent_name: string | null;
      total_cost_cents: bigint | number;
      total_input_tokens: bigint | number;
      total_output_tokens: bigint | number;
      run_count: bigint | number;
    }> = await this.prisma.$queryRaw`
      SELECT h.agent_id, d.name as agent_name,
        COALESCE(SUM((h.usage_json->>'costCents')::int), 0) as total_cost_cents,
        COALESCE(SUM((h.usage_json->>'inputTokens')::int), 0) as total_input_tokens,
        COALESCE(SUM((h.usage_json->>'outputTokens')::int), 0) as total_output_tokens,
        COUNT(*)::int as run_count
      FROM heartbeat_runs h
      LEFT JOIN agent_definitions d
        ON h.agent_id = d.id
        AND (d.company_id IS NULL OR d.company_id = h.company_id)
      WHERE h.company_id = ${companyId}::uuid
        AND h.started_at >= ${from} AND h.started_at <= ${to}
        AND h.status IN ('succeeded', 'failed')
        AND h.usage_json IS NOT NULL
        ${agentFilter}
      GROUP BY h.agent_id, d.name ORDER BY total_cost_cents DESC
    `;

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

    const summary = {
      totalCostCents: dailyResult.reduce((s, r) => s + r.totalCostCents, 0),
      totalInputTokens: dailyResult.reduce((s, r) => s + r.totalInputTokens, 0),
      totalOutputTokens: dailyResult.reduce((s, r) => s + r.totalOutputTokens, 0),
      totalRuns: dailyResult.reduce((s, r) => s + r.runCount, 0),
    } satisfies CostAnalytics['summary'];

    return { daily: dailyResult, byAgent: byAgentResult, summary } satisfies CostAnalytics;
  }
}
