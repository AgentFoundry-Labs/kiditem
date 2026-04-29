import { describe, expect, it, vi } from 'vitest';
import { AgentRuntimeScheduleControlAdapter } from '../agent-schedule-control.adapter';
import { TenantOwnedAgentRequiredError } from '../../../../application/port/in/agent-schedule-control.port';

function makeAdapter() {
  const agentRegistry = {
    findByType: vi.fn(),
    update: vi.fn(),
  };
  const heartbeat = {
    syncTimers: vi.fn().mockResolvedValue(undefined),
  };

  return {
    adapter: new AgentRuntimeScheduleControlAdapter(
      agentRegistry as never,
      heartbeat as never,
    ),
    agentRegistry,
    heartbeat,
  };
}

describe('AgentRuntimeScheduleControlAdapter', () => {
  describe('getSchedule', () => {
    it('returns disabled when the resolved definition belongs to the global catalog', async () => {
      const { adapter, agentRegistry } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-global',
        companyId: null,
        schedule: '0 9 * * *',
      });

      await expect(
        adapter.getSchedule('rules_evaluation', 'company-1'),
      ).resolves.toEqual({ schedule: 'disabled' });
      expect(agentRegistry.findByType).toHaveBeenCalledWith('rules_evaluation');
    });

    it('returns disabled when the definition belongs to a different tenant', async () => {
      const { adapter, agentRegistry } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-foreign',
        companyId: 'company-other',
        schedule: '0 9 * * *',
      });

      await expect(
        adapter.getSchedule('rules_evaluation', 'company-1'),
      ).resolves.toEqual({ schedule: 'disabled' });
    });

    it('returns the tenant-owned cron expression', async () => {
      const { adapter, agentRegistry } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-tenant',
        companyId: 'company-1',
        schedule: '0 9,18 * * *',
      });

      await expect(
        adapter.getSchedule('rules_evaluation', 'company-1'),
      ).resolves.toEqual({ schedule: '0 9,18 * * *' });
    });

    it('returns disabled when the tenant-owned definition has no schedule', async () => {
      const { adapter, agentRegistry } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-tenant',
        companyId: 'company-1',
        schedule: null,
      });

      await expect(
        adapter.getSchedule('rules_evaluation', 'company-1'),
      ).resolves.toEqual({ schedule: 'disabled' });
    });
  });

  describe('setSchedule', () => {
    it('throws TenantOwnedAgentRequiredError when the resolved definition is global', async () => {
      const { adapter, agentRegistry, heartbeat } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-global',
        companyId: null,
        schedule: null,
      });

      await expect(
        adapter.setSchedule('rules_evaluation', 'company-1', '0 9 * * *'),
      ).rejects.toBeInstanceOf(TenantOwnedAgentRequiredError);

      expect(agentRegistry.update).not.toHaveBeenCalled();
      expect(heartbeat.syncTimers).not.toHaveBeenCalled();
    });

    it('throws TenantOwnedAgentRequiredError when the resolved definition belongs to another tenant', async () => {
      const { adapter, agentRegistry, heartbeat } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-foreign',
        companyId: 'company-other',
        schedule: null,
      });

      await expect(
        adapter.setSchedule('rules_evaluation', 'company-1', '0 9 * * *'),
      ).rejects.toBeInstanceOf(TenantOwnedAgentRequiredError);

      expect(agentRegistry.update).not.toHaveBeenCalled();
      expect(heartbeat.syncTimers).not.toHaveBeenCalled();
    });

    it('updates the tenant-owned definition and resyncs heartbeat timers', async () => {
      const { adapter, agentRegistry, heartbeat } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-tenant',
        companyId: 'company-1',
        schedule: null,
      });

      await expect(
        adapter.setSchedule('rules_evaluation', 'company-1', '0 9 * * *'),
      ).resolves.toEqual({ schedule: '0 9 * * *' });

      expect(agentRegistry.update).toHaveBeenCalledWith(
        'agent-tenant',
        'company-1',
        { schedule: '0 9 * * *' },
      );
      expect(heartbeat.syncTimers).toHaveBeenCalledOnce();
    });

    it('disables the schedule by passing null and reports disabled in the snapshot', async () => {
      const { adapter, agentRegistry, heartbeat } = makeAdapter();
      agentRegistry.findByType.mockResolvedValue({
        id: 'agent-tenant',
        companyId: 'company-1',
        schedule: '0 9 * * *',
      });

      await expect(
        adapter.setSchedule('rules_evaluation', 'company-1', null),
      ).resolves.toEqual({ schedule: 'disabled' });

      expect(agentRegistry.update).toHaveBeenCalledWith(
        'agent-tenant',
        'company-1',
        { schedule: null },
      );
      expect(heartbeat.syncTimers).toHaveBeenCalledOnce();
    });
  });
});
