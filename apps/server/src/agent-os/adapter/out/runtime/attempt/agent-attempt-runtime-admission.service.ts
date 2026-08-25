import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type { AgentAttemptReadinessPreflightPort } from '../../../../application/port/out/runtime/agent-attempt-readiness-preflight.port';
import type {
  AdmitAttemptInput,
  AdmitRootAttemptInput,
  DelegateTaskInput,
} from '../../../../application/port/out/work/agent-work-persistence.types';
import type { HostRunnerControlReadinessPort } from '../runner/host-runner-control-session.module';

/** Fences durable admission and every process launch to an exact Runner tuple. */
@Injectable()
export class AgentAttemptRuntimeAdmissionService implements AgentAttemptReadinessPreflightPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: Pick<HostRunnerControlReadinessPort, 'assertRuntime'>,
  ) {}

  async assert(binding: { attemptId: string; organizationId: string; sessionId: string; taskId: string; agentVersionId: string }, runtime: 'codex_cli' | 'claude_cli'): Promise<void> {
    const attempt = await this.prisma.agentAttempt.findFirst({
      where: {
        id: binding.attemptId,
        organizationId: binding.organizationId,
        sessionId: binding.sessionId,
        taskId: binding.taskId,
        agentVersionId: binding.agentVersionId,
        status: { in: ['starting', 'running'] },
        agentVersion: { activatedAt: { not: null } },
      },
      select: { runtimeType: true, reportedModel: true, applicationVersion: true, authorizingGitSha: true, agentVersion: { select: { runtimeType: true } } },
    });
    if (!attempt || attempt.runtimeType !== runtime || attempt.agentVersion.runtimeType !== runtime) throw new Error('attempt_runtime_not_pinned');
    await this.readiness.assertRuntime(runtime, attempt.reportedModel ?? '', `${attempt.applicationVersion}:${attempt.authorizingGitSha}`);
  }

  async assertRoot(input: AdmitRootAttemptInput): Promise<void> {
    const runtime = await this.currentVersionRuntime(input.assignedAgentVersionId);
    await this.assertPreflight(runtime, input);
  }

  async assertFollowUp(input: AdmitAttemptInput): Promise<void> {
    const task = await this.prisma.agentTask.findFirst({
      where: {
        id: input.taskId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      },
      select: {
        assignedAgentVersion: {
          select: { runtimeType: true, activatedAt: true, retiredAt: true },
        },
      },
    });
    if (!task) throw agentWorkError('task_not_found');
    const version = task.assignedAgentVersion;
    // This is a Task-pinned immutable snapshot. Retirement only removes a
    // version from new root/delegation selection; a successor must retain its
    // original runtime contract.
    if (!version.activatedAt) {
      throw agentWorkError('agent_version_not_active');
    }
    await this.assertPreflight(runtimeType(version.runtimeType), input);
  }

  async assertDelegation(input: DelegateTaskInput): Promise<void> {
    const runtime = await this.currentVersionRuntime(input.targetAgentVersionId);
    await this.assertPreflight(runtime, input);
  }

  private async currentVersionRuntime(agentVersionId: string): Promise<'codex_cli' | 'claude_cli'> {
    const version = await this.prisma.agentVersion.findFirst({
      where: { id: agentVersionId, activatedAt: { not: null }, retiredAt: null },
      select: { runtimeType: true },
    });
    if (!version) throw agentWorkError('agent_version_not_active');
    return runtimeType(version.runtimeType);
  }

  private async assertPreflight(
    runtime: 'codex_cli' | 'claude_cli',
    input: Pick<
      AdmitRootAttemptInput | AdmitAttemptInput | DelegateTaskInput,
      'reportedModel' | 'applicationVersion' | 'authorizingGitSha'
    >,
  ): Promise<void> {
    await this.readiness.assertRuntime(
      runtime,
      input.reportedModel ?? '',
      `${input.applicationVersion}:${input.authorizingGitSha}`,
    );
  }
}

function runtimeType(value: string): 'codex_cli' | 'claude_cli' {
  if (value === 'codex_cli' || value === 'claude_cli') return value;
  throw new Error('attempt_runtime_not_supported');
}

function agentWorkError(code: string): AgentOsRuntimeError {
  return new AgentOsRuntimeError(code, code);
}
