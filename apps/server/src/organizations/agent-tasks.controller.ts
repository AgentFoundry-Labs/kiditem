import { Controller, Get, Post, Body, Query, Param, HttpCode } from '@nestjs/common';
import { AgentTasksService } from './agent-tasks.service';
import { CreateAgentTaskBodyDto, ListAgentTasksQueryDto } from './dto';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';

@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly agentTasksService: AgentTasksService) {}

  @Post()
  create(@Body() body: CreateAgentTaskBodyDto, @CurrentOrganization() organizationId: string) {
    return this.agentTasksService.create(body.agentType, body.input, organizationId);
  }

  @Get()
  findAll(@Query() query: ListAgentTasksQueryDto, @CurrentOrganization() organizationId: string) {
    return this.agentTasksService.findAll(query, organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.agentTasksService.findOne(id, organizationId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.agentTasksService.cancel(id, organizationId);
  }
}
