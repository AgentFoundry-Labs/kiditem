import { Injectable, Inject } from '@nestjs/common';
import {
  AgentKeySchema,
  type ConversationPreferences,
  type ConversationSummary,
  type CreateConversationCommand,
  type SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import {
  type ConversationCoordinates,
  type ConversationLiveTurn,
  type ConversationOwner,
  type ConversationPort,
  CONVERSATION_TURN_ID_FACTORY,
  type ConversationTurnIdFactory,
  type ConversationTurnCoordinates,
} from '../port/in/capability/conversation.port';
import {
  GATEWAY_CONVERSATION_PORT,
  type GatewayConversationPort,
  type GatewayLiveTurn,
} from '../port/out/gateway-conversation.port';

interface StoredTurn extends ConversationTurnCoordinates {}

type CreateConversationInput = ConversationOwner & CreateConversationCommand;

type StartConversationInput = ConversationCoordinates & {
  turnId?: string;
  message: string;
  model: string;
  reasoningEffort: string;
};

/**
 * An organization-scoped facade over the installed Gateway. Provider history
 * remains provider-native; only initiating-user live-turn metadata is transient.
 */
@Injectable()
export class ConversationService implements ConversationPort {
  private readonly turns = new Map<string, StoredTurn>();

  constructor(
    @Inject(GATEWAY_CONVERSATION_PORT)
    private readonly gateway: GatewayConversationPort,
    @Inject(CONVERSATION_TURN_ID_FACTORY)
    private readonly nextTurnId: ConversationTurnIdFactory,
  ) {}

  async list(input: ConversationOwner): Promise<ConversationSummary[]> {
    assertOwner(input);
    const summaries = await this.gateway.list(input);
    for (const summary of summaries) {
      assertAgent(summary.agentKey);
    }
    return summaries;
  }

  async create(input: CreateConversationInput): Promise<ConversationSummary> {
    assertOwner(input);
    assertCreateInput(input);
    const agentKey = parseAgent(input.agentKey);
    const summary = await this.gateway.create({
      ...copyOwner(input),
      conversationId: input.conversationId,
      runtime: input.runtime,
      agentKey,
      title: input.title,
    });
    if (summary.id !== input.conversationId) throw new AgentOsRuntimeError('conversation_not_found');
    assertAgent(summary.agentKey);
    return summary;
  }

  async preferences(input: ConversationOwner): Promise<ConversationPreferences> {
    assertOwner(input);
    return this.gateway.preferences(copyOwner(input));
  }

  async setPreference(input: ConversationOwner & SetConversationPreferenceCommand): Promise<ConversationPreferences> {
    assertOwner(input);
    assertPreferenceSettings(input);
    this.requireReadiness(input.runtime, input.model, input.reasoningEffort);
    return this.gateway.setPreference({
      ...copyOwner(input),
      context: input.context,
      runtime: input.runtime,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
  }

  async history(input: ConversationCoordinates) {
    assertConversation(input);
    return this.gateway.history(input);
  }

  async isRunning(input: ConversationCoordinates): Promise<boolean> {
    assertConversation(input);
    return this.turns.has(activeTurnKey(input));
  }

  async stop(input: ConversationCoordinates): Promise<boolean> {
    assertConversation(input);
    const turn = this.turns.get(activeTurnKey(input));
    if (!turn || !sameOwner(turn, input)) return false;
    await this.gateway.interrupt(turn);
    return true;
  }

  async rename(input: ConversationCoordinates & { title: string }): Promise<ConversationSummary> {
    assertConversation(input);
    const summary = await this.gateway.rename(input);
    assertAgent(summary.agentKey);
    return summary;
  }

  async delete(input: ConversationCoordinates): Promise<void> {
    assertConversation(input);
    await this.gateway.delete(input);
    for (const [key, turn] of this.turns) {
      if (turn.conversationId === input.conversationId && sameOwner(turn, input)) this.turns.delete(key);
    }
  }

  async start(input: StartConversationInput): Promise<ConversationLiveTurn> {
    const conversation = await this.requireConversation(input);
    assertTurnSettings(input);
    this.requireReadiness(conversation.runtime, input.model, input.reasoningEffort);
    const turnId = input.turnId ?? this.nextTurnId();
    const gatewayTurn = this.gateway.start({
      ...copyOwner(input),
      conversationId: input.conversationId,
      turnId,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    const coordinates = { ...copyOwner(input), conversationId: input.conversationId, turnId };
    this.turns.set(activeTurnKey(coordinates), coordinates);
    let unsubscribeLifecycle: (() => void) | null = null;
    let terminalBeforeSubscriptionReturned = false;
    const lifecycleSubscription = gatewayTurn.subscribe((event) => {
      if (event.kind === 'status' && event.status !== 'started') {
        this.clearTurn(coordinates);
        if (unsubscribeLifecycle) {
          const cleanup = unsubscribeLifecycle;
          unsubscribeLifecycle = null;
          cleanup();
        } else {
          terminalBeforeSubscriptionReturned = true;
        }
      }
    });
    unsubscribeLifecycle = lifecycleSubscription;
    if (terminalBeforeSubscriptionReturned) {
      unsubscribeLifecycle = null;
      lifecycleSubscription();
    }
    return this.bindLiveTurn(gatewayTurn, coordinates);
  }

  async input(input: ConversationTurnCoordinates & { message: string }): Promise<void> {
    await this.requireTurn(input);
    await this.gateway.input(input);
  }

  async interrupt(input: ConversationTurnCoordinates): Promise<void> {
    await this.requireTurn(input);
    await this.gateway.interrupt(input);
  }

  disconnect(input: ConversationTurnCoordinates): void {
    const stored = this.turns.get(activeTurnKey(input));
    if (!stored || !sameTurn(stored, input)) return;
    this.clearTurn(input);
    this.gateway.disconnect(input);
  }

  readiness() {
    return this.gateway.readiness();
  }

  private bindLiveTurn(turn: GatewayLiveTurn, coordinates: ConversationTurnCoordinates): ConversationLiveTurn {
    void turn.ready.catch(() => {
      this.clearTurn(coordinates);
    });
    return {
      turnId: turn.turnId,
      ready: turn.ready,
      subscribe: (sink) => turn.subscribe((event) => {
        if (event.kind === 'status' && event.status !== 'started') {
          this.clearTurn(coordinates);
        }
        sink(event);
      }),
    };
  }

  private async requireConversation(input: ConversationCoordinates): Promise<ConversationSummary> {
    assertConversation(input);
    const conversations = await this.gateway.list(copyOwner(input));
    const conversation = conversations.find((summary) => summary.id === input.conversationId);
    if (!conversation) {
      throw new AgentOsRuntimeError('conversation_not_found');
    }
    assertAgent(conversation.agentKey);
    return conversation;
  }

  private async requireTurn(input: ConversationTurnCoordinates): Promise<StoredTurn> {
    assertTurn(input);
    const turn = this.turns.get(activeTurnKey(input));
    if (!turn || !sameTurn(turn, input)) throw new AgentOsRuntimeError('conversation_not_found');
    return turn;
  }

  private clearTurn(coordinates: ConversationTurnCoordinates): void {
    const key = activeTurnKey(coordinates);
    if (sameTurn(this.turns.get(key), coordinates)) this.turns.delete(key);
  }

  private requireReadiness(runtime: ConversationSummary['runtime'], model: string, reasoningEffort: string): void {
    const runtimeReadiness = this.gateway.readiness()?.find((entry) => entry.runtime === runtime);
    if (!runtimeReadiness?.ready) throw new AgentOsRuntimeError('conversation_gateway_unavailable');
    const modelReadiness = runtimeReadiness.readiness.modelReasoningEfforts.find((entry) => entry.model === model);
    if (!modelReadiness) throw new AgentOsRuntimeError('conversation_model_unsupported');
    if (!modelReadiness.reasoningEfforts.includes(reasoningEffort)) {
      throw new AgentOsRuntimeError('conversation_reasoning_effort_unsupported');
    }
  }
}

function assertOwner(input: ConversationOwner): void {
  if (!validIdentifier(input.organizationId) || !validIdentifier(input.userId)) {
    throw new AgentOsRuntimeError('conversation_owner_invalid');
  }
}

function assertConversation(input: ConversationCoordinates): void {
  assertOwner(input);
  if (!validIdentifier(input.conversationId)) throw new AgentOsRuntimeError('conversation_not_found');
}

function assertTurn(input: ConversationTurnCoordinates): void {
  assertConversation(input);
  if (!validIdentifier(input.turnId)) throw new AgentOsRuntimeError('conversation_not_found');
}

function assertAgent(agentKey: string | null): void {
  parseAgent(agentKey);
}

function parseAgent(agentKey: string | null) {
  if (agentKey === null) return null;
  const parsed = AgentKeySchema.safeParse(agentKey);
  if (!parsed.success) throw new AgentOsRuntimeError('conversation_agent_invalid');
  return parsed.data;
}

function assertTurnSettings(input: StartConversationInput): void {
  if (!validIdentifier(input.message)) throw new AgentOsRuntimeError('conversation_message_required');
  if (!validIdentifier(input.model)) throw new AgentOsRuntimeError('conversation_model_required');
  if (!validIdentifier(input.reasoningEffort)) throw new AgentOsRuntimeError('conversation_reasoning_effort_required');
}

function assertCreateInput(input: CreateConversationInput): void {
  if (!validIdentifier(input.conversationId)) throw new AgentOsRuntimeError('conversation_id_required');
  if (!validIdentifier(input.title)) throw new AgentOsRuntimeError('conversation_title_required');
}

function assertPreferenceSettings(input: SetConversationPreferenceCommand): void {
  if (!validIdentifier(input.model)) throw new AgentOsRuntimeError('conversation_model_required');
  if (!validIdentifier(input.reasoningEffort)) throw new AgentOsRuntimeError('conversation_reasoning_effort_required');
}

function validIdentifier(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function copyOwner(input: ConversationOwner): ConversationOwner {
  return { organizationId: input.organizationId, userId: input.userId };
}

function sameOwner(left: ConversationOwner, right: ConversationOwner): boolean {
  return left.organizationId === right.organizationId && left.userId === right.userId;
}

function sameTurn(left: ConversationTurnCoordinates | undefined, right: ConversationTurnCoordinates): boolean {
  return Boolean(left && sameOwner(left, right) && left.conversationId === right.conversationId && left.turnId === right.turnId);
}

function activeTurnKey(input: ConversationCoordinates): string {
  return `${input.organizationId}\u0000${input.userId}\u0000${input.conversationId}`;
}
