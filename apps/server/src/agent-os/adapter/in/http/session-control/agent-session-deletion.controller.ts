import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AgentSessionIdSchema,
  formatAgentSessionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import {
  AGENT_SESSION_DELETION_PORT,
  type AgentSessionDeletionPort,
} from '../../../../application/port/in/session-control/agent-session-deletion.port';

@Controller('agent-os/sessions')
export class AgentSessionDeletionController {
  constructor(
    @Inject(AGENT_SESSION_DELETION_PORT)
    private readonly deletion: AgentSessionDeletionPort,
  ) {}

  @Delete(':sessionId')
  async requestDelete(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.deletion.request(deletionScope(organizationId, user, sessionId));
    response.status(result ? HttpStatus.ACCEPTED : HttpStatus.NO_CONTENT);
    return result ?? undefined;
  }

  @Get(':sessionId/deletion')
  async status(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.deletion.status(deletionScope(organizationId, user, sessionId));
    response.status(result ? HttpStatus.OK : HttpStatus.NO_CONTENT);
    return result ?? undefined;
  }

  @Post(':sessionId/deletion/retry')
  async retry(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.deletion.retry(deletionScope(organizationId, user, sessionId));
    response.status(result ? HttpStatus.ACCEPTED : HttpStatus.NO_CONTENT);
    return result ?? undefined;
  }
}

function deletionScope(organizationId: string, user: AuthUser, sessionId: string) {
  const organization = OrganizationIdSchema.parse(organizationId);
  return {
    organizationId,
    actorUserId: user.id,
    session: formatAgentSessionName(organization, AgentSessionIdSchema.parse(sessionId)),
  };
}
