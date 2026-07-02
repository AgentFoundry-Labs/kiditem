import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProcurementService } from '../procurement.service';
import { PurchaseOrderSubmissionService } from '../purchase-order-submission.service';

describe('PurchaseOrderSubmissionService', () => {
  it('moves a pending purchase order to ordered after approval', async () => {
    const procurement = {
      getPurchaseOrderCheckoutSnapshot: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        supplierName: '1688 Supplier',
        supplierId: 'supplier-1',
        totalAmountCny: '45.60',
        items: [
          {
            productName: 'Silicone plate',
            optionId: 'option-1',
            quantity: 2,
            unitPriceCny: '22.80',
          },
        ],
      }),
      submitPurchaseOrder: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'ordered',
      }),
    } as unknown as ProcurementService;
    const service = new PurchaseOrderSubmissionService(procurement);

    const result = await service.submit({
      organizationId: 'org-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
    });

    expect(procurement.submitPurchaseOrder).toHaveBeenCalledWith(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      {
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      },
    );
    expect(result).toEqual({
      orderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      status: 'ordered',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      externalOrderPlatform: 'ALIBABA_1688',
      href: '/purchase-orders?orderId=0187e942-9098-7382-9a22-c5b821f2f5d1',
    });
  });

  it('uses the checkout runtime to obtain external order identity when it is not supplied', async () => {
    const procurement = {
      preparePurchaseOrderSubmission: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'pending',
      }),
      getPurchaseOrderCheckoutSnapshot: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        supplierName: '1688 Supplier',
        supplierId: 'supplier-1',
        totalAmountCny: '45.60',
        items: [
          {
            productName: 'Silicone plate',
            optionId: 'option-1',
            quantity: 2,
            unitPriceCny: '22.80',
          },
        ],
      }),
      submitPurchaseOrder: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'ordered',
      }),
    } as unknown as ProcurementService;
    const checkoutRuntime = {
      submit: vi.fn().mockResolvedValue({
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-RUNTIME-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-RUNTIME-ORDER-1.html',
      }),
    };
    const Service =
      PurchaseOrderSubmissionService as new (
        ...args: unknown[]
      ) => PurchaseOrderSubmissionService;
    const service = new Service(procurement, checkoutRuntime);

    const result = await service.submit({
      organizationId: 'org-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
    });

    expect(procurement.preparePurchaseOrderSubmission).toHaveBeenCalledWith(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
    );
    expect(checkoutRuntime.submit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      purchaseOrder: {
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        supplierName: '1688 Supplier',
        supplierId: 'supplier-1',
        totalAmountCny: '45.60',
        items: [
          {
            productName: 'Silicone plate',
            optionId: 'option-1',
            quantity: 2,
            unitPriceCny: '22.80',
          },
        ],
      },
    });
    expect(procurement.submitPurchaseOrder).toHaveBeenCalledWith(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      {
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-RUNTIME-ORDER-1',
        externalOrderUrl:
          'https://trade.1688.com/order/1688-RUNTIME-ORDER-1.html',
      },
    );
    expect(
      vi.mocked(procurement.preparePurchaseOrderSubmission).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(checkoutRuntime.submit).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(checkoutRuntime.submit).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(procurement.submitPurchaseOrder).mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      orderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-RUNTIME-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-RUNTIME-ORDER-1.html',
      href: '/purchase-orders?orderId=0187e942-9098-7382-9a22-c5b821f2f5d1',
    });
  });
});

describe('ProcurementService purchase order submission', () => {
  it('prepares a draft purchase order by moving it to pending before external checkout', async () => {
    const repository = {
      findScopedStatus: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'draft',
      }),
      updateStatusScoped: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'pending',
      }),
    };
    const procurement = new ProcurementService(repository as never);

    const result = await procurement.preparePurchaseOrderSubmission(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
    );

    expect(repository.updateStatusScoped).toHaveBeenCalledWith(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      'draft',
      { status: 'pending' },
    );
    expect(result).toMatchObject({ status: 'pending' });
  });

  it('keeps an already pending purchase order prepared without mutating again', async () => {
    const repository = {
      findScopedStatus: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'pending',
      }),
      updateStatusScoped: vi.fn(),
    };
    const procurement = new ProcurementService(repository as never);

    const result = await procurement.preparePurchaseOrderSubmission(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
    );

    expect(repository.updateStatusScoped).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'pending' });
  });

  it('submits a draft purchase order through pending and then ordered', async () => {
    const repository = {
      findScopedStatus: vi
        .fn()
        .mockResolvedValueOnce({
          id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          status: 'draft',
        })
        .mockResolvedValueOnce({
          id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          status: 'pending',
        }),
      updateStatusScoped: vi
        .fn()
        .mockResolvedValueOnce({
          id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          status: 'pending',
        })
        .mockResolvedValueOnce({
          id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          status: 'ordered',
        }),
    };
    const procurement = new ProcurementService(repository as never);

    const result = await procurement.submitPurchaseOrder(
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      {
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      },
    );

    expect(repository.updateStatusScoped).toHaveBeenNthCalledWith(
      1,
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      'draft',
      { status: 'pending' },
    );
    expect(repository.updateStatusScoped).toHaveBeenNthCalledWith(
      2,
      'org-1',
      '0187e942-9098-7382-9a22-c5b821f2f5d1',
      'pending',
      {
        status: 'ordered',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      },
    );
    expect(result).toMatchObject({ status: 'ordered' });
  });

  it('rejects shipped purchase orders before mutating', async () => {
    const repository = {
      findScopedStatus: vi.fn().mockResolvedValue({
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        status: 'shipped',
      }),
      updateStatusScoped: vi.fn(),
    };
    const procurement = new ProcurementService(repository as never);

    await expect(
      procurement.submitPurchaseOrder(
        'org-1',
        '0187e942-9098-7382-9a22-c5b821f2f5d1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.updateStatusScoped).not.toHaveBeenCalled();
  });
});
