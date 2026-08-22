import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentRuntimeCredentialAuthorityRepositoryPort } from "../../../../application/port/out/repository/session-execution/agent-runtime-credential-authority.repository.port";

@Injectable()
export class PrismaAgentRuntimeCredentialAuthorityRepository implements AgentRuntimeCredentialAuthorityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadRuntimeCredentialAuthority(input: {
    organizationId: string; sessionId: string; executionId: string; attemptId: string;
  }) {
    const attempt = await this.prisma.agentExecutionAttempt.findFirst({
      where: {
        id: input.attemptId, organizationId: input.organizationId,
        sessionId: input.sessionId, executionId: input.executionId,
      },
      select: {
        organizationId: true, sessionId: true, executionId: true, id: true,
        runtimeStartIntentId: true, runtimeCredentialGeneration: true,
        execution: { select: { session: { select: { lifecycle: true } } } },
      },
    });
    if (!attempt) return null;
    return {
      organizationId: attempt.organizationId, sessionId: attempt.sessionId,
      executionId: attempt.executionId, attemptId: attempt.id,
      startIntentId: attempt.runtimeStartIntentId,
      runtimeCredentialGeneration: attempt.runtimeCredentialGeneration,
      lifecycle: attempt.execution.session.lifecycle,
    };
  }
}
