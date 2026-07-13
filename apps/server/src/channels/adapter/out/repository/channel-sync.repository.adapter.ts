import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelSyncRepositoryPort,
  CoupangSyncOrderPayload,
  CoupangSyncReturnPayload,
  ProductListingSyncResult,
} from '../../../application/port/out/repository/channel-sync.repository.port';
import {
  normalizeCoupangOrderStatus,
  normalizeCoupangProductStatus,
} from '../../../domain/coupang-normalization';

type ListingForProductSync = {
  id: string;
  channelAccountId: string;
};

@Injectable()
export class ChannelSyncRepositoryAdapter implements ChannelSyncRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimaryCoupangAccountId(organizationId: string): Promise<string | null> {
    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return channelAccount?.id ?? null;
  }

  async syncSingleProductListing(input: {
    organizationId: string;
    sellerProductId: string;
    channelAccountId: string | null;
  }): Promise<ProductListingSyncResult> {
    const existing = await this.findExistingListingForProductSync(input);
    if (!existing.listing) {
      return {
        synced: false,
        detail: existing.detail ??
          `Listing ${input.sellerProductId}: no matching ChannelListing — create via product import / admin UI first`,
      };
    }
    return { synced: true };
  }

  async updateSingleProductListing(input: {
    organizationId: string;
    sellerProductId: string;
    channelAccountId: string | null;
    detail: {
      sellerProductName?: string | null;
      statusName?: string | null;
      deliveryChargeType?: string | null;
      freeShipOverAmount?: number | null;
      returnCharge?: number | null;
      deliveryInfo?: unknown;
      items?: Array<{
        vendorItemId?: string | number | null;
        itemName?: string | null;
        salePrice?: number | null;
      }> | null;
    };
  }): Promise<void> {
    const existingResult = await this.findExistingListingForProductSync(input);
    const existing = existingResult.listing;
    if (!existing) {
      throw new BadRequestException(existingResult.detail ?? 'ChannelListing not found');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.channelListing.updateMany({
          where: {
            id: existing.id,
            organizationId: input.organizationId,
            externalId: input.sellerProductId,
            channelAccountId: existing.channelAccountId,
            isActive: true,
            channelAccount: { is: { channel: 'coupang' } },
          },
          data: {
            channelName: input.detail.sellerProductName ?? null,
            status: normalizeCoupangProductStatus(input.detail.statusName),
            deliveryChargeType: input.detail.deliveryChargeType ?? null,
            freeShipOverAmount: input.detail.freeShipOverAmount ?? null,
            returnCharge: input.detail.returnCharge ?? null,
            deliveryInfo: input.detail.deliveryInfo === undefined
              ? Prisma.DbNull
              : (input.detail.deliveryInfo as Prisma.InputJsonValue),
          },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `ChannelListing ${input.sellerProductId} is no longer active for this organization`,
          );
        }

        const items = Array.isArray(input.detail.items) ? input.detail.items : [];
        for (const item of items) {
          if (!item.vendorItemId) {
            throw new BadRequestException(
              `Coupang item missing vendorItemId — cannot upsert (sellerProductId=${input.sellerProductId})`,
            );
          }
          const externalOptionId = String(item.vendorItemId);

          await tx.channelListingOption.upsert({
            where: {
              listingId_externalOptionId: {
                listingId: existing.id,
                externalOptionId,
              },
            },
            update: {
              itemName: item.itemName ?? null,
              salePrice: item.salePrice ?? null,
              isActive: true,
            },
            create: {
              organizationId: input.organizationId,
              listingId: existing.id,
              externalOptionId,
              itemName: item.itemName ?? null,
              salePrice: item.salePrice ?? null,
              isActive: true,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  async syncSingleOrder(
    organizationId: string,
    channelAccountId: string,
    payload: CoupangSyncOrderPayload,
  ): Promise<void> {
    const shipmentBoxId = String(payload.shipmentBoxId);
    const orderItems = payload.orderItems ?? [];
    const totalPrice = orderItems.reduce(
      (sum, item) => sum + (item.orderPrice ?? 0),
      0,
    );
    const receiverAddr =
      [payload.receiver?.addr1, payload.receiver?.addr2]
        .filter(Boolean)
        .join(' ') || null;
    const metadata = {
      orderer: payload.orderer ?? null,
      receiver: payload.receiver ?? null,
      parcelPrintMessage: payload.parcelPrintMessage ?? null,
    };

    await this.prisma.$transaction(
      async (tx) => {
        const existingOrder = await tx.order.findFirst({
          where: { organizationId, channelAccountId, externalOrderId: shipmentBoxId },
          select: { id: true },
        });
        const orderUpdate = {
            status: normalizeCoupangOrderStatus(payload.status),
            trackingNumber: payload.invoiceNumber ?? null,
            shippingCompany: payload.deliveryCompanyName ?? null,
            shippingPrice: payload.shippingPrice ?? 0,
            totalPrice,
            receiverName: payload.receiver?.name ?? null,
            receiverPhone: payload.receiver?.safeNumber ?? null,
            receiverAddr,
            memo: payload.parcelPrintMessage ?? null,
            metadata: metadata as Prisma.InputJsonValue,
            channelAccountId,
        };
        const order = existingOrder
          ? await tx.order.update({ where: { id: existingOrder.id }, data: orderUpdate })
          : await tx.order.create({ data: {
            organizationId,
            channelAccountId,
            externalOrderId: shipmentBoxId,
            externalNumber: payload.orderId ? String(payload.orderId) : null,
            status: normalizeCoupangOrderStatus(payload.status) ?? 'ACCEPT',
            customerName: payload.orderer?.name ?? '',
            receiverName: payload.receiver?.name ?? null,
            receiverPhone: payload.receiver?.safeNumber ?? null,
            receiverAddr,
            memo: payload.parcelPrintMessage ?? null,
            orderedAt: new Date(payload.orderedAt),
            paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
            shippingPrice: payload.shippingPrice ?? 0,
            totalPrice,
            trackingNumber: payload.invoiceNumber ?? null,
            shippingCompany: payload.deliveryCompanyName ?? null,
            metadata: metadata as Prisma.InputJsonValue,
          } });

        for (const item of orderItems) {
          if (!item.vendorItemId) {
            throw new BadRequestException(
              `OrderLineItem missing vendorItemId — cannot upsert (shipmentBoxId=${shipmentBoxId})`,
            );
          }
          const externalOptionId = String(item.vendorItemId);
          const sellerProductId = item.sellerProductId
            ? String(item.sellerProductId)
            : null;
          const externalLineId = externalOptionId;
          const listingOption = await tx.channelListingOption.findFirst({
            where: {
              organizationId,
              externalOptionId,
              isActive: true,
              listing: {
                channelAccountId,
                isActive: true,
                ...(sellerProductId ? { externalId: sellerProductId } : {}),
              },
            },
            select: {
              id: true,
              sellerSku: true,
              itemName: true,
            },
          });

          const lineItemMetadata = {
            sellerProductId: item.sellerProductId ?? null,
            instantCouponDiscount: item.instantCouponDiscount ?? 0,
          };

          await tx.orderLineItem.upsert({
            where: {
              orderId_externalLineId: {
                orderId: order.id,
                externalLineId,
              },
            },
            update: {
              quantity: item.shippingCount ?? 1,
              unitPrice: item.salesPrice ?? 0,
              totalPrice: item.orderPrice ?? 0,
              listingOptionId: listingOption?.id ?? null,
              productName: item.sellerProductName ?? '',
              optionName:
                item.vendorItemName ?? listingOption?.itemName ?? null,
              sku: listingOption?.sellerSku ?? externalOptionId,
              metadata: lineItemMetadata as Prisma.InputJsonValue,
            },
            create: {
              organizationId,
              orderId: order.id,
              listingOptionId: listingOption?.id ?? null,
              productName: item.sellerProductName ?? '',
              optionName:
                item.vendorItemName ?? listingOption?.itemName ?? null,
              sku: listingOption?.sellerSku ?? externalOptionId,
              quantity: item.shippingCount ?? 1,
              unitPrice: item.salesPrice ?? 0,
              totalPrice: item.orderPrice ?? 0,
              externalLineId,
              metadata: lineItemMetadata as Prisma.InputJsonValue,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  async syncSingleReturn(
    organizationId: string,
    channelAccountId: string,
    payload: CoupangSyncReturnPayload,
  ): Promise<void> {
    const receiptId = String(payload.receiptId);
    const metadata = {
      reasonCode: payload.reasonCode ?? null,
      reasonCodeText: payload.reasonCodeText ?? null,
      returnDeliveryId: payload.returnDeliveryId ?? null,
    };

    await this.prisma.$transaction(
      async (tx) => {
        const matchedOrder = payload.orderId
          ? await tx.order.findFirst({
              where: {
                organizationId,
                channelAccountId,
                externalNumber: String(payload.orderId),
              },
              select: { id: true },
            })
          : null;

        const existingReturn = await tx.orderReturn.findFirst({
          where: { organizationId, channelAccountId, externalReturnId: receiptId },
          select: { id: true },
        });
        const returnUpdate = {
            type: payload.receiptType ?? 'RETURN',
            status: payload.receiptStatus ?? 'pending',
            reason: payload.cancelReason ?? '',
            reasonCategory1: payload.cancelReasonCategory1 ?? null,
            reasonCategory2: payload.cancelReasonCategory2 ?? null,
            faultBy: payload.faultByType ?? 'CUSTOMER',
            requesterName: payload.requesterName ?? '',
            enclosePrice: payload.enclosePrice ?? null,
            completedAt: payload.completedAt
              ? new Date(payload.completedAt)
              : null,
            orderId: matchedOrder?.id ?? null,
            metadata: metadata as Prisma.InputJsonValue,
            channelAccountId,
        };
        const ret = existingReturn
          ? await tx.orderReturn.update({ where: { id: existingReturn.id }, data: returnUpdate })
          : await tx.orderReturn.create({ data: {
            organizationId,
            channelAccountId,
            externalReturnId: receiptId,
            type: payload.receiptType ?? 'RETURN',
            status: payload.receiptStatus ?? 'pending',
            reason: payload.cancelReason ?? '',
            reasonCategory1: payload.cancelReasonCategory1 ?? null,
            reasonCategory2: payload.cancelReasonCategory2 ?? null,
            faultBy: payload.faultByType ?? 'CUSTOMER',
            requesterName: payload.requesterName ?? '',
            enclosePrice: payload.enclosePrice ?? null,
            requestedAt: new Date(payload.requestedAt),
            completedAt: payload.completedAt
              ? new Date(payload.completedAt)
              : null,
            orderId: matchedOrder?.id ?? null,
            metadata: metadata as Prisma.InputJsonValue,
          } });

        await tx.orderReturnLineItem.deleteMany({
          where: { returnId: ret.id },
        });
        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const it of items) {
          const externalSku = it.vendorItemId == null ? null : String(it.vendorItemId);
          const orderLineItem = matchedOrder && externalSku
            ? await tx.orderLineItem.findFirst({
                where: {
                  organizationId,
                  orderId: matchedOrder.id,
                  externalLineId: externalSku,
                },
                select: {
                  id: true,
                  listingOptionId: true,
                  productName: true,
                  optionName: true,
                  sku: true,
                },
              })
            : null;
          await tx.orderReturnLineItem.create({
            data: {
              organizationId,
              returnId: ret.id,
              orderLineItemId: orderLineItem?.id ?? null,
              listingOptionId: orderLineItem?.listingOptionId ?? null,
              productName: it.productName ?? it.vendorItemName ?? orderLineItem?.productName ?? '',
              optionName: orderLineItem?.optionName ?? null,
              externalSku: externalSku ?? orderLineItem?.sku ?? null,
              quantity: it.quantity ?? 1,
              metadata: { raw: it } as Prisma.InputJsonValue,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  private async findExistingListingForProductSync(input: {
    organizationId: string;
    sellerProductId: string;
    channelAccountId: string | null;
  }): Promise<{ listing: ListingForProductSync | null; detail?: string }> {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        externalId: input.sellerProductId,
        isActive: true,
        channelAccount: { is: { organizationId: input.organizationId, channel: 'coupang' } },
        ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
      },
      select: { id: true, channelAccountId: true },
      orderBy: [{ channelAccountId: 'asc' }, { updatedAt: 'desc' }],
      take: input.channelAccountId ? 3 : 2,
    });
    if (input.channelAccountId) {
      const accountListing = listings.find(
        (listing) => listing.channelAccountId === input.channelAccountId,
      );
      if (accountListing) return { listing: accountListing };
      if (listings.length > 1) {
        return {
          listing: null,
          detail:
            `Listing ${input.sellerProductId}: multiple accountless/account candidates — select the market account before sync`,
        };
      }
      const inactive = await this.prisma.channelListing.findFirst({
        where: {
          organizationId: input.organizationId,
          externalId: input.sellerProductId,
          isActive: false,
          channelAccountId: input.channelAccountId,
          channelAccount: { is: { organizationId: input.organizationId, channel: 'coupang' } },
        },
        select: { id: true },
      });
      if (inactive) {
        return {
          listing: null,
          detail:
            `Listing ${input.sellerProductId}: ChannelListing no longer active for this organization`,
        };
      }
      return { listing: null };
    }
    if (listings.length === 1) return { listing: listings[0] };
    if (listings.length > 1) {
      return {
        listing: null,
        detail:
          `Listing ${input.sellerProductId}: multiple active ChannelListings — account identity is required`,
      };
    }
    const inactive = await this.prisma.channelListing.findFirst({
      where: {
        organizationId: input.organizationId,
        externalId: input.sellerProductId,
        isActive: false,
        channelAccount: { is: { organizationId: input.organizationId, channel: 'coupang' } },
        ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
      },
      select: { id: true },
    });
    if (inactive) {
      return {
        listing: null,
        detail:
          `Listing ${input.sellerProductId}: ChannelListing no longer active for this organization`,
      };
    }
    return { listing: null };
  }
}
