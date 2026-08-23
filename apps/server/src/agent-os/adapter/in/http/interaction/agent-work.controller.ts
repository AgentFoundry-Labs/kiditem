import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentAttemptAdmissionService } from '../../../../application/service/work/agent-attempt-admission.service';
import { AgentCapabilityApprovalService } from '../../../../application/service/work/agent-capability-approval.service';
import { AgentSessionTerminalDeleteService } from '../../../../application/service/work/agent-session-terminal-delete.service';
import { AgentTaskLifecycleService } from '../../../../application/service/work/agent-task-lifecycle.service';
import { AgentWorkProjectionService } from '../../../../application/service/work/agent-work-projection.service';
import { AgentAttemptExecutorService } from '../../../../adapter/out/runtime/attempt/agent-attempt-executor.service';
import { z } from 'zod';

const StartInput = z.object({ objective: z.string().trim().min(1).max(8_000), completionCriteria: z.string().trim().min(1).max(4_000).optional(), input: z.unknown().optional() }).strict();
const ContinueInput = z.object({ predecessorAttemptId: z.string().uuid(), prompt: z.string().max(8_000).optional(), reopen: z.boolean().optional() }).strict();
const ApprovalInput = z.object({ invocationId: z.string().uuid(), inputHash: z.string().min(1).max(128), decision: z.enum(['approved', 'rejected']), reason: z.string().max(1_000).optional() }).strict();

