import { describe, it, expect, vi } from 'vitest';
import { AlertsController } from '../controllers/alerts.controller';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALERT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeService() {
  return {
    findAll: vi.fn(),
    markAllAsRead: vi.fn(),
    markAsRead: vi.fn(),
    promote: vi.fn(),
    dismiss: vi.fn(),
  };
}

function makeController(service = makeService()) {
  const controller = new AlertsController(service as any);
  return { controller, service };
}

describe('AlertsController', () => {
  it('findAll forwards @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();

    controller.findAll({ limit: 10 }, COMPANY_ID);

    expect(service.findAll).toHaveBeenCalledWith(COMPANY_ID, 10);
  });

  it('markAllAsRead forwards @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();

    controller.markAllAsRead(COMPANY_ID);

    expect(service.markAllAsRead).toHaveBeenCalledWith(COMPANY_ID);
  });

  it('markAsRead forwards id and @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();

    controller.markAsRead(ALERT_ID, COMPANY_ID);

    expect(service.markAsRead).toHaveBeenCalledWith(ALERT_ID, COMPANY_ID);
  });

  it('promote forwards id, companyId, dto, and current user id', () => {
    const { controller, service } = makeController();
    const dto = { priorityOverride: 'high' as const };

    controller.promote(ALERT_ID, COMPANY_ID, { id: USER_ID } as any, dto);

    expect(service.promote).toHaveBeenCalledWith(ALERT_ID, COMPANY_ID, dto, USER_ID);
  });

  it('dismiss forwards id and @CurrentCompany companyId to the service', async () => {
    const { controller, service } = makeController();
    service.dismiss.mockResolvedValue(undefined);

    await expect(controller.dismiss(ALERT_ID, COMPANY_ID)).resolves.toEqual({ ok: true });
    expect(service.dismiss).toHaveBeenCalledWith(ALERT_ID, COMPANY_ID);
  });
});
