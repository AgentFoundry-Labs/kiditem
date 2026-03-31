import { Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';

@Controller('agent-registry')
export class AgentRegistryController {
  constructor(private readonly service: AgentRegistryService) {}

  @Get()
  list(
    @Query('companyId') companyId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list({ companyId, isActive });
  }

  @Get('org')
  getOrgTree() {
    return this.service.getOrgTree();
  }

  @Get('cost-analytics')
  getCostAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.service.getCostAnalytics({ from, to, agentId });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body() body: {
      companyId?: string;
      name: string;
      type: string;
      description?: string;
      promptTemplate: string;
      allowedTools?: string;
      permissionMode?: string;
      monthlyTokenBudget?: number;
      schedule?: string;
      timeoutSeconds?: number;
      requiresApproval?: boolean;
    },
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body as any);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  // ── 실행 ──

  @Post(':id/run')
  run(
    @Param('id') id: string,
    @Body() body: {
      companyId?: string;
      dryRun?: boolean;
      extra?: Record<string, unknown>;
    },
  ) {
    return this.service.run(id, body);
  }

  @Post('results/:taskId')
  receiveResults(
    @Param('taskId') taskId: string,
    @Body() body: { actions?: unknown[]; summary?: Record<string, unknown>; tokensUsed?: number },
  ) {
    return this.service.receiveResults(taskId, body);
  }

  // ── 스케줄 & 관리 ──

  @Post('sync-timers')
  syncTimers() {
    // HeartbeatService가 내부에서 호출됨 — 수동 트리거용
    return this.service.onModuleInit();
  }

  @Post('reset-budgets')
  resetBudgets() {
    return this.service.resetMonthlyBudgets();
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() body: { reason?: string }) {
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
  getRunHistory(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.getRunHistory(id, limit ? parseInt(limit) : undefined);
  }

  @Get(':id/runtime-state')
  getRuntimeState(@Param('id') id: string) {
    return this.service.getRuntimeState(id);
  }
}
