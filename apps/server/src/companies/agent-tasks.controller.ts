import { Controller, Get, Post, Body, Query, Param, HttpCode } from '@nestjs/common';
import { AgentTasksService } from './agent-tasks.service';
import { CreateAgentTaskBodyDto, ListAgentTasksQueryDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly agentTasksService: AgentTasksService) {}

  @Post()
  create(@Body() body: CreateAgentTaskBodyDto, @CurrentCompany() companyId: string) {
    return this.agentTasksService.create(body.agentType, body.input, companyId);
  }

  @Get()
  findAll(@Query() query: ListAgentTasksQueryDto, @CurrentCompany() companyId: string) {
    return this.agentTasksService.findAll(query, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.agentTasksService.findOne(id, companyId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.agentTasksService.cancel(id, companyId);
  }
}
