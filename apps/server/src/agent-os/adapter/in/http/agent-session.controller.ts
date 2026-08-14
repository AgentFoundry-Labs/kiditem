import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { AgentSessionApprovalService } from '../../../application/service/agent-session-approval.service';
import { AgentSessionCancellationService } from '../../../application/service/agent-session-cancellation.service';
import { AgentSessionExecutionService } from '../../../application/service/agent-session-execution.service';
import {
  CancelAgentSessionTaskDto,
  DecideAgentSessionApprovalDto,
  TaskControlDto,
} from './dto/agent-session.dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('agent-os/sessions')
export class AgentSessionController {
  constructor(
    private readonly runtime: AgentSessionExecutionService,
    private readonly approvals: AgentSessionApprovalService,
    private readonly cancellations: AgentSessionCancellationService,
  ) {}

  @Get(':sessionId/tasks/:taskId')
  async inspect(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
  ) {
    const names = taskNames(organizationId, sessionId, taskId);
    return this.runtime.inspect({
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
    return this.runtime.retry({
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
    return this.runtime.resume({
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
    return this.cancellations.cancel({
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
