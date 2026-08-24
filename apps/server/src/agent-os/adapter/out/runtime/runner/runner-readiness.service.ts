import { randomUUID } from 'node:crypto';
import {
  ATTEMPT_RUNTIME_TRAIN,
  AttemptLaunchSpecSchema,
  type RunnerEvent,
  type AttemptRuntimeType,
} from '@kiditem/shared/agent-runtime';
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const MAX_VERIFIED_CANARIES = 256;
const READINESS_CANARY_TIMEOUT_MS = 5 * 60_000;

type RunnerLeasePort = Pick<RunnerLeaseRegistry, 'markProbing' | 'markReady' | 'requireActive' | 'requireReady' | 'generationForLease'>;

type VerifiedCanary = Readonly<{
  runnerInstanceId: string;
  leaseId: string;
}>;

type ActiveCanary = {
  canaryId: string;
  runnerInstanceId: string;
  leaseId: string;
  runtime: AttemptRuntimeType;
  model: string;
  deployIdentity: string;
  nonce: string;
  deadlineAt: Date;
  started: boolean;
  probeAccepted: boolean;
  inputCommandId?: string;
  inputCommandHash?: string;
  inputAcknowledged: boolean;
};

export interface RunnerReadinessServiceOptions {
  leases: RunnerLeasePort;
  commands: Pick<RunnerCommandQueue, 'enqueueInput' | 'enqueueStart'>;
  tokens: Pick<AttemptTokenRegistry, 'issueReadiness' | 'revokeLease' | 'revokeReadiness'>;
  loopbackOrigin: string;
  now?: () => Date;
  canaryId?: () => string;
  nonce?: () => string;
}

export type RunnerReadinessSnapshot = Readonly<{
  runnerInstanceId: string;
  platform: 'macos' | 'windows';
  nodeMajor: 22;
  controlRevision: 'kiditem-runner-control-v1';
  cliContractIdentity: 'office-cli-contract-v2';
  mcpProtocolRevision: '2026-07-28';
  runtimes: Readonly<{
    codex_cli: Readonly<{ version: '0.149.1'; loginVerified: true; nonPersistentSettingsVerified: true }>;
    claude_cli: Readonly<{ version: '2.1.241'; loginVerified: true; nonPersistentSettingsVerified: true }>;
  }>;
}>;

/**
 * API-side projection of the Host Runner's strict installation hello.
 * Provider version, login, and non-persistent-setting checks belong to the
 * native Runner; Nest only admits work while that process-memory lease is ready.
 */
export class RunnerReadinessService {
  private readonly verified = new Map<string, VerifiedCanary>();
  private readonly activeCanaries = new Map<string, ActiveCanary>();
  private readonly canaryByIdentity = new Map<string, string>();
  private readonly commands: Pick<RunnerCommandQueue, 'enqueueInput' | 'enqueueStart'> | null;
  private readonly tokens: Pick<AttemptTokenRegistry, 'issueReadiness' | 'revokeLease' | 'revokeReadiness'> | null;
  private readonly origin: URL | null;
  private readonly now: () => Date;
  private readonly createCanaryId: () => string;
  private readonly createNonce: () => string;
  private readonly leases: RunnerLeasePort;

  constructor(input: RunnerLeasePort | RunnerReadinessServiceOptions) {
    if ('leases' in input) {
      this.leases = input.leases;
      this.commands = input.commands;
      this.tokens = input.tokens;
      this.origin = requiredLoopbackOrigin(input.loopbackOrigin);
      this.now = input.now ?? (() => new Date());
      this.createCanaryId = input.canaryId ?? randomUUID;
      this.createNonce = input.nonce ?? randomUUID;
      return;
    }
    this.leases = input;
    this.commands = null;
    this.tokens = null;
    this.origin = null;
    this.now = () => new Date();
    this.createCanaryId = randomUUID;
    this.createNonce = randomUUID;
  }

