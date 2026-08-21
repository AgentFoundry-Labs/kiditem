import { Injectable } from '@nestjs/common';
import {
  AgentSessionDeletionStatusSchema,
  type AgentSessionDeletionStatus,
} from '@kiditem/shared/agent-interaction';
import {
  formatOrganizationName,
  OrganizationIdSchema,
  parseAgentSessionName,
  UserIdSchema,
} from '@kiditem/shared/identifiers';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { AgentSessionDeletionQueryPort } from '../../../../application/port/out/repository/session-deletion/agent-session-deletion-query.port';
import type { ScopedDeletionActor } from '../../../../application/port/in/session-control/agent-session-deletion.port';

@Injectable()
export class PrismaAgentSessionDeletionQueryRepository
  implements AgentSessionDeletionQueryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findAuthorizedStatus(
    input: ScopedDeletionActor,
  ): Promise<AgentSessionDeletionStatus | null> {
    const scope = parseScope(input);
    if (!scope) return null;
    const session = await this.prisma.agentSession.findFirst({
      where: { id: scope.sessionId, organizationId: scope.organizationId },
      select: {
        lifecycle: true,
        deletionFailureCode: true,
        createdByUserId: true,
      },
    });
    if (session) {
      if (!await isAuthorized(
        this.prisma,
        scope,
        session.createdByUserId,
      )) return null;
      return status(session.lifecycle, session.deletionFailureCode);
    }

    const binding = await this.prisma.agentSessionDeletionOperationBinding.findFirst({
      where: {
        organizationId: scope.organizationId,
        sessionId: scope.sessionId,
        operationRun: {
          checkpoints: { some: { kind: 'graph_deleted' } },
        },
      },
      select: {
        sessionCreatorUserId: true,
        deletionRequestedByUserId: true,
      },
      orderBy: [{ retryGeneration: 'desc' }, { createdAt: 'desc' }],
    });
    if (!binding) return null;
    if (!await isAuthorized(
      this.prisma,
      scope,
      binding.sessionCreatorUserId,
    )) return null;
    return { state: 'finalizing', failureCode: null };
  }
}

function parseScope(input: ScopedDeletionActor): {
  organizationId: string;
  actorUserId: string;
  sessionId: string;
} | null {
  try {
    const organizationId = OrganizationIdSchema.parse(input.organizationId);
    const actorUserId = UserIdSchema.parse(input.actorUserId);
    const session = parseAgentSessionName(
      input.session,
      formatOrganizationName(organizationId),
    );
    return { organizationId, actorUserId, sessionId: session.session };
  } catch {
    return null;
  }
}

async function isAuthorized(
  prisma: PrismaService,
  scope: { organizationId: string; actorUserId: string },
  creatorUserId: string,
): Promise<boolean> {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: scope.organizationId,
      userId: scope.actorUserId,
      status: 'active',
    },
    select: { role: true },
  });
  return Boolean(
    membership && (
      scope.actorUserId === creatorUserId ||
      membership.role === 'owner' ||
      membership.role === 'admin'
    ),
  );
}

function status(
  lifecycle: string,
  failureCode: string | null,
): AgentSessionDeletionStatus | null {
  const parsed = AgentSessionDeletionStatusSchema.safeParse({
    state: lifecycle,
    failureCode,
  });
  return parsed.success ? parsed.data : null;
}
