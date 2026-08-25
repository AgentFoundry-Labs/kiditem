import { createHash } from 'node:crypto';
import { AttemptLaunchSpecSchema } from '@kiditem/shared/agent-runtime';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerEventHandlerService } from './runner-event-handler.service';
import { RunnerLeaseRegistry } from './runner-lease.registry';
import { RunnerReadinessService, type RunnerReadinessSnapshot } from './runner-readiness.service';
import type {
  AttemptLaunchSpec,
  AttemptRuntimeType,
  RunnerCommandBatch,
  RunnerEventAcknowledgement,
  RunnerEventBatch,
  RunnerHello,
  RunnerInputCommand,
  RunnerInterruptCommand,
  RunnerLeaseResponse,
  RunnerPoll,
} from '@kiditem/shared/agent-runtime';
import type { AttemptMcpBinding } from '../../../../application/port/in/mcp/attempt-mcp-actions.port';
import type { AgentWorkLifecyclePort } from '../../../../application/port/out/work/agent-work-lifecycle.port';
import type { ReconciliationResult } from '../../../../application/port/out/work/agent-work-persistence.types';

export type { RunnerReadinessSnapshot } from './runner-readiness.service';

/** Nest tokens expose only a narrow view of one process-memory control session. */
export const HOST_RUNNER_CONTROL_SESSION = Symbol('HOST_RUNNER_CONTROL_SESSION');
export const HOST_RUNNER_CONTROL_HTTP_PORT = Symbol('HOST_RUNNER_CONTROL_HTTP_PORT');
export const HOST_RUNNER_CONTROL_ATTEMPT_PORT = Symbol('HOST_RUNNER_CONTROL_ATTEMPT_PORT');
export const HOST_RUNNER_CONTROL_READINESS_PORT = Symbol('HOST_RUNNER_CONTROL_READINESS_PORT');

export interface HostRunnerControlHttpPort {
  hello(input: RunnerHello): RunnerLeaseResponse;
  poll(input: RunnerPoll): Promise<RunnerCommandBatch>;
  events(input: RunnerEventBatch): Promise<RunnerEventAcknowledgement>;
}

export interface HostRunnerControlAttemptPort {
  requireActive(): { runnerInstanceId: string; leaseId: string; status: 'probing' | 'ready'; hello: RunnerHello };
  requireReady(): { runnerInstanceId: string; leaseId: string };
  startBusiness(input: {
    launch: Omit<AttemptLaunchSpec, 'attemptToken'>;
    binding: AttemptMcpBinding;
    deadlineAt: Date;
  }): void;
  sendInput(input: { attemptId: string; input: string; deadlineAt: Date }): RunnerInputCommand;
  interrupt(input: { attemptId: string; deadlineAt: Date }): RunnerInterruptCommand;
}

export interface HostRunnerControlReadinessPort {
  beginCanary(input: { runtime: AttemptRuntimeType; model: string; deployIdentity: string }): { canaryId: string };
  canaryMcpBinding(input: { canaryId: string; leaseId: string }): Readonly<{
    nonce: string;
    onProbe: (input: { nonce: string }) => void;
  }>;
  recordVerifiedCanary(input: {
    runnerInstanceId: string;
    leaseId: string;
    runtime: AttemptRuntimeType;
    model: string;
    deployIdentity: string;
  }): void;
  assertRuntime(runtime: AttemptRuntimeType, model: string, deployIdentity: string): Promise<void>;
  snapshot(): RunnerReadinessSnapshot | null;
}

/**
 * The public host-control Module. It intentionally exposes view Interfaces,
 * not its lease, queue, lifecycle, or readiness implementation objects.
 */
export interface HostRunnerControlSessionPort {
  readonly http: HostRunnerControlHttpPort;
  readonly attempts: HostRunnerControlAttemptPort;
  readonly readiness: HostRunnerControlReadinessPort;
  dispose(): void;
}

/** Injectable test/configuration values without exposing the queue class. */
export interface HostRunnerControlSessionCommandOptions {
  commandId?: () => string;
  maxEntries?: number;
}

export interface HostRunnerControlSessionOptions {
  tokens: AttemptTokenRegistry;
  work: AgentWorkLifecyclePort;
  capacity: { releaseAttempt(attemptId: string): void };
  output: {
    publish(input: { attemptId: string; output: string }): void;
    finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void;
  };
  reconciler?: { reconcile(): Promise<ReconciliationResult> };
  loopbackOrigin: string;
  commandQueue?: HostRunnerControlSessionCommandOptions;
  leaseId?: () => string;
  now?: () => Date;
  canaryId?: () => string;
  nonce?: () => string;
}

/**
 * Owns a complete API-side Host Runner control session: lease replacement,
 * command delivery/ACK, event-sequence fencing, lifecycle cleanup/loss
 * recovery, and readiness state all share one private in-memory graph.
 */
export class HostRunnerControlSession implements HostRunnerControlSessionPort {
  private readonly tokens: AttemptTokenRegistry;
  private readonly commands: RunnerCommandQueue;
  private readonly leases: RunnerLeaseRegistry;
  private readonly readinessState: RunnerReadinessService;
  private readonly eventLifecycle: RunnerEventHandlerService;

  readonly http: HostRunnerControlHttpPort;
  readonly attempts: HostRunnerControlAttemptPort;
  readonly readiness: HostRunnerControlReadinessPort;

