import {
  Injectable,
  Logger,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getSellerProducts } from '../adapters/coupang/products';
import { getOrderSheets } from '../adapters/coupang/orders';
import { getVendorId } from '../adapters/coupang/coupang-client';
import type {
  SyncResult,
  HealthResult,
  SellerProductListResponse,
  OrderSheetResponse,
  CoupangSyncOrderPayload,
  CoupangSyncReturnPayload,
} from './types';

export type { SyncResult, HealthResult } from './types';

/**
 * Coupang raw status → 내부 canonical status 정규화. 현재 `NONE_TRACKING` (송장없는 배송)
 * 만 매핑 (DEPARTURE = 출고완료 와 동일 의미). UI pipeline 5-stage bucket 과 정합 유지.
 */
export function normalizeCoupangOrderStatus(raw: string | null | undefined): string | undefined {
  if (raw === 'NONE_TRACKING') return 'DEPARTURE';
  return raw ?? undefined;
}

/**
 * Coupang KR market timestamp formatter. UTC instant 을 KST wall-clock 으로 변환하고
 * `+09:00` offset 을 명시한다. 예: `new Date('2026-04-25T00:30:00.000Z')`
 * (KST 09:30) → `'2026-04-25T09:30:00+09:00'`.
 */
export function formatKstIso(d: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<HealthResult> {
    try {
      const vendorId = getVendorId();
      const response = (await getSellerProducts({
        maxPerPage: 1,
      })) as SellerProductListResponse;

      if (response.code === 'ERROR' || response.code === 'FORBIDDEN') {
        return {
          connected: false,
          vendorId,
          error: response.message || 'API 인증 실패',
        };
      }

      return { connected: true, vendorId };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Health check failed: ${message}`);
      return {
        connected: false,
        vendorId: '',
        error: message,
      };
    }
  }

  async syncProducts(_companyId: string): Promise<SyncResult> {
    throw new NotImplementedException(
      'Product sync requires Plan B3 listingId-based rewrite — uses dropped Product/ProductItem/MasterInventory models (ADR-0013)',
    );
  }

  async syncOrders(companyId: string, from?: Date, to?: Date): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const dateTo = to ?? new Date();
      const dateFrom =
        from ?? new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Coupang KR market 은 `yyyy-MM-ddTHH:mm:ss+09:00` 포맷 (KST 로컬 + offset) 을 기대한다.
      // 단순 `toISOString().slice(0,19)` (UTC + offset 제거) 로 보내면 Coupang 이 KST 로 해석해
      // 9시간 어긋난 윈도우로 조회됨 (예: KST 09:30 실행 → `00:30` 으로 인식, 00:30~09:30 누락).
      const response = (await getOrderSheets({
        createdAtFrom: formatKstIso(dateFrom),
        createdAtTo: formatKstIso(dateTo),
        maxPerPage: 50,
      })) as OrderSheetResponse;

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
          await this.syncSingleOrder(order, companyId);
          result.synced++;
        } catch (error: unknown) {
          result.errors++;
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          result.details?.push(`주문 ${order.shipmentBoxId}: ${message}`);
          this.logger.error(
            `Failed to sync order ${order.shipmentBoxId}: ${message}`,
          );
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors++;
      result.details?.push(`전체 동기화 오류: ${message}`);
      this.logger.error(`Order sync failed: ${message}`);
    }

    this.logger.log(
      `Order sync complete: ${result.synced} synced, ${result.errors} errors`,
    );
    return result;
  }

  async syncInventory(_companyId: string): Promise<SyncResult> {
    throw new NotImplementedException(
      'Inventory sync requires Plan B3 listingId-based rewrite — uses dropped Product/ProductItem/MasterInventory models (ADR-0013)',
    );
  }

  private async syncSingleOrder(
    payload: CoupangSyncOrderPayload,
    companyId: string,
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
        const order = await tx.order.upsert({
          where: {
            companyId_platform_externalOrderId: {
              companyId,
              platform: 'coupang',
              externalOrderId: shipmentBoxId,
            },
          },
          update: {
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
          },
          create: {
            companyId,
            platform: 'coupang',
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
          },
        });

        for (const item of orderItems) {
          if (!item.vendorItemId) {
            // Coupang API 는 line item 에 vendorItemId 항상 채워서 보냄. 누락 시 upsert key 충돌 방지 + 계약 명시화.
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
              companyId,
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
              companyId,
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

  private async syncSingleReturn(
    payload: CoupangSyncReturnPayload,
    companyId: string,
  ): Promise<void> {
    const receiptId = String(payload.receiptId);
    const metadata = {
      reasonCode: payload.reasonCode ?? null,
      reasonCodeText: payload.reasonCodeText ?? null,
      returnDeliveryId: payload.returnDeliveryId ?? null,
    };

    await this.prisma.$transaction(
      async (tx) => {
        // matchedOrder lookup inside tx: 동일 sync run 이 Order 를 먼저 만든 직후 Return 을 처리할 때 phantom read 방지.
        const matchedOrder = payload.orderId
          ? await tx.order.findFirst({
              where: {
                companyId,
                platform: 'coupang',
                externalNumber: String(payload.orderId),
              },
              select: { id: true },
            })
          : null;

        const ret = await tx.orderReturn.upsert({
          where: {
            companyId_platform_externalReturnId: {
              companyId,
              platform: 'coupang',
              externalReturnId: receiptId,
            },
          },
          update: {
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
          },
          create: {
            companyId,
            platform: 'coupang',
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
          },
        });

        await tx.orderReturnLineItem.deleteMany({
          where: { returnId: ret.id },
        });
        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const it of items) {
          await tx.orderReturnLineItem.create({
            data: {
              companyId,
              returnId: ret.id,
              productName: it.productName ?? it.vendorItemName ?? '',
              quantity: it.quantity ?? 1,
              metadata: { raw: it } as Prisma.InputJsonValue,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }
}
