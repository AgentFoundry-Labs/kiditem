import { Controller, Get, Post, Patch, Delete, Body, Query, Param, Sse, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentRegistryService } from './agent-registry.service';
import { AgentSseService } from './events/agent-sse.service';
import {
  ListAgentsQueryDto,
  CostAnalyticsQueryDto,
  CreateAgentBodyDto,
  UpdateAgentBodyDto,
  RunAgentBodyDto,
  ReceiveResultsBodyDto,
  PauseAgentBodyDto,
  RunHistoryQueryDto,
  DelegateAgentBodyDto,
} from './dto';
import { DelegationService } from './delegation/delegation.service';
import { DenialTrackerService } from './safety/denial-tracker.service';

@Controller('agent-registry')
export class AgentRegistryController {
  constructor(
    private readonly service: AgentRegistryService,
    private readonly sseService: AgentSseService,
    @Optional() private readonly delegationService?: DelegationService,
    @Optional() private readonly denialTracker?: DenialTrackerService,
  ) {}

  @Get()
  list(@Query() query: ListAgentsQueryDto) {
    return this.service.list(query);
  }

  @Get('org')
  getOrgTree() {
    return this.service.getOrgTree();
  }

  @Sse('events')
  agentEvents(): Observable<MessageEvent> {
    return this.sseService.getStream();
  }

  @Get('cost-analytics')
  getCostAnalytics(@Query() query: CostAnalyticsQueryDto) {
    return this.service.getCostAnalytics(query);
  }

  @Get('denials/summary')
  getDenialsSummary(@Query('companyId') companyId: string) {
    if (!this.denialTracker) return { total: 0, byCategory: {} };
    return this.denialTracker.getSummary(companyId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(@Body() body: CreateAgentBodyDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateAgentBodyDto) {
    return this.service.update(id, body as any);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  // ── 실행 ──

  @Post(':id/run')
  run(@Param('id') id: string, @Body() body: RunAgentBodyDto) {
    return this.service.run(id, body);
  }

  @Post('results/:taskId')
  receiveResults(@Param('taskId') taskId: string, @Body() body: ReceiveResultsBodyDto) {
    return this.service.receiveResults(taskId, body);
  }

  // ── 스케줄 & 관리 ──

  @Post('sync-timers')
  syncTimers() {
    return this.service.onModuleInit();
  }

  @Post('reset-budgets')
  resetBudgets() {
    return this.service.resetMonthlyBudgets();
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() body: PauseAgentBodyDto) {
    return this.service.pauseAgent(id, body.reason);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.service.resumeAgent(id);
  }

  @Post(':id/reset-session')
  resetSession(@Param('id') id: string) {
    return this.service.resetSession(id);
  }

  @Get(':id/runs')
  getRunHistory(@Param('id') id: string, @Query() query: RunHistoryQueryDto) {
    return this.service.getRunHistory(id, query.limit);
  }

  @Get(':id/runtime-state')
  getRuntimeState(@Param('id') id: string) {
    return this.service.getRuntimeState(id);
  }

  // ── Delegation (#14) ──

  @Post(':parentId/delegate')
  delegate(
    @Param('parentId') parentId: string,
    @Body() body: DelegateAgentBodyDto,
  ) {
    if (!this.delegationService) return { ok: false, error: 'delegation_not_available' };
    return this.delegationService.delegate({
      parentAgentId: parentId,
      childAgentType: body.childAgentType,
      parentRunId: body.parentRunId,
      companyId: body.companyId,
      payload: body.payload,
      reason: body.reason,
    });
  }

  // ── Permission Denials (#22) ──

  @Get(':id/denials')
  getDenials(@Param('id') id: string) {
    if (!this.denialTracker) return [];
    return this.denialTracker.listDenials(id);
  }
}
