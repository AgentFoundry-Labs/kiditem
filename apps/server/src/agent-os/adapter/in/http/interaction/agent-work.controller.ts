import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AGENT_WORK_QUERY_PORT, type AgentWorkQueryPort } from '../../../../application/port/in/work/agent-work-query.port';
import { AGENT_WORK_COMMAND_PORT, type AgentWorkCommandPort } from '../../../../application/port/in/work/agent-work-command.port';
import {
  LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
  type LiveAttemptExecutionCapabilityPort,
} from '../../../../application/port/in/capability/live-attempt-execution.capability.port';
import { z } from 'zod';

const StartInput = z.object({ objective: z.string().trim().min(1).max(8_000), completionCriteria: z.string().trim().min(1).max(4_000).optional(), input: z.unknown().optional() }).strict();
const ContinueInput = z.object({ predecessorAttemptId: z.string().uuid(), prompt: z.string().trim().min(1).max(8_000), reopen: z.boolean().optional() }).strict();
const ApprovalInput = z.object({ invocationId: z.string().uuid(), inputHash: z.string().min(1).max(128), decision: z.enum(['approved', 'rejected']), reason: z.string().max(1_000).optional() }).strict();

/** Same-origin durable Work transport. It never reads or persists chat history. */
@Controller('agent-work')
export class AgentWorkController {
  constructor(
    @Inject(AGENT_WORK_QUERY_PORT) private readonly queries: AgentWorkQueryPort,
    @Inject(AGENT_WORK_COMMAND_PORT) private readonly commands: AgentWorkCommandPort,
    @Inject(LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT)
    private readonly executor: LiveAttemptExecutionCapabilityPort,
  ) {}

  @Get('sessions/:sessionId')
  async projection(@Param('sessionId') sessionId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.queries.projection({ sessionId, organizationId, userId: user.id });
  }

  @Post('start')
  async start(@Body() body: { objective: string; completionCriteria?: string; input?: unknown }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = StartInput.parse(body);
    const version = await this.queries.activeVersion('operator');
    if (!version) throw new NotFoundException('operator_agent_version_not_found');
    const runtime = requiredRuntimeConfig('operator');
    const admitted = await this.commands.root({ organizationId, createdByUserId: user.id, assignedAgentVersionId: version.id, objective: input.objective, completionCriteria: input.completionCriteria ?? 'Provide a concise durable result.', inputResourceRefs: [], input: input.input ?? { prompt: input.objective }, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
    await this.startAttempt({ attemptId: admitted.attempt.id, sessionId: admitted.session.id, taskId: admitted.task.id, organizationId, userId: user.id, version, prompt: input.objective });
    return admitted;
  }

  @Post('sessions/:sessionId/tasks/:taskId/continue')
  async continue(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @Body() body: { predecessorAttemptId: string; prompt: string; reopen?: boolean }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = ContinueInput.parse(body);
    const version = await this.queries.taskVersion({ organizationId, userId: user.id, sessionId, taskId });
    if (!version) throw new NotFoundException('agent_version_not_found');
    const runtime = requiredRuntimeConfig(version.agentDefinitionKey);
    const context = await this.queries.continuationContext({ organizationId, userId: user.id, sessionId, taskId, prompt: input.prompt });
    const admitted = await this.commands.followUp({ organizationId, sessionId, taskId, requestedByUserId: user.id, predecessorAttemptId: input.predecessorAttemptId, intent: input.reopen ? 'reopen' : 'follow_up', input: context.input, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
    await this.startAttempt({ attemptId: admitted.attemptId, sessionId, taskId, organizationId, userId: user.id, version, prompt: context.prompt });
    return admitted;
  }

  @Post('sessions/:sessionId/tasks/:taskId/cancel')
  async cancel(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const live = await this.queries.liveAttempt({ organizationId, sessionId, taskId, userId: user.id });
    const transitioned = await this.commands.transition({ organizationId, sessionId, taskId, requestedByUserId: user.id, to: 'cancelled', at: new Date() });
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
    return this.commands.decide({ organizationId, sessionId, approvalId, invocationId: input.invocationId, inputHash: input.inputHash, decision: input.decision, decidedByUserId: user.id, decisionReason: input.reason, decidedAt: new Date() });
  }

  @Post('sessions/:sessionId/tasks/:taskId/attempts/:attemptId/interrupt')
  async interrupt(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @Param('attemptId') attemptId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const owned = await this.queries.liveAttempt({ attemptId, sessionId, taskId, organizationId, userId: user.id });
    if (!owned) throw new NotFoundException('live_attempt_not_found');
    await this.executor.interrupt(attemptId);
    return { interrupted: true };
  }

  @Post('sessions/:sessionId/delete')
  delete(@Param('sessionId') sessionId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.commands.delete({ organizationId, sessionId, deletedByUserId: user.id });
  }

  private async startAttempt(input: { attemptId: string; sessionId: string; taskId: string; organizationId: string; userId: string; version: { id: string; agentDefinitionKey: string; runtimeType: string; capabilityKeys: unknown; instructionProfileRef: string }; prompt: string }) {
    if (input.version.runtimeType !== 'codex_cli' && input.version.runtimeType !== 'claude_cli') throw new Error('attempt_runtime_not_supported');
    await this.executor.start({ attemptId: input.attemptId, runtime: input.version.runtimeType, profile: requiredRuntimeConfig(input.version.agentDefinitionKey), prompt: input.prompt, instructionProfileRef: input.version.instructionProfileRef, mcp: { attemptId: input.attemptId, sessionId: input.sessionId, taskId: input.taskId, agentVersionId: input.version.id, organizationId: input.organizationId, userId: input.userId, capabilityKeys: Array.isArray(input.version.capabilityKeys) ? input.version.capabilityKeys.filter((key): key is string => typeof key === 'string') : [] } });
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
