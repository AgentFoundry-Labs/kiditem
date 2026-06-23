import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalStringField(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringField(value) ?? undefined;
}

function registrationInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const masterId = stringField(input.masterId);
  const channelAccountId = stringField(input.channelAccountId);
  const externalId = stringField(input.externalId);
  const productBarcode = optionalStringField(input.productBarcode);
  const channelName = optionalStringField(input.channelName);

  if (masterId) output.masterId = masterId;
  if (channelAccountId) output.channelAccountId = channelAccountId;
  if (externalId) output.externalId = externalId;
  if (productBarcode !== undefined) output.productBarcode = productBarcode;
  if (channelName !== undefined) output.channelName = channelName;
  if (typeof input.channelPrice === 'number') {
    output.channelPrice = input.channelPrice;
  } else if (input.channelPrice === null) {
    output.channelPrice = null;
  }

  return output;
}

function coupangSubmissionInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const masterId = stringField(input.masterId);
  const channelAccountId = stringField(input.channelAccountId);
  const productBarcode = optionalStringField(input.productBarcode);

  if (masterId) output.masterId = masterId;
  if (channelAccountId) output.channelAccountId = channelAccountId;
  if (productBarcode !== undefined) output.productBarcode = productBarcode;
  if (
    input.listingPayload &&
    typeof input.listingPayload === 'object' &&
    !Array.isArray(input.listingPayload)
  ) {
    output.listingPayload = input.listingPayload;
  }

  return output;
}

@Injectable()
export class ChannelRegistrationRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
  ) {}

  onModuleInit(): void {
    this.registry.register('channel_registration', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const action = stringField(context.input.action);
    const capabilityKey =
      action === 'confirmed_listing_registration'
        ? 'channels.register_confirmed_listing'
        : action === 'coupang_listing_submit'
          ? 'channels.submit_coupang_listing'
          : null;
    if (!capabilityKey) {
      throw new AgentOsRuntimeError(
        'channel_registration_unknown_action',
        `Unknown channel_registration action: ${action ?? '(missing)'}`,
      );
    }

    const conversationId = stringField(context.input.conversationId);
    const requestedByUserId = stringField(context.input.requestedByUserId);
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId,
      capabilityKey,
      input:
        action === 'coupang_listing_submit'
          ? coupangSubmissionInput(context.input)
          : registrationInput(context.input),
    });

    return {
      provider: 'kiditem-channel-registration',
      output: {
        action,
        toolInvocationIds: [result.invocation.id],
        artifactIds: result.artifacts.map((artifact) => artifact.id),
        status:
          result.status === 'waiting_approval'
            ? 'waiting_approval'
            : action === 'coupang_listing_submit'
              ? 'coupang_listing_submitted'
              : 'channel_listing_registered',
      },
    };
  }
}
