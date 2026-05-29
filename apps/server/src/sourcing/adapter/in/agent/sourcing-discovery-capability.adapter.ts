import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import type {
  SourcingDiscoveryCapabilityInput,
  SourcingDiscoveryCapabilityPort,
  SourcingDiscoveryCapabilityResult,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import { SourcingMarketDiscoveryService } from '../../../application/service/sourcing-market-discovery.service';

const DiscoveryInputSchema = z.object({
  keyword: z.string().min(1),
  category: z.string().nullable().optional(),
  mode: z.enum(['stub', 'replay']).default('stub'),
});
const CountOutputSchema = z.object({ count: z.number().int().nonnegative() });
const RecommendationOutputSchema = z.object({
  recommendations: z.number().int().nonnegative(),
  topScore: z.number(),
});

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalStringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function modeField(value: unknown): 'stub' | 'replay' {
  return value === 'replay' ? 'replay' : 'stub';
}

function discoveryIdempotency(capabilityKey: string) {
  return ({ organizationId, input }: { organizationId: string; input: Record<string, unknown> }) =>
    [
      organizationId,
      capabilityKey,
      stringField(input.keyword, '실리콘 식판'),
      optionalStringField(input.category) ?? 'none',
      modeField(input.mode),
    ].join(':');
}

@Injectable()
export class SourcingDiscoveryCapabilityAdapter
  implements OnModuleInit, SourcingDiscoveryCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly discovery: SourcingMarketDiscoveryService,
  ) {}

  onModuleInit(): void {
    for (const handler of this.handlers()) {
      this.registry.register(handler);
    }
  }

  async executeDiscoveryCapability(
    input: SourcingDiscoveryCapabilityInput,
  ): Promise<SourcingDiscoveryCapabilityResult> {
    const result = await this.discovery.discover(input);
    return {
      artifacts: result.recommendations.map((recommendation) => ({
        artifactType: 'sourcing_recommendation',
        title: recommendation.artifact.title,
        summary: recommendation.artifact.summary,
      })),
    };
  }

  private handlers(): AgentCapabilityHandler[] {
    return [
      this.countHandler({
        key: 'market.collect_keyword_category_rankings',
        executionKind: 'job_trigger',
        artifactType: 'market_signal_snapshot',
        targetModel: 'MarketSignalSnapshot',
        title: '시장 신호 스냅샷',
        pick: (result) => result.marketSignals,
      }),
      this.countHandler({
        key: 'coupang.match_products',
        executionKind: 'tool',
        artifactType: 'coupang_product_match',
        targetModel: 'CoupangProductMatch',
        title: '쿠팡 매칭 상품',
        pick: (result) => result.coupangMatches,
      }),
      this.countHandler({
        key: 'coupang.collect_tracking_snapshot',
        executionKind: 'job_trigger',
        artifactType: 'coupang_tracking_snapshot',
        targetModel: 'CoupangTrackingSnapshot',
        title: '쿠팡 추적 스냅샷',
        pick: (result) => result.trackingSnapshots,
      }),
      this.countHandler({
        key: 'supplier1688.match_products',
        executionKind: 'tool',
        artifactType: 'supplier_match',
        targetModel: 'SupplierMatch',
        title: '1688 공급처 매칭',
        pick: (result) => result.supplierMatches,
      }),
      this.countHandler({
        key: 'sourcing.score_opportunities',
        executionKind: 'scorer',
        artifactType: 'sourcing_opportunity_score',
        targetModel: 'SourcingOpportunityScore',
        title: '소싱 기회 점수',
        pick: (result) => result.scoredOpportunities,
      }),
      {
        key: 'sourcing.create_recommendation_packet',
        ownerDomain: 'sourcing',
        executionKind: 'workflow',
        inputSchema: DiscoveryInputSchema,
        outputSchema: RecommendationOutputSchema,
        sideEffects: ['read'],
        approvalRisk: 'none',
        idempotencyKey: discoveryIdempotency('sourcing.create_recommendation_packet'),
        execute: async ({ organizationId, input }) => {
          const result = await this.discover(organizationId, input);
          const first = result.recommendations[0];
          return {
            resourceType: 'sourcing_recommendation',
            resourceId: first?.id ?? null,
            outputSummary: {
              recommendations: result.recommendations.length,
              topScore: first?.score.totalScore ?? 0,
            },
            artifacts: result.recommendations.map((recommendation) => ({
              artifactType: 'sourcing_recommendation',
              targetDomain: 'sourcing',
              targetModel: 'SourcingRecommendation',
              targetId: recommendation.id,
              title: recommendation.artifact.title,
              summary: recommendation.artifact.summary,
            })),
          };
        },
      },
    ];
  }

  private countHandler(input: {
    key: string;
    executionKind: 'tool' | 'job_trigger' | 'scorer';
    artifactType: string;
    targetModel: string;
    title: string;
    pick(result: Awaited<ReturnType<SourcingMarketDiscoveryService['discover']>>): Array<Record<string, unknown>>;
  }): AgentCapabilityHandler {
    return {
      key: input.key,
      ownerDomain: 'sourcing',
      executionKind: input.executionKind,
      inputSchema: DiscoveryInputSchema,
      outputSchema: CountOutputSchema,
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: discoveryIdempotency(input.key),
      execute: async ({ organizationId, input: capabilityInput }) => {
        const result = await this.discover(organizationId, capabilityInput);
        const rows = input.pick(result);
        return {
          outputSummary: { count: rows.length },
          artifacts: rows.map((row, index) => ({
            artifactType: input.artifactType,
            targetDomain: 'sourcing',
            targetModel: input.targetModel,
            targetId: `${input.artifactType}-stub-${index + 1}`,
            title: input.title,
            summary: row,
          })),
        };
      },
    };
  }

  private discover(organizationId: string, input: Record<string, unknown>) {
    return this.discovery.discover({
      organizationId,
      keyword: stringField(input.keyword, '실리콘 식판'),
      category: optionalStringField(input.category),
      mode: modeField(input.mode),
    });
  }
}
