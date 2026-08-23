import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { OperationRunNameSchema } from '@kiditem/shared/identifiers';
import { z } from 'zod';
import type {
  AgentCapabilityExecutionInput,
  AgentCapabilityHandler,
} from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { ownerCapabilityContext, ownerCapabilityIdempotencyKey } from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  SOURCING_COLLECTION_OPERATION_PORT,
  type SourcingCollectionOperationPort,
} from '../../../application/port/out/cross-domain/sourcing-collection-operation.port';

const CollectionInput = z
  .object({
    sources: z.array(z.enum(['naver', '1688', 'shorts'])).min(1).max(3),
  })
  .strict();

const CollectionOutput = z
  .object({
    operation: OperationRunNameSchema,
    status: z.string(),
  })
  .strict();

type CollectionInputType = z.infer<typeof CollectionInput>;

@Injectable()
export class SourcingCollectionCapabilityAdapter implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(SOURCING_COLLECTION_OPERATION_PORT)
    private readonly collections: SourcingCollectionOperationPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  private handler(): AgentCapabilityHandler<CollectionInputType> {
    return {
      key: 'sourcing.refreshCollection',
      ownerDomain: 'sourcing',
      executionKind: 'job_trigger',
      inputSchema: CollectionInput,
      outputSchema: CollectionOutput,
      sideEffects: ['db_write', 'external_io', 'job_enqueue'],
      approvalRisk: 'low',
      idempotencyKey: (execution) => this.idempotencyKey(execution),
      execute: async (execution) => {
        const sources = [...new Set(execution.input.sources)].sort() as
          CollectionInputType['sources'];
        const result = await this.collections.startOfficial({
          execution,
          sources,
        });
        return {
          resourceType: 'operation_run',
          resourceId: result.operation,
          outputSummary: result,
          artifacts: [
            {
              artifactType: 'operation_run',
              targetDomain: 'operations',
              targetModel: 'OperationRun',
              targetId: result.operation,
              title: '소싱 수집 실행',
              summary: {
                operation: result.operation,
                status: result.status,
                sources,
              },
            },
          ],
        };
      },
    };
  }

  private idempotencyKey(
    execution: AgentCapabilityExecutionInput<CollectionInputType>,
  ): string | null {
    return ownerCapabilityIdempotencyKey(
      execution,
      `sourcing.refreshCollection:${[...execution.input.sources].sort().join(',')}`,
    );
  }
}
