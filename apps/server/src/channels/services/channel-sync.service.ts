import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getSellerProducts, getSellerProduct } from '../adapters/coupang/products';
import { getOrderSheets } from '../adapters/coupang/orders';
import { getVendorId } from '../adapters/coupang/coupang-client';
import type {
  SyncResult,
  HealthResult,
  SellerProductListResponse,
  SellerProductDetailResponse,
  OrderSheetResponse,
} from './types';

export type { SyncResult, HealthResult } from './types';

const COUPANG_STATUS_MAP: Record<string, string> = {
  APPROVED: 'active',
  ON_SALE: 'active',
  SUSPEND: 'paused',
  DELETED: 'deleted',
  UNDER_EXAMINATION: 'draft',
  REJECTED: 'draft',
};

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

  async syncProducts(companyId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const allSellerProductIds = await this.fetchAllSellerProductIds(result);

      this.logger.log(
        `Found ${allSellerProductIds.length} seller products from Coupang`,
      );

      for (const sellerProductId of allSellerProductIds) {
        try {
          await this.syncSingleProduct(sellerProductId, companyId);
          result.synced++;
        } catch (error: unknown) {
          result.errors++;
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          result.details?.push(`상품 ${sellerProductId}: ${message}`);
          this.logger.error(
            `Failed to sync product ${sellerProductId}: ${message}`,
          );
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors++;
      result.details?.push(`전체 동기화 오류: ${message}`);
      this.logger.error(`Product sync failed: ${message}`);
    }

    this.logger.log(
      `Product sync complete: ${result.synced} synced, ${result.errors} errors`,
    );
    return result;
  }

  async syncOrders(companyId: string, from?: Date, to?: Date): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const dateTo = to ?? new Date();
      const dateFrom =
        from ?? new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

      const formatDate = (d: Date): string =>
        d.toISOString().split('T')[0] + 'T00:00:00';

      const response = (await getOrderSheets({
        createdAtFrom: formatDate(dateFrom),
        createdAtTo: formatDate(dateTo),
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

  async syncInventory(companyId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const syncedProducts = await this.prisma.product.findMany({
        where: {
          companyId,
          coupangProductId: { not: null },
        },
        include: {
          productItems: true,
          inventory: true,
          masterProduct: true,
        },
      });

      this.logger.log(
        `Found ${syncedProducts.length} synced products for inventory update`,
      );

      for (const product of syncedProducts) {
        try {
          const totalStock = product.productItems.reduce(
            (sum, item) => sum + (item.salePrice > 0 ? 1 : 0),
            0,
          );

          // masterProductId 연결됨 → Inventory 쓰기 스킵 (아래 MasterInventory SUM 집계에서 처리)
          if (!product.masterProductId) {
            if (product.inventory) {
              await this.prisma.inventory.update({
                where: { id: product.inventory.id },
                data: {
                  currentStock: totalStock,
                  updatedAt: new Date(),
                },
              });
            } else {
              await this.prisma.inventory.create({
              data: {
                companyId: companyId,
                productId: product.id,
                currentStock: totalStock,
                reservedStock: 0,
                safetyStock: 0,
                reorderPoint: 0,
                reorderQuantity: 0,
                dailySalesAvg: 0,
              },
            });
            }
          }

          result.synced++;
        } catch (error: unknown) {
          result.errors++;
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          result.details?.push(`상품 ${product.id}: ${message}`);
          this.logger.error(
            `Failed to sync inventory for product ${product.id}: ${message}`,
          );
        }
      }

      // MasterInventory: 1:N SUM 집계 후 일괄 upsert
      const masterStockMap = new Map<string, number>();
      for (const product of syncedProducts) {
        if (!product.masterProductId) continue;
        const stock = product.productItems.reduce(
          (sum, item) => sum + (item.salePrice > 0 ? 1 : 0),
          0,
        );
        const current = masterStockMap.get(product.masterProductId) ?? 0;
        masterStockMap.set(product.masterProductId, current + stock);
      }
      await Promise.all(
        Array.from(masterStockMap.entries()).map(([masterProductId, totalStock]) =>
          this.prisma.masterInventory
            .upsert({
              where: { masterProductId },
              update: { currentStock: totalStock },
              create: {
                companyId: companyId,
                masterProductId,
                currentStock: totalStock,
                safetyStock: 0,
              },
            })
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              this.logger.error(`MasterInventory sync failed for ${masterProductId}: ${msg}`);
            }),
        ),
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors++;
      result.details?.push(`전체 동기화 오류: ${message}`);
      this.logger.error(`Inventory sync failed: ${message}`);
    }

    this.logger.log(
      `Inventory sync complete: ${result.synced} synced, ${result.errors} errors`,
    );
    return result;
  }

  private async fetchAllSellerProductIds(
    result: SyncResult,
  ): Promise<number[]> {
    let nextToken: string | undefined;
    const ids: number[] = [];

    do {
      const response = (await getSellerProducts({
        maxPerPage: 50,
        nextToken,
      })) as SellerProductListResponse;

      if (response.code === 'ERROR') {
        result.errors++;
        result.details?.push(`API 에러: ${response.message}`);
        break;
      }

      for (const sp of response.data?.content ?? []) {
        ids.push(sp.sellerProductId);
      }

      nextToken = response.data?.nextToken;
    } while (nextToken);

    return ids;
  }

  private async syncSingleProduct(
    sellerProductId: number,
    companyId: string,
  ): Promise<void> {
    const detail = (await getSellerProduct(
      String(sellerProductId),
    )) as SellerProductDetailResponse;

    if (!detail.data) {
      throw new Error('상세 데이터 없음');
    }

    const pd = detail.data;
    const items = pd.items ?? [];
    const primaryItem = items[0];
    const mappedStatus = COUPANG_STATUS_MAP[pd.statusName ?? ''] ?? 'draft';

    const images = (pd.images ?? []).map((img) => ({
      imageOrder: img.imageOrder,
      imageType: img.imageType,
      cdnPath: img.cdnPath,
    }));

    const coupangProductId = String(pd.sellerProductId);
    const existingProduct = await this.prisma.product.findFirst({
      where: { coupangProductId },
    });

    if (existingProduct) {
      await this.prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          name: pd.sellerProductName,
          sellPrice: primaryItem?.salePrice ?? null,
          status: mappedStatus,
          category: pd.displayCategoryCode
            ? String(pd.displayCategoryCode)
            : existingProduct.category,
          deliveryChargeType: pd.deliveryChargeType ?? null,
          freeShipOverAmount: pd.freeShipOverAmount ?? null,
          returnCharge: pd.returnCharge ?? null,
          deliveryInfo: pd.deliveryInfo
            ? (pd.deliveryInfo as Prisma.InputJsonValue)
            : Prisma.DbNull,
          images: images.length > 0 ? images : undefined,
        },
      });

      await this.upsertProductItems(existingProduct.id, items);
    } else {
      const newProduct = await this.prisma.product.create({
        data: {
          companyId,
          name: pd.sellerProductName,
          coupangProductId,
          sellPrice: primaryItem?.salePrice ?? null,
          status: mappedStatus,
          category: pd.displayCategoryCode
            ? String(pd.displayCategoryCode)
            : null,
          deliveryChargeType: pd.deliveryChargeType ?? null,
          freeShipOverAmount: pd.freeShipOverAmount ?? null,
          returnCharge: pd.returnCharge ?? null,
          deliveryInfo: pd.deliveryInfo
            ? (pd.deliveryInfo as Prisma.InputJsonValue)
            : Prisma.DbNull,
          images: images.length > 0 ? images : [],
        },
      });

      await this.upsertProductItems(newProduct.id, items);
    }
  }

  private async upsertProductItems(
    productId: string,
    items: NonNullable<SellerProductDetailResponse['data']>['items'],
  ): Promise<void> {
    if (!items?.length) return;

    // 한 번의 쿼리로 기존 아이템 맵 구성 → vendorItemId 기준으로 매칭
    const vendorItemIds = items.map((item) => String(item.vendorItemId));
    const existingItems = await this.prisma.productItem.findMany({
      where: { productId, vendorItemId: { in: vendorItemIds } },
      select: { id: true, vendorItemId: true },
    });
    const existingByVendorId = new Map(
      existingItems.map((it) => [it.vendorItemId, it.id]),
    );

    // update / create 를 병렬 실행 (같은 vendorItemId 는 호출 내 중복 없다는 가정)
    await Promise.all(
      items.map((item) => {
        const vendorItemId = String(item.vendorItemId);
        const itemData = {
          itemName: item.itemName ?? '',
          originalPrice: item.originalPrice ?? 0,
          salePrice: item.salePrice ?? 0,
          supplyPrice: item.supplyPrice ?? 0,
        };
        const existingId = existingByVendorId.get(vendorItemId);
        if (existingId) {
          return this.prisma.productItem.update({
            where: { id: existingId },
            data: itemData,
          });
        }
        return this.prisma.productItem.create({
          data: { productId, vendorItemId, ...itemData },
        });
      }),
    );
  }

  private async syncSingleOrder(
    payload: NonNullable<OrderSheetResponse['data']>[number],
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
            status: payload.status ?? undefined,
            shippedAt: payload.shippedAt
              ? new Date(payload.shippedAt)
              : undefined,
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
            status: payload.status ?? 'ACCEPT',
            customerName: payload.orderer?.name ?? '',
            receiverName: payload.receiver?.name ?? null,
            receiverPhone: payload.receiver?.safeNumber ?? null,
            receiverAddr,
            memo: payload.parcelPrintMessage ?? null,
            orderedAt: new Date(payload.orderedAt),
            paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
            shippedAt: payload.shippedAt ? new Date(payload.shippedAt) : null,
            shippingPrice: payload.shippingPrice ?? 0,
            totalPrice,
            trackingNumber: payload.invoiceNumber ?? null,
            shippingCompany: payload.deliveryCompanyName ?? null,
            metadata: metadata as Prisma.InputJsonValue,
          },
        });

        for (const item of orderItems) {
          const vendorItemId = item.vendorItemId
            ? String(item.vendorItemId)
            : null;
          const listingOption = vendorItemId
            ? await tx.channelListingOption.findUnique({
                where: {
                  companyId_vendorItemId: {
                    companyId,
                    vendorItemId,
                  },
                },
                select: {
                  id: true,
                  optionId: true,
                  option: { select: { sku: true, optionName: true } },
                },
              })
            : null;

          const lineItemMetadata = {
            sellerProductId: item.sellerProductId ?? null,
            instantCouponDiscount: item.instantCouponDiscount ?? 0,
          };

          await tx.orderLineItem.upsert({
            where: {
              orderId_externalLineId: {
                orderId: order.id,
                externalLineId: vendorItemId ?? '',
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
              externalLineId: vendorItemId,
              metadata: lineItemMetadata as Prisma.InputJsonValue,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }
}
