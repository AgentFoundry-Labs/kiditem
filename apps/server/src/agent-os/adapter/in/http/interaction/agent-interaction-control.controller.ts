import {
  Body,
  Controller,
  Inject,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AgentConversationConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  DashboardContextSchema,
} from '@kiditem/shared/agent-interaction';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import { ServiceAuth } from '../../../../../auth/decorators/service-auth.decorator';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import {
  AGENT_INTERACTION_AUTHORIZATION_PORT,
  type AgentInteractionAuthorizationPort,
} from '../../../../application/port/in/interaction/agent-interaction-authorization.port';
import {
  AuthorizeCurrentInteractionRunDto,
  AuthorizeInteractionConnectionDto,
  AuthorizeInteractionRunDto,
} from './dto/agent-interaction.dto';
import { interactionHttpCall } from './interaction-http-error';
import { InteractionGatewayGuard } from './interaction-gateway.guard';
import type { AuthUser } from '../../../../../auth/auth.types';

@Controller('agent-os/interaction')
@UseGuards(InteractionGatewayGuard)
export class AgentInteractionControlController {
  constructor(
    @Inject(AGENT_INTERACTION_AUTHORIZATION_PORT)
    private readonly interactions: AgentInteractionAuthorizationPort,
  ) {}

  @Post('runs/authorize')
  @ServiceAuth()
  async authorizeRun(@Body() dto: AuthorizeInteractionRunDto) {
    return interactionHttpCall(async () => {
      const result = await this.interactions.authorizeRun({
        runIntent: dto.runIntent,
        copilotThreadId: dto.copilotThreadId,
        aguiRunId: dto.aguiRunId,
        dashboardContext: DashboardContextSchema.parse(dto.dashboardContext),
        userEvent: dto.userEvent,
      });
      return AguiRunAuthorizationSchema.parse(result);
    });
  }

  @Post('connections/authorize')
  async authorizeConnection(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AuthorizeInteractionConnectionDto,
  ) {
    return interactionHttpCall(async () => {
      const result = await this.interactions.authorizeConnection({
        organizationId,
        userId: user.id,
        copilotThreadId: dto.copilotThreadId,
        cursor: dto.cursor ?? null,
      });
      return AgentConversationConnectionAuthorizationSchema.parse(result);
    });
  }

  @Post('connections/current-run')
  async authorizeCurrentRun(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AuthorizeCurrentInteractionRunDto,
  ) {
    return interactionHttpCall(() => this.interactions.authorizeCurrentRun({
      organizationId,
      userId: user.id,
      agentDefinitionKey: dto.agentDefinitionKey,
      copilotThreadId: dto.copilotThreadId,
    }));
  }

  @Get('health')
  @SkipAuth()
  async health() {
    return interactionHttpCall(async () => {
      await this.interactions.health();
      return { status: 'ok' as const };
    });
  }
}
