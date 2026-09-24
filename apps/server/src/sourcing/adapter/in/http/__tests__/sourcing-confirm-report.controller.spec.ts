import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { SourcingConfirmReportController } from '../sourcing-confirm-report.controller';
import type { SourcingConfirmReportService } from '../../../../application/service/sourcing-confirm-report.service';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

describe('SourcingConfirmReportController', () => {
  it('⭐ lets only owner/admin send the Telegram report or issue a setup token while status stays readable', () => {
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SourcingConfirmReportController.prototype.sendTelegram,
    )).toEqual(['owner', 'admin']);
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SourcingConfirmReportController.prototype.issueSetupToken,
    )).toEqual(['owner', 'admin']);
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SourcingConfirmReportController.prototype.status,
    )).toBeUndefined();
  });

  it('passes only the session organization (and the caller role for status) to the report service', async () => {
    const reports = {
      status: vi.fn().mockResolvedValue({}),
      sendReport: vi.fn().mockResolvedValue({}),
      issueSetupToken: vi.fn().mockResolvedValue({}),
    };
    const controller = new SourcingConfirmReportController(reports as unknown as SourcingConfirmReportService);
    const user = { id: 'user-1', organizationId: ORG_ID, role: 'member' } as AuthUser;

    await controller.status(ORG_ID, user);
    await controller.sendTelegram(ORG_ID);
    await controller.issueSetupToken(ORG_ID);

    expect(reports.status).toHaveBeenCalledWith(ORG_ID, 'member');
    expect(reports.sendReport).toHaveBeenCalledWith(ORG_ID);
    expect(reports.issueSetupToken).toHaveBeenCalledWith(ORG_ID);
  });
});
