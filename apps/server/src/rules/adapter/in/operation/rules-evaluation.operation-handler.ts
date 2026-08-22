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
  APPLY_RULES_EVALUATION_PORT,
  type ApplyRulesEvaluationPort,
} from '../../../application/port/in/apply-rules-evaluation.port';
import { RULES_EVALUATION_OPERATION } from '../../../domain/operation/rules.operations';

/** Registers and executes the deterministic Rules-owned evaluation operation. */
@Injectable()
export class RulesEvaluationOperationHandler implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(APPLY_RULES_EVALUATION_PORT)
    private readonly results: ApplyRulesEvaluationPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(RULES_EVALUATION_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    const result = await this.results.apply({
      organizationId: context.organizationId,
      operationId: context.runId,
      products: [],
    });
    return { kind: 'completed', result };
  }
}
