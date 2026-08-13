import { Injectable } from '@nestjs/common';
import type { BaseEvent } from '@ag-ui/core';

const MAX_ACTIVE_PRODUCERS = 256;
const MAX_PENDING_EVENTS_PER_SUBSCRIBER = 256;
const MAX_COMPLETED_PRODUCERS = 1_024;

interface Subscriber {
  queue: BaseEvent[];
  wake: (() => void) | null;
  done: boolean;
  error: unknown;
}

interface Producer {
  subscribers: Set<Subscriber>;
  source: AsyncIterable<BaseEvent>;
}

@Injectable()
export class AgentAguiProducerCoordinator {
  private readonly active = new Map<string, Producer>();
  private readonly completed = new Set<string>();

  attach(
    producerKey: string,
    sourceFactory: () => AsyncIterable<BaseEvent>,
  ): AsyncIterable<BaseEvent> {
    if (this.completed.has(producerKey)) {
      throw new Error('The Agent OS interaction producer has already completed.');
    }
    let producer = this.active.get(producerKey);
    if (!producer) {
      if (this.active.size >= MAX_ACTIVE_PRODUCERS) {
        throw new Error('Too many active Agent OS interaction producers.');
      }
      producer = { subscribers: new Set(), source: sourceFactory() };
      this.active.set(producerKey, producer);
      queueMicrotask(() => { void this.pump(producerKey, producer!); });
    }
    return this.subscribe(producer);
  }

  private async pump(producerKey: string, producer: Producer): Promise<void> {
    try {
      for await (const event of producer.source) {
        for (const subscriber of producer.subscribers) {
          if (subscriber.queue.length >= MAX_PENDING_EVENTS_PER_SUBSCRIBER) {
            subscriber.error = new Error('Agent OS interaction subscriber is too slow.');
            subscriber.done = true;
            subscriber.wake?.();
            continue;
          }
          subscriber.queue.push(event);
          subscriber.wake?.();
        }
      }
      for (const subscriber of producer.subscribers) {
        subscriber.done = true;
        subscriber.wake?.();
      }
    } catch (error) {
      for (const subscriber of producer.subscribers) {
        subscriber.error = error;
        subscriber.done = true;
        subscriber.wake?.();
      }
    } finally {
      this.active.delete(producerKey);
      this.completed.add(producerKey);
      if (this.completed.size > MAX_COMPLETED_PRODUCERS) {
        const oldest = this.completed.values().next().value;
        if (oldest) this.completed.delete(oldest);
      }
    }
  }

  private subscribe(producer: Producer): AsyncIterable<BaseEvent> {
    const subscriber: Subscriber = {
      queue: [], wake: null, done: false, error: null,
    };
    producer.subscribers.add(subscriber);
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<BaseEvent>> => {
          while (subscriber.queue.length === 0 && !subscriber.done) {
            await new Promise<void>((resolve) => { subscriber.wake = resolve; });
            subscriber.wake = null;
          }
          if (subscriber.queue.length > 0) {
            return { done: false, value: subscriber.queue.shift()! };
          }
          if (subscriber.error) throw subscriber.error;
          return { done: true, value: undefined };
        },
        return: async (): Promise<IteratorResult<BaseEvent>> => {
          producer.subscribers.delete(subscriber);
          subscriber.done = true;
          subscriber.wake?.();
          return { done: true, value: undefined };
        },
      }),
    };
  }
}
