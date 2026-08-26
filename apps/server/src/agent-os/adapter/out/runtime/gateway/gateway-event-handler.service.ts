import {
  GatewayEventBatchSchema,
  type GatewayEventBatch,
} from '@kiditem/shared/agent-runtime';
import {
  GatewayCommandQueue,
  GatewayProcessRegistrationMissingError,
} from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayReadinessService } from './gateway-readiness.service';

export class GatewayEventSequenceError extends Error {
  constructor() { super('gateway_event_sequence_invalid'); }
}

/** Validates retry-safe Gateway event batches and never writes conversational state to the database. */
export class GatewayEventHandlerService {
  private gatewayInstanceId: string | null = null;
  private eventSeq = 0;

  constructor(private readonly options: Readonly<{
    queue: Pick<GatewayCommandQueue, 'isLiveSession' | 'acknowledge' | 'reject' | 'terminal'>;
    readiness: Pick<GatewayReadinessService, 'update'>;
    broker: Pick<GatewayCommandResponseBroker,
      'acknowledge' | 'reject'
      | 'resolveConversationListed' | 'resolveConversationCreated' | 'resolveConversationHistory'
      | 'resolveConversationRenamed' | 'resolveConversationDeleted'
      | 'resolvePreferenceLoaded' | 'resolvePreferenceUpdated'
      | 'publishTurnEvent' | 'terminal'>;
  }>) {}

  handle(input: GatewayEventBatch): { eventSeq: number; accepted: true } {
    const batch = GatewayEventBatchSchema.parse(input);
    if (!this.options.queue.isLiveSession(batch.gatewayInstanceId)) throw new GatewayProcessRegistrationMissingError();
    if (this.gatewayInstanceId !== batch.gatewayInstanceId) {
      this.gatewayInstanceId = batch.gatewayInstanceId;
      // An API restart deliberately loses this in-memory cursor while the
      // Gateway process retains its ordered outbox. The first authenticated
      // batch from the newly polled process establishes the new baseline.
      this.eventSeq = batch.eventSeq - 1;
    }
    if (batch.eventSeq <= this.eventSeq) return { eventSeq: batch.eventSeq, accepted: true };
    if (batch.eventSeq !== this.eventSeq + 1) throw new GatewayEventSequenceError();
    for (const event of batch.events) this.apply(batch.gatewayInstanceId, event);
    this.eventSeq = batch.eventSeq;
    return { eventSeq: batch.eventSeq, accepted: true };
  }

  private apply(gatewayInstanceId: string, event: GatewayEventBatch['events'][number]): void {
    switch (event.kind) {
      case 'command.ack':
        this.options.queue.acknowledge(event.commandId);
        this.options.broker.acknowledge(event.commandId);
        return;
      case 'command.rejected':
        this.options.queue.reject(event.commandId);
        this.options.broker.reject(event.commandId, event.code);
        return;
      case 'conversation.listed':
        this.options.broker.resolveConversationListed(event);
        return;
      case 'conversation.created':
        this.options.broker.resolveConversationCreated(event);
        return;
      case 'conversation.history':
        this.options.broker.resolveConversationHistory(event);
        return;
      case 'conversation.renamed':
        this.options.broker.resolveConversationRenamed(event);
        return;
      case 'conversation.deleted':
        this.options.broker.resolveConversationDeleted(event);
        return;
      case 'conversation.preferences.loaded':
        this.options.broker.resolvePreferenceLoaded(event);
        return;
      case 'conversation.preferences.updated':
        this.options.broker.resolvePreferenceUpdated(event);
        return;
      case 'turn.terminal':
        this.options.queue.terminal(event.conversationId, event.turnId);
        this.options.broker.terminal(event.conversationId, event.turnId, event.status);
        return;
      case 'turn.event':
        this.options.broker.publishTurnEvent(event.conversationId, event.turnId, event.event);
        if (event.event.kind === 'status' && event.event.status !== 'started') {
          this.options.queue.terminal(event.conversationId, event.turnId);
          this.options.broker.terminal(event.conversationId, event.turnId, event.event.status);
        }
        return;
      case 'gateway.readiness':
        this.options.readiness.update(gatewayInstanceId, event.readiness);
        return;
      default:
        return;
    }
  }
}