  /**
   * A readiness canary is deliberately an ordinary ephemeral Runner command,
   * never a durable Attempt or a new control command type.
   */
  beginCanary(input: { runtime: AttemptRuntimeType; model: string; deployIdentity: string }): { canaryId: string } {
    const runtime = validatedRuntime(input.runtime, input.model, input.deployIdentity);
    const activeLease = this.leases.requireActive();
    const identity = readinessKey(runtime, input.model, input.deployIdentity);
    const existingId = this.canaryByIdentity.get(identity);
    const existing = existingId ? this.activeCanaries.get(existingId) : null;
    if (existing && existing.leaseId === activeLease.leaseId) return { canaryId: existing.canaryId };

    const commands = this.commands;
    const tokens = this.tokens;
    const origin = this.origin;
    if (!commands || !tokens || !origin) throw new Error('runner_readiness_canary_unavailable');

    const canaryId = this.createCanaryId();
    const nonce = this.createNonce();
    const deadlineAt = new Date(this.now().getTime() + READINESS_CANARY_TIMEOUT_MS);
    let raw: string | undefined;
    try {
      raw = tokens.issueReadiness({ canaryId, leaseId: activeLease.leaseId, deadline: deadlineAt }).raw;
      const launch = AttemptLaunchSpecSchema.parse({
        attemptId: canaryId,
        runtime,
        model: input.model.trim(),
        prompt: readinessPrompt(runtime, nonce),
        workspacePolicy: 'empty_ephemeral_v1',
        timeoutMs: READINESS_CANARY_TIMEOUT_MS,
        mcpUrl: new URL(`/internal/agent-runtime/attempts/${canaryId}/mcp`, origin).toString(),
        attemptToken: raw,
        mcpToolScope: 'readiness_canary',
        readinessProbeNonce: nonce,
        mcpProtocolRevision: ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision,
        cliContractIdentity: ATTEMPT_RUNTIME_TRAIN.cliContractIdentity,
      });
      commands.enqueueStart({
        launch,
        deadlineAt,
        leaseGeneration: this.leases.generationForLease(activeLease),
      });
    } catch (error) {
      if (raw) tokens.revokeReadiness(canaryId);
      throw error;
    }
    const state: ActiveCanary = {
      canaryId,
      runnerInstanceId: activeLease.runnerInstanceId,
      leaseId: activeLease.leaseId,
      runtime,
      model: input.model.trim(),
      deployIdentity: input.deployIdentity.trim(),
      nonce,
      deadlineAt,
      started: false,
      probeAccepted: false,
      inputAcknowledged: false,
    };
    this.activeCanaries.set(canaryId, state);
    this.canaryByIdentity.set(identity, canaryId);
    this.trimCanaries();
    return { canaryId };
  }

  /** Called only by the request-scoped readiness MCP server after its one tool validates. */
  acceptCanaryProbe(input: { canaryId: string; nonce: string }): void {
    const state = this.activeCanaries.get(input.canaryId);
    const activeLease = this.leases.requireActive();
    if (
      !state || state.nonce !== input.nonce || state.leaseId !== activeLease.leaseId ||
      state.runnerInstanceId !== activeLease.runnerInstanceId || state.deadlineAt <= this.now()
    ) {
      throw new Error('readiness_canary_invalid');
    }
    if (state.probeAccepted) return;
    if (!this.commands) throw new Error('runner_readiness_canary_unavailable');
    const command = this.commands.enqueueInput({
      attemptId: state.canaryId,
      input: 'The readiness probe succeeded. Complete now with only a valid AgentResultEnvelope JSON object.',
      deadlineAt: state.deadlineAt,
    });
    state.probeAccepted = true;
    state.inputCommandId = command.commandId;
    state.inputCommandHash = command.commandHash;
  }

  canaryMcpBinding(input: { canaryId: string; leaseId: string }): Readonly<{
    nonce: string;
    onProbe: (input: { nonce: string }) => void;
  }> {
    const state = this.activeCanaries.get(input.canaryId);
    const activeLease = this.leases.requireActive();
    if (
      !state || state.leaseId !== input.leaseId || state.leaseId !== activeLease.leaseId ||
      state.runnerInstanceId !== activeLease.runnerInstanceId || state.deadlineAt <= this.now()
    ) {
      throw new Error('readiness_canary_invalid');
    }
    return Object.freeze({
      nonce: state.nonce,
      onProbe: (probe) => this.acceptCanaryProbe({ canaryId: state.canaryId, nonce: probe.nonce }),
    });
  }

  /** Returns true only for the synthetic readiness Attempt, before business lifecycle handling. */
  handleRunnerEvent(event: RunnerEvent): boolean {
    const state = this.activeCanaries.get(event.attemptId);
    if (!state) return false;
    switch (event.kind) {
      case 'attempt.started':
        state.started = true;
        return true;
      case 'command_ack':
        if (event.commandId === state.inputCommandId && event.commandHash === state.inputCommandHash) {
          state.inputAcknowledged = true;
        }
        return true;
      case 'attempt.output':
        return true;
      case 'attempt.rejected':
        this.failCanary(state);
        return true;
      case 'attempt.terminal':
        if (
          state.started && state.probeAccepted && state.inputAcknowledged &&
          (event.terminalReason === 'success' || event.terminalReason === 'protocol_success') &&
          AgentResultEnvelopeSchema.safeParse(event.result).success && event.result?.outcome === 'completed'
        ) {
          this.completeCanary(state);
        } else {
          this.failCanary(state);
        }
        return true;
      default:
        // RunnerEvent is validated at the HTTP boundary. Keep this synthetic
        // attempt consumed if a future event kind reaches this service rather
        // than allowing it into the durable business lifecycle.
        this.failCanary(state);
        return true;
    }
  }

  recordVerifiedCanary(input: {
    runnerInstanceId: string;
    leaseId: string;
    runtime: AttemptRuntimeType;
    model: string;
    deployIdentity: string;
  }): void {
    const runtime = validatedRuntime(input.runtime, input.model, input.deployIdentity);
    const active = this.leases.requireActive();
    if (active.runnerInstanceId !== input.runnerInstanceId || active.leaseId !== input.leaseId) {
      throw new Error('runner_not_ready');
    }
    this.leases.markReady({ runnerInstanceId: input.runnerInstanceId, leaseId: input.leaseId });
    const key = readinessKey(runtime, input.model, input.deployIdentity);
    this.verified.delete(key);
    this.verified.set(key, Object.freeze({ runnerInstanceId: active.runnerInstanceId, leaseId: active.leaseId }));
    while (this.verified.size > MAX_VERIFIED_CANARIES) {
      this.verified.delete(this.verified.keys().next().value as string);
    }
  }

