import { describe, it, expect, vi } from 'vitest';
import { AdStrategyAgentService } from '../ad-strategy-agent.service';
import type { AgentRunnerPort } from '../../../../agent-os/application/port/in/agent-runner.port';

function makeAgentRunner(): { runByType: ReturnType<typeof vi.fn> } & AgentRunnerPort {
  return {
    runByType: vi.fn(),
  } as unknown as { runByType: ReturnType<typeof vi.fn> } & AgentRunnerPort;
}

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
  };
}

function makeService() {
  const agentRunner = makeAgentRunner();
  const operationAlerts = makeOperationAlerts();
  return {
    service: new AdStrategyAgentService(agentRunner, operationAlerts as never),
    agentRunner,
    operationAlerts,
  };
}

describe('AdStrategyAgentService', () => {
  describe('run', () => {
    it('delegates to AGENT_RUNNER_PORT.runByType for ad_strategy with sourceType', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'req-1',
        agentInstanceId: 'inst-1',
        agentType: 'ad_strategy',
        status: 'pending',
      });

      const result = await service.run({
        organizationId: 'org-1',
        triggeredByUserId: null,
        dryRun: true,
      });

      expect(agentRunner.runByType).toHaveBeenCalledWith(
        'ad_strategy',
        expect.objectContaining({
          organizationId: 'org-1',
          sourceType: 'advertising.ad_strategy.manual',
          reason: 'manual_trigger',
          dryRun: true,
        }),
      );
      expect(result.ok).toBe(true);
      expect(result.agentType).toBe('ad_strategy');
    });

    it('forwards triggeredByUserId to AGENT_RUNNER_PORT.requestedByUserId so the FINALIZED bridge can resolve the actor', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'req-actor',
        agentType: 'ad_strategy',
        status: 'pending',
      });

      await service.run({
        organizationId: 'org-1',
        triggeredByUserId: 'user-7',
        dryRun: false,
      });

      expect(agentRunner.runByType).toHaveBeenCalledWith(
        'ad_strategy',
        expect.objectContaining({ requestedByUserId: 'user-7' }),
      );
    });

    it('omits requestedByUserId when no actor is known (system/cron path)', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'req-sys',
        agentType: 'ad_strategy',
        status: 'pending',
      });

      await service.run({ organizationId: 'org-1', triggeredByUserId: null });

      const callInput = agentRunner.runByType.mock.calls[0]![1];
      expect(callInput).not.toHaveProperty('requestedByUserId');
    });

    it('passes dryRun=false through to the port', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, agentType: 'ad_strategy' });

      await service.run({ organizationId: 'org-1', triggeredByUserId: null, dryRun: false });

      expect(agentRunner.runByType).toHaveBeenCalledWith(
        'ad_strategy',
        expect.objectContaining({ organizationId: 'org-1', dryRun: false }),
      );
    });

    it('opens a producer-owned operation alert keyed by agent_run_request:<requestId> on successful enqueue', async () => {
      const { service, agentRunner, operationAlerts } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'req-42',
        agentType: 'ad_strategy',
        status: 'pending',
      });

      await service.run({
        organizationId: 'org-1',
        triggeredByUserId: 'user-9',
        dryRun: true,
      });

      expect(operationAlerts.start).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          operationKey: 'ad-strategy:req-42',
          type: 'ad_strategy',
          sourceType: 'agent_run_request',
          sourceId: 'req-42',
          actorUserId: 'user-9',
          href: '/ad-ops',
          metadata: expect.objectContaining({
            agentType: 'ad_strategy',
            dryRun: true,
          }),
        }),
      );
    });

    it('does NOT open an operation alert when the runner produced no requestId', async () => {
      const { service, agentRunner, operationAlerts } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        runId: 'run-only',
        agentType: 'ad_strategy',
        status: 'running',
      });

      await service.run({ organizationId: 'org-1', triggeredByUserId: 'user-9' });

      expect(operationAlerts.start).not.toHaveBeenCalled();
    });

    it('returns the port result when the agent instance is missing and does not open an alert', async () => {
      const { service, agentRunner, operationAlerts } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: false,
        agentType: 'ad_strategy',
        reason: 'agent_instance_not_found',
      });

      const result = await service.run({
        organizationId: 'org-2',
        triggeredByUserId: 'user-9',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('agent_instance_not_found');
      expect(operationAlerts.start).not.toHaveBeenCalled();
    });
  });
});
