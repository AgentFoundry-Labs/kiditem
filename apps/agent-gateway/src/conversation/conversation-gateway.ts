import {
  ConversationIdSchema,
  ConversationTitleSchema,
  CreateConversationCommandSchema,
  ProviderEventSchema,
  ProviderMessageSchema,
  type CreateConversationCommand,
  type ConversationSummary,
  type Model,
  type ProviderEvent,
  type ProviderMessage,
  type ProviderReadiness,
  type ProviderRuntime,
  type ReasoningEffort,
} from '@kiditem/shared/agent-runtime';
import { ConversationDescriptorStore } from './conversation-descriptor.store';
import type { ConversationDescriptor } from './conversation-descriptor';
import type { ProviderConversationPort } from '../provider/provider-conversation.port';
import { gatewayInstructionProfile } from '../profile/agent-profile.catalog';

type ProviderMap = Readonly<Record<ProviderRuntime, ProviderConversationPort>>;

type PendingCreate = Readonly<{
  canonical: string;
  promise: Promise<ConversationSummary>;
}>;

export interface GatewayTurnStart {
  conversationId: string;
  turnId: string;
  message: string;
  model: Model;
  reasoningEffort: ReasoningEffort;
  executionBinding: string;
  onEvent: (event: ProviderEvent) => void;
}

/**
 * Maps opaque Gateway conversation IDs to provider-local references. No public
 * method returns a provider reference, and runtime is set only at creation.
 */
export class ConversationGateway {
  private readonly pendingCreates = new Map<string, PendingCreate>();

  constructor(private readonly options: Readonly<{
    descriptors: ConversationDescriptorStore;
    providers: ProviderMap;
    now?: () => Date;
  }>) {}

