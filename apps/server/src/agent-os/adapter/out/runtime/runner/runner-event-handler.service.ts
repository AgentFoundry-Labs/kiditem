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

type TerminalStages = {
  attemptTerminalized: boolean;
  taskFinalized: boolean;
  tokenRevoked: boolean;
  outputFinished: boolean;
  commandTerminalized: boolean;
  capacityReleased: boolean;
};

const MAX_TERMINAL_TRACKING = 1_024;

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
  private readonly terminalCompleted = new Set<string>();
  private readonly terminalInFlight = new Map<string, Promise<void>>();
  private readonly terminalStages = new Map<string, TerminalStages>();
  private readonly now: () => Date;

  constructor(private readonly options: RunnerEventHandlerServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.options.leases.setLossHandlers({
      interruptAttempt: (attemptId) => this.interruptAttempt(attemptId),
      revokeLease: (leaseId) => this.options.tokens.revokeLease(leaseId),
    });
  }

  handle(batch: RunnerEventBatch): Promise<{ eventSeq: number; accepted: true }> {
    return this.options.leases.acceptEventBatch(batch, async (assertActive) => {
      for (const event of batch.events) {
        assertActive();
        await this.apply(event, assertActive);
      }
    });
  }

  /** Lease replacement/expiry reaches the same terminal lifecycle path as Runner events. */
  interruptAttempt(attemptId: string): Promise<void> {
    return this.terminalize(attemptId, 'interrupted');
  }

  private async apply(event: RunnerEventBatch['events'][number], assertActive: () => void): Promise<void> {
    switch (event.kind) {
      case 'command_ack':
        assertActive();
        this.options.commands.acknowledge(event);
        return;
      case 'attempt.started':
        assertActive();
        await this.options.work.transitionAttempt({
          attemptId: event.attemptId,
          from: 'starting',
          to: 'running',
          at: this.now(),
        });
        return;
      case 'attempt.output':
        assertActive();
        this.options.output.publish({ attemptId: event.attemptId, output: event.output });
        return;
      case 'attempt.terminal':
        await this.terminalize(event.attemptId, event.terminalReason, event.result, assertActive);
        return;
      case 'attempt.rejected':
        await this.terminalize(event.attemptId, 'runtime_error', undefined, assertActive);
        return;
    }
  }

  private async terminalize(
    attemptId: string,
    reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
    result?: AgentResultEnvelope,
    assertActive?: () => void,
  ): Promise<void> {
    if (this.terminalCompleted.has(attemptId)) return;
    const inFlight = this.terminalInFlight.get(attemptId);
    if (inFlight) return inFlight;
    const terminalization = this.completeTerminal(attemptId, reason, result, assertActive);
    this.terminalInFlight.set(attemptId, terminalization);
    try {
      await terminalization;
      this.terminalCompleted.add(attemptId);
      this.terminalStages.delete(attemptId);
      if (this.terminalCompleted.size > MAX_TERMINAL_TRACKING) {
        this.terminalCompleted.delete(this.terminalCompleted.values().next().value as string);
      }
    } finally {
      if (this.terminalInFlight.get(attemptId) === terminalization) {
        this.terminalInFlight.delete(attemptId);
      }
    }
  }

  private async completeTerminal(
    attemptId: string,
    reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
    result: AgentResultEnvelope | undefined,
    assertActive: (() => void) | undefined,
  ): Promise<void> {
    const stages = this.stagesFor(attemptId);
    const terminal = terminalOutcome(reason, result);
    const input: Omit<AttemptLifecycleTransitionInput, 'from'> = {
      attemptId,
      to: terminal.status,
      at: this.now(),
      ...(terminal.error ? { error: terminal.error } : {}),
      ...(terminal.result ? { result: terminal.result } : {}),
    };
    if (!stages.attemptTerminalized) {
      assertActive?.();
      const running = await this.options.work.transitionAttempt({ ...input, from: 'running' });
      assertActive?.();
      if (!running.transitioned) await this.options.work.transitionAttempt({ ...input, from: 'starting' });
      stages.attemptTerminalized = true;
    }
    if (!stages.taskFinalized) {
      assertActive?.();
      await this.options.work.finalizeTaskFromAttempt({ attemptId, at: this.now() });
      stages.taskFinalized = true;
    }
    if (!stages.tokenRevoked) {
      assertActive?.();
      this.options.tokens.revokeAttempt(attemptId);
      stages.tokenRevoked = true;
    }
    if (!stages.outputFinished) {
      assertActive?.();
      this.options.output.finish({
        attemptId,
        outcome: terminal.status === 'succeeded' ? 'completed' : 'failed',
        ...(terminal.result?.summary ? { summary: terminal.result.summary } : {}),
      });
      stages.outputFinished = true;
    }
    if (!stages.commandTerminalized) {
      assertActive?.();
      this.options.commands.markTerminal(attemptId);
      stages.commandTerminalized = true;
    }
    if (!stages.capacityReleased) {
      // markTerminal removes the command used by the batch ownership fence. Both
      // remaining steps are synchronous, so no lease replacement can interleave.
      this.options.capacity.releaseAttempt(attemptId);
      stages.capacityReleased = true;
    }
  }

  private stagesFor(attemptId: string): TerminalStages {
    const existing = this.terminalStages.get(attemptId);
    if (existing) return existing;
    if (this.terminalStages.size >= MAX_TERMINAL_TRACKING) {
      throw new Error('runner_terminal_backpressure');
    }
    const stages: TerminalStages = {
      attemptTerminalized: false,
      taskFinalized: false,
      tokenRevoked: false,
      outputFinished: false,
      commandTerminalized: false,
      capacityReleased: false,
    };
    this.terminalStages.set(attemptId, stages);
    return stages;
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
