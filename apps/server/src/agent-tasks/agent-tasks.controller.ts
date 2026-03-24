import { Controller, Get, Post, Body, Query, Param, BadRequestException } from '@nestjs/common';
import { AgentTasksService } from './agent-tasks.service';

const VALID_AGENTS = ['inventory', 'sourcing', 'content', 'listing', 'pricing', 'cs'];

@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly agentTasksService: AgentTasksService) {}

  @Post()
  create(@Body() body: { agentType: string; input?: Record<string, unknown> }) {
    if (!body.agentType || !VALID_AGENTS.includes(body.agentType)) {
      throw new BadRequestException(`Invalid agent type. Valid: ${VALID_AGENTS.join(', ')}`);
    }
    return this.agentTasksService.create(body.agentType, body.input);
  }

  @Get()
  findAll(@Query() query: { status?: string; agentType?: string; limit?: string }) {
    return this.agentTasksService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentTasksService.findOne(id);
  }
}
