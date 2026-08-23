import {
  AgentWorkTaskStatusSchema,
  type AgentWorkTaskStatus,
} from "@kiditem/shared/agent-interaction";
import type { PrismaClient } from "@prisma/client";
import type {
  AgentWorkProjection,
  AgentWorkRepositoryPort,
  OrganizationScopedId,
} from "../../../../application/port/out/work/agent-work-repository.port";

export class PrismaAgentWorkRepository implements AgentWorkRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async loadProjection(
    input: OrganizationScopedId,
  ): Promise<AgentWorkProjection | null> {
    const session = await this.prisma.agentWorkSession.findFirst({
      where: input,
      include: { tasks: true },
    });
    if (!session) return null;
    return {
      session: { id: session.id, organizationId: session.organizationId },
      tasks: session.tasks.map((task) => ({
        id: task.id,
        organizationId: task.organizationId,
        sessionId: task.sessionId,
        status: AgentWorkTaskStatusSchema.parse(task.status),
      })),
    };
  }

  async findDelegationReplay(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    idempotencyKey: string;
    requestedByUserId: string;
  }): Promise<{
    childTaskId: string;
    requestHash: string | null;
    firstAttemptId: string | null;
  } | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.requestedByUserId,
        status: "active",
      },
    });
    if (!membership) return null;
    const task = await this.prisma.agentWorkTask.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        parentTaskId: input.parentTaskId,
        delegationIdempotencyKey: input.idempotencyKey,
        session: { createdByUserId: input.requestedByUserId },
      },
      include: { attempts: { orderBy: { ordinal: "asc" }, take: 1 } },
    });
    return task
      ? {
          childTaskId: task.id,
          requestHash: task.delegationRequestHash,
          firstAttemptId: task.attempts[0]?.id ?? null,
        }
      : null;
  }

  async loadLiveAttempt(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    requestedByUserId: string;
  }): Promise<{ taskStatus: AgentWorkTaskStatus; live: boolean } | null> {
    const [attempt, membership] = await Promise.all([
      this.prisma.agentAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          session: { createdByUserId: input.requestedByUserId },
        },
        include: { task: { select: { status: true } } },
      }),
      this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.requestedByUserId,
          status: "active",
        },
      }),
    ]);
    if (!attempt || !membership) return null;
    return {
      taskStatus: AgentWorkTaskStatusSchema.parse(attempt.task.status),
      live: ["starting", "running"].includes(attempt.status),
    };
  }

  async loadAttemptMcpDelegationContext(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    requestedByUserId: string;
    targetAgentKey: string;
  }) {
    const [attempt, target] = await Promise.all([
      this.prisma.agentAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          session: { createdByUserId: input.requestedByUserId },
        },
        select: {
          input: true,
          applicationVersion: true,
          authorizingGitSha: true,
          cliVersion: true,
          reportedModel: true,
        },
      }),
      this.prisma.agentWorkVersion.findFirst({
        where: {
          agentDefinitionKey: input.targetAgentKey,
          activatedAt: { not: null },
          retiredAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!attempt || !target) return null;
    return {
      input: attempt.input,
      applicationVersion: attempt.applicationVersion,
      authorizingGitSha: attempt.authorizingGitSha,
      cliVersion: attempt.cliVersion,
      reportedModel: attempt.reportedModel,
      targetAgentVersionId: target.id,
    };
  }

  async loadAttemptMcpChild(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    childTaskId: string;
    requestedByUserId: string;
  }) {
    const [child, membership] = await Promise.all([
      this.prisma.agentWorkTask.findFirst({
        where: {
          id: input.childTaskId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          session: { createdByUserId: input.requestedByUserId },
        },
        include: {
          attempts: {
            orderBy: { ordinal: 'desc' },
            take: 1,
            select: { id: true, status: true },
          },
        },
      }),
      this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.requestedByUserId,
          status: 'active',
        },
        select: { id: true },
      }),
    ]);
    if (!child || !membership) return null;
    const attempt = child.attempts[0] ?? null;
    return {
      childTaskId: child.id,
      taskStatus: AgentWorkTaskStatusSchema.parse(child.status),
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      live: Boolean(attempt && ['starting', 'running'].includes(attempt.status)),
    };
  }
}
