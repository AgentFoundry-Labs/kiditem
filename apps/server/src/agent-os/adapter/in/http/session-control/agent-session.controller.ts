import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../../auth/decorators/roles.decorator';
import {
  AGENT_SESSION_APPROVAL_DECISION_PORT,
  type AgentSessionApprovalDecisionPort,
} from '../../../../application/port/in/session-control/agent-session-approval-decision.port';
import {
  AGENT_SESSION_TASK_CONTROL_PORT,
  type AgentSessionTaskControlPort,
} from '../../../../application/port/in/session-control/agent-session-task-control.port';
import {
  CancelAgentSessionTaskDto,
  DecideAgentSessionApprovalDto,
  TaskControlDto,
} from './dto/agent-session.dto';
import type { AuthUser } from '../../../../../auth/auth.types';

@Controller('agent-os/sessions')
export class AgentSessionController {
  constructor(
    @Inject(AGENT_SESSION_TASK_CONTROL_PORT)
    private readonly tasks: AgentSessionTaskControlPort,
    @Inject(AGENT_SESSION_APPROVAL_DECISION_PORT)
    private readonly approvals: AgentSessionApprovalDecisionPort,
  ) {}

  @Get(':sessionId/tasks/:taskId')
  async inspect(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
  ) {
    const names = taskNames(organizationId, sessionId, taskId);
    return this.tasks.inspect({
      organizationId,
      actorId: user.id,
      ...names,
    });
  }

  @Post(':sessionId/approvals/:approvalId/decision')
  @Roles('owner', 'admin')
  async decideApproval(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: DecideAgentSessionApprovalDto,
  ) {
    return this.approvals.decide({
      organizationId,
      session: sessionName(organizationId, sessionId),
      approvalId,
      actorId: user.id,
      decision: body.decision,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post(':sessionId/tasks/:taskId/retry')
  @Roles('owner', 'admin')
  async retry(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
    @Body() body: TaskControlDto,
  ) {
    const names = taskNames(organizationId, sessionId, taskId);
    return this.tasks.retry({
      organizationId,
      actorId: user.id,
      ...names,
      idempotencyKey: body.idempotencyKey,
      expectedStatus: body.expectedStatus,
    });
  }

  @Post(':sessionId/tasks/:taskId/resume')
  @Roles('owner', 'admin')
  async resume(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
    @Body() body: TaskControlDto,
  ) {
    const names = taskNames(organizationId, sessionId, taskId);
    return this.tasks.resume({
      organizationId,
      actorId: user.id,
      ...names,
      idempotencyKey: body.idempotencyKey,
      expectedStatus: body.expectedStatus,
    });
  }

  @Post(':sessionId/tasks/:taskId/cancel')
  @Roles('owner', 'admin')
  async cancel(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
    @Body() body: CancelAgentSessionTaskDto,
  ) {
    const names = taskNames(organizationId, sessionId, taskId);
    return this.tasks.cancel({
      organizationId,
      actorId: user.id,
      ...names,
      idempotencyKey: body.idempotencyKey,
      expectedStatus: body.expectedStatus,
      reason: body.reason ?? null,
    });
  }
}

function sessionName(organizationId: string, sessionId: string) {
  return formatAgentSessionName(
    OrganizationIdSchema.parse(organizationId),
    AgentSessionIdSchema.parse(sessionId),
  );
}

function taskNames(organizationId: string, sessionId: string, taskId: string) {
  const session = sessionName(organizationId, sessionId);
  return {
    session,
    task: formatAgentSessionTaskName(
      OrganizationIdSchema.parse(organizationId),
      AgentSessionIdSchema.parse(sessionId),
      AgentSessionTaskIdSchema.parse(taskId),
    ),
  };
}
