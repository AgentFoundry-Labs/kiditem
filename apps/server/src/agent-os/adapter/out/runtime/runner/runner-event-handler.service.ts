import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';
import type { RunnerReadinessService } from './runner-readiness.service';
import type { RunnerEventBatch } from '@kiditem/shared/agent-runtime';
import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { AgentWorkLifecyclePort } from '../../../../application/port/out/work/agent-work-lifecycle.port';
import type {
  AttemptLifecycleTransitionInput,
  ReconciliationResult,
} from '../../../../application/port/out/work/agent-work-persistence.types';

type LiveOutput = {
  publish(input: { attemptId: string; output: string }): void;
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void;
};

type TerminalOutcome = {
  status: 'succeeded' | 'failed' | 'process_interrupted';
  error?: { code: string; message: string };
  result?: AgentResultEnvelope;
};

type TerminalStages = {
  /**
   * The first terminal signal wins. Lease-loss recovery resumes this exact
   * plan, rather than changing a successfully completed Attempt into an
   * interruption while later local cleanup is pending.
   */
  terminal: Readonly<TerminalOutcome>;
  attemptTerminalized: boolean;
  taskFinalized: boolean;
  tokenRevoked: boolean;
  outputFinished: boolean;
  commandTerminalized: boolean;
  capacityReleased: boolean;
  leaseLossRecovery?: Promise<void>;
};

const MAX_TERMINAL_TRACKING = 1_024;

export interface RunnerEventHandlerServiceOptions {
  leases: RunnerLeaseRegistry;
  commands: RunnerCommandQueue;
  tokens: AttemptTokenRegistry;
  work: Pick<AgentWorkLifecyclePort, 'transitionAttempt' | 'finalizeTaskFromAttempt'>;
  capacity: { releaseAttempt(attemptId: string): void };
  output: LiveOutput;
  readiness?: Pick<RunnerReadinessService, 'handleRunnerEvent'>;
  reconciler?: { reconcile(): Promise<ReconciliationResult> };
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
      reconcileLeaseLoss: (input) => this.reconcileLeaseLoss(input),
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

  private async reconcileLeaseLoss(input: { leaseId: string; attemptIds: readonly string[] }): Promise<void> {
    if (this.options.reconciler) {
      const reconciliation = await this.options.reconciler.reconcile();
      const capacityReleased = new Set(reconciliation.attemptIds);
      const attemptIds = new Set([...input.attemptIds, ...reconciliation.attemptIds]);
      await Promise.all([...attemptIds].map((attemptId) =>
        this.terminalize(attemptId, 'interrupted', undefined, undefined, capacityReleased.has(attemptId)),
      ));
      return;
    }
    await Promise.all(input.attemptIds.map((attemptId) => this.interruptAttempt(attemptId)));
  }

  private async apply(event: RunnerEventBatch['events'][number], assertActive: () => void): Promise<void> {
    if (this.options.readiness?.handleRunnerEvent(event)) {
      // Synthetic canaries never enter durable Attempt lifecycle work, but
      // they still use the ordinary Runner queue. Clear their acknowledgements
      // and raw start-token-bearing records on the same local path as business
      // commands so a completed canary leaves no process-memory capability.
      if (event.kind === 'command_ack') {
        assertActive();
        this.options.commands.acknowledge(event);
      }
      if (event.kind === 'attempt.terminal' || event.kind === 'attempt.rejected') {
        this.options.commands.markTerminal(event.attemptId);
      }
      return;
    }
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

  private terminalize(
    attemptId: string,
    reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
    result?: AgentResultEnvelope,
    assertActive?: () => void,
    capacityAlreadyReleased = false,
  ): Promise<void> {
    if (this.terminalCompleted.has(attemptId)) return Promise.resolve();
    const existingStages = this.terminalStages.get(attemptId);
    if (capacityAlreadyReleased && existingStages) existingStages.capacityReleased = true;
    const inFlight = this.terminalInFlight.get(attemptId);
    if (inFlight) {
      // Lease invalidation is deliberately not fenced: it must resume a
      // terminal event whose old lease becomes invalid while a durable stage
      // is awaiting completion.
      return assertActive ? inFlight : this.resumeAfterLeaseLoss(attemptId, inFlight);
    }
    const stages = this.stagesFor(attemptId, freezeTerminalOutcome(reason, result), capacityAlreadyReleased);
    let terminalization!: Promise<void>;
    terminalization = Promise.resolve().then(async () => {
      try {
        await this.completeTerminal(attemptId, stages, assertActive);
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
    });
    this.terminalInFlight.set(attemptId, terminalization);
    return terminalization;
  }

  /**
   * A replaced lease can invalidate an event after its durable transition has
   * completed. Keep one recovery promise in the retained stage state, wait
   * for the fenced operation to settle, then continue the unfinished stages
   * without the stale lease assertion.
   */
  private resumeAfterLeaseLoss(attemptId: string, inFlight: Promise<void>): Promise<void> {
    const stages = this.terminalStages.get(attemptId);
    if (!stages) return inFlight;
    if (stages.leaseLossRecovery) return stages.leaseLossRecovery;
    let recovery!: Promise<void>;
    recovery = (async () => {
      try {
        await inFlight;
      } catch {
        await this.terminalize(attemptId, 'interrupted');
      } finally {
        if (stages.leaseLossRecovery === recovery) stages.leaseLossRecovery = undefined;
      }
    })();
    stages.leaseLossRecovery = recovery;
    return recovery;
  }

  private async completeTerminal(
    attemptId: string,
    stages: TerminalStages,
    assertActive: (() => void) | undefined,
  ): Promise<void> {
    const terminal = stages.terminal;
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
      // Do not let a fenced old lease attempt the starting fallback after the
      // awaited running transition. Lease-loss recovery resumes this stage
      // without the stale assertion instead.
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

  private stagesFor(
    attemptId: string,
    terminal: Readonly<TerminalOutcome>,
    capacityAlreadyReleased = false,
  ): TerminalStages {
    const existing = this.terminalStages.get(attemptId);
    if (existing) {
      if (capacityAlreadyReleased) existing.capacityReleased = true;
      return existing;
    }
    if (this.terminalStages.size >= MAX_TERMINAL_TRACKING) {
      throw new Error('runner_terminal_backpressure');
    }
    const stages: TerminalStages = {
      terminal,
      attemptTerminalized: false,
      taskFinalized: false,
      tokenRevoked: false,
      outputFinished: false,
      commandTerminalized: false,
      capacityReleased: capacityAlreadyReleased,
    };
    this.terminalStages.set(attemptId, stages);
    return stages;
  }
}

function freezeTerminalOutcome(
  reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
  result?: AgentResultEnvelope,
): Readonly<TerminalOutcome> {
  const terminal = terminalOutcome(reason, result);
  return Object.freeze({
    ...terminal,
    ...(terminal.error ? { error: Object.freeze({ ...terminal.error }) } : {}),
    ...(terminal.result ? { result: Object.freeze(structuredClone(terminal.result)) } : {}),
  });
}

function terminalOutcome(
  reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted',
  result?: AgentResultEnvelope,
): TerminalOutcome {
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