/** Same-origin durable Work transport. It never reads or persists chat history. */
@Controller('agent-work')
export class AgentWorkController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admissions: AgentAttemptAdmissionService,
    private readonly approvals: AgentCapabilityApprovalService,
    private readonly tasks: AgentTaskLifecycleService,
    private readonly deletion: AgentSessionTerminalDeleteService,
    private readonly presentation: AgentWorkProjectionService,
    private readonly executor: AgentAttemptExecutorService,
  ) {}

  @Get('sessions/:sessionId')
  async projection(@Param('sessionId') sessionId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, organizationId, createdByUserId: user.id },
      include: {
        tasks: {
          include: {
            attempts: { orderBy: { ordinal: 'desc' }, take: 1 },
            invocations: { include: { approval: true }, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) throw new NotFoundException('agent_session_not_found');
    return {
      session: { id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt },
      tasks: session.tasks.map((task) => {
        const latest = task.attempts[0] ?? null;
        const approval = task.invocations.map((item) => item.approval).find((item) => item?.status === 'pending') ?? null;
        const results = task.invocations.flatMap((item) => item.result && typeof item.result === 'object' ? [item.result as { operationRefs?: unknown; resourceRefs?: unknown }] : []);
        const result = latest?.result && typeof latest.result === 'object' ? latest.result as { needsInput?: unknown; summary?: unknown; resourceRefs?: unknown; operationRefs?: unknown } : null;
        const children = session.tasks.filter((candidate) => candidate.parentTaskId === task.id);
        return {
          id: task.id, parentTaskId: task.parentTaskId, objective: task.objective, completionCriteria: task.completionCriteria,
          status: task.status, latestAttempt: latest && { id: latest.id, ordinal: latest.ordinal, status: latest.status, result: latest.result },
          approval: approval && { id: approval.id, invocationId: approval.invocationId, inputHash: approval.inputHash, status: approval.status, expiresAt: approval.expiresAt },
          summary: typeof result?.summary === 'string' ? result.summary : null,
          operationRefs: [...results.flatMap((item) => Array.isArray(item.operationRefs) ? item.operationRefs : []), ...(Array.isArray(result?.operationRefs) ? result.operationRefs : [])],
          resourceRefs: [...results.flatMap((item) => Array.isArray(item.resourceRefs) ? item.resourceRefs : []), ...(Array.isArray(result?.resourceRefs) ? result.resourceRefs : [])],
          presentation: this.presentation.project({ taskStatus: task.status as 'open' | 'completed' | 'failed' | 'cancelled', hasLiveAttempt: Boolean(latest && ['starting', 'running'].includes(latest.status)), hasPendingApproval: Boolean(approval), hasReadyOrExecutingMutation: task.invocations.some((item) => ['ready', 'executing'].includes(item.status)), hasLiveChild: children.some((child) => child.status === 'open'), needsInput: Boolean(result?.needsInput), lastAttemptFailed: latest?.status === 'failed' }),
        };
      }),
    };
  }

  @Post('start')
  async start(@Body() body: { objective: string; completionCriteria?: string; input?: unknown }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = StartInput.parse(body);
    const version = await this.prisma.agentVersion.findFirst({ where: { agentDefinitionKey: 'operator', activatedAt: { not: null }, retiredAt: null }, orderBy: { activatedAt: 'desc' } });
    if (!version) throw new NotFoundException('operator_agent_version_not_found');
    const runtime = requiredRuntimeConfig('operator');
    const admitted = await this.admissions.root({ organizationId, createdByUserId: user.id, assignedAgentVersionId: version.id, objective: input.objective, completionCriteria: input.completionCriteria ?? 'Provide a concise durable result.', inputResourceRefs: [], input: input.input ?? { prompt: input.objective }, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
    await this.startAttempt({ attemptId: admitted.attempt.id, sessionId: admitted.session.id, taskId: admitted.task.id, organizationId, userId: user.id, version, prompt: input.objective });
    return admitted;
  }

  @Post('sessions/:sessionId/tasks/:taskId/continue')
  async continue(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @Body() body: { predecessorAttemptId: string; prompt?: string; reopen?: boolean }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = ContinueInput.parse(body);
    const runtime = requiredRuntimeConfig('operator');
    const admitted = await this.admissions.followUp({ organizationId, sessionId, taskId, requestedByUserId: user.id, predecessorAttemptId: input.predecessorAttemptId, intent: input.reopen ? 'reopen' : 'follow_up', input: { prompt: input.prompt ?? '' }, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
    const version = await this.prisma.agentVersion.findFirst({ where: { id: (await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId }, select: { assignedAgentVersionId: true } })).assignedAgentVersionId } });
    if (!version) throw new NotFoundException('agent_version_not_found');
    await this.startAttempt({ attemptId: admitted.attemptId, sessionId, taskId, organizationId, userId: user.id, version, prompt: input.prompt ?? '' });
    return admitted;
  }

  @Post('sessions/:sessionId/tasks/:taskId/cancel')
  async cancel(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const live = await this.prisma.agentAttempt.findFirst({
      where: { organizationId, sessionId, taskId, session: { createdByUserId: user.id }, status: { in: ['starting', 'running'] } },
      select: { id: true },
    });
    const transitioned = await this.tasks.transition({ organizationId, sessionId, taskId, requestedByUserId: user.id, to: 'cancelled', at: new Date() });
    // The durable transaction wins first.  Only an API-owned live CLI is
    // interrupted; ready/executing worker mutations deliberately keep running.
    if (live) {
      try { await this.executor.interrupt(live.id); } catch { /* terminal race after durable cancellation */ }
    }
    return transitioned;
  }

  @Post('sessions/:sessionId/approvals/:approvalId')
  decide(@Param('sessionId') sessionId: string, @Param('approvalId') approvalId: string, @Body() body: { invocationId: string; inputHash: string; decision: 'approved' | 'rejected'; reason?: string }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = ApprovalInput.parse(body);
    return this.approvals.decide({ organizationId, sessionId, approvalId, invocationId: input.invocationId, inputHash: input.inputHash, decision: input.decision, decidedByUserId: user.id, decisionReason: input.reason, decidedAt: new Date() });
  }

  @Post('sessions/:sessionId/tasks/:taskId/attempts/:attemptId/interrupt')
  async interrupt(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @Param('attemptId') attemptId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const owned = await this.prisma.agentAttempt.findFirst({ where: { id: attemptId, sessionId, taskId, organizationId, session: { createdByUserId: user.id }, status: { in: ['starting', 'running'] } }, select: { id: true } });
    if (!owned) throw new NotFoundException('live_attempt_not_found');
    await this.executor.interrupt(attemptId);
    return { interrupted: true };
  }

  @Post('sessions/:sessionId/delete')
  delete(@Param('sessionId') sessionId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.deletion.delete({ organizationId, sessionId, deletedByUserId: user.id });
  }

  private async startAttempt(input: { attemptId: string; sessionId: string; taskId: string; organizationId: string; userId: string; version: { id: string; runtimeType: string; capabilityKeys: unknown }; prompt: string }) {
    if (input.version.runtimeType !== 'codex_cli' && input.version.runtimeType !== 'claude_cli') throw new Error('attempt_runtime_not_supported');
    await this.executor.start({ attemptId: input.attemptId, runtime: input.version.runtimeType, profile: requiredRuntimeConfig('operator'), prompt: input.prompt, mcp: { attemptId: input.attemptId, sessionId: input.sessionId, taskId: input.taskId, agentVersionId: input.version.id, organizationId: input.organizationId, userId: input.userId, capabilityKeys: Array.isArray(input.version.capabilityKeys) ? input.version.capabilityKeys.filter((key): key is string => typeof key === 'string') : [] } });
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_configuration:${name}`);
  return value;
}

function requiredRuntimeConfig(definitionKey: string): { model: string; loginHome: string } {
  return { model: requiredEnvironment(`AGENT_${definitionKey.toUpperCase()}_MODEL`), loginHome: requiredEnvironment('KIDITEM_ATTEMPT_LOGIN_HOME') };
}
