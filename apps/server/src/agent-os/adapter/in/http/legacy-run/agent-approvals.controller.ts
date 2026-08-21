import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../../auth/decorators/roles.decorator';
import { LEGACY_AGENT_APPROVAL_PORT, type LegacyAgentApprovalPort } from '../../../../application/port/in/legacy-run/legacy-agent-run.port';
import type { AgentApprovalStatus } from '../../../../domain/agent-os.types';
import {
  ListAgentApprovalsQueryDto,
  ResolveAgentApprovalDto,
} from './dto/agent-approvals.dto';

@Controller('agent-os/approvals')
export class AgentApprovalsController {
  constructor(@Inject(LEGACY_AGENT_APPROVAL_PORT) private readonly approvals: LegacyAgentApprovalPort) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListAgentApprovalsQueryDto,
  ) {
    const items = await this.approvals.listApprovals({
      organizationId,
      agentInstanceId: query.agentInstanceId ?? null,
      status: query.status ? (query.status.split(',') as AgentApprovalStatus[]) : null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return { items };
  }

  @Post(':id/resolve')
  @Roles('owner', 'admin')
  async resolve(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') approvalRequestId: string,
    @Body() body: ResolveAgentApprovalDto,
  ) {
    return this.approvals.resolveApproval({
      organizationId,
      userId: user.id,
      actorRole: user.role,
      approvalRequestId,
      status: body.status,
      decisionReason: body.decisionReason,
    });
  }
}
