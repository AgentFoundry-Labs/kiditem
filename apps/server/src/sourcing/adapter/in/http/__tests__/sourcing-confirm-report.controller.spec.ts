import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../../auth/decorators/roles.decorator';
import { SourcingConfirmReportController } from '../sourcing-confirm-report.controller';
import type { SourcingConfirmReportService } from '../../../../application/service/sourcing-confirm-report.service';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

describe('SourcingConfirmReportController', () => {
  it('⭐ lets only owner/admin send the Telegram report while status stays readable', () => {
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SourcingConfirmReportController.prototype.sendTelegram,
    )).toEqual(['owner', 'admin']);
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SourcingConfirmReportController.prototype.status,
    )).toBeUndefined();
  });

  it('passes only the session organization to the report service', async () => {
    const reports = {
      status: vi.fn().mockResolvedValue({}),
      sendReport: vi.fn().mockResolvedValue({}),
    };
    const controller = new SourcingConfirmReportController(reports as unknown as SourcingConfirmReportService);

    await controller.status(ORG_ID);
    await controller.sendTelegram(ORG_ID);

    expect(reports.status).toHaveBeenCalledWith(ORG_ID);
    expect(reports.sendReport).toHaveBeenCalledWith(ORG_ID);
  });
});
