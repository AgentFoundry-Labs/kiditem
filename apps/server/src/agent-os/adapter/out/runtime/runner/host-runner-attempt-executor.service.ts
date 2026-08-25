import {
  ATTEMPT_RUNTIME_TRAIN,
  type AttemptLaunchSpec,
} from '@kiditem/shared/agent-runtime';
import type {
  LiveAttemptExecutionCapabilityPort,
  LiveAttemptMcpBinding,
} from '../../../../application/port/in/capability/live-attempt-execution.capability.port';
import type { HostRunnerControlAttemptPort } from './host-runner-control-session.module';

const MAX_ATTEMPT_TIMEOUT_MS = 30 * 60_000;

export interface AttemptPromptResolver {
  resolve(input: { reference?: string; prompt: string }): Promise<string>;
}

export interface HostRunnerAttemptExecutorServiceOptions {
  admission: { assert(binding: Pick<LiveAttemptMcpBinding, 'attemptId' | 'organizationId' | 'sessionId' | 'taskId' | 'agentVersionId'>, runtime: 'codex_cli' | 'claude_cli'): Promise<void> };
  prompts: AttemptPromptResolver;
  control: Pick<HostRunnerControlAttemptPort, 'startBusiness' | 'interrupt'>;
  loopbackOrigin: string;
  now?: () => Date;
}

/**
 * Nest-owned admission adapter. It constructs only the shared launch record;
 * native Host Runner is the sole owner of provider process construction.
 */
export class HostRunnerAttemptExecutorService implements LiveAttemptExecutionCapabilityPort {
  private readonly now: () => Date;
  private readonly origin: URL;

  constructor(private readonly options: HostRunnerAttemptExecutorServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.origin = requiredLoopbackOrigin(options.loopbackOrigin);
  }

  async start(input: Parameters<LiveAttemptExecutionCapabilityPort['start']>[0]): Promise<void> {
    await this.options.admission.assert(input.mcp, input.runtime);
    const prompt = await this.options.prompts.resolve({ reference: input.instructionProfileRef, prompt: input.prompt });
    const deadlineAt = validDeadline(input.deadlineAt, this.now());
    const launch = parseLaunch({
      attemptId: input.attemptId,
      runtime: input.runtime,
      model: input.profile.model,
      prompt,
      timeoutMs: Math.max(1_000, Math.min(MAX_ATTEMPT_TIMEOUT_MS, deadlineAt.getTime() - this.now().getTime())),
      mcpUrl: new URL(`/internal/agent-runtime/attempts/${input.attemptId}/mcp`, this.origin).toString(),
    });
    this.options.control.startBusiness({ launch, binding: input.mcp, deadlineAt });
  }

  async interrupt(attemptId: string): Promise<void> {
    await this.options.control.interrupt({ attemptId, deadlineAt: this.now() });
  }
}

function parseLaunch(input: Pick<AttemptLaunchSpec, 'attemptId' | 'runtime' | 'model' | 'prompt' | 'timeoutMs' | 'mcpUrl'>): Omit<AttemptLaunchSpec, 'attemptToken'> {
  return {
    ...input,
    workspacePolicy: 'empty_ephemeral_v1',
    mcpToolScope: 'business',
    mcpProtocolRevision: ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision,
    cliContractIdentity: ATTEMPT_RUNTIME_TRAIN.cliContractIdentity,
  };
}

function validDeadline(deadline: Date | undefined, now: Date): Date {
  const value = deadline ?? new Date(now.getTime() + MAX_ATTEMPT_TIMEOUT_MS);
  if (!Number.isFinite(value.getTime()) || value.getTime() - now.getTime() < 1_000) throw new Error('attempt_deadline_invalid');
  return new Date(Math.min(value.getTime(), now.getTime() + MAX_ATTEMPT_TIMEOUT_MS));
}

function requiredLoopbackOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('agent_runtime_loopback_origin_invalid');
  }
  return origin;
}
