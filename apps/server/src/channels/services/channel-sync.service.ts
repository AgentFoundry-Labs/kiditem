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

  async syncProducts(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const company = await this.getDefaultCompany();
      if (!company) {
        return { synced: 0, errors: 1, details: ['활성 회사가 없습니다'] };
      }

      const allSellerProductIds = await this.fetchAllSellerProductIds(result);

      this.logger.log(
        `Found ${allSellerProductIds.length} seller products from Coupang`,
      );

      for (const sellerProductId of allSellerProductIds) {
        try {
          await this.syncSingleProduct(sellerProductId, company.id);
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

  async syncOrders(from?: Date, to?: Date): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const company = await this.getDefaultCompany();
      if (!company) {
        return { synced: 0, errors: 1, details: ['활성 회사가 없습니다'] };
      }

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
          await this.syncSingleOrder(order, company.id);
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

  async syncInventory(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, details: [] };

    try {
      const company = await this.getDefaultCompany();
      if (!company) {
        return { synced: 0, errors: 1, details: ['활성 회사가 없습니다'] };
      }

      const syncedProducts = await this.prisma.product.findMany({
        where: {
          companyId: company.id,
          coupangProductId: { not: null },
        },
        include: {
          productItems: true,
          inventory: true,
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
                companyId: company.id,
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

  private async getDefaultCompany() {
    return this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
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
    for (const item of items ?? []) {
      const vendorItemId = String(item.vendorItemId);
      const existingItem = await this.prisma.productItem.findFirst({
        where: { productId, vendorItemId },
      });

      const itemData = {
        itemName: item.itemName ?? '',
        originalPrice: item.originalPrice ?? 0,
        salePrice: item.salePrice ?? 0,
        supplyPrice: item.supplyPrice ?? 0,
      };

      if (existingItem) {
        await this.prisma.productItem.update({
          where: { id: existingItem.id },
          data: itemData,
        });
      } else {
        await this.prisma.productItem.create({
          data: { productId, vendorItemId, ...itemData },
        });
      }
    }
  }

  private async syncSingleOrder(
    order: NonNullable<OrderSheetResponse['data']>[number],
    companyId: string,
  ): Promise<void> {
    const shipmentBoxId = String(order.shipmentBoxId);
    const orderId = String(order.orderId);
    const orderItems = order.orderItems ?? [];
    const totalPrice = orderItems.reduce(
      (sum, item) => sum + (item.orderPrice ?? 0),
      0,
    );

    const existingOrder = await this.prisma.coupangOrder.findUnique({
      where: { shipmentBoxId },
    });

    let coupangOrderId: string;

    if (existingOrder) {
      await this.prisma.coupangOrder.update({
        where: { id: existingOrder.id },
        data: {
          status: order.status ?? existingOrder.status,
          deliveryCompanyName: order.deliveryCompanyName ?? null,
          invoiceNumber: order.invoiceNumber ?? null,
          parcelPrintMessage: order.parcelPrintMessage ?? null,
          shippingPrice: order.shippingPrice ?? 0,
          totalPrice,
          orderer: order.orderer
            ? (order.orderer as Prisma.InputJsonValue)
            : existingOrder.orderer
              ? (existingOrder.orderer as Prisma.InputJsonValue)
              : Prisma.DbNull,
          receiver: order.receiver
            ? (order.receiver as Prisma.InputJsonValue)
            : existingOrder.receiver
              ? (existingOrder.receiver as Prisma.InputJsonValue)
              : Prisma.DbNull,
        },
      });
      coupangOrderId = existingOrder.id;
    } else {
      const created = await this.prisma.coupangOrder.create({
        data: {
          companyId,
          shipmentBoxId,
          orderId,
          status: order.status ?? 'ACCEPT',
          orderedAt: new Date(order.orderedAt),
          paidAt: order.paidAt ? new Date(order.paidAt) : null,
          shippingPrice: order.shippingPrice ?? 0,
          totalPrice,
          deliveryCompanyName: order.deliveryCompanyName ?? null,
          invoiceNumber: order.invoiceNumber ?? null,
          parcelPrintMessage: order.parcelPrintMessage ?? null,
          orderer: order.orderer
            ? (order.orderer as Prisma.InputJsonValue)
            : Prisma.DbNull,
          receiver: order.receiver
            ? (order.receiver as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
      coupangOrderId = created.id;
    }

    await this.prisma.coupangOrderItem.deleteMany({
      where: { orderId: coupangOrderId },
    });

    for (const item of orderItems) {
      await this.prisma.coupangOrderItem.create({
        data: {
          orderId: coupangOrderId,
          vendorItemId: String(item.vendorItemId),
          vendorItemName: item.vendorItemName ?? '',
          sellerProductId: item.sellerProductId
            ? String(item.sellerProductId)
            : null,
          sellerProductName: item.sellerProductName ?? '',
          shippingCount: item.shippingCount ?? 1,
          salesPrice: item.salesPrice ?? 0,
          orderPrice: item.orderPrice ?? 0,
          instantCouponDiscount: item.instantCouponDiscount ?? 0,
        },
      });
    }
  }
}
