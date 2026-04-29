import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getAdapter } from './registry';
import type { ExecutionContext, ExecutionResult, StreamEvent } from './types';

const logger = new Logger('FallbackChain');

/**
 * Execute with fallback chain. Tries adapters in order.
 *
 * Error contract: throws the FIRST adapter's error (3-strike cascade compatible).
 * Secondary adapter failures are logged as events only.
 */
export async function* executeFallbackChain(
  adapterTypes: string[],
  ctx: ExecutionContext,
  eventEmitter?: EventEmitter2,
): AsyncGenerator<StreamEvent, ExecutionResult> {
  if (adapterTypes.length === 0) {
    return { exitCode: 1, signal: null, timedOut: false, stdout: '', stderr: 'No adapters configured' };
  }

  let firstError: ExecutionResult | null = null;

  for (let i = 0; i < adapterTypes.length; i++) {
    const adapterType = adapterTypes[i];
    try {
      const adapter = getAdapter(adapterType);
      const gen = adapter.execute(ctx);

      // Yield all stream events from this adapter
      let iter: IteratorResult<StreamEvent, ExecutionResult>;
      do {
        iter = await gen.next();
        if (!iter.done) yield iter.value;
      } while (!iter.done);

      const result = iter.value;

      if (result.exitCode === 0) {
        if (i > 0) {
          logger.warn(`Fallback succeeded: ${adapterTypes[0]} → ${adapterType}`);
          eventEmitter?.emit('agent.fallback', {
            from: adapterTypes[0],
            to: adapterType,
            runId: ctx.runId,
          });
        }
        return result;
      }

      // First adapter failure — save for error contract
      if (i === 0) firstError = result;

      logger.warn(`Adapter ${adapterType} failed (exit=${result.exitCode}), trying next...`);
      eventEmitter?.emit('agent.fallback.attempt', {
        adapter: adapterType,
        exitCode: result.exitCode,
        runId: ctx.runId,
      });
    } catch (err: any) {
      logger.error(`Adapter ${adapterType} threw: ${err.message}`);
      if (i === 0) {
        firstError = {
          exitCode: 1, signal: null, timedOut: false,
          stdout: '', stderr: `Adapter error: ${err.message}`,
        };
      }
    }
  }

  // All adapters failed — return first adapter's error (3-strike cascade compatible)
  return firstError ?? {
    exitCode: 1, signal: null, timedOut: false,
    stdout: '', stderr: 'All adapters in fallback chain failed',
  };
}
