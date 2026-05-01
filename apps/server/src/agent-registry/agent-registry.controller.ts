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
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
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
  list(@CurrentOrganization() organizationId: string, @Query() query: ListAgentsQueryDto) {
    return this.service.list(organizationId, query);
  }

  @Get('org')
  getOrgTree(@CurrentOrganization() organizationId: string, @Query() _query: OrgTreeQueryDto) {
    return this.service.getOrgTree(organizationId);
  }

  @Roles('admin')
  @Sse('events')
  agentEvents(@CurrentOrganization() organizationId: string): Observable<MessageEvent> {
    return this.sseService.getStream(organizationId);
  }

  @Roles('admin')
  @Get('cost-analytics')
  getCostAnalytics(@CurrentOrganization() organizationId: string, @Query() query: CostAnalyticsQueryDto) {
    return this.service.getCostAnalytics(organizationId, query);
  }

  @Roles('admin')
  @Get('denials/summary')
  getDenialsSummary(@CurrentOrganization() organizationId: string) {
    if (!this.denialTracker) return { total: 0, byCategory: {} };
    return this.denialTracker.getSummary(organizationId);
  }

  @Post('run-by-type')
  runByType(@Body() body: RunByTypeBodyDto, @CurrentOrganization() organizationId: string) {
    return this.service.runByType(body.type, {
      organizationId,
    });
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @CurrentOrganization() organizationId: string) {
    return this.service.getById(id, organizationId);
  }

  @Post()
  create(@Body() body: CreateAgentBodyDto, @CurrentOrganization() organizationId: string) {
    return this.service.create({ ...body, organizationId });
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateAgentBodyDto,
  ) {
    return this.service.update(id, organizationId, body);
  }

  @Delete(':id')
  delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentOrganization() organizationId: string) {
    return this.service.delete(id, organizationId);
  }

  // ── 실행 ──

  @Post(':id/run')
  run(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RunAgentBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.run(id, { ...body, organizationId });
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
  pause(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: PauseAgentBodyDto,
  ) {
    return this.service.pauseAgent(id, organizationId, body.reason);
  }

  @Post(':id/resume')
  resume(@Param('id', new ParseUUIDPipe()) id: string, @CurrentOrganization() organizationId: string) {
    return this.service.resumeAgent(id, organizationId);
  }

  @Post(':id/reset-session')
  resetSession(@Param('id', new ParseUUIDPipe()) id: string, @CurrentOrganization() organizationId: string) {
    return this.service.resetSession(id, organizationId);
  }

  @Get(':id/runs')
  getRunHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Query() query: RunHistoryQueryDto,
  ) {
    return this.service.getRunHistory(id, organizationId, query.limit);
  }

  @Get(':id/runtime-state')
  getRuntimeState(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getRuntimeState(id, organizationId);
  }

  // ── Delegation (#14) ──

  @Post(':parentId/delegate')
  delegate(
    @Param('parentId', new ParseUUIDPipe()) parentId: string,
    @Body() body: DelegateAgentBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!this.delegationService) throw new ServiceUnavailableException('delegation_not_available');
    return this.delegationService.delegate({
      parentAgentId: parentId,
      childAgentType: body.childAgentType,
      parentRunId: body.parentRunId,
      organizationId,
      payload: body.payload,
      reason: body.reason,
    });
  }

  // ── Permission Denials (#22) ──

  @Roles('admin')
  @Get(':id/denials')
  getDenials(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!this.denialTracker) return [];
    return this.denialTracker.listDenials(id, organizationId);
  }

  // ── Business Safety: Snapshots + Rollback ──

  @Roles('admin')
  @Get('runs/:runId/snapshots')
  getSnapshots(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!this.snapshotService) return [];
    return this.snapshotService.getSnapshots(runId, organizationId);
  }

  @Roles('admin')
  @Get('runs/:runId/reasoning')
  async getReasoning(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const run = await this.service.getRunById(runId, organizationId);
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
  rollback(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    if (!this.snapshotService) return { restored: 0 };
    return this.snapshotService.rollback(runId, organizationId);
  }

  @Patch(':id/trust-level')
  async updateTrustLevel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateTrustLevelDto,
  ) {
    return this.service.update(id, organizationId, { trustLevel: body.trustLevel });
  }
}
