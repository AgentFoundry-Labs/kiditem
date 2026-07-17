import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { kstBusinessDate } from '../../../../common/kst';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import type {
  MarketShadowCollectionCapabilityInput,
  MarketShadowCollectionCapabilityPort,
  MarketShadowCollectionCapabilityResult,
} from '../../../application/port/in/capability/market-shadow-capability.port';

const CAPABILITY_KEY = 'market.collect_shadow_signals';
const InputSchema = z.object({}).strict();
const OutputSchema = z.object({
  claimed: z.boolean(),
  snapshotId: z.string(),
  businessDate: z.string(),
  status: z.string(),
  decisionImpact: z.literal('disabled'),
});

@Injectable()
export class MarketShadowSignalCapabilityAdapter
  implements OnModuleInit, MarketShadowCollectionCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly shadowSignals: SourcingShadowSignalService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  async collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult> {
    const result = await this.shadowSignals.collect(input.organizationId);
    return toCapabilityResult(result);
  }

  private handler(): AgentCapabilityHandler<z.infer<typeof InputSchema>> {
    return {
      key: CAPABILITY_KEY,
      ownerDomain: 'sourcing',
      executionKind: 'job_trigger',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      sideEffects: ['read', 'external_io', 'db_write'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId }) => [
        organizationId,
        CAPABILITY_KEY,
        kstBusinessDate(new Date()).toISOString().slice(0, 10),
      ].join(':'),
      execute: async ({ organizationId }) => {
        const collection = await this.shadowSignals.collect(organizationId);
        const result = toCapabilityResult(collection);
        const payloadResult = recordValue(collection.snapshot.payload.result);
        return {
          resourceType: 'market_shadow_signal_snapshot',
          resourceId: collection.snapshot.id,
          outputSummary: { ...result },
          artifacts: [{
            artifactType: 'market_shadow_signal_snapshot',
            targetDomain: 'sourcing',
            targetModel: 'SourcingWorkspaceSnapshot',
            targetId: collection.snapshot.id,
            title: '시장 shadow 신호 스냅샷',
            summary: {
              ...result,
              evaluation: recordValue(payloadResult.evaluation),
              errors: Array.isArray(payloadResult.errors)
                ? payloadResult.errors
                : [],
            },
          }],
        };
      },
    };
  }
}

function toCapabilityResult(input: Awaited<
  ReturnType<SourcingShadowSignalService['collect']>
>): MarketShadowCollectionCapabilityResult {
  const payloadResult = recordValue(input.snapshot.payload.result);
  return {
    claimed: input.claimed,
    snapshotId: input.snapshot.id,
    businessDate: input.snapshot.businessDate.toISOString().slice(0, 10),
    status: stringValue(payloadResult.status) ?? 'unknown',
    decisionImpact: 'disabled',
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
