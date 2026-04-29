import { Inject, Injectable, OnModuleInit, forwardRef } from '@nestjs/common';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { AgentCostAnalyticsService } from '../automation/application/service/agent-cost-analytics.service';
import { AgentCrudService } from '../automation/application/service/agent-crud.service';
import { AgentLifecycleService } from '../automation/application/service/agent-lifecycle.service';
import { AgentRunService } from '../automation/application/service/agent-run.service';
import type {
  AgentDefinitionUpdateData,
  AgentRunInput,
} from '../automation/application/service/agent-registry.types';

export type { AgentRunInput } from '../automation/application/service/agent-registry.types';

/**
 * Compatibility facade for the public Agent Registry API.
 *
 * Phase 3C-6 moves the implementation into Automation application services
 * while preserving this injection token for existing callers across rules,
 * workflows, sourcing, advertising, AI, and controller routes.
 */
@Injectable()
export class AgentRegistryService implements OnModuleInit {
  constructor(
    @Inject(forwardRef(() => HeartbeatService))
    private readonly heartbeat: HeartbeatService,
    private readonly crud: AgentCrudService,
    private readonly runner: AgentRunService,
    private readonly lifecycle: AgentLifecycleService,
    private readonly costAnalytics: AgentCostAnalyticsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.heartbeat.syncTimers();
  }

  findByType(type: string) {
    return this.crud.findByType(type);
  }

  list(companyId: string, query: { isActive?: string } = {}) {
    return this.crud.list(companyId, query);
  }

  getById(id: string, companyId?: string) {
    return this.crud.getById(id, companyId);
  }

  create(data: Parameters<AgentCrudService['create']>[0]) {
    return this.crud.create(data);
  }

  update(id: string, companyId: string, data: AgentDefinitionUpdateData) {
    return this.crud.update(id, companyId, data);
  }

  delete(id: string, companyId: string): Promise<{ ok: boolean }> {
    return this.crud.delete(id, companyId);
  }

  runByType(type: string, input?: AgentRunInput) {
    return this.runner.runByType(type, input);
  }

  run(id: string, input?: AgentRunInput) {
    return this.runner.run(id, input);
  }

  resetMonthlyBudgets(): Promise<void> {
    return this.costAnalytics.resetMonthlyBudgets();
  }

  getRunById(runId: string, companyId: string) {
    return this.lifecycle.getRunById(runId, companyId);
  }

  getRunHistory(agentId: string, companyId: string, limit = 20) {
    return this.lifecycle.getRunHistory(agentId, companyId, limit);
  }

  getRuntimeState(agentId: string, companyId: string) {
    return this.lifecycle.getRuntimeState(agentId, companyId);
  }

  resetSession(agentId: string, companyId: string): Promise<{ ok: boolean }> {
    return this.lifecycle.resetSession(agentId, companyId);
  }

  pauseAgent(agentId: string, companyId: string, reason?: string): Promise<{ ok: boolean }> {
    return this.lifecycle.pauseAgent(agentId, companyId, reason);
  }

  resumeAgent(agentId: string, companyId: string): Promise<{ ok: boolean }> {
    return this.lifecycle.resumeAgent(agentId, companyId);
  }

  getCostAnalytics(companyId: string, query: { from?: string; to?: string; agentId?: string }) {
    return this.costAnalytics.getCostAnalytics(companyId, query);
  }

  getOrgTree(companyId: string) {
    return this.crud.getOrgTree(companyId);
  }
}
