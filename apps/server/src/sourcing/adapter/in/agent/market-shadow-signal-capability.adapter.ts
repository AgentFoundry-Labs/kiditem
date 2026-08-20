import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { kstBusinessDate } from '../../../../common/kst';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import type {
  MarketShadowCollectionCapabilityInput,
  MarketShadowCollectionCapabilityPort,
  MarketShadowCollectionCapabilityResult,
} from '../../../application/port/in/capability/market-shadow-capability.port';
import {
  MARKET_SHADOW_OPERATION_PORT,
  type MarketShadowOperationPort,
} from '../../../application/port/out/cross-domain/market-shadow-operation.port';

const CAPABILITY_KEY = 'market.collect_shadow_signals';
const InputSchema = z.object({}).strict();
const OutputSchema = z.object({
  operationRunId: z.string().uuid(),
  status: z.string(),
});

@Injectable()
export class MarketShadowSignalCapabilityAdapter
  implements OnModuleInit, MarketShadowCollectionCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(MARKET_SHADOW_OPERATION_PORT)
    private readonly operations: MarketShadowOperationPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  async collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult> {
    return this.operations.startShadowCollection({
      organizationId: input.organizationId,
      requestedByUserId: null,
      triggerSource: 'agent',
      idempotencyKey: capabilityIdempotencyKey(input.organizationId),
    });
  }

  private handler(): AgentCapabilityHandler<z.infer<typeof InputSchema>> {
    return {
      key: CAPABILITY_KEY,
      ownerDomain: 'sourcing',
      executionKind: 'job_trigger',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      sideEffects: ['db_write', 'external_io', 'job_enqueue'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId }) => [
        organizationId,
        CAPABILITY_KEY,
        kstBusinessDate(new Date()).toISOString().slice(0, 10),
      ].join(':'),
      execute: async ({ organizationId }) => {
        const result = await this.collectShadowSignals({ organizationId });
        return {
          resourceType: 'operation_run',
          resourceId: result.operationRunId,
          outputSummary: { ...result },
          artifacts: [{
            artifactType: 'operation_run',
            targetDomain: 'operations',
            targetModel: 'OperationRun',
            targetId: result.operationRunId,
            title: '시장 shadow 신호 수집 실행',
            summary: { ...result },
          }],
        };
      },
    };
  }
}

function capabilityIdempotencyKey(organizationId: string): string {
  return [
    organizationId,
    CAPABILITY_KEY,
    kstBusinessDate(new Date()).toISOString().slice(0, 10),
  ].join(':');
}
