import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalStringField(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringField(value) ?? undefined;
}

function submissionInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const purchaseOrderId = stringField(input.purchaseOrderId);
  const externalOrderPlatform = optionalStringField(input.externalOrderPlatform);
  const externalOrderId = optionalStringField(input.externalOrderId);
  const externalOrderUrl = optionalStringField(input.externalOrderUrl);

  if (purchaseOrderId) output.purchaseOrderId = purchaseOrderId;
  if (externalOrderPlatform !== undefined) {
    output.externalOrderPlatform = externalOrderPlatform;
  }
  if (externalOrderId !== undefined) output.externalOrderId = externalOrderId;
  if (externalOrderUrl !== undefined) output.externalOrderUrl = externalOrderUrl;
  return output;
}

function assertToolInvocationDidNotFail(
  result: Awaited<ReturnType<AgentToolRouter['invoke']>>,
): void {
  if (result.status !== 'failed') return;
  throw new AgentOsRuntimeError(
    result.invocation.errorCode ?? 'capability_failed',
    result.invocation.errorMessage ??
      `Capability failed: ${result.invocation.capabilityKey}`,
  );
}

@Injectable()
export class OrderAgentRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
  ) {}

  onModuleInit(): void {
    this.registry.register('order', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const action = stringField(context.input.action) ?? 'create_purchase_order_draft';
    const isSubmission = action === 'submit_purchase_order';
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId:
        typeof context.input.conversationId === 'string'
          ? context.input.conversationId
          : null,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId: stringField(context.input.requestedByUserId),
      capabilityKey: isSubmission
        ? 'supply.submit_purchase_order'
        : 'supply.create_purchase_order_draft',
      input: isSubmission ? submissionInput(context.input) : context.input,
    });
    assertToolInvocationDidNotFail(result);
    return {
      provider: 'kiditem-supply',
      output: {
        action: isSubmission
          ? 'submit_purchase_order'
          : 'create_purchase_order_draft',
        toolInvocationIds: [result.invocation.id],
        artifactIds: result.artifacts.map((artifact) => artifact.id),
        status:
          result.status === 'waiting_approval'
            ? 'waiting_approval'
            : isSubmission
              ? 'purchase_order_submitted'
              : 'purchase_order_draft_created',
      },
    };
  }
}
