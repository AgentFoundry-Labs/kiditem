import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type {
  AgentCapabilityExecutionInput,
  AgentCapabilityHandler,
} from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { ownerCapabilityContext, ownerCapabilityIdempotencyKey } from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
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
    operationRunId: z.string(),
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
        const result = await this.collections.startCollection({
          organizationId: ownerCapabilityContext(execution).organizationId,
          requestedByUserId: ownerCapabilityContext(execution).actorId,
          sources,
          idempotencyKey: requireIdempotencyKey(
            this.idempotencyKey(execution),
          ),
        });
        return {
          resourceType: 'operation_run',
          resourceId: result.operationRunId,
          outputSummary: result,
          artifacts: [
            {
              artifactType: 'operation_run',
              targetDomain: 'operations',
              targetModel: 'OperationRun',
              targetId: result.operationRunId,
              title: '소싱 수집 실행',
              summary: {
                operationRunId: result.operationRunId,
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

function requireIdempotencyKey(value: string | null): string {
  if (value) return value;
  throw new AgentOsRuntimeError(
    'agent_request_context_required',
    'Mutating Sourcing capability requires an Agent OS request context.',
  );
}
