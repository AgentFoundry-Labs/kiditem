import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RulesController } from '../controllers/rules.controller';

function makeController() {
  const rulesService = {
    evaluateAll: vi.fn(),
    getEvaluationStatus: vi.fn(),
    getSummary: vi.fn(),
    findAllRules: vi.fn(),
    suggestThresholds: vi.fn(),
    updateRule: vi.fn(),
  };
  const agentRegistry = {
    findByType: vi.fn(),
    update: vi.fn(),
  };
  const heartbeat = {
    syncTimers: vi.fn(),
  };

  return {
    controller: new RulesController(rulesService as never, agentRegistry as never, heartbeat as never),
    rulesService,
    agentRegistry,
    heartbeat,
  };
}

describe('RulesController schedule tenant boundary', () => {
  it('does not expose a global rules_evaluation schedule as tenant-owned config', async () => {
    const { controller, agentRegistry } = makeController();
    agentRegistry.findByType.mockResolvedValue({
      id: 'agent-global',
      type: 'rules_evaluation',
      companyId: null,
      schedule: '0 9 * * *',
    });

    await expect(controller.getSchedule('company-1')).resolves.toMatchObject({
      schedule: 'disabled',
    });
  });

  it('rejects schedule updates against the global rules_evaluation definition', async () => {
    const { controller, agentRegistry, heartbeat } = makeController();
    agentRegistry.findByType.mockResolvedValue({
      id: 'agent-global',
      type: 'rules_evaluation',
      companyId: null,
      schedule: null,
    });

    await expect(
      controller.updateSchedule('company-1', { schedule: '0 9 * * *' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(agentRegistry.update).not.toHaveBeenCalled();
    expect(heartbeat.syncTimers).not.toHaveBeenCalled();
  });

  it('updates only a tenant-owned rules_evaluation definition', async () => {
    const { controller, agentRegistry, heartbeat } = makeController();
    agentRegistry.findByType.mockResolvedValue({
      id: 'agent-tenant',
      type: 'rules_evaluation',
      companyId: 'company-1',
      schedule: null,
    });

    await expect(
      controller.updateSchedule('company-1', { schedule: '0 9 * * *' }),
    ).resolves.toEqual({ ok: true, schedule: '0 9 * * *' });

    expect(agentRegistry.update).toHaveBeenCalledWith('agent-tenant', 'company-1', {
      schedule: '0 9 * * *',
    });
    expect(heartbeat.syncTimers).toHaveBeenCalledOnce();
  });
});
