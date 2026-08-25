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
import {
  AGENT_WORK_INTAKE_PORT,
  AgentWorkIntakeError,
  type AgentWorkIntakePort,
} from '../../../../application/port/in/work/agent-work-intake.port';
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
    @Inject(AGENT_WORK_INTAKE_PORT)
    private readonly intake: AgentWorkIntakePort,
  ) {}

  @Get('sessions/:sessionId')
  async view(@Param('sessionId') sessionId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.queries.view({ sessionId, organizationId, userId: user.id });
  }

  @Post('start')
  async start(@Body() body: { objective: string; completionCriteria?: string; input?: unknown }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = StartInput.parse(body);
    try {
      return await this.intake.startRoot({
        principal: { organizationId, userId: user.id },
        objective: input.objective,
        completionCriteria: input.completionCriteria,
        input: input.input,
      });
    } catch (error) {
      rethrowIntakeError(error);
    }
  }

  @Post('sessions/:sessionId/tasks/:taskId/continue')
  async continue(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @Body() body: { predecessorAttemptId: string; prompt: string; reopen?: boolean }, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const input = ContinueInput.parse(body);
    try {
      return await this.intake.continue({
        principal: { organizationId, userId: user.id },
        sessionId,
        taskId,
        predecessorAttemptId: input.predecessorAttemptId,
        prompt: input.prompt,
        reopen: input.reopen,
      });
    } catch (error) {
      rethrowIntakeError(error);
    }
  }

  @Post('sessions/:sessionId/tasks/:taskId/cancel')
  async cancel(@Param('sessionId') sessionId: string, @Param('taskId') taskId: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    const transitioned = await this.commands.transition({ organizationId, sessionId, taskId, requestedByUserId: user.id, to: 'cancelled', at: new Date() });
    // The locked durable transition names every live Attempt it actually
    // cancelled. Cleanup is intentionally idempotent: terminal races may
    // already have revoked a token, but one failure must not skip another ID.
    await Promise.all((transitioned.cancelledAttemptIds ?? []).map(async (attemptId) => {
      try { await this.executor.interrupt(attemptId); } catch { /* terminal race after durable cancellation */ }
    }));
    return { status: transitioned.status };
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
}

function rethrowIntakeError(error: unknown): never {
  if (
    error instanceof AgentWorkIntakeError
    && (error.code === 'operator_agent_version_not_found' || error.code === 'agent_version_not_found')
  ) {
    throw new NotFoundException(error.code);
  }
  throw error;
}
