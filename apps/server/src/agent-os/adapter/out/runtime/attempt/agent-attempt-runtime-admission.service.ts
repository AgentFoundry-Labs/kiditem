import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentAttemptReadinessService } from './agent-attempt-readiness.service';

/** Fences every process launch to the active AgentVersion's Task-pinned CLI. */
@Injectable()
export class AgentAttemptRuntimeAdmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness = new AgentAttemptReadinessService(),
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
}
