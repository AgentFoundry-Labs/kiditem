import { describe, expect, it, vi } from 'vitest';
import { AdStrategyAgentService } from '../ad-strategy-agent.service';
import type { AdvertisingJudgmentPort } from '../../port/out/cross-domain/advertising-judgment.port';

function makeJudgment(): { submit: ReturnType<typeof vi.fn> } & AdvertisingJudgmentPort {
  return { submit: vi.fn() } as unknown as { submit: ReturnType<typeof vi.fn> } & AdvertisingJudgmentPort;
}

function makeService() {
  const judgment = makeJudgment();
  const operationAlerts = { start: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new AdStrategyAgentService(judgment, operationAlerts),
    judgment,
    operationAlerts,
  };
}

const submitted = {
  session: 'organizations/org-1/agentSessions/session-1',
  task: 'organizations/org-1/agentSessions/session-1/tasks/task-1',
  execution: 'organizations/org-1/agentSessions/session-1/executions/execution-1',
  operation: 'organizations/org-1/operations/operation-1',
};

describe('AdStrategyAgentService', () => {
  it('submits ad_strategy through the local judgment port with canonical session resources', async () => {
    const { service, judgment } = makeService();
    judgment.submit.mockResolvedValue(submitted);

    await expect(service.run({ organizationId: 'org-1', triggeredByUserId: 'user-1', dryRun: true }))
      .resolves.toEqual(submitted);

    expect(judgment.submit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      objective: 'Create an advertising strategy analysis.',
      resourceRefs: [],
      idempotencyKey: 'advertising.ad_strategy.manual:org-1:user-1:true',
    });
  });

  it('opens feedback using the canonical Operation resource rather than AgentRun identity', async () => {
    const { service, judgment, operationAlerts } = makeService();
    judgment.submit.mockResolvedValue(submitted);

    await service.run({ organizationId: 'org-1', triggeredByUserId: 'user-1' });

    expect(operationAlerts.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      operationKey: 'ad-strategy:organizations/org-1/operations/operation-1',
      sourceType: 'operation_run',
      sourceId: 'organizations/org-1/operations/operation-1',
      actorUserId: 'user-1',
    }));
  });

  it('rejects a system caller instead of creating judgment without a user actor', async () => {
    const { service, judgment } = makeService();

    await expect(service.run({ organizationId: 'org-1', triggeredByUserId: null }))
      .rejects.toThrow('AD_STRATEGY_JUDGMENT_ACTOR_REQUIRED');

    expect(judgment.submit).not.toHaveBeenCalled();
  });
});
