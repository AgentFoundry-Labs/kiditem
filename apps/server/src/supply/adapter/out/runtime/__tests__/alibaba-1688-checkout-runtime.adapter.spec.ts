import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Alibaba1688CheckoutRuntimeAdapter,
  type Alibaba1688CheckoutProviderClient,
} from '../alibaba-1688-checkout-runtime.adapter';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Alibaba1688CheckoutRuntimeAdapter', () => {
  it('submits a purchase order through the configured provider endpoint', async () => {
    process.env.AGENT_OS_1688_CHECKOUT_RUNTIME = 'provider';
    process.env.AGENT_OS_1688_CHECKOUT_PROVIDER_URL =
      'https://checkout.example.test/1688/orders';
    process.env.AGENT_OS_1688_CHECKOUT_TIMEOUT_MS = '12345';
    const client: Alibaba1688CheckoutProviderClient = {
      submit: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          externalOrderId: '1688-RUNTIME-ORDER-1',
          externalOrderUrl:
            'https://trade.1688.com/order/1688-RUNTIME-ORDER-1.html',
        },
      }),
    };
    const adapter = new Alibaba1688CheckoutRuntimeAdapter(client);

    const result = await adapter.submit({
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

    expect(client.submit).toHaveBeenCalledWith({
      url: 'https://checkout.example.test/1688/orders',
      timeoutMs: 12345,
      body: {
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
      },
    });
    expect(result).toEqual({
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-RUNTIME-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-RUNTIME-ORDER-1.html',
    });
  });

  it('fails closed when provider runtime is not configured', async () => {
    delete process.env.AGENT_OS_1688_CHECKOUT_RUNTIME;
    delete process.env.AGENT_OS_1688_CHECKOUT_PROVIDER_URL;
    const client: Alibaba1688CheckoutProviderClient = { submit: vi.fn() };
    const adapter = new Alibaba1688CheckoutRuntimeAdapter(client);

    await expect(
      adapter.submit({
        organizationId: 'org-1',
        purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        purchaseOrder: {
          id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          supplierName: '1688 Supplier',
          supplierId: 'supplier-1',
          totalAmountCny: '45.60',
          items: [],
        },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.submit).not.toHaveBeenCalled();
  });
});
