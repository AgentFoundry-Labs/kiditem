import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  AGENT_CAPABILITY_REGISTRY_PORT,
  type AgentCapabilityRegistryPort,
} from '../../../../agent-os/application/port/in/capability/agent-capability-registry.port';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { ownerCapabilityContext, ownerCapabilityIdempotencyKey } from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import {
  APPLY_RULES_EVALUATION_PORT,
  type ApplyRulesEvaluationPort,
} from '../../../application/port/in/apply-rules-evaluation.port';

const EvaluationResultInputSchema = z.object({
  operationId: z.string().uuid(),
  products: z.array(z.object({
    masterId: z.string().uuid(),
    healthScore: z.number(),
    violations: z.array(z.object({
      ruleName: z.string(),
      field: z.string(),
      severity: z.string(),
      category: z.string(),
      message: z.string(),
      actionType: z.string().nullable(),
      value: z.number(),
    }).strict()),
  }).strict()),
}).strict();

const EvaluationResultOutputSchema = z.object({
  productCount: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
  criticalCount: z.number().int().nonnegative(),
}).strict();

/** Official capability entrypoint; it carries only the validated owner context. */
@Injectable()
export class RulesEvaluationCapabilityAdapter implements OnModuleInit {
  constructor(
    @Inject(AGENT_CAPABILITY_REGISTRY_PORT)
    private readonly registry: AgentCapabilityRegistryPort,
    @Inject(APPLY_RULES_EVALUATION_PORT)
    private readonly results: ApplyRulesEvaluationPort,
  ) {}

  onModuleInit(): void {
    const handler: AgentCapabilityHandler<z.infer<typeof EvaluationResultInputSchema>> = {
      key: 'rules.apply_evaluation_result',
      ownerDomain: 'rules',
      executionKind: 'workflow',
      inputSchema: EvaluationResultInputSchema,
      outputSchema: EvaluationResultOutputSchema,
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: (execution) => ownerCapabilityIdempotencyKey(
        execution, `rules.apply_evaluation_result:${execution.input.operationId}`,
      ),
      execute: async (execution) => ({
        outputSummary: await this.results.apply({
          organizationId: ownerCapabilityContext(execution).organizationId,
          operationId: execution.input.operationId,
          products: execution.input.products,
        }),
        resourceType: 'operation_run',
        resourceId: execution.input.operationId,
      }),
    };
    this.registry.register(handler);
  }
}
