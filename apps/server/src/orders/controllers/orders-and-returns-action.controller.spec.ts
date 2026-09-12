import { describe, expect, it, vi } from 'vitest';
import { NotImplementedException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ReturnsController } from './returns.controller';

describe('Orders and Returns action controllers', () => {
  it('propagates the unsupported order confirmation response instead of wrapping it as provider outage', async () => {
    const error = new NotImplementedException('쿠팡 주문 확인은 지원하지 않습니다.');
    const service = {
      confirm: vi.fn().mockRejectedValue(error),
      uploadInvoice: vi.fn(),
    };
    const controller = new OrdersController(service as never);

    await expect(
      controller.handleAction(
        { action: 'confirm', shipmentBoxIds: [12345] } as never,
        'organization-1',
      ),
    ).rejects.toBe(error);
    expect(service.confirm).toHaveBeenCalledWith([12345], 'organization-1');
  });

  it('propagates the unsupported invoice response instead of wrapping it as provider outage', async () => {
    const error = new NotImplementedException('쿠팡 송장 전송은 지원하지 않습니다.');
    const service = {
      confirm: vi.fn(),
      uploadInvoice: vi.fn().mockRejectedValue(error),
    };
    const controller = new OrdersController(service as never);

    await expect(
      controller.handleAction(
        {
          action: 'invoice',
          shipmentBoxId: 12345,
          deliveryCompanyCode: 'CJGLS',
          invoiceNumber: 'INV-001',
        } as never,
        'organization-1',
      ),
    ).rejects.toBe(error);
    expect(service.uploadInvoice).toHaveBeenCalledWith(
      12345,
      'CJGLS',
      'INV-001',
      'organization-1',
    );
  });

  it('propagates the unsupported return approval response instead of wrapping it as provider outage', async () => {
    const error = new NotImplementedException('쿠팡 반품 승인은 지원하지 않습니다.');
    const service = {
      approve: vi.fn().mockRejectedValue(error),
    };
    const controller = new ReturnsController(service as never);

    await expect(
      controller.handleAction({ receiptId: 12345 } as never, 'organization-1'),
    ).rejects.toBe(error);
    expect(service.approve).toHaveBeenCalledWith(12345, 'organization-1');
  });
});
