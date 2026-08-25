import { Injectable, Inject } from '@nestjs/common';
import { AgentKeySchema, type ConversationSummary } from '@kiditem/shared/agent-runtime';
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

interface StoredConversation {
  owner: ConversationOwner;
  summary: ConversationSummary;
}

interface StoredTurn extends ConversationTurnCoordinates {}

type CreateConversationInput = ConversationOwner & {
  runtime: ConversationSummary['runtime'];
  agentKey: string | null;
  title?: string;
};

type StartConversationInput = ConversationCoordinates & {
  turnId?: string;
  message: string;
  model: string;
  reasoningEffort: string;
};

/**
 * A deliberately transient, owner-fenced facade over the installed Gateway.
 * Provider history remains provider-native; this only remembers enough live
 * metadata to enforce browser ownership while a Nest process is running.
 */
@Injectable()
export class ConversationService implements ConversationPort {
  private readonly conversations = new Map<string, StoredConversation>();
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
    const visible: ConversationSummary[] = [];
    for (const summary of summaries) {
      assertAgent(summary.agentKey);
      const current = this.conversations.get(summary.id);
      if (!current || sameOwner(current.owner, input)) {
        this.conversations.set(summary.id, { owner: copyOwner(input), summary });
        visible.push(summary);
      }
    }
    return visible;
  }

  async create(input: CreateConversationInput): Promise<ConversationSummary> {
    assertOwner(input);
    const agentKey = parseAgent(input.agentKey);
    const summary = await this.gateway.create({
      ...copyOwner(input),
      runtime: input.runtime,
      agentKey,
      ...(input.title ? { title: input.title } : {}),
    });
    assertAgent(summary.agentKey);
    this.rememberConversation(input, summary);
    return summary;
  }

  async history(input: ConversationCoordinates) {
    this.requireConversation(input);
    return this.gateway.history(input);
  }

  async rename(input: ConversationCoordinates & { title: string }): Promise<ConversationSummary> {
    this.requireConversation(input);
    const summary = await this.gateway.rename(input);
    assertAgent(summary.agentKey);
    this.rememberConversation(input, summary);
    return summary;
  }

  async delete(input: ConversationCoordinates): Promise<void> {
    this.requireConversation(input);
    await this.gateway.delete(input);
    this.conversations.delete(input.conversationId);
    for (const [key, turn] of this.turns) {
      if (turn.conversationId === input.conversationId && sameOwner(turn, input)) this.turns.delete(key);
    }
  }

  async start(input: StartConversationInput): Promise<ConversationLiveTurn> {
    const conversation = this.requireConversation(input);
    assertTurnSettings(input);
    this.requireReadiness(conversation.summary.runtime, input.model, input.reasoningEffort);
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
    this.turns.set(turnKey(coordinates), coordinates);
    let unsubscribeLifecycle: (() => void) | null = null;
    let terminalBeforeSubscriptionReturned = false;
    const lifecycleSubscription = gatewayTurn.subscribe((event) => {
      if (event.kind === 'status' && event.status !== 'started') {
        this.turns.delete(turnKey(coordinates));
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
    this.requireTurn(input);
    await this.gateway.input(input);
  }

  async interrupt(input: ConversationTurnCoordinates): Promise<void> {
    this.requireTurn(input);
    await this.gateway.interrupt(input);
    this.turns.delete(turnKey(input));
  }

  disconnect(input: ConversationTurnCoordinates): void {
    const stored = this.turns.get(turnKey(input));
    if (!stored || !sameOwner(stored, input)) return;
    this.turns.delete(turnKey(input));
    this.gateway.disconnect(input);
  }

  readiness() {
    return this.gateway.readiness();
  }

  private bindLiveTurn(turn: GatewayLiveTurn, coordinates: ConversationTurnCoordinates): ConversationLiveTurn {
    void turn.ready.catch(() => {
      this.turns.delete(turnKey(coordinates));
    });
    return {
      turnId: turn.turnId,
      ready: turn.ready,
      subscribe: (sink) => turn.subscribe((event) => {
        if (event.kind === 'status' && event.status !== 'started') {
          this.turns.delete(turnKey(coordinates));
        }
        sink(event);
      }),
    };
  }

  private requireConversation(input: ConversationCoordinates): StoredConversation {
    assertOwner(input);
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation || !sameOwner(conversation.owner, input)) {
      throw new AgentOsRuntimeError('conversation_not_found');
    }
    return conversation;
  }

  private requireTurn(input: ConversationTurnCoordinates): StoredTurn {
    this.requireConversation(input);
    const turn = this.turns.get(turnKey(input));
    if (!turn || !sameOwner(turn, input)) throw new AgentOsRuntimeError('conversation_not_found');
    return turn;
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

  private rememberConversation(owner: ConversationOwner, summary: ConversationSummary): void {
    const current = this.conversations.get(summary.id);
    if (current && !sameOwner(current.owner, owner)) {
      throw new AgentOsRuntimeError('conversation_not_found');
    }
    this.conversations.set(summary.id, { owner: copyOwner(owner), summary });
  }
}

function assertOwner(input: ConversationOwner): void {
  if (!validIdentifier(input.organizationId) || !validIdentifier(input.userId)) {
    throw new AgentOsRuntimeError('conversation_owner_invalid');
  }
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

function validIdentifier(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function copyOwner(input: ConversationOwner): ConversationOwner {
  return { organizationId: input.organizationId, userId: input.userId };
}

function sameOwner(left: ConversationOwner, right: ConversationOwner): boolean {
  return left.organizationId === right.organizationId && left.userId === right.userId;
}

function turnKey(input: ConversationTurnCoordinates): string {
  return `${input.organizationId}\u0000${input.userId}\u0000${input.conversationId}\u0000${input.turnId}`;
}
