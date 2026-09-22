import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AiUsageAgentKeySchema,
  type AiUsageAgentKey,
  type AiUsageSummary,
  type AiUsageTotals,
} from '@kiditem/shared/ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { isPricedModel } from '../../../domain/ai-usage';
import type { AiUsageEntry } from '../../../application/usage/ai-usage-meter';
import type { AiUsageRepositoryPort } from '../../../application/port/out/repository/ai-usage.repository.port';

type TotalsRow = {
  calls: bigint;
  input_tokens: bigint | null;
  output_tokens: bigint | null;
  cost_micro_usd: bigint | null;
  unpriced_calls: bigint;
};

@Injectable()
export class AiUsageRepositoryAdapter implements AiUsageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async insert(entry: AiUsageEntry & { costMicroUsd: bigint | null }): Promise<void> {
    await this.prisma.aiUsageRecord.create({
      data: {
        organizationId: entry.organizationId,
        agentKey: entry.agentKey,
        provider: entry.provider,
        model: entry.model,
        operation: entry.operation,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costMicroUsd: entry.costMicroUsd,
      },
    });
  }

  async summarize(input: {
    organizationId: string;
    from: Date;
    to: Date;
    agentKey?: AiUsageAgentKey;
  }): Promise<Omit<AiUsageSummary, 'from' | 'to'>> {
    const agentFilter = input.agentKey
      ? Prisma.sql`AND agent_key = ${input.agentKey}`
      : Prisma.empty;
    const totalsSql = Prisma.sql`
      COUNT(*) AS calls,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_micro_usd) AS cost_micro_usd,
      COUNT(*) FILTER (WHERE cost_micro_usd IS NULL) AS unpriced_calls`;
    const { organizationId, from, to } = input;
    const [totals, agents, models, first] = await this.prisma.$transaction([
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT ${totalsSql} FROM ai_usage_records
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${from} AND created_at < ${to} ${agentFilter}`,
      this.prisma.$queryRaw<(TotalsRow & { agent_key: string | null })[]>`
        SELECT agent_key, ${totalsSql} FROM ai_usage_records
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${from} AND created_at < ${to} ${agentFilter}
        GROUP BY agent_key`,
      this.prisma.$queryRaw<(TotalsRow & { model: string })[]>`
        SELECT model, ${totalsSql} FROM ai_usage_records
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${from} AND created_at < ${to} ${agentFilter}
        GROUP BY model ORDER BY COUNT(*) DESC`,
      this.prisma.aiUsageRecord.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      recordingSince: first?.createdAt.toISOString() ?? null,
      totals: toTotals(totals[0]),
      agents: agents.map((row) => {
        const agentKey = AiUsageAgentKeySchema.safeParse(row.agent_key);
        return { agentKey: agentKey.success ? agentKey.data : null, ...toTotals(row) };
      }),
      models: models.map((row) => ({ model: row.model, priced: isPricedModel(row.model), ...toTotals(row) })),
    };
  }
}

function toTotals(row: TotalsRow | undefined): AiUsageTotals {
  const n = (value: bigint | null | undefined) => Number(value ?? 0n);
  return {
    calls: n(row?.calls),
    inputTokens: n(row?.input_tokens),
    outputTokens: n(row?.output_tokens),
    costMicroUsd: n(row?.cost_micro_usd),
    unpricedCalls: n(row?.unpriced_calls),
  };
}
