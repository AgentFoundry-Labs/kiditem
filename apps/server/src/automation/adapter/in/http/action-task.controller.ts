import { Controller, Get, Patch, Post, Param, Body, Query } from '@nestjs/common';
import { ActionBoardService } from '../../../application/service/action-board.service';
import { UpdateTaskDto, AddNoteDto, ListActionTasksDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('action-tasks')
export class ActionTaskController {
  constructor(private readonly actionBoardService: ActionBoardService) {}

  @Get()
  getTasks(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListActionTasksDto,
  ) {
    if (query.assignedTo !== undefined) {
      return this.actionBoardService.list(organizationId, user.id, { assignedTo: query.assignedTo });
    }
    return this.actionBoardService.getTasks(organizationId);
  }

  @Patch(':id/claim')
  claim(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionBoardService.claim(id, organizationId, user.id);
  }

  @Patch(':id/unclaim')
  unclaim(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actionBoardService.unclaim(id, organizationId, user.id);
  }

  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.actionBoardService.updateTask(id, organizationId, dto);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.actionBoardService.addNote(id, organizationId, dto.text);
  }

  @Post(':id/execute')
  executeTask(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.actionBoardService.executeTask(id, organizationId);
  }
}
