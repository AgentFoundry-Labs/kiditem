import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  Put,
} from '@nestjs/common';
import {
  ConversationIdSchema,
  ConversationPreferenceContextSchema,
  ConversationPreferencesSchema,
  CreateConversationRequestSchema,
  ConversationTitleSchema,
  ModelSchema,
  ProviderRuntimeSchema,
  ReasoningEffortSchema,
} from '@kiditem/shared/agent-runtime';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import {
  CONVERSATION_PORT,
  type ConversationPort,
} from '../../../../application/port/in/capability/conversation.port';

const CreateConversationSchema = CreateConversationRequestSchema;
const SetConversationPreferenceSchema = z.object({
  context: ConversationPreferenceContextSchema,
  runtime: ProviderRuntimeSchema,
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();
const RenameConversationSchema = z.object({
  title: ConversationTitleSchema,
}).strict();
/** Same-origin browser facade. It never accepts provider or execution coordinates. */
@Controller('agent-os')
export class ConversationController {
  constructor(
    @Inject(CONVERSATION_PORT)
    private readonly conversations: ConversationPort,
  ) {}

  @Get('conversations')
  async list(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      return await this.conversations.list(owner(organizationId, user));
    } catch (error) {
      rethrowConversationError(error);
    }
  }

  @Post('conversations')
  async create(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const command = parse(CreateConversationSchema, body, 'Invalid conversation create request.');
    try {
      return await this.conversations.create({ ...owner(organizationId, user), ...command });
    } catch (error) {
      rethrowConversationError(error);
    }
  }

  @Get('conversation-preferences')
  async preferences(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      return strictPreferences(await this.conversations.preferences(owner(organizationId, user)));
    } catch (error) {
      rethrowConversationError(error);
    }
  }

  @Put('conversation-preferences')
  async setPreference(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const command = parse(SetConversationPreferenceSchema, body, 'Invalid conversation preference request.');
    try {
      return strictPreferences(await this.conversations.setPreference({ ...owner(organizationId, user), ...command }));
    } catch (error) {
      rethrowConversationError(error);
    }
  }

  @Patch('conversations/:conversationId')
  async rename(
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const command = parse(RenameConversationSchema, body, 'Invalid conversation rename request.');
    const parsedConversationId = parseId(ConversationIdSchema, conversationId, 'conversationId');
    try {
      return await this.conversations.rename({
        ...owner(organizationId, user),
        conversationId: parsedConversationId,
        title: command.title,
      });
    } catch (error) {
      rethrowConversationError(error);
    }
  }

  @Delete('conversations/:conversationId')
  async delete(
    @Param('conversationId') conversationId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const parsedConversationId = parseId(ConversationIdSchema, conversationId, 'conversationId');
    try {
      await this.conversations.delete({
        ...owner(organizationId, user),
        conversationId: parsedConversationId,
      });
      return undefined;
    } catch (error) {
      rethrowConversationError(error);
    }
  }

}

function owner(organizationId: string, user: AuthUser) {
  return { organizationId, userId: user.id };
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

function parseId<T extends z.ZodTypeAny>(schema: T, input: string, label: string): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(`${label} is invalid.`);
  return parsed.data;
}

function strictPreferences(input: unknown) {
  const parsed = ConversationPreferencesSchema.safeParse(input);
  if (!parsed.success) throw new AgentOsRuntimeError('conversation_gateway_unavailable');
  return parsed.data;
}

function rethrowConversationError(error: unknown): never {
  if (error instanceof AgentOsRuntimeError && error.code === 'conversation_not_found') {
    throw new NotFoundException('Conversation was not found.');
  }
  if (error instanceof AgentOsRuntimeError && error.code === 'conversation_gateway_unavailable') {
    throw new ServiceUnavailableException('The provider Gateway is unavailable.');
  }
  if (error instanceof AgentOsRuntimeError && [
    'conversation_create_conflict',
    'conversation_turn_live',
  ].includes(error.code)) {
    throw new ConflictException('Conversation state changed. Refresh and try again.');
  }
  if (error instanceof AgentOsRuntimeError && [
    'conversation_agent_invalid',
    'conversation_id_required',
    'conversation_message_required',
    'conversation_model_required',
    'conversation_model_unsupported',
    'conversation_reasoning_effort_required',
    'conversation_reasoning_effort_unsupported',
    'conversation_title_required',
  ].includes(error.code)) {
    throw new BadRequestException(error.code);
  }
  throw new ServiceUnavailableException('The provider Gateway is unavailable.');
}
