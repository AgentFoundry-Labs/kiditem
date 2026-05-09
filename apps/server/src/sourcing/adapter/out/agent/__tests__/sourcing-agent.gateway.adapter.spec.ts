import { describe, it, expect, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { SourcingAgentGatewayAdapter } from '../sourcing-agent.gateway.adapter';
import type { AgentRunnerPort } from '../../../../../agent-os/application/port/in/agent-runner.port';

function makeAdapter(runByType: ReturnType<typeof vi.fn>) {
  const runner = { runByType } as unknown as AgentRunnerPort;
  return new SourcingAgentGatewayAdapter(runner);
}

describe('SourcingAgentGatewayAdapter', () => {
  describe('scrapeUrl', () => {
    it('forwards triggeredByUserId to AGENT_RUNNER_PORT.requestedByUserId so the FINALIZED bridge can resolve the actor', async () => {
      const runByType = vi.fn().mockResolvedValue({
        ok: true,
        runId: 'run-1',
        requestId: 'req-1',
        agentType: 'sourcing',
        status: 'running',
      });
      const adapter = makeAdapter(runByType);

      await adapter.scrapeUrl({
        organizationId: 'org-1',
        url: 'https://1688.com/item/1',
        triggeredByUserId: 'user-7',
      });

      expect(runByType).toHaveBeenCalledWith(
        'sourcing',
        expect.objectContaining({
          organizationId: 'org-1',
          sourceType: 'sourcing.scrape_url',
          requestedByUserId: 'user-7',
          payload: expect.objectContaining({
            action: 'scrape_url',
            url: 'https://1688.com/item/1',
            organization_id: 'org-1',
          }),
        }),
      );
    });

    it('omits requestedByUserId when no actor is known (system/cron path)', async () => {
      const runByType = vi.fn().mockResolvedValue({
        ok: true,
        runId: 'run-2',
        requestId: 'req-2',
        agentType: 'sourcing',
        status: 'running',
      });
      const adapter = makeAdapter(runByType);

      await adapter.scrapeUrl({
        organizationId: 'org-1',
        url: 'https://1688.com/item/2',
        triggeredByUserId: null,
      });

      const callInput = runByType.mock.calls[0]![1];
      expect(callInput).not.toHaveProperty('requestedByUserId');
    });

    it('returns the durable AgentRunRequest id alongside the legacy taskId', async () => {
      const runByType = vi.fn().mockResolvedValue({
        ok: true,
        runId: 'run-1',
        requestId: 'req-1',
        agentType: 'sourcing',
        status: 'running',
      });
      const adapter = makeAdapter(runByType);

      const result = await adapter.scrapeUrl({
        organizationId: 'org-1',
        url: 'https://1688.com/item/1',
      });

      // taskId still prefers runId; requestId is exposed separately so
      // SourcingService can open a producer-owned operation alert.
      expect(result.taskId).toBe('run-1');
      expect(result.requestId).toBe('req-1');
    });

    it('falls back to requestId for taskId when the runner deferred execution', async () => {
      const runByType = vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'req-deferred',
        agentType: 'sourcing',
        status: 'requires_approval',
      });
      const adapter = makeAdapter(runByType);

      const result = await adapter.scrapeUrl({
        organizationId: 'org-1',
        url: 'https://1688.com/item/3',
      });

      expect(result.taskId).toBe('req-deferred');
      expect(result.requestId).toBe('req-deferred');
    });

    it('throws InternalServerError when the runner produced no runId or requestId', async () => {
      const runByType = vi.fn().mockResolvedValue({
        ok: false,
        agentType: 'sourcing',
        reason: 'agent_instance_not_found',
      });
      const adapter = makeAdapter(runByType);

      await expect(
        adapter.scrapeUrl({ organizationId: 'org-1', url: 'https://1688.com/item/4' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
