import {
  MAX_RUNNER_EVENTS,
  MAX_RUNNER_OUTPUT_BYTES,
  RunnerEventAcknowledgementSchema,
  RunnerEventBatchSchema,
  RunnerEventSchema,
  type RunnerEvent,
} from '@kiditem/shared/agent-runtime';
import { redactForRunnerEvent } from '../security/redaction';

type InFlight = Readonly<{ body: string; count: number; eventSeq: number }>;
const MAX_BUFFERED_EVENTS = MAX_RUNNER_EVENTS * 2;
const RESERVED_CONTROL_EVENTS = Math.max(8, Math.floor(MAX_BUFFERED_EVENTS / 4));
const MAX_BUFFERED_OUTPUT_EVENTS = MAX_BUFFERED_EVENTS - RESERVED_CONTROL_EVENTS;

/** One-memory-only stable event batch with retry-before-advance semantics. */
export class RunnerEventOutbox {
  private readonly events: RunnerEvent[] = [];
  private readonly redactionTokens: readonly string[];
  private eventSeq = 1;
  private inFlight: InFlight | null = null;
  private flushTail: Promise<void> = Promise.resolve();

  constructor(private readonly binding: Readonly<{ runnerInstanceId: string; leaseId: string; redactionTokens?: readonly string[] }>) {
    this.redactionTokens = binding.redactionTokens ?? [];
  }

  enqueue(event: RunnerEvent): void {
    const parsed = RunnerEventSchema.parse(event);
    if (parsed.kind === 'attempt.output') {
      // Output is lossy telemetry. It must never crowd out terminal/command control state.
      if (this.events.length >= MAX_BUFFERED_EVENTS || this.outputCount() >= MAX_BUFFERED_OUTPUT_EVENTS) return;
      this.events.push(parsed);
      return;
    }
    while (this.events.length >= MAX_BUFFERED_EVENTS && this.dropPendingOutput()) undefined;
    if (this.events.length >= MAX_BUFFERED_EVENTS) throw new Error('runner_event_backpressure');
    this.events.push(parsed);
  }

  enqueueOutput(attemptId: string, providerText: string): void {
    const output = redactForRunnerEvent(providerText, this.redactionTokens).trim();
    if (output) this.enqueue({ kind: 'attempt.output', attemptId, output });
  }

  peekBody(): string | null {
    return this.snapshot()?.body ?? null;
  }

  nextEventSeq(): number { return this.eventSeq; }

  flush(send: (body: string) => Promise<unknown>): Promise<void> {
    const task = this.flushTail.then(() => this.flushOne(send));
    this.flushTail = task.then(() => undefined, () => undefined);
    return task;
  }

  private async flushOne(send: (body: string) => Promise<unknown>): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const acknowledgement = RunnerEventAcknowledgementSchema.parse(await send(snapshot.body));
    if (acknowledgement.eventSeq !== snapshot.eventSeq || !acknowledgement.accepted) throw new Error('runner_event_ack_invalid');
    this.events.splice(0, snapshot.count);
    this.inFlight = null;
    this.eventSeq += 1;
  }

  private snapshot(): InFlight | null {
    if (this.inFlight) return this.inFlight;
    if (!this.events.length) return null;
    const events = this.maximalSendablePrefix();
    const batch = RunnerEventBatchSchema.parse({
      runnerInstanceId: this.binding.runnerInstanceId,
      leaseId: this.binding.leaseId,
      eventSeq: this.eventSeq,
      events,
    });
    const snapshot = Object.freeze({ body: JSON.stringify(batch), count: events.length, eventSeq: this.eventSeq });
    this.inFlight = snapshot;
    return snapshot;
  }

  /** Drops only unsent output gaps so the prefix remains ordered and always schema-sendable. */
  private maximalSendablePrefix(): RunnerEvent[] {
    const events: RunnerEvent[] = []; const discard: number[] = []; let outputBytes = 0;
    for (let index = 0; index < this.events.length && events.length < MAX_RUNNER_EVENTS; index += 1) {
      const event = this.events[index]!;
      if (event.kind === 'attempt.output') {
        const bytes = Buffer.byteLength(event.output, 'utf8');
        if (outputBytes + bytes > MAX_RUNNER_OUTPUT_BYTES) { discard.push(index); continue; }
        outputBytes += bytes;
      }
      events.push(event);
    }
    for (const index of discard.reverse()) this.events.splice(index, 1);
    return events;
  }

  private outputCount(): number { return this.events.filter((event) => event.kind === 'attempt.output').length; }

  private dropPendingOutput(): boolean {
    const protectedCount = this.inFlight?.count ?? 0;
    const index = this.events.findIndex((event, current) => current >= protectedCount && event.kind === 'attempt.output');
    if (index < 0) return false;
    this.events.splice(index, 1);
    return true;
  }
}
