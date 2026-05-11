import { BadRequestException, type Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CoupangProviderPort } from '../port/out/coupang-provider.port';
import { isCoupangCredentialResolutionError } from './channel-account.service';
import type { CoupangSyncOrderPayload, SyncResult } from './types';

type SyncLogger = Pick<Logger, 'error' | 'log'>;

interface OrderSyncDeps {
  prisma: PrismaService;
  coupang: CoupangProviderPort;
  logger: SyncLogger;
  formatOrderDate(d: Date): string;
  normalizeOrderStatus(raw: string | null | undefined): string | undefined;
}

export async function syncCoupangOrders(
  deps: OrderSyncDeps,
  organizationId: string,
  from?: Date,
  to?: Date,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: 0, details: [] };

  try {
    const dateTo = to ?? new Date();
    const dateFrom =
      from ?? new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    const response = await deps.coupang.getOrderSheets(organizationId, {
      createdAtFrom: deps.formatOrderDate(dateFrom),
      createdAtTo: deps.formatOrderDate(dateTo),
      maxPerPage: 50,
    });

    if (response.code === 'ERROR') {
      return {
        synced: 0,
        errors: 1,
        details: [`API 에러: ${response.message}`],
      };
    }

    const orders = response.data ?? [];

    for (const order of orders) {
      try {
        await syncSingleCoupangOrder(
          deps.prisma,
          order,
          organizationId,
          deps.normalizeOrderStatus,
        );
        result.synced++;
      } catch (error: unknown) {
        result.errors++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.details?.push(`주문 ${order.shipmentBoxId}: ${message}`);
        deps.logger.error(
          `Failed to sync order ${order.shipmentBoxId}: ${message}`,
        );
      }
    }
  } catch (error: unknown) {
    if (isCoupangCredentialResolutionError(error)) throw error;
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    result.errors++;
    result.details?.push(`전체 동기화 오류: ${message}`);
    deps.logger.error(`Order sync failed: ${message}`);
  }

  deps.logger.log(
    `Order sync complete: ${result.synced} synced, ${result.errors} errors`,
  );
  return result;
}

export async function syncSingleCoupangOrder(
  prisma: PrismaService,
  payload: CoupangSyncOrderPayload,
  organizationId: string,
  normalizeOrderStatus: (raw: string | null | undefined) => string | undefined,
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

  await prisma.$transaction(
    async (tx) => {
      const order = await tx.order.upsert({
        where: {
          organizationId_platform_externalOrderId: {
            organizationId,
            platform: 'coupang',
            externalOrderId: shipmentBoxId,
          },
        },
        update: {
          status: normalizeOrderStatus(payload.status),
          trackingNumber: payload.invoiceNumber ?? null,
          shippingCompany: payload.deliveryCompanyName ?? null,
          shippingPrice: payload.shippingPrice ?? 0,
          totalPrice,
          receiverName: payload.receiver?.name ?? null,
          receiverPhone: payload.receiver?.safeNumber ?? null,
          receiverAddr,
          memo: payload.parcelPrintMessage ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          platform: 'coupang',
          externalOrderId: shipmentBoxId,
          externalNumber: payload.orderId ? String(payload.orderId) : null,
          status: normalizeOrderStatus(payload.status) ?? 'ACCEPT',
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
        },
      });

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
              channel: 'coupang',
              isDeleted: false,
              ...(sellerProductId ? { externalId: sellerProductId } : {}),
            },
          },
          select: {
            id: true,
            optionId: true,
            option: { select: { sku: true, optionName: true } },
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
            optionId: listingOption?.optionId ?? null,
            productName: item.sellerProductName ?? '',
            optionName:
              item.vendorItemName ?? listingOption?.option?.optionName ?? null,
            sku: listingOption?.option?.sku ?? null,
            metadata: lineItemMetadata as Prisma.InputJsonValue,
          },
          create: {
            organizationId,
            orderId: order.id,
            listingOptionId: listingOption?.id ?? null,
            optionId: listingOption?.optionId ?? null,
            productName: item.sellerProductName ?? '',
            optionName:
              item.vendorItemName ?? listingOption?.option?.optionName ?? null,
            sku: listingOption?.option?.sku ?? null,
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
