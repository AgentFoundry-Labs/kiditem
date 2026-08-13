import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { AgentInteractionPresentationService } from '../../../application/service/agent-interaction-presentation.service';
import { AuthorizeInteractionNavigationDto } from './dto/agent-interaction.dto';
import { interactionHttpCall } from './interaction-http-error';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('agent-os/interaction/actions')
export class AgentInteractionActionsController {
  constructor(private readonly presentation: AgentInteractionPresentationService) {}

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
