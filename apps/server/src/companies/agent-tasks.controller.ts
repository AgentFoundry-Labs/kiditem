import { Controller, Get, Post, Body, Query, Param, HttpCode } from '@nestjs/common';
import { AgentTasksService } from './agent-tasks.service';
import { CreateAgentTaskBodyDto, ListAgentTasksQueryDto } from './dto';

@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly agentTasksService: AgentTasksService) {}

  @Post()
  create(@Body() body: CreateAgentTaskBodyDto) {
    return this.agentTasksService.create(body.agentType, body.input);
  }

  @Get()
  findAll(@Query() query: ListAgentTasksQueryDto) {
    return this.agentTasksService.findAll(query as any);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentTasksService.findOne(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.agentTasksService.cancel(id);
  }
}
