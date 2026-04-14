import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import { ActionTaskService } from './action-task.service';
import { UpdateTaskDto, AddNoteDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('action-tasks')
export class ActionTaskController {
  constructor(private readonly actionTaskService: ActionTaskService) {}

  @Get()
  getTasks(@CurrentCompany() companyId: string) {
    return this.actionTaskService.getTasks(companyId);
  }

  @Patch(':id')
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.actionTaskService.updateTask(id, dto);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.actionTaskService.addNote(id, dto.text);
  }

  @Post(':id/execute')
  executeTask(@Param('id') id: string) {
    return this.actionTaskService.executeTask(id);
  }
}
