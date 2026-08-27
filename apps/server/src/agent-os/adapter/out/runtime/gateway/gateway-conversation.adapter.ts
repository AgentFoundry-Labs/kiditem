import type {
  ConversationPreferences,
  ConversationSummary,
  GatewayCommand,
  SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';
import type {
  GatewayConversationCoordinates,
  GatewayConversationOwner,
  GatewayConversationPort,
  GatewayLiveTurn,
  GatewayTurnCoordinates,
} from '../../../../application/port/out/gateway-conversation.port';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import { GatewayCommandQueue } from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayReadinessService } from './gateway-readiness.service';

type QueuePort = Pick<GatewayCommandQueue, 'enqueue' | 'enqueueTurnStart' | 'terminal'>;
type BrokerPort = Pick<
  GatewayCommandResponseBroker,
  'nextCommandId' | 'begin' | 'beginTurnStart' | 'subscribeTurn' | 'reject' | 'terminal'
>;
type ReadinessPort = Pick<GatewayReadinessService, 'snapshot'>;
interface BrokerRequest<T> {
  commandId: string;
  result: Promise<T>;
}

/**
 * Provider-native conversation commands stay inside the Gateway control plane.
 * This adapter deliberately exposes only browser-safe conversation coordinates.
 */
export class GatewayConversationAdapter implements GatewayConversationPort {
  constructor(
    private readonly queue: QueuePort,
    private readonly broker: BrokerPort,
    private readonly readinessService: ReadinessPort,
  ) {}

  list(input: GatewayConversationOwner): Promise<ConversationSummary[]> {
    return this.dispatch(input, {
      kind: 'conversation.list',
      commandId: this.broker.nextCommandId(),
      organizationId: input.organizationId,
    });
  }

  create(input: GatewayConversationOwner & {
    conversationId: string;
    runtime: ConversationSummary['runtime'];
    agentKey: ConversationSummary['agentKey'];
    title: string;
  }): Promise<ConversationSummary> {
    return this.dispatch(input, {
      kind: 'conversation.create',
      commandId: this.broker.nextCommandId(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      runtime: input.runtime,
      agentKey: input.agentKey,
      title: input.title,
    });
  }

  preferences(input: GatewayConversationOwner): Promise<ConversationPreferences> {
    return this.dispatch(input, {
      kind: 'conversation.preferences.get',
      commandId: this.broker.nextCommandId(),
    });
  }

  setPreference(input: GatewayConversationOwner & SetConversationPreferenceCommand): Promise<ConversationPreferences> {
    return this.dispatch(input, {
      kind: 'conversation.preferences.set',
      commandId: this.broker.nextCommandId(),
      context: input.context,
      runtime: input.runtime,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
  }

  rename(input: GatewayConversationCoordinates & { title: string }): Promise<ConversationSummary> {
    return this.dispatch(input, {
      kind: 'conversation.rename',
      commandId: this.broker.nextCommandId(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      title: input.title,
    });
  }

  delete(input: GatewayConversationCoordinates): Promise<void> {
    return this.dispatch(input, {
      kind: 'conversation.delete',
      commandId: this.broker.nextCommandId(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
  }

  start(input: GatewayTurnCoordinates & {
    message: string;
    model: string;
    reasoningEffort: string;
  }): GatewayLiveTurn {
    const commandId = this.broker.nextCommandId();
    let request: BrokerRequest<void>;
    try {
      request = this.broker.beginTurnStart({
        organizationId: input.organizationId,
        initiatingUserId: input.userId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        commandId,
        message: input.message,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
      });
    } catch (error) {
      throw gatewayError(error, 'turn.start');
    }
    if (request.commandId === commandId) {
      try {
        this.queue.enqueueTurnStart({
          organizationId: input.organizationId,
          initiatingUserId: input.userId,
          commandId: request.commandId,
          conversationId: input.conversationId,
          turnId: input.turnId,
          message: input.message,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
        });
      } catch (error) {
        void request.result.catch(() => undefined);
        this.broker.reject(request.commandId, 'gateway_command_not_enqueued');
        this.queue.terminal(input.conversationId, input.turnId);
        throw gatewayError(error, 'turn.start');
      }
    }
    const ready = request.result.catch((error) => {
      this.queue.terminal(input.conversationId, input.turnId);
      throw gatewayError(error, 'turn.start');
    });
    return {
      turnId: input.turnId,
      ready,
      subscribe: (sink) => this.broker.subscribeTurn({
        organizationId: input.organizationId,
        initiatingUserId: input.userId,
        conversationId: input.conversationId,
        turnId: input.turnId,
      }, sink),
    };
  }

  interrupt(input: GatewayTurnCoordinates): Promise<void> {
    return this.dispatch(input, {
      kind: 'turn.interrupt',
      commandId: this.broker.nextCommandId(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      turnId: input.turnId,
    });
  }

  readiness() {
    return this.readinessService.snapshot()?.readiness ?? null;
  }

  private dispatch<T>(owner: GatewayConversationOwner, command: Exclude<GatewayCommand, { kind: 'turn.start' }>): Promise<T> {
    let request: BrokerRequest<T>;
    try {
      request = this.broker.begin<T>({
        command,
        organizationId: owner.organizationId,
        initiatingUserId: owner.userId,
      });
    } catch (error) {
      return Promise.reject(gatewayError(error, command.kind));
    }
    try {
      this.queue.enqueue(command);
    } catch (error) {
      void request.result.catch(() => undefined);
      this.broker.reject(request.commandId, 'gateway_command_not_enqueued');
      return Promise.reject(gatewayError(error, command.kind));
    }
    return request.result.catch((error) => {
      throw gatewayError(error, command.kind);
    });
  }
}

function gatewayError(error: unknown, commandKind: GatewayCommand['kind']): AgentOsRuntimeError {
  if (error instanceof AgentOsRuntimeError) return error;
  const message = error instanceof Error ? error.message : '';
  if (message === 'gateway_broker_turn_start_input_conflict') {
    return new AgentOsRuntimeError('conversation_turn_live');
  }
  if (message === 'gateway_command_rejected_not_found') {
    return new AgentOsRuntimeError('conversation_not_found');
  }
  if (message === 'gateway_command_rejected_invalid_state') {
    if (commandKind === 'conversation.create') return new AgentOsRuntimeError('conversation_create_conflict');
    if (commandKind === 'conversation.delete') return new AgentOsRuntimeError('conversation_turn_live');
  }
  return new AgentOsRuntimeError('conversation_gateway_unavailable');
}
