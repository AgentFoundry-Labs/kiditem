import { describe, expect, it, vi } from 'vitest';
import { SellpiaShipmentTrackingSourceController } from './sellpia-shipment-tracking-source.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = { id: '22222222-2222-4222-8222-222222222222' };
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const TOKEN = '44444444-4444-4444-8444-444444444444';

describe('SellpiaShipmentTrackingSourceController', () => {
  it('begins the fixed single-day source plan with the idempotency key', async () => {
    const source = { beginAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT }) };
    const controller = new SellpiaShipmentTrackingSourceController(source as never);

    await controller.begin(
      ORG,
      USER as never,
      'tracking-key',
      { startDate: '2026-09-07', endDate: '2026-09-07' },
    );

    expect(source.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: USER.id,
      idempotencyKey: 'tracking-key',
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    });
  });

  it('rejects a caller-owned multi-day range before the owner port', async () => {
    const source = { beginAttempt: vi.fn() };
    const controller = new SellpiaShipmentTrackingSourceController(source as never);

    await expect(Promise.resolve().then(() => controller.begin(
      ORG,
      USER as never,
      'tracking-key',
      { startDate: '2026-09-06', endDate: '2026-09-07' },
    ))).rejects.toThrow('INVALID_SELLPIA_SHIPMENT_TRACKING_DATE_RANGE');
    expect(source.beginAttempt).not.toHaveBeenCalled();
  });

  it('passes the exact source token and multipart bytes to complete', async () => {
    const source = {
      completeAttempt: vi.fn().mockResolvedValue({ state: 'COMPLETE' }),
    };
    const controller = new SellpiaShipmentTrackingSourceController(source as never);
    const file = {
      buffer: Buffer.from('{"rows":[]}'),
      originalname: 'sellpia-shipment-tracking-v1.json',
      mimetype: 'application/json',
    };

    await controller.complete(ORG, USER as never, ATTEMPT, TOKEN, file);

    expect(source.completeAttempt).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: USER.id,
      attemptId: ATTEMPT,
      attemptToken: TOKEN,
      source: {
        bytes: file.buffer,
        fileName: file.originalname,
        contentType: file.mimetype,
      },
    });
  });

  it('reads raw source by attempt and sets private no-store download headers', async () => {
    const source = {
      readSourceDownload: vi.fn().mockResolvedValue({
        bytes: Buffer.from('{"rows":[]}'),
        fileName: 'sellpia-shipment-tracking-v1.json',
        contentType: 'application/json',
      }),
    };
    const controller = new SellpiaShipmentTrackingSourceController(source as never);
    const response = { setHeader: vi.fn() };

    await controller.readSource(ORG, ATTEMPT, response as never);

    expect(source.readSourceDownload).toHaveBeenCalledWith({
      organizationId: ORG,
      attemptId: ATTEMPT,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
