import { describe, it, expect, vi } from 'vitest';
import { AdStrategyAgentService } from '../ad-strategy-agent.service';
import type { AgentRunnerPort } from '../../../../agent-os/application/port/in/agent-runner.port';

function makeAgentRunner(): { runByType: ReturnType<typeof vi.fn> } & AgentRunnerPort {
  return {
    runByType: vi.fn(),
  } as unknown as { runByType: ReturnType<typeof vi.fn> } & AgentRunnerPort;
}

function makeService() {
  const agentRunner = makeAgentRunner();
  return {
    service: new AdStrategyAgentService(agentRunner),
    agentRunner,
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

      const result = await service.run({ organizationId: 'org-1', dryRun: true });

      expect(agentRunner.runByType).toHaveBeenCalledWith('ad_strategy', {
        organizationId: 'org-1',
        sourceType: 'advertising.ad_strategy.manual',
        reason: 'manual_trigger',
        dryRun: true,
      });
      expect(result.ok).toBe(true);
      expect(result.agentType).toBe('ad_strategy');
    });

    it('passes dryRun=false through to the port', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, agentType: 'ad_strategy' });

      await service.run({ organizationId: 'org-1', dryRun: false });

      expect(agentRunner.runByType).toHaveBeenCalledWith(
        'ad_strategy',
        expect.objectContaining({ organizationId: 'org-1', dryRun: false }),
      );
    });

    it('returns the port result when the agent instance is missing', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: false,
        agentType: 'ad_strategy',
        reason: 'agent_instance_not_found',
      });

      const result = await service.run({ organizationId: 'org-2' });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('agent_instance_not_found');
    });
  });
});
