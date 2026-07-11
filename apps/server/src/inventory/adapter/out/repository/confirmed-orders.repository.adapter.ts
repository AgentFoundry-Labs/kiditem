import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { PickingSourceOrder } from '../../../domain/policy/picking-rules';
import type { ConfirmedOrdersPort } from '../../../application/port/out/cross-domain/confirmed-orders.port';

// Read-only adapter that crosses into the orders aggregate to feed the picking
// use case. Inventory consumes this through ConfirmedOrdersPort so application
// code never reaches into another owner domain's service.
@Injectable()
export class ConfirmedOrdersRepositoryAdapter implements ConfirmedOrdersPort {
  constructor(private readonly prisma: PrismaService) {}

  async findConfirmedOrdersForPicking(organizationId: string): Promise<PickingSourceOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: { organizationId, status: 'confirmed' },
      include: {
        lineItems: {
          select: {
            productName: true,
            quantity: true,
            listingOption: {
              select: {
                organizationId: true,
                components: {
                  select: {
                    inventorySkuId: true,
                    quantity: true,
                    inventorySku: {
                      select: {
                        sellpiaProductCode: true,
                        name: true,
                        optionName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return rows.map((order) => ({
      id: order.id,
      lineItems: order.lineItems.map((li) => ({
        productName: li.productName,
        quantity: li.quantity,
        listingOption: li.listingOption?.organizationId === organizationId
          ? { components: li.listingOption.components }
          : null,
      })),
    }));
  }
}
