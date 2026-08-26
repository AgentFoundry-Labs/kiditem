import {
  GatewayEventAcknowledgementSchema,
  GatewayEventBatchSchema,
  GatewayEventSchema,
  type GatewayEvent,
} from '@kiditem/shared/agent-runtime';
import { redactForGatewayEvent } from '../security/redaction';

type InFlight = Readonly<{ body: string; count: number; eventSeq: number }>;
const MAX_BUFFERED_EVENTS = 128;

/** Process-local ordered event state. Retries preserve the exact serialized body. */
export class GatewayEventOutbox {
  private readonly events: GatewayEvent[] = [];
  private readonly redactionTokens: readonly string[];
  private eventSeq = 1;
  private inFlight: InFlight | null = null;
  private flushTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: Readonly<{ gatewayInstanceId: string; redactionTokens?: readonly string[] }>) {
    this.redactionTokens = options.redactionTokens ?? [];
  }

  enqueue(event: GatewayEvent): void {
    const parsed = GatewayEventSchema.parse(redactEvent(event, this.redactionTokens));
    if (this.events.length >= MAX_BUFFERED_EVENTS) {
      if (!dropPendingDelta(this.events, this.inFlight?.count ?? 0)) throw new Error('gateway_event_backpressure');
    }
    this.events.push(parsed);
  }

  peekBody(): string | null { return this.snapshot()?.body ?? null; }
  hasPending(): boolean { return this.inFlight !== null || this.events.length > 0; }
  nextEventSeq(): number { return this.eventSeq; }

  flush(send: (body: string) => Promise<unknown>): Promise<void> {
    const task = this.flushTail.then(() => this.flushOne(send));
    this.flushTail = task.then(() => undefined, () => undefined);
    return task;
  }

  private async flushOne(send: (body: string) => Promise<unknown>): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const acknowledgement = GatewayEventAcknowledgementSchema.parse(await send(snapshot.body));
    if (acknowledgement.eventSeq !== snapshot.eventSeq || !acknowledgement.accepted) throw new Error('gateway_event_ack_invalid');
    this.events.splice(0, snapshot.count);
    this.inFlight = null;
    this.eventSeq += 1;
  }

  private snapshot(): InFlight | null {
    if (this.inFlight) return this.inFlight;
    if (!this.events.length) return null;
    const events = this.events.slice(0, 64);
    const batch = GatewayEventBatchSchema.parse({
      gatewayInstanceId: this.options.gatewayInstanceId,
      eventSeq: this.eventSeq,
      events,
    });
    this.inFlight = Object.freeze({ body: JSON.stringify(batch), count: events.length, eventSeq: this.eventSeq });
    return this.inFlight;
  }
}

function redactEvent(event: GatewayEvent, tokens: readonly string[]): GatewayEvent {
  return redactValue(event, tokens) as GatewayEvent;
}

function redactValue(value: unknown, tokens: readonly string[]): unknown {
  if (typeof value === 'string') return redactForGatewayEvent(value, tokens);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, tokens)]));
  }
  return value;
}

function dropPendingDelta(events: GatewayEvent[], protectedCount: number): boolean {
  const index = events.findIndex((event, current) => current >= protectedCount && event.kind === 'turn.event' && event.event.kind === 'assistant.delta');
  if (index < 0) return false;
  events.splice(index, 1);
  return true;
}
