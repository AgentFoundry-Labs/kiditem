import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { ManagerService } from './manager.service';
import { ManagerWorkflowService } from './manager-workflow.service';
import {
  ManagerAskBodyDto,
  ReceiveManagerResultsBodyDto,
  ListConversationsQueryDto,
  StartWorkflowBodyDto,
  ApproveWorkflowBodyDto,
  ListWorkflowsQueryDto,
} from './dto';

@Controller('manager')
export class ManagerController {
  constructor(
    private readonly managerService: ManagerService,
    private readonly workflowService: ManagerWorkflowService,
  ) {}

  @Post('ask')
  ask(@Body() body: ManagerAskBodyDto) {
    return this.managerService.ask(body);
  }

  @Post('results/:taskId')
  receiveResults(@Param('taskId') taskId: string, @Body() body: ReceiveManagerResultsBodyDto) {
    return this.managerService.receiveResults(taskId, body);
  }

  @Get('conversations')
  getConversations(@Query() query: ListConversationsQueryDto) {
    return this.managerService.getConversations(query.companyId, query.limit);
  }

  // ── Workflow Endpoints ──

  @Post('workflow')
  startWorkflow(@Body() body: StartWorkflowBodyDto) {
    return this.workflowService.startWorkflow(body);
  }

  @Post('workflow/:id/approve')
  approveWorkflow(@Param('id') id: string, @Body() body: ApproveWorkflowBodyDto) {
    return this.workflowService.resumeWorkflow(id, body);
  }

  @Get('workflow/:id')
  getWorkflow(@Param('id') id: string) {
    return this.workflowService.getWorkflow(id);
  }

  @Get('workflows')
  listWorkflows(@Query() query: ListWorkflowsQueryDto) {
    return this.workflowService.listWorkflows(query.companyId, query.limit);
  }
}
