import { Controller, Get, Patch, Post, Param, Body, Query } from '@nestjs/common';
import { ActionBoardService } from '../../../application/service/action-board.service';
import { UpdateTaskDto, AddNoteDto, ListActionTasksDto } from './dto';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('action-tasks')
export class ActionTaskController {
  constructor(private readonly actionBoardService: ActionBoardService) {}

  @Get()
  getTasks(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListActionTasksDto,
  ) {
    if (query.assignedTo !== undefined) {
      return this.actionBoardService.list(companyId, user.id, { assignedTo: query.assignedTo });
    }
    return this.actionBoardService.getTasks(companyId);
  }

  @Patch(':id/claim')
  claim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionBoardService.claim(id, companyId, user.id);
  }

  @Patch(':id/unclaim')
  unclaim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionBoardService.unclaim(id, companyId, user.id);
  }

  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.actionBoardService.updateTask(id, companyId, dto);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.actionBoardService.addNote(id, companyId, dto.text);
  }

  @Post(':id/execute')
  executeTask(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.actionBoardService.executeTask(id, companyId);
  }
}
