import type { RunnerEventBatch } from '@kiditem/shared/agent-runtime';
import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type {
  AgentWorkTransactionPort,
  AttemptLifecycleTransitionInput,
} from '../../../../application/port/out/work/agent-work-transaction.port';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

type FutureOutput = {
  publish(input: { attemptId: string; output: string }): void;
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void;
};

export interface RunnerEventHandlerServiceOptions {
  leases: RunnerLeaseRegistry;
  commands: RunnerCommandQueue;
  tokens: AttemptTokenRegistry;
  work: Pick<AgentWorkTransactionPort, 'transitionAttempt' | 'finalizeTaskFromAttempt'>;
  capacity: { releaseAttempt(attemptId: string): void };
  output: FutureOutput;
  now?: () => Date;
}

/**
 * The sole control-plane adapter that projects Runner events into durable
 * Attempt lifecycle changes. The Runner itself owns provider processes.
 */
export class RunnerEventHandlerService {
  private readonly terminalized = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly options: RunnerEventHandlerServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.options.leases.setLossHandlers({
      interruptAttempt: (attemptId) => this.interruptAttempt(attemptId),
      revokeLease: (leaseId) => this.options.tokens.revokeLease(leaseId),
    });
  }

  handle(batch: RunnerEventBatch): Promise<{ eventSeq: number; accepted: true }> {
    return this.options.leases.acceptEventBatch(batch, async () => {
      for (const event of batch.events) await this.apply(event);
    });
  }

  /** Lease replacement/expiry reaches the same terminal lifecycle path as Runner events. */
  interruptAttempt(attemptId: string): Promise<void> {
    return this.terminalize(attemptId, 'interrupted');
  }

  private async apply(event: RunnerEventBatch['events'][number]): Promise<void> {
    switch (event.kind) {
      case 'command_ack':
        this.options.commands.acknowledge(event);
        return;
      case 'attempt.started':
        await this.options.work.transitionAttempt({
          attemptId: event.attemptId,
          from: 'starting',
          to: 'running',
          at: this.now(),
        });
        return;
      case 'attempt.output':
        this.options.output.publish({ attemptId: event.attemptId, output: event.output });
        return;
      case 'attempt.terminal':
        await this.terminalize(event.attemptId, event.terminalReason, event.result);
        return;
      case 'attempt.rejected':
        await this.terminalize(event.attemptId, 'runtime_error');
        return;
    }
  }

  private async terminalize(
    attemptId: string,
    reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
    result?: AgentResultEnvelope,
  ): Promise<void> {
    if (this.terminalized.has(attemptId)) return;
    this.terminalized.add(attemptId);
    if (this.terminalized.size > 1_024) this.terminalized.delete(this.terminalized.values().next().value as string);
    this.options.tokens.revokeAttempt(attemptId);
    this.options.commands.markTerminal(attemptId);
    const terminal = terminalOutcome(reason, result);
    const input: Omit<AttemptLifecycleTransitionInput, 'from'> = {
      attemptId,
      to: terminal.status,
      at: this.now(),
      ...(terminal.error ? { error: terminal.error } : {}),
      ...(terminal.result ? { result: terminal.result } : {}),
    };
    try {
      const running = await this.options.work.transitionAttempt({ ...input, from: 'running' });
      if (!running.transitioned) await this.options.work.transitionAttempt({ ...input, from: 'starting' });
      await this.options.work.finalizeTaskFromAttempt({ attemptId, at: this.now() });
      this.options.output.finish({
        attemptId,
        outcome: terminal.status === 'succeeded' ? 'completed' : 'failed',
        ...(terminal.result?.summary ? { summary: terminal.result.summary } : {}),
      });
    } finally {
      this.options.capacity.releaseAttempt(attemptId);
    }
  }
}

function terminalOutcome(
  reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
  result?: AgentResultEnvelope,
): {
  status: 'succeeded' | 'failed' | 'process_interrupted';
  error?: { code: string; message: string };
  result?: AgentResultEnvelope;
} {
  if ((reason === 'success' || reason === 'protocol_success') && result) {
    return {
      status: result.outcome === 'failed' ? 'failed' : 'succeeded',
      result,
      ...(result.error ? { error: result.error } : {}),
    };
  }
  if (reason === 'success' || reason === 'protocol_success') {
    return { status: 'failed', error: { code: 'attempt_result_invalid', message: 'Runner completed without a valid result.' } };
  }
  if (reason === 'timeout' || reason === 'interrupted') {
    return {
      status: 'process_interrupted',
      error: { code: reason === 'timeout' ? 'attempt_timeout' : 'attempt_interrupted', message: 'Runner Attempt was interrupted.' },
    };
  }
  return {
    status: 'failed',
    error: { code: reason === 'nonzero_exit' ? 'attempt_exit_nonzero' : 'attempt_runtime_error', message: 'Runner Attempt failed.' },
  };
}
