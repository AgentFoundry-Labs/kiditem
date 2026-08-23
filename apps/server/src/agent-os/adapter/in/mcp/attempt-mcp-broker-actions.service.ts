import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentCapabilityInvocationService } from '../../../application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from '../../../application/service/work/agent-task-delegation.service';
import { AgentLiveMessageService } from '../../../application/service/work/agent-live-message.service';
import { AttemptLiveControlRegistry } from '../../out/runtime/attempt/attempt-live-control.registry';
import type { AttemptMcpBrokerActions } from './attempt-mcp-broker.service';

/** Adapts socket-bound Attempt authority to Task 2's durable admission services. */
@Injectable()
export class AttemptMcpBrokerActionsService implements AttemptMcpBrokerActions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invocations: AgentCapabilityInvocationService,
    private readonly delegation: AgentTaskDelegationService,
    private readonly liveMessages: AgentLiveMessageService,
    private readonly controls: AttemptLiveControlRegistry,
  ) {}

  async invoke(input: Parameters<AttemptMcpBrokerActions['invoke']>[0]): Promise<unknown> {
    return this.invocations.authorize({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      agentVersionId: input.binding.agentVersionId,
      initiatingUserId: input.binding.userId,
      capabilityKey: input.capabilityKey,
      authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date(Date.now() + 30 * 60 * 1_000),
      ownerIdempotencyKey: input.invocationId,
      input: input.input,
    });
  }

  async delegate(input: Parameters<AttemptMcpBrokerActions['delegate']>[0]): Promise<unknown> {
    const [attempt, target] = await Promise.all([
      this.prisma.agentAttempt.findFirst({
        where: { id: input.binding.attemptId, organizationId: input.binding.organizationId, sessionId: input.binding.sessionId, taskId: input.binding.taskId },
        select: { input: true, applicationVersion: true, authorizingGitSha: true, cliVersion: true, reportedModel: true },
      }),
      this.prisma.agentWorkVersion.findFirst({
        where: { agentDefinitionKey: input.targetAgentKey, activatedAt: { not: null }, retiredAt: null },
        select: { id: true },
      }),
    ]);
    if (!attempt || !target) throw new Error('attempt_mcp_delegation_target_unavailable');
    return this.delegation.delegate({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      parentTaskId: input.binding.taskId,
      delegatingAttemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId,
      targetAgentVersionId: target.id,
      objective: input.objective,
      completionCriteria: input.objective,
      inputResourceRefs: [],
      idempotencyKey: `attempt:${input.binding.attemptId}:delegate:${input.targetAgentKey}:${input.objective}`,
      input: attempt.input,
      applicationVersion: attempt.applicationVersion,
      authorizingGitSha: attempt.authorizingGitSha,
      cliVersion: attempt.cliVersion,
      ...(attempt.reportedModel ? { reportedModel: attempt.reportedModel } : {}),
    });
  }

  async child(input: Parameters<AttemptMcpBrokerActions['child']>[0]): Promise<unknown> {
    const child = await this.prisma.agentWorkTask.findFirst({
      where: { id: input.childTaskId, organizationId: input.binding.organizationId, sessionId: input.binding.sessionId, parentTaskId: input.binding.taskId },
      include: { attempts: { orderBy: { ordinal: 'desc' }, take: 1, select: { id: true, status: true } } },
    });
    if (!child) throw new Error('attempt_mcp_child_not_found');
    const attempt = child.attempts[0];
    if (!attempt) throw new Error('attempt_mcp_child_not_started');
    if (input.action === 'message') {
      await this.liveMessages.send({ organizationId: input.binding.organizationId, requestedByUserId: input.binding.userId, sessionId: input.binding.sessionId, taskId: child.id, attemptId: attempt.id, content: input.message ?? '' });
      return { childTaskId: child.id, status: child.status };
    }
    if (input.action === 'interrupt') {
      await this.controls.get(attempt.id)?.interrupt();
      return { childTaskId: child.id, status: child.status };
    }
    return { childTaskId: child.id, attemptId: attempt.id, status: child.status, attemptStatus: attempt.status };
  }
}
