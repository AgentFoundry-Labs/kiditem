import { Controller, Get, Patch, Post, Param, Body, Query } from '@nestjs/common';
import { ActionTaskService } from './action-task.service';
import { UpdateTaskDto, AddNoteDto, ListActionTasksDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('action-tasks')
export class ActionTaskController {
  constructor(private readonly actionTaskService: ActionTaskService) {}

  @Get()
  getTasks(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListActionTasksDto,
  ) {
    if (query.assignedTo !== undefined) {
      return this.actionTaskService.list(companyId, user.id, { assignedTo: query.assignedTo });
    }
    return this.actionTaskService.getTasks(companyId);
  }

  @Patch(':id/claim')
  claim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionTaskService.claim(id, companyId, user.id);
  }

  @Patch(':id/unclaim')
  unclaim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionTaskService.unclaim(id, companyId, user.id);
  }

  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.actionTaskService.updateTask(id, companyId, dto);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.actionTaskService.addNote(id, companyId, dto.text);
  }

  @Post(':id/execute')
  executeTask(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.actionTaskService.executeTask(id, companyId);
  }
}