  async assertRuntime(runtime: AttemptRuntimeType, model: string, deployIdentity: string): Promise<void> {
    const checkedRuntime = validatedRuntime(runtime, model, deployIdentity);
    const active = this.leases.requireReady();
    const verified = this.verified.get(readinessKey(checkedRuntime, model, deployIdentity));
    if (!verified || verified.runnerInstanceId !== active.runnerInstanceId || verified.leaseId !== active.leaseId) {
      throw new Error('runner_not_ready');
    }
  }

  snapshot(): RunnerReadinessSnapshot | null {
    const active = this.leases.requireActive();
    if (active.status !== 'ready') return null;
    const { hello } = active;
    return Object.freeze({
      runnerInstanceId: hello.runnerInstanceId,
      platform: hello.platform,
      nodeMajor: hello.nodeMajor,
      controlRevision: hello.controlRevision,
      cliContractIdentity: hello.cliContractIdentity,
      mcpProtocolRevision: hello.mcpProtocolRevision,
      runtimes: Object.freeze({
        codex_cli: Object.freeze({ ...hello.runtimes.codex_cli }),
        claude_cli: Object.freeze({ ...hello.runtimes.claude_cli }),
      }),
    });
  }

  private trimCanaries(): void {
    while (this.activeCanaries.size > MAX_VERIFIED_CANARIES) {
      const oldest = this.activeCanaries.keys().next().value as string;
      const state = this.activeCanaries.get(oldest);
      this.activeCanaries.delete(oldest);
      if (state) this.canaryByIdentity.delete(readinessKey(state.runtime, state.model, state.deployIdentity));
    }
  }

  private completeCanary(state: ActiveCanary): void {
    if (!this.tokens) throw new Error('runner_readiness_canary_unavailable');
    this.tokens.revokeReadiness(state.canaryId);
    this.recordVerifiedCanary({
      runnerInstanceId: state.runnerInstanceId,
      leaseId: state.leaseId,
      runtime: state.runtime,
      model: state.model,
      deployIdentity: state.deployIdentity,
    });
    this.removeCanary(state);
  }

  private failCanary(state: ActiveCanary): void {
    this.tokens?.revokeReadiness(state.canaryId);
    this.removeCanary(state);
    for (const [key, verified] of this.verified) {
      if (verified.runnerInstanceId === state.runnerInstanceId && verified.leaseId === state.leaseId) {
        this.verified.delete(key);
      }
    }
    try {
      const active = this.leases.requireActive();
      if (active.runnerInstanceId === state.runnerInstanceId && active.leaseId === state.leaseId) {
        this.leases.markProbing({ runnerInstanceId: state.runnerInstanceId, leaseId: state.leaseId });
      }
    } catch {
      // The stale lease is already unusable. No new lease can be demoted by an old canary.
    }
  }

  private removeCanary(state: ActiveCanary): void {
    this.activeCanaries.delete(state.canaryId);
    const identity = readinessKey(state.runtime, state.model, state.deployIdentity);
    if (this.canaryByIdentity.get(identity) === state.canaryId) this.canaryByIdentity.delete(identity);
  }
}

function validatedRuntime(runtime: AttemptRuntimeType, model: string, deployIdentity: string): AttemptRuntimeType {
  if ((runtime !== 'codex_cli' && runtime !== 'claude_cli') || !model.trim() || model.length > 256) {
      throw new Error('attempt_runtime_not_supported');
  }
  if (!deployIdentity.trim() || deployIdentity.length > 512) throw new Error('attempt_runtime_not_supported');
  return runtime;
}

function readinessKey(runtime: AttemptRuntimeType, model: string, deployIdentity: string): string {
  return `${runtime}\u0000${model.trim()}\u0000${deployIdentity.trim()}`;
}

function requiredLoopbackOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== '4000' ||
    origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password
  ) {
    throw new Error('agent_runtime_loopback_origin_invalid');
  }
  return origin;
}

function readinessPrompt(runtime: AttemptRuntimeType, nonce: string): string {
  if (runtime === 'codex_cli') {
    return [
      'This is a Host Runner readiness canary.',
      'A Runner-owned modern MCP readiness exchange has already completed.',
      'Wait for one subsequent live user input before completing.',
      'On that input, respond only with a valid AgentResultEnvelope JSON object.',
    ].join(' ');
  }
  return [
    'This is a Host Runner readiness canary.',
    `Use the readiness_probe MCP tool exactly once with nonce ${nonce}.`,
    'After it succeeds, wait for one subsequent live user input before completing.',
    'On that input, respond only with a valid AgentResultEnvelope JSON object.',
  ].join(' ');
}
