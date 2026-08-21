import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import {
  AGENT_INTERACTION_PRESENTATION_PORT,
  type AgentInteractionPresentationPort,
} from '../../../../application/port/in/interaction/agent-interaction-presentation.port';
import { AuthorizeInteractionNavigationDto } from './dto/agent-interaction.dto';
import { interactionHttpCall } from './interaction-http-error';
import type { AuthUser } from '../../../../../auth/auth.types';

@Controller('agent-os/interaction/actions')
export class AgentInteractionActionsController {
  constructor(
    @Inject(AGENT_INTERACTION_PRESENTATION_PORT)
    private readonly presentation: AgentInteractionPresentationPort,
  ) {}

  @Post('authorize')
  authorize(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AuthorizeInteractionNavigationDto,
  ) {
    return interactionHttpCall(() => this.presentation.authorize({
      organizationId,
      userId: user.id,
      sessionId: null,
    }, dto.actionId));
  }
}