  constructor(input: HostRunnerControlSessionOptions) {
    this.tokens = input.tokens;
    this.commands = new RunnerCommandQueue(input.commandQueue);
    this.leases = new RunnerLeaseRegistry({
      commands: this.commands,
      interruptAttempt: async () => undefined,
      ...(input.leaseId ? { leaseId: input.leaseId } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    this.readinessState = new RunnerReadinessService({
      leases: this.leases,
      commands: this.commands,
      tokens: input.tokens,
      loopbackOrigin: input.loopbackOrigin,
      ...(input.now ? { now: input.now } : {}),
      ...(input.canaryId ? { canaryId: input.canaryId } : {}),
      ...(input.nonce ? { nonce: input.nonce } : {}),
    });
    this.eventLifecycle = new RunnerEventHandlerService({
      leases: this.leases,
      commands: this.commands,
      tokens: input.tokens,
      work: input.work,
      capacity: input.capacity,
      output: input.output,
      readiness: this.readinessState,
      ...(input.reconciler ? { reconciler: input.reconciler } : {}),
      ...(input.now ? { now: input.now } : {}),
    });

    this.http = Object.freeze({
      hello: (hello: RunnerHello) => this.leases.hello(hello),
      poll: (poll: RunnerPoll) => this.leases.poll(poll),
      events: (events: RunnerEventBatch) => this.eventLifecycle.handle(events),
    });
    this.attempts = Object.freeze({
      requireActive: () => this.leases.requireActive(),
      requireReady: () => this.leases.requireReady(),
      startBusiness: (start: Parameters<HostRunnerControlAttemptPort['startBusiness']>[0]) => this.startBusiness(start),
      sendInput: (command: Parameters<HostRunnerControlAttemptPort['sendInput']>[0]) => this.commands.enqueueInput(command),
      interrupt: (command: Parameters<HostRunnerControlAttemptPort['interrupt']>[0]) => this.interrupt(command),
    });
    this.readiness = Object.freeze({
      beginCanary: (canary: Parameters<HostRunnerControlReadinessPort['beginCanary']>[0]) => this.readinessState.beginCanary(canary),
      canaryMcpBinding: (binding: Parameters<HostRunnerControlReadinessPort['canaryMcpBinding']>[0]) => this.readinessState.canaryMcpBinding(binding),
      recordVerifiedCanary: (canary: Parameters<HostRunnerControlReadinessPort['recordVerifiedCanary']>[0]) => this.readinessState.recordVerifiedCanary(canary),
      assertRuntime: (runtime: AttemptRuntimeType, model: string, deployIdentity: string) => this.readinessState.assertRuntime(runtime, model, deployIdentity),
      snapshot: () => this.readinessState.snapshot(),
    });
  }

  dispose(): void {
    this.leases.dispose();
  }

  onModuleDestroy(): void {
    this.dispose();
  }

  private startBusiness(input: {
    launch: Omit<AttemptLaunchSpec, 'attemptToken'>;
    binding: AttemptMcpBinding;
    deadlineAt: Date;
  }): void {
    if (input.launch.mcpToolScope !== 'business') throw new Error('runner_business_launch_scope_invalid');
    const lease = this.leases.requireReady();
    const replay = this.commands.startReplayMetadataForAttempt(input.launch.attemptId);
    const deadlineAt = replay ? new Date(replay.deadlineAt) : input.deadlineAt;
    const leaseGeneration = replay?.leaseGeneration ?? this.leases.generationForLease(lease);
    const replayFingerprint = businessStartReplayFingerprint({
      launch: input.launch,
      binding: input.binding,
      deadlineAt,
      leaseGeneration,
    });
    if (replay) {
      this.commands.assertStartReplayFingerprint({ attemptId: input.launch.attemptId, replayFingerprint });
      return;
    }
    let issued = false;
    try {
      const attemptToken = this.tokens.issueBusiness({ binding: input.binding, leaseId: lease.leaseId, deadline: deadlineAt }).raw;
      issued = true;
      const launch = AttemptLaunchSpecSchema.parse({ ...input.launch, attemptToken });
      this.commands.enqueueStart({
        launch,
        deadlineAt,
        leaseGeneration,
        replayFingerprint,
      });
    } catch (error) {
      if (issued) this.tokens.revokeAttempt(input.launch.attemptId);
      throw error;
    }
  }

  private interrupt(input: { attemptId: string; deadlineAt: Date }): RunnerInterruptCommand {
    this.tokens.revokeAttempt(input.attemptId);
    return this.commands.enqueueInterrupt(input);
  }
}

/**
 * This stays process-local and stores only a SHA-256 digest in the command
 * queue. The raw attempt token is neither an input nor part of retained replay
 * metadata, while the MCP binding remains part of the replay identity.
 */
function businessStartReplayFingerprint(input: {
  launch: Omit<AttemptLaunchSpec, 'attemptToken'>;
  binding: AttemptMcpBinding;
  deadlineAt: Date;
  leaseGeneration: number;
}): string {
  return createHash('sha256').update(stableJson({
    launch: input.launch,
    binding: input.binding,
    deadlineAt: input.deadlineAt.toISOString(),
    leaseGeneration: input.leaseGeneration,
  })).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}
