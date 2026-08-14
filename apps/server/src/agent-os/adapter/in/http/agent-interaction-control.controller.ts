import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AgentConversationConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  DashboardContextSchema,
} from '@kiditem/shared/agent-interaction';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { ServiceAuth } from '../../../../auth/decorators/service-auth.decorator';
import { SkipAuth } from '../../../../auth/decorators/skip-auth.decorator';
import { AgentInteractionIdentityService } from '../../../application/service/agent-interaction-identity.service';
import {
  AuthorizeInteractionConnectionDto,
  AuthorizeInteractionRunDto,
} from './dto/agent-interaction.dto';
import { interactionHttpCall } from './interaction-http-error';
import { InteractionGatewayGuard } from './interaction-gateway.guard';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('agent-os/interaction')
@UseGuards(InteractionGatewayGuard)
export class AgentInteractionControlController {
  constructor(private readonly identity: AgentInteractionIdentityService) {}

  @Post('runs/authorize')
  @ServiceAuth()
  async authorizeRun(@Body() dto: AuthorizeInteractionRunDto) {
    return interactionHttpCall(async () => {
      const result = await this.identity.authorizeRun({
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
      const result = await this.identity.authorizeConnection({
        organizationId,
        userId: user.id,
        copilotThreadId: dto.copilotThreadId,
        cursor: dto.cursor ?? null,
      });
      return AgentConversationConnectionAuthorizationSchema.parse(result);
    });
  }

  @Get('health')
  @SkipAuth()
  async health() {
    return interactionHttpCall(async () => {
      await this.identity.health();
      return { status: 'ok' as const };
    });
  }
}
