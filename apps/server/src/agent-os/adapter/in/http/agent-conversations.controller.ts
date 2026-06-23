import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { AgentConversationService } from '../../../application/service/agent-conversation.service';
import { AgentRunGraphService } from '../../../application/service/agent-run-graph.service';
import { SendAgentMessageDto } from './dto/agent-conversations.dto';

@Controller('agent-os/conversations')
export class AgentConversationsController {
  constructor(
    private readonly conversations: AgentConversationService,
    private readonly graph: AgentRunGraphService,
  ) {}

  @Get()
  async list(@CurrentOrganization() organizationId: string) {
    const items = await this.conversations.listConversations({ organizationId });
    return { items };
  }

  @Post()
  async create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: SendAgentMessageDto,
  ) {
    return this.conversations.startConversation({
      organizationId,
      userId: user.id,
      content: body.content,
    });
  }

  @Get(':id/messages')
  async messages(
    @CurrentOrganization() organizationId: string,
    @Param('id') conversationId: string,
  ) {
    const items = await this.conversations.listMessages({
      organizationId,
      conversationId,
    });
    return { items };
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: SendAgentMessageDto,
  ) {
    return this.conversations.sendMessage({
      organizationId,
      userId: user.id,
      conversationId,
      content: body.content,
    });
  }

  @Get(':id/graph')
  async getGraph(
    @CurrentOrganization() organizationId: string,
    @Param('id') conversationId: string,
  ) {
    return this.graph.getConversationGraph({ organizationId, conversationId });
  }

  @Post(':id/recommendations/:artifactId/order-draft')
  async createOrderDraft(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.conversations.createOrderDraftFromRecommendation({
      organizationId,
      userId: user.id,
      conversationId,
      artifactId,
    });
  }
}
