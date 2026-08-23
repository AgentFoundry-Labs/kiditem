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

  async assert(agentVersionId: string, runtime: 'codex_cli' | 'claude_cli'): Promise<void> {
    const version = await this.prisma.agentWorkVersion.findFirst({
      where: { id: agentVersionId, activatedAt: { not: null }, retiredAt: null },
      select: { runtimeType: true },
    });
    if (!version || version.runtimeType !== runtime) throw new Error('attempt_runtime_not_pinned');
    await this.readiness.assertRuntime(runtime);
  }
}
