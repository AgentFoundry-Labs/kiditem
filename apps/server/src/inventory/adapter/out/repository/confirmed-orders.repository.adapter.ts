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
                productVariant: {
                  select: {
                    organizationId: true,
                    components: {
                      where: {
                        organizationId,
                        sellpiaInventorySku: { organizationId },
                      },
                      select: {
                        organizationId: true,
                        sellpiaInventorySkuId: true,
                        quantity: true,
                        sellpiaInventorySku: {
                          select: {
                            organizationId: true,
                            code: true,
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
        },
      },
    });
    return rows.map((order) => ({
      id: order.id,
      lineItems: order.lineItems.map((li) => ({
        productName: li.productName,
        quantity: li.quantity,
        listingOption: toPickingListingOption(
          li.listingOption,
          organizationId,
        ),
      })),
    }));
  }
}

function toPickingListingOption(
  listingOption: {
    organizationId: string;
    productVariant: {
      organizationId: string;
      components: Array<{
        organizationId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
        sellpiaInventorySku: {
          organizationId: string;
          code: string;
          name: string;
          optionName: string | null;
        };
      }>;
    } | null;
  } | null,
  organizationId: string,
): PickingSourceOrder['lineItems'][number]['listingOption'] {
  if (
    listingOption?.organizationId !== organizationId
    || listingOption.productVariant?.organizationId !== organizationId
    || listingOption.productVariant.components.some((component) => (
      component.organizationId !== organizationId
      || component.sellpiaInventorySku.organizationId !== organizationId
    ))
  ) return null;

  return {
    components: listingOption.productVariant.components.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      quantity: component.quantity,
      sellpiaInventorySku: {
        code: component.sellpiaInventorySku.code,
        name: component.sellpiaInventorySku.name,
        optionName: component.sellpiaInventorySku.optionName,
      },
    })),
  };
}
