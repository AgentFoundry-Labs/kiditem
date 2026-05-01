import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RulesController } from '../controllers/rules.controller';
import { TenantOwnedAgentRequiredError } from '../../automation/application/port/in/agent-schedule-control.port';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RULE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeController() {
  const rulesService = {
    evaluateAll: vi.fn(),
    getEvaluationStatus: vi.fn(),
    getSummary: vi.fn(),
    findAllRules: vi.fn(),
    suggestThresholds: vi.fn(),
    updateRule: vi.fn(),
  };
  const scheduleControl = {
    getSchedule: vi.fn(),
    setSchedule: vi.fn(),
  };

  return {
    controller: new RulesController(rulesService as never, scheduleControl as never),
    rulesService,
    scheduleControl,
  };
}

describe('RulesController schedule tenant boundary', () => {
  it('passes through the schedule reported by the port (port owns tenant filtering)', async () => {
    const { controller, scheduleControl } = makeController();
    scheduleControl.getSchedule.mockResolvedValue({ schedule: 'disabled' });

    await expect(controller.getSchedule('organization-1')).resolves.toMatchObject({
      schedule: 'disabled',
    });
    expect(scheduleControl.getSchedule).toHaveBeenCalledWith(
      'rules_evaluation',
      'organization-1',
    );
  });

  it('returns the cron expression reported by the port for tenant-owned schedules', async () => {
    const { controller, scheduleControl } = makeController();
    scheduleControl.getSchedule.mockResolvedValue({ schedule: '0 9 * * *' });

    await expect(controller.getSchedule('organization-1')).resolves.toMatchObject({
      schedule: '0 9 * * *',
    });
  });

  it('translates BadRequest from TenantOwnedAgentRequiredError', async () => {
    const { controller, scheduleControl } = makeController();
    scheduleControl.setSchedule.mockRejectedValue(
      new TenantOwnedAgentRequiredError('rules_evaluation'),
    );

    await expect(
      controller.updateSchedule('organization-1', { schedule: '0 9 * * *' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates schedule updates to the port and returns the body schedule', async () => {
    const { controller, scheduleControl } = makeController();
    scheduleControl.setSchedule.mockResolvedValue({ schedule: '0 9 * * *' });

    await expect(
      controller.updateSchedule('organization-1', { schedule: '0 9 * * *' }),
    ).resolves.toEqual({ ok: true, schedule: '0 9 * * *' });

    expect(scheduleControl.setSchedule).toHaveBeenCalledWith(
      'rules_evaluation',
      'organization-1',
      '0 9 * * *',
    );
  });

  it('translates the "disabled" body sentinel to null at the port boundary', async () => {
    const { controller, scheduleControl } = makeController();
    scheduleControl.setSchedule.mockResolvedValue({ schedule: 'disabled' });

    await expect(
      controller.updateSchedule('organization-1', { schedule: 'disabled' }),
    ).resolves.toEqual({ ok: true, schedule: 'disabled' });

    expect(scheduleControl.setSchedule).toHaveBeenCalledWith(
      'rules_evaluation',
      'organization-1',
      null,
    );
  });

  it('lets non-tenant-boundary errors from the port propagate unchanged', async () => {
    const { controller, scheduleControl } = makeController();
    const surprise = new Error('runtime exploded');
    scheduleControl.setSchedule.mockRejectedValue(surprise);

    await expect(
      controller.updateSchedule('organization-1', { schedule: '0 9 * * *' }),
    ).rejects.toBe(surprise);
  });
});

describe('RulesController.update — tenant scope', () => {
  it('forwards id, @CurrentOrganization organizationId, and body to RulesService.updateRule', () => {
    const { controller, rulesService } = makeController();
    const body = { active: false, threshold: { min: 10 } };

    controller.update(RULE_ID, ORGANIZATION_ID, body as never);

    // Multi-tenant scope: organizationId must reach the service so it can scope the
    // tenant-scoped read before the write (apps/server/AGENTS.md 멀티테넌트 격리).
    expect(rulesService.updateRule).toHaveBeenCalledWith(RULE_ID, ORGANIZATION_ID, body);
  });
});
