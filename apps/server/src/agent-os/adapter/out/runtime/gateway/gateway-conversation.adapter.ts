import type {
  ConversationSummary,
  GatewayCommand,
  ProviderMessage,
} from '@kiditem/shared/agent-runtime';
import type {
  GatewayConversationCoordinates,
  GatewayConversationOwner,
  GatewayConversationPort,
  GatewayLiveTurn,
  GatewayTurnCoordinates,
} from '../../../../application/port/out/gateway-conversation.port';
import { GatewayCommandQueue } from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayReadinessService } from './gateway-readiness.service';

type QueuePort = Pick<GatewayCommandQueue, 'enqueue' | 'enqueueTurnStart' | 'terminal'>;
type BrokerPort = Pick<
  GatewayCommandResponseBroker,
  'nextCommandId' | 'begin' | 'beginTurnStart' | 'subscribeTurn' | 'reject' | 'terminal'
>;
type ReadinessPort = Pick<GatewayReadinessService, 'snapshot'>;

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
    return this.dispatch(input, { kind: 'conversation.list', commandId: this.broker.nextCommandId() });
  }

  create(input: GatewayConversationOwner & {
    runtime: ConversationSummary['runtime'];
    agentKey: ConversationSummary['agentKey'];
    title?: string;
  }): Promise<ConversationSummary> {
    return this.dispatch(input, {
      kind: 'conversation.create',
      commandId: this.broker.nextCommandId(),
      runtime: input.runtime,
      agentKey: input.agentKey,
      ...(input.title ? { title: input.title } : {}),
    });
  }

  history(input: GatewayConversationCoordinates): Promise<ProviderMessage[]> {
    return this.dispatch(input, {
      kind: 'conversation.history',
      commandId: this.broker.nextCommandId(),
      conversationId: input.conversationId,
    });
  }

  rename(input: GatewayConversationCoordinates & { title: string }): Promise<ConversationSummary> {
    return this.dispatch(input, {
      kind: 'conversation.rename',
      commandId: this.broker.nextCommandId(),
      conversationId: input.conversationId,
      title: input.title,
    });
  }

  delete(input: GatewayConversationCoordinates): Promise<void> {
    return this.dispatch(input, {
      kind: 'conversation.delete',
      commandId: this.broker.nextCommandId(),
      conversationId: input.conversationId,
    });
  }

  start(input: GatewayTurnCoordinates & {
    message: string;
    model: string;
    reasoningEffort: string;
  }): GatewayLiveTurn {
    const commandId = this.broker.nextCommandId();
    const request = this.broker.beginTurnStart({
      organizationId: input.organizationId,
      initiatingUserId: input.userId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      commandId,
    });
    try {
      this.queue.enqueueTurnStart({
        organizationId: input.organizationId,
        initiatingUserId: input.userId,
        commandId,
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
      throw error;
    }
    void request.result.catch(() => {
      this.queue.terminal(input.conversationId, input.turnId);
    });
    return {
      turnId: input.turnId,
      ready: request.result,
      subscribe: (sink) => this.broker.subscribeTurn({
        organizationId: input.organizationId,
        initiatingUserId: input.userId,
        conversationId: input.conversationId,
        turnId: input.turnId,
      }, sink),
    };
  }

  input(input: GatewayTurnCoordinates & { message: string }): Promise<void> {
    return this.dispatch(input, {
      kind: 'turn.input',
      commandId: this.broker.nextCommandId(),
      conversationId: input.conversationId,
      turnId: input.turnId,
      message: input.message,
    });
  }

  interrupt(input: GatewayTurnCoordinates): Promise<void> {
    try {
      return this.dispatch(input, {
        kind: 'turn.interrupt',
        commandId: this.broker.nextCommandId(),
        conversationId: input.conversationId,
        turnId: input.turnId,
      });
    } finally {
      this.queue.terminal(input.conversationId, input.turnId);
    }
  }

  disconnect(input: GatewayTurnCoordinates): void {
    this.queue.terminal(input.conversationId, input.turnId);
    this.broker.terminal(input.conversationId, input.turnId, 'disconnected');
  }

  readiness() {
    return this.readinessService.snapshot()?.readiness ?? null;
  }

  private dispatch<T>(owner: GatewayConversationOwner, command: Exclude<GatewayCommand, { kind: 'turn.start' }>): Promise<T> {
    const request = this.broker.begin<T>({
      command,
      organizationId: owner.organizationId,
      initiatingUserId: owner.userId,
    });
    try {
      this.queue.enqueue(command);
    } catch (error) {
      void request.result.catch(() => undefined);
      this.broker.reject(request.commandId, 'gateway_command_not_enqueued');
      return Promise.reject(error);
    }
    return request.result;
  }
}
