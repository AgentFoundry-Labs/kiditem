import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import {
  AguiRunIntentSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
} from '@kiditem/shared/agent-interaction';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import {
  AGENT_INTERACTION_BOOTSTRAP_PORT,
  type AgentInteractionBootstrapPort,
} from '../../../../application/port/in/interaction/agent-interaction-bootstrap.port';
import { PrepareInteractionRunIntentDto } from './dto/agent-interaction.dto';
import { interactionHttpCall } from './interaction-http-error';
import type { AuthUser } from '../../../../../auth/auth.types';

@Controller('agent-os/interaction')
export class AgentInteractionBootstrapController {
  constructor(
    @Inject(AGENT_INTERACTION_BOOTSTRAP_PORT)
    private readonly interactions: AgentInteractionBootstrapPort,
  ) {}

  @Get('bootstrap')
  async bootstrap(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
  ) {
    return interactionHttpCall(async () => {
      const result = await this.interactions.bootstrap({
        organizationId,
        userId: user.id,
      });
      return InteractionBootstrapSchema.parse(result);
    });
  }

  @Post('runs/intent')
  async prepareRunIntent(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: PrepareInteractionRunIntentDto,
  ) {
    return interactionHttpCall(async () => {
      const result = await this.interactions.prepareRunIntent({
        organizationId,
        userId: user.id,
        agentDefinitionKey: dto.agentDefinitionKey,
        copilotThreadId: dto.copilotThreadId,
        aguiRunId: dto.aguiRunId,
        dashboardContext: DashboardContextSchema.parse(dto.dashboardContext),
        userEvent: dto.userEvent,
      });
      return AguiRunIntentSchema.parse(result);
    });
  }
}
