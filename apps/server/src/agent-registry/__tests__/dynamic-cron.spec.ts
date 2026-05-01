import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatService } from '../heartbeat/heartbeat.service';

// ── Mocks ──

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    heartbeatRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
    agentWakeupRequest: {
      create: vi.fn(),
    },
  };
}

function makeSchedulerRegistry() {
  return {
    addCronJob: vi.fn(),
    deleteCronJob: vi.fn(),
    getCronJobs: vi.fn().mockReturnValue(new Map()),
    getIntervals: vi.fn().mockReturnValue([]),
    deleteInterval: vi.fn(),
  };
}

function makeService(prisma?: any, schedulerRegistry?: any) {
  const p = prisma ?? makePrisma();
  const sr = schedulerRegistry ?? makeSchedulerRegistry();

  const service = new HeartbeatService(
    p as any,
    { requestWakeup: vi.fn(), claimNext: vi.fn(), finish: vi.fn() } as any,
    { buildSkillsDir: vi.fn(), cleanup: vi.fn() } as any,
    sr as any,
    { emit: vi.fn() } as any,
    { isEnabled: vi.fn().mockResolvedValue(true) } as any,
  );

  return { service, prisma: p, schedulerRegistry: sr };
}

const MOCK_AGENT = {
  id: 'agent-1',
  name: '광고 전략 에이전트',
  type: 'ad_strategy',
  organizationId: 'organization-1',
  schedule: '0 9 * * *',
  isActive: true,
};

// ── Tests ──

describe('Dynamic Cron (#30)', () => {
  describe('replaceAgentTimer', () => {
    it('valid nextSchedule → schedule updated in DB and new timer registered', async () => {
      const { service, prisma, schedulerRegistry } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);

      await service.replaceAgentTimer('agent-1', '0 10 * * *');

      expect(prisma.agentDefinition.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: { schedule: '0 10 * * *' },
      });
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        'heartbeat-timer-agent-1',
        expect.anything(),
      );
    });

    it('invalid cron string → schedule NOT updated, existing schedule preserved', async () => {
      const { service, prisma, schedulerRegistry } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);

      await service.replaceAgentTimer('agent-1', 'not-a-cron');

      expect(prisma.agentDefinition.update).not.toHaveBeenCalled();
      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('replaceAgentTimer does NOT call syncTimers (only the single agent timer is replaced)', async () => {
      const { service, prisma, schedulerRegistry } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);

      const syncTimersSpy = vi.spyOn(service, 'syncTimers');

      await service.replaceAgentTimer('agent-1', '*/30 * * * *');

      expect(syncTimersSpy).not.toHaveBeenCalled();
      // Only the heartbeat-timer-agent-1 job is touched
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith('heartbeat-timer-agent-1');
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        'heartbeat-timer-agent-1',
        expect.anything(),
      );
      // Other jobs (heartbeat-timer-agent-2, etc.) are not deleted
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledTimes(1);
    });
  });
});
