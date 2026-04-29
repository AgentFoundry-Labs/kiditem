import {
  Injectable,
  Logger,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getSellerProduct, getSellerProducts } from '../adapters/coupang/products';
import { getOrderSheets } from '../adapters/coupang/orders';
import { getVendorId } from '../adapters/coupang/coupang-client';
import type {
  SyncResult,
  HealthResult,
  SellerProductListResponse,
  SellerProductDetailResponse,
  OrderSheetResponse,
  CoupangSyncOrderPayload,
  CoupangSyncReturnPayload,
} from './types';

/**
 * Coupang raw status → 내부 canonical status 정규화. 현재 `NONE_TRACKING` (송장없는 배송)
 * 만 매핑 (DEPARTURE = 출고완료 와 동일 의미). UI pipeline 5-stage bucket 과 정합 유지.
 */
export function normalizeCoupangOrderStatus(raw: string | null | undefined): string | undefined {
  if (raw === 'NONE_TRACKING') return 'DEPARTURE';
  return raw ?? undefined;
}

/**
 * Coupang seller_product `statusName` → 내부 ChannelListing `status`.
 * 새 raw status 는 lowercase fallback 으로 통과시키되, 매핑된 값은 product UI / strategy
 * 에서 안정적으로 쿼리할 수 있는 canonical 값으로 정규화한다. C1 — Wave C.
 */
function normalizeCoupangProductStatus(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  switch (raw) {
    case 'APPROVED':
    case 'ON_SALE':
      return 'active';
    case 'SUSPEND':
      return 'paused';
    case 'DELETED':
      return 'deleted';
    case 'UNDER_EXAMINATION':
    case 'REJECTED':
      return 'draft';
    default:
      return raw.toLowerCase();
  }
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

  /**
   * Coupang seller-product → ChannelListing/ChannelListingOption 동기화.
   *
   * 페이지네이션은 `nextToken` 기반. 각 listing 은 별도 transaction 으로 처리해서
   * batch 중간 실패가 다른 listing 의 동기화를 막지 않도록 한다 (`syncOrders` 와 동일
   * continue-on-error 패턴).
   *
   * **Master 자동 생성 안 함**: `ChannelListing.masterId` 는 required 이므로, 기존
   * listing 이 없는 sellerProductId 는 skip + report 한다. 신규 listing 생성은
   * 제품 import / admin UI 가 담당해야 함 (ADR-0019 same-business-domain rule).
   * 한 번이라도 listing 이 등록된 sellerProductId 는 매번 sync 가 refresh 한다 →
   * 재실행 idempotent (같은 (listingId, externalOptionId) 는 update 만).
   *
   * `vendorItemId` 는 항상 `ChannelListingOption.externalOptionId` 로 mapping.
   * 내부 `optionId` 는 별도 매칭 단계가 채우며 여기서는 nullable 그대로 유지
   * (unmatched 옵션이 ingestion 을 막지 않게).
   */
  async syncProducts(companyId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };
    const PRODUCT_PAGE_SIZE = 50;
    const MAX_PAGES = 200;

    let nextToken: string | undefined;
    let pages = 0;

    try {
      do {
        const listResponse = (await getSellerProducts({
          nextToken,
          maxPerPage: PRODUCT_PAGE_SIZE,
        })) as SellerProductListResponse;

        if (listResponse.code !== 'SUCCESS') {
          result.errors += 1;
          result.details?.push(
            `seller-products list ${listResponse.code}: ${listResponse.message || 'Unknown API error'}`,
          );
          break;
        }

        const items = listResponse.data?.content ?? [];
        for (const summary of items) {
          const sellerProductId = String(summary.sellerProductId);
          try {
            await this.syncSingleProductListing(sellerProductId, companyId, result);
          } catch (error: unknown) {
            result.errors += 1;
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.details?.push(`Listing ${sellerProductId}: ${message}`);
            this.logger.error(`Failed to sync listing ${sellerProductId}: ${message}`);
          }
        }

        nextToken = listResponse.data?.nextToken;
        pages += 1;
      } while (nextToken && pages < MAX_PAGES);

      if (nextToken && pages >= MAX_PAGES) {
        result.details?.push(
          `Stopped after ${MAX_PAGES} pages of seller-products — re-run to continue`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors += 1;
      result.details?.push(`Product sync failed: ${message}`);
      this.logger.error(`Product sync failed: ${message}`);
    }

    this.logger.log(
      `Product sync complete: ${result.synced} synced, ${result.errors} errors`,
    );
    return result;
  }

  private async syncSingleProductListing(
    sellerProductId: string,
    companyId: string,
    result: SyncResult,
  ): Promise<void> {
    // Refresh-only: 신규 master 자동 생성 금지. 기존 listing 이 있을 때만 진행.
    const existing = await this.prisma.channelListing.findFirst({
      where: {
        companyId,
        channel: 'coupang',
        externalId: sellerProductId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!existing) {
      result.details?.push(
        `Listing ${sellerProductId}: no matching ChannelListing — create via product import / admin UI first`,
      );
      return;
    }

    const detailResponse = (await getSellerProduct(sellerProductId)) as SellerProductDetailResponse;
    if (detailResponse.code !== 'SUCCESS') {
      throw new Error(
        `detail ${detailResponse.code}: ${detailResponse.message || 'Unknown API error'}`,
      );
    }
    const detail = detailResponse.data;
    if (!detail) {
      throw new Error('detail returned no data');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.channelListing.updateMany({
          where: {
            id: existing.id,
            companyId,
            channel: 'coupang',
            externalId: sellerProductId,
            isDeleted: false,
          },
          data: {
            channelName: detail.sellerProductName ?? null,
            status: normalizeCoupangProductStatus(detail.statusName),
            deliveryChargeType: detail.deliveryChargeType ?? null,
            freeShipOverAmount: detail.freeShipOverAmount ?? null,
            returnCharge: detail.returnCharge ?? null,
            // Prisma `Json?` 컬럼: SQL NULL 표현은 `Prisma.DbNull`.
            // payload 가 deliveryInfo 를 안 보내면 컬럼을 비우고, 보내면 그대로 저장.
            deliveryInfo: detail.deliveryInfo === undefined
              ? Prisma.DbNull
              : (detail.deliveryInfo as Prisma.InputJsonValue),
          },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `ChannelListing ${sellerProductId} is no longer active for this company`,
          );
        }

        const items = Array.isArray(detail.items) ? detail.items : [];
        for (const item of items) {
          if (!item.vendorItemId) {
            // Coupang seller-product detail 은 item 에 vendorItemId 항상 채워서 보냄.
            // 누락 시 (listingId, externalOptionId) upsert key 충돌 방지 + 계약 명시화.
            throw new BadRequestException(
              `Coupang item missing vendorItemId — cannot upsert (sellerProductId=${sellerProductId})`,
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
              companyId,
              listingId: existing.id,
              externalOptionId,
              itemName: item.itemName ?? null,
              salePrice: item.salePrice ?? null,
              isActive: true,
              // optionId 는 internal ProductOption 매칭 단계가 채움. C1 에서는 nullable
              // 그대로 두어 unmatched 옵션이 ingestion 을 막지 않게 한다.
            },
          });
        }
      },
      { timeout: 15_000 },
    );

    result.synced += 1;
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
      'Inventory sync is not implemented yet — define the InventoryService single-writer boundary before adding channel inventory writes',
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