  async list(runtime?: ProviderRuntime): Promise<ConversationSummary[]> {
    const descriptors = await this.options.descriptors.list();
    return descriptors
      .filter((descriptor) => runtime === undefined || descriptor.runtime === runtime)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toPublicConversation);
  }

  async create(input: CreateConversationCommand): Promise<ConversationSummary> {
    const command = CreateConversationCommandSchema.parse(input);
    const existing = await this.options.descriptors.find(command.conversationId);
    if (existing) return this.replayOrConflict(existing, command);
    const canonical = JSON.stringify({ runtime: command.runtime, agentKey: command.agentKey, title: command.title });
    const pending = this.pendingCreates.get(command.conversationId);
    if (pending) {
      if (pending.canonical !== canonical) throw new Error('gateway_conversation_create_conflict');
      return pending.promise;
    }
    const promise = this.createMissing(command);
    this.pendingCreates.set(command.conversationId, { canonical, promise });
    try {
      return await promise;
    } finally {
      if (this.pendingCreates.get(command.conversationId)?.promise === promise) {
        this.pendingCreates.delete(command.conversationId);
      }
    }
  }

  private async createMissing(command: CreateConversationCommand): Promise<ConversationSummary> {
    const provider = this.provider(command.runtime);
    let created: Awaited<ReturnType<ProviderConversationPort['create']>>;
    try {
      created = await provider.create({
        title: command.title,
        instructionProfile: gatewayInstructionProfile(command.agentKey),
      });
    } catch {
      throw new Error('gateway_provider_create_failed');
    }
    const timestamp = this.now().toISOString();
    const descriptor: ConversationDescriptor = {
      id: command.conversationId,
      runtime: command.runtime,
      providerConversationRef: created.providerConversationRef,
      agentKey: command.agentKey,
      createTitle: command.title,
      title: command.title,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    try {
      await this.options.descriptors.create(descriptor);
    } catch {
      // The provider may have created a thread, but we deliberately do not
      // leak its reference while reporting the bounded local-catalog failure.
      try { await provider.delete(created.providerConversationRef); } catch { /* best-effort provider cleanup */ }
      throw new Error('gateway_descriptor_create_failed');
    }
    return toPublicConversation(descriptor);
  }

  async history(conversationId: string): Promise<ProviderMessage[]> {
    const descriptor = await this.resolve(conversationId);
    try {
      const messages = await this.provider(descriptor.runtime).history(descriptor.providerConversationRef);
      return ProviderMessageSchema.array().max(1_000).parse(messages);
    } catch {
      throw new Error('gateway_provider_history_failed');
    }
  }

  async rename(conversationId: string, title: string): Promise<ConversationSummary> {
    const descriptor = await this.resolve(conversationId);
    const parsedTitle = ConversationTitleSchema.safeParse(title);
    if (!parsedTitle.success) throw new Error('gateway_conversation_title_invalid');
    try {
      await this.provider(descriptor.runtime).rename(descriptor.providerConversationRef, parsedTitle.data);
    } catch {
      throw new Error('gateway_provider_rename_failed');
    }
    const next = await this.options.descriptors.update(descriptor.id, (current) => ({
      ...current,
      title: parsedTitle.data,
      updatedAt: this.now().toISOString(),
    }));
    return toPublicConversation(next);
  }

  async delete(conversationId: string): Promise<void> {
    const id = ConversationIdSchema.safeParse(conversationId);
    if (!id.success) throw new Error('gateway_conversation_not_found');
    const descriptor = await this.options.descriptors.find(id.data);
    if (!descriptor) return;
    try {
      await this.provider(descriptor.runtime).delete(descriptor.providerConversationRef);
    } catch {
      // Provider deletion/archive is the first half of this operation. Keeping
      // the descriptor makes failure retryable and avoids a false UI success.
      throw new Error('gateway_provider_delete_failed');
    }
    await this.options.descriptors.removeIfPresent(descriptor.id);
  }

  async startTurn(input: GatewayTurnStart): Promise<void> {
    const descriptor = await this.resolve(input.conversationId);
    await this.assertSupportedTurn(descriptor.runtime, input.model, input.reasoningEffort);
    try {
      await this.provider(descriptor.runtime).startTurn({
        providerConversationRef: descriptor.providerConversationRef,
        turnId: input.turnId,
        message: input.message,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        executionBinding: input.executionBinding,
        instructionProfile: gatewayInstructionProfile(descriptor.agentKey),
      }, (event) => input.onEvent(ProviderEventSchema.parse(event)));
    } catch {
      throw new Error('gateway_provider_turn_failed');
    }
    // The provider has accepted the turn at this point. Sidebar metadata is
    // non-authoritative, so its local I/O failure must not release the live
    // control-plane fence while the provider keeps running.
    try {
      await this.options.descriptors.update(descriptor.id, (current) => ({
        ...current,
        updatedAt: this.now().toISOString(),
        lastModel: input.model,
        lastReasoningEffort: input.reasoningEffort,
      }));
    } catch {
      // Best-effort only after successful provider launch.
    }
  }

  async sendInput(input: Readonly<{ conversationId: string; turnId: string; message: string }>): Promise<void> {
    const descriptor = await this.resolve(input.conversationId);
    try {
      await this.provider(descriptor.runtime).sendInput({
        providerConversationRef: descriptor.providerConversationRef,
        turnId: input.turnId,
        message: input.message,
      });
    } catch {
      throw new Error('gateway_provider_input_failed');
    }
  }

  async interrupt(input: Readonly<{ conversationId: string; turnId: string }>): Promise<void> {
    const descriptor = await this.resolve(input.conversationId);
    try {
      await this.provider(descriptor.runtime).interrupt({
        providerConversationRef: descriptor.providerConversationRef,
        turnId: input.turnId,
      });
    } catch {
      throw new Error('gateway_provider_interrupt_failed');
    }
  }

  readiness(runtime: ProviderRuntime): Promise<ProviderReadiness> {
    return this.provider(runtime).readiness();
  }

  private async resolve(conversationId: string): Promise<ConversationDescriptor> {
    const id = ConversationIdSchema.safeParse(conversationId);
    if (!id.success) throw new Error('gateway_conversation_not_found');
    const descriptor = await this.options.descriptors.find(id.data);
    if (!descriptor) throw new Error('gateway_conversation_not_found');
    return descriptor;
  }

  private provider(runtime: ProviderRuntime): ProviderConversationPort {
    const provider = this.options.providers[runtime];
    if (!provider || provider.runtime !== runtime) throw new Error('gateway_provider_unavailable');
    return provider;
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }

  private async assertSupportedTurn(runtime: ProviderRuntime, model: Model, reasoningEffort: ReasoningEffort): Promise<void> {
    let readiness: ProviderReadiness;
    try {
      readiness = await this.provider(runtime).readiness();
    } catch {
      throw new Error('gateway_provider_readiness_failed');
    }
    if (readiness.runtime !== runtime) throw new Error('gateway_provider_readiness_invalid');
    const modelCatalog = readiness.modelReasoningEfforts.find((entry) => entry.model === model);
    if (!modelCatalog || !readiness.models.includes(model)) throw new Error('gateway_model_unsupported');
    if (!modelCatalog.reasoningEfforts.includes(reasoningEffort)) throw new Error('gateway_reasoning_effort_unsupported');
  }

  private replayOrConflict(descriptor: ConversationDescriptor, command: CreateConversationCommand): ConversationSummary {
    if (
      descriptor.runtime !== command.runtime
      || descriptor.agentKey !== command.agentKey
      || descriptor.createTitle !== command.title
    ) {
      throw new Error('gateway_conversation_create_conflict');
    }
    return toPublicConversation(descriptor);
  }
}

function toPublicConversation(descriptor: ConversationDescriptor): ConversationSummary {
  const {
    providerConversationRef: _providerConversationRef,
    createTitle: _createTitle,
    ...conversation
  } = descriptor;
  return conversation;
}
