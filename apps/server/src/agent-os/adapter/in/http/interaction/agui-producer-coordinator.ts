import type { BaseEvent } from '@ag-ui/core';
import type { AgentAguiProducerPort } from '../../../../application/port/in/interaction/agent-agui-producer.port';

interface Subscriber { queue: BaseEvent[]; wake: (() => void) | null; done: boolean; error: unknown }
interface Producer { subscribers: Set<Subscriber>; source: AsyncIterable<BaseEvent> }

/** Adapter-local fallback used only by direct controller tests; Nest injects the application capability. */
export class LocalAguiProducerCoordinator implements AgentAguiProducerPort {
  private readonly active = new Map<string, Producer>();

  attach(key: string, sourceFactory: () => AsyncIterable<BaseEvent>): AsyncIterable<BaseEvent> {
    let producer = this.active.get(key);
    if (!producer) {
      producer = { subscribers: new Set(), source: sourceFactory() };
      this.active.set(key, producer);
      queueMicrotask(() => { void this.pump(key, producer!); });
    }
    const subscriber: Subscriber = { queue: [], wake: null, done: false, error: null };
    producer.subscribers.add(subscriber);
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<BaseEvent>> => {
          while (subscriber.queue.length === 0 && !subscriber.done) {
            await new Promise<void>((resolve) => { subscriber.wake = resolve; });
            subscriber.wake = null;
          }
          if (subscriber.queue.length) return { done: false, value: subscriber.queue.shift()! };
          if (subscriber.error) throw subscriber.error;
          return { done: true, value: undefined };
        },
        return: async (): Promise<IteratorResult<BaseEvent>> => {
          producer!.subscribers.delete(subscriber);
          subscriber.done = true;
          subscriber.wake?.();
          return { done: true, value: undefined };
        },
      }),
    };
  }

  private async pump(key: string, producer: Producer): Promise<void> {
    try {
      for await (const event of producer.source) {
        for (const subscriber of producer.subscribers) {
          subscriber.queue.push(event);
          subscriber.wake?.();
        }
      }
      for (const subscriber of producer.subscribers) { subscriber.done = true; subscriber.wake?.(); }
    } catch (error) {
      for (const subscriber of producer.subscribers) { subscriber.error = error; subscriber.done = true; subscriber.wake?.(); }
    } finally { this.active.delete(key); }
  }
}
