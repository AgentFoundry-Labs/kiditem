import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentRegistryService } from './agent-registry.service';
import { AgentSseService } from './events/agent-sse.service';
import {
  ListAgentsQueryDto,
  CostAnalyticsQueryDto,
  CreateAgentBodyDto,
  UpdateAgentBodyDto,
  RunAgentBodyDto,
  RunByTypeBodyDto,
  PauseAgentBodyDto,
  RunHistoryQueryDto,
  DelegateAgentBodyDto,
  OrgTreeQueryDto,
  UpdateTrustLevelDto,
} from './dto';
import { DelegationService } from './delegation/delegation.service';
import { DenialTrackerService } from './safety/denial-tracker.service';
import { SnapshotService } from './business-safety/snapshot.service';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('agent-registry')
export class AgentRegistryController {
  constructor(
    private readonly service: AgentRegistryService,
    private readonly sseService: AgentSseService,
    @Optional() private readonly delegationService?: DelegationService,
    @Optional() private readonly denialTracker?: DenialTrackerService,
    @Optional() private readonly snapshotService?: SnapshotService,
  ) {}

  @Get()
  list(@CurrentCompany() companyId: string, @Query() query: ListAgentsQueryDto) {
    return this.service.list(companyId, query);
  }

  @Get('org')
  getOrgTree(@CurrentCompany() companyId: string, @Query() _query: OrgTreeQueryDto) {
    return this.service.getOrgTree(companyId);
  }

  @Roles('admin')
  @Sse('events')
  agentEvents(@CurrentCompany() companyId: string): Observable<MessageEvent> {
    return this.sseService.getStream(companyId);
  }

  @Roles('admin')
  @Get('cost-analytics')
  getCostAnalytics(@CurrentCompany() companyId: string, @Query() query: CostAnalyticsQueryDto) {
    return this.service.getCostAnalytics(companyId, query);
  }

  @Roles('admin')
  @Get('denials/summary')
  getDenialsSummary(@CurrentCompany() companyId: string) {
    if (!this.denialTracker) return { total: 0, byCategory: {} };
    return this.denialTracker.getSummary(companyId);
  }

  @Post('run-by-type')
  runByType(@Body() body: RunByTypeBodyDto, @CurrentCompany() companyId: string) {
    return this.service.runByType(body.type, {
      companyId,
    });
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @CurrentCompany() companyId: string) {
    return this.service.getById(id, companyId);
  }

  @Post()
  create(@Body() body: CreateAgentBodyDto, @CurrentCompany() companyId: string) {
    return this.service.create({ ...body, companyId });
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateAgentBodyDto) {
    return this.service.update(id, body as any);
  }

  @Delete(':id')
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.delete(id);
  }

  // ── 실행 ──

  @Post(':id/run')
  run(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RunAgentBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.run(id, { ...body, companyId });
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
  pause(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: PauseAgentBodyDto) {
    return this.service.pauseAgent(id, body.reason);
  }

  @Post(':id/resume')
  resume(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.resumeAgent(id);
  }

  @Post(':id/reset-session')
  resetSession(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.resetSession(id);
  }

  @Get(':id/runs')
  getRunHistory(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: RunHistoryQueryDto) {
    return this.service.getRunHistory(id, query.limit);
  }

  @Get(':id/runtime-state')
  getRuntimeState(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getRuntimeState(id);
  }

  // ── Delegation (#14) ──

  @Post(':parentId/delegate')
  delegate(
    @Param('parentId', new ParseUUIDPipe()) parentId: string,
    @Body() body: DelegateAgentBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    if (!this.delegationService) throw new ServiceUnavailableException('delegation_not_available');
    return this.delegationService.delegate({
      parentAgentId: parentId,
      childAgentType: body.childAgentType,
      parentRunId: body.parentRunId,
      companyId,
      payload: body.payload,
      reason: body.reason,
    });
  }

  // ── Permission Denials (#22) ──

  @Roles('admin')
  @Get(':id/denials')
  getDenials(@Param('id', new ParseUUIDPipe()) id: string) {
    if (!this.denialTracker) return [];
    return this.denialTracker.listDenials(id);
  }

  // ── Business Safety: Snapshots + Rollback ──

  @Roles('admin')
  @Get('runs/:runId/snapshots')
  getSnapshots(@Param('runId', new ParseUUIDPipe()) runId: string) {
    if (!this.snapshotService) return [];
    return this.snapshotService.getSnapshots(runId);
  }

  @Roles('admin')
  @Get('runs/:runId/reasoning')
  async getReasoning(@Param('runId', new ParseUUIDPipe()) runId: string) {
    const run = await this.service.getRunById(runId);
    if (!run?.resultJson) return { actions: [] };
    const result = run.resultJson as any;
    const actions = (result.actions || []).map((a: any) => ({
      product_id: a.product_id,
      action: a.action,
      reason: a.reason,
      reasoning: a.reasoning ?? null,
    }));
    return { actions };
  }

  @Roles('admin')
  @Post('runs/:runId/rollback')
  rollback(@Param('runId', new ParseUUIDPipe()) runId: string) {
    if (!this.snapshotService) return { restored: 0 };
    return this.snapshotService.rollback(runId);
  }

  @Patch(':id/trust-level')
  async updateTrustLevel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateTrustLevelDto) {
    return this.service.update(id, { trustLevel: body.trustLevel });
  }
}
