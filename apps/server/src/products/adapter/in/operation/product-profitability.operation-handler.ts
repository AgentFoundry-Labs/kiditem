import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../../../../operations/application/port/in/composite-operation-coordinator.port';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../../operations/application/port/in/operation-attempt-verifier.port';
import { MasterProductAbcService } from '../../../application/service/master-product-abc.service';
import {
  PRODUCT_PROFITABILITY_OPERATIONS,
  PROFITABILITY_REFRESH_STAGES,
} from '../../../domain/operation/product-profitability.operations';

@Injectable()
export class ProductProfitabilityRefreshOperationHandler
implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly coordinator: CompositeOperationCoordinatorPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(PRODUCT_PROFITABILITY_OPERATIONS[0], this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    const children = await this.coordinator.listChildren({
      organizationId: context.organizationId,
      parentRunId: context.runId,
    });
    for (const stage of PROFITABILITY_REFRESH_STAGES) {
      const child = children.find(({ operationKey }) => operationKey === stage.operationKey);
      if (child?.status === 'succeeded') continue;
      return {
        kind: 'waiting_dependency',
        child: {
          operationKey: stage.operationKey,
          input: stage.input,
          idempotencyKey: `profitability:${context.runId}:${stage.operationKey}`,
        },
      };
    }
    const abc = children.find(({ operationKey }) =>
      operationKey === 'products.recalculate_profitability_abc');
    return {
      kind: 'completed',
      result: {
        stages: PROFITABILITY_REFRESH_STAGES.map(({ operationKey }) => {
          const child = children.find((candidate) => candidate.operationKey === operationKey);
          return {
            operationKey,
            status: child?.status ?? 'failed',
            finishedAt: child?.finishedAt?.toISOString() ?? null,
          };
        }),
        ...(abc?.result ?? {}),
      },
    };
  }
}

@Injectable()
export class ProductProfitabilityAbcOperationHandler
implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly abc: MasterProductAbcService,
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(PRODUCT_PROFITABILITY_OPERATIONS[1], this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    context.signal.throwIfAborted();
    const result = await this.abc.recalculate(context.organizationId, {
      signal: context.signal,
      checkpoint: (stage) => context.checkpoint({ stage }),
      withinActiveOperationAttemptFence: (commit) =>
        this.attemptVerifier.withActiveDomainAttemptFence({
          organizationId: context.organizationId,
          runId: context.runId,
          expectedOperationKey: PRODUCT_PROFITABILITY_OPERATIONS[1].key,
          attemptToken: context.attemptToken,
        }, (_attempt, transaction) => commit(transaction)),
    });
    context.signal.throwIfAborted();
    return {
      kind: 'completed',
      result: {
        changedProductCount: result.changedProductCount,
        classifiedProductCount: result.classifiedProductCount,
        unclassifiedProductCount: result.unclassifiedProductCount,
      },
    };
  }
}
