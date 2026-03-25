import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ── KST Timestamp Helper ────────────────────────────────────────────────────

function parseKST(naive: string | null | undefined): Date | null {
  if (!naive || naive === '') return null;
  return new Date(naive + '+09:00');
}

// ── File Path Helper ────────────────────────────────────────────────────────

function resolveDataPath(filename: string): string | null {
  // Try process.cwd()/data/ first (normal repo)
  const cwdPath = path.join(process.cwd(), 'data', filename);
  if (existsSync(cwdPath)) return cwdPath;

  // Try two levels up (worktree scenario: .claude/worktrees/<name>/)
  const parentPath = path.join(process.cwd(), '..', '..', 'data', filename);
  if (existsSync(parentPath)) return parentPath;

  // Try main repo absolute path as last resort
  const mainRepoPath = path.join('/Users/yhc125/workspace/kiditem', 'data', filename);
  if (existsSync(mainRepoPath)) return mainRepoPath;

  return null;
}

async function readDataFile(filename: string): Promise<unknown[] | null> {
  const filePath = resolveDataPath(filename);
  if (!filePath) {
    console.warn(`File not found: ${filename}, skipping...`);
    return null;
  }
  console.log(`Reading: ${filePath}`);
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

// ── Import Orders ───────────────────────────────────────────────────────────

async function importOrders(companyId: string) {
  const raw = await readDataFile('coupang_orders_raw.json');
  if (!raw) return;

  let imported = 0;
  let errors = 0;

  for (const box of raw as Record<string, unknown>[]) {
    try {
      const orderItems = (box.orderItems as Record<string, unknown>[]) ?? [];

      const order = await prisma.coupangOrder.upsert({
        where: { shipmentBoxId: String(box.shipmentBoxId) },
        update: {
          status: (box.status as string) ?? 'ACCEPT',
          updatedAt: new Date(),
        },
        create: {
          companyId,
          shipmentBoxId: String(box.shipmentBoxId),
          orderId: String(box.orderId),
          orderer: (box.orderer as object) ?? null,
          receiver: (box.receiver as object) ?? null,
          status: (box.status as string) ?? 'ACCEPT',
          deliveryCompanyName: (box.deliveryCompanyName as string) ?? null,
          invoiceNumber: box.invoiceNumber ? String(box.invoiceNumber) : null,
          parcelPrintMessage: (box.parcelPrintMessage as string) ?? null,
          shippingPrice: Number(box.shippingPrice ?? 0),
          totalPrice: orderItems.reduce(
            (sum: number, item: Record<string, unknown>) =>
              sum + (Number(item.orderPrice) || 0),
            0,
          ),
          orderedAt: parseKST(box.orderedAt as string)!,
          paidAt: parseKST(box.paidAt as string | undefined),
        },
      });

      // Idempotent: delete existing items, then re-create
      await prisma.coupangOrderItem.deleteMany({
        where: { orderId: order.id },
      });

      if (orderItems.length > 0) {
        await prisma.coupangOrderItem.createMany({
          data: orderItems.map((item: Record<string, unknown>) => ({
            orderId: order.id,
            vendorItemId: String(item.vendorItemId),
            vendorItemName: String(item.vendorItemName ?? ''),
            sellerProductId: item.sellerProductId
              ? String(item.sellerProductId)
              : null,
            sellerProductName: String(item.sellerProductName ?? ''),
            shippingCount: Number(item.shippingCount ?? 1),
            salesPrice: Number(item.salesPrice ?? 0),
            orderPrice: Number(item.orderPrice ?? 0),
            instantCouponDiscount: Number(item.instantCouponDiscount ?? 0),
          })),
        });
      }

      imported++;
    } catch (err) {
      errors++;
      console.error(
        `Error importing order ${box.shipmentBoxId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `Orders imported: ${imported}/${raw.length}${errors > 0 ? ` (${errors} errors)` : ''}`,
  );
}

// ── Import Returns ──────────────────────────────────────────────────────────

async function importReturns(companyId: string) {
  const raw = await readDataFile('coupang_returns_all.json');
  if (!raw) return;

  let imported = 0;
  let errors = 0;

  for (const ret of raw as Record<string, unknown>[]) {
    try {
      const returnItems =
        (ret.returnItems as Record<string, unknown>[]) ?? [];

      const returnRecord = await prisma.coupangReturn.upsert({
        where: { receiptId: String(ret.receiptId) },
        update: {
          receiptStatus: (ret.receiptStatus as string) ?? 'UC',
          updatedAt: new Date(),
        },
        create: {
          companyId,
          receiptId: String(ret.receiptId),
          orderId: String(ret.orderId),
          requesterName: String(ret.requesterName ?? ''),
          receiptStatus: (ret.receiptStatus as string) ?? 'UC',
          receiptType: (ret.receiptType as string) ?? 'RETURN',
          faultByType: (ret.faultByType as string) ?? 'CUSTOMER',
          cancelReason: String(ret.cancelReason ?? ''),
          cancelReasonCategory1:
            (ret.cancelReasonCategory1 as string) ?? null,
          cancelReasonCategory2:
            (ret.cancelReasonCategory2 as string) ?? null,
          reasonCode: (ret.reasonCode as string) ?? null,
          reasonCodeText: (ret.reasonCodeText as string) ?? null,
          returnDeliveryId: ret.returnDeliveryId
            ? String(ret.returnDeliveryId)
            : null,
          enclosePrice: ret.enclosePrice ? Number(ret.enclosePrice) : null,
          // Note: actual data uses "createdAt" for request time
          requestedAt: parseKST(ret.createdAt as string)!,
          // Note: actual data uses "completeConfirmDate" (not "completedAt")
          completedAt: parseKST(ret.completeConfirmDate as string | undefined),
        },
      });

      // Idempotent: delete existing items, then re-create
      await prisma.coupangReturnItem.deleteMany({
        where: { returnId: returnRecord.id },
      });

      if (returnItems.length > 0) {
        await prisma.coupangReturnItem.createMany({
          data: returnItems.map((item: Record<string, unknown>) => ({
            returnId: returnRecord.id,
            vendorItemId: item.vendorItemId
              ? String(item.vendorItemId)
              : null,
            vendorItemName: String(item.vendorItemName ?? ''),
            sellerProductId: item.sellerProductId
              ? String(item.sellerProductId)
              : null,
            sellerProductName: String(item.sellerProductName ?? ''),
            purchaseCount: Number(item.purchaseCount ?? 1),
            cancelCount: Number(item.cancelCount ?? 1),
          })),
        });
      }

      imported++;
    } catch (err) {
      errors++;
      console.error(
        `Error importing return ${ret.receiptId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `Returns imported: ${imported}/${raw.length}${errors > 0 ? ` (${errors} errors)` : ''}`,
  );
}

// ── Import Product Details ──────────────────────────────────────────────────

async function importProductDetails() {
  const detail50 = await readDataFile('coupang_products_detail_50.json');
  const detail150 = await readDataFile(
    'coupang_products_detail_150more.json',
  );

  const allDetails: Record<string, unknown>[] = [
    ...((detail50 as Record<string, unknown>[]) ?? []),
    ...((detail150 as Record<string, unknown>[]) ?? []),
  ];

  if (allDetails.length === 0) {
    console.log('Product details: no data files found, skipping');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of allDetails) {
    try {
      // Pitfall 6: actual data is inside record.data (Coupang API wrapper)
      const d = record.data as Record<string, unknown> | undefined;
      if (!d || !d.sellerProductId) {
        skipped++;
        continue;
      }

      // Find matching Product by coupangProductId
      const product = await prisma.product.findFirst({
        where: { coupangProductId: String(d.sellerProductId) },
      });

      if (!product) {
        skipped++;
        continue;
      }

      // Collect images from all items
      const items = (d.items as Record<string, unknown>[]) ?? [];
      const allImages: unknown[] = [];
      for (const item of items) {
        const itemImages = (item.images as unknown[]) ?? [];
        allImages.push(...itemImages);
      }

      // Build deliveryInfo object from individual fields
      const deliveryInfo: Prisma.InputJsonObject = {
        deliveryMethod: (d.deliveryMethod as string) ?? null,
        deliveryCompanyCode: (d.deliveryCompanyCode as string) ?? null,
        deliveryCharge: (d.deliveryCharge as number) ?? null,
        deliveryChargeOnReturn: (d.deliveryChargeOnReturn as number) ?? null,
        deliverySurcharge: (d.deliverySurcharge as number) ?? null,
        remoteAreaDeliverable: (d.remoteAreaDeliverable as string) ?? null,
        unionDeliveryType: (d.unionDeliveryType as string) ?? null,
        returnCenterCode: (d.returnCenterCode as string) ?? null,
        returnChargeName: (d.returnChargeName as string) ?? null,
        returnZipCode: (d.returnZipCode as string) ?? null,
        returnAddress: (d.returnAddress as string) ?? null,
        returnAddressDetail: (d.returnAddressDetail as string) ?? null,
      };

      // Update Product with detail fields
      await prisma.product.update({
        where: { id: product.id },
        data: {
          deliveryChargeType:
            (d.deliveryChargeType as string) ?? null,
          freeShipOverAmount: d.freeShipOverAmount
            ? Number(d.freeShipOverAmount)
            : null,
          returnCharge: d.returnCharge ? Number(d.returnCharge) : null,
          deliveryInfo,
          images: allImages as Prisma.InputJsonValue,
        },
      });

      // ProductItem: delete existing, then re-create from items array
      await prisma.productItem.deleteMany({
        where: { productId: product.id },
      });

      if (items.length > 0) {
        await prisma.productItem.createMany({
          data: items.map((item: Record<string, unknown>) => ({
            productId: product.id,
            vendorItemId: item.vendorItemId
              ? String(item.vendorItemId)
              : null,
            itemName: String(item.itemName ?? ''),
            originalPrice: Number(item.originalPrice ?? 0),
            salePrice: Number(item.salePrice ?? 0),
            supplyPrice: Number(item.supplyPrice ?? 0),
          })),
        });
      }

      updated++;
    } catch (err) {
      errors++;
      console.error(
        `Error importing product detail:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `Product details updated: ${updated}, skipped: ${skipped}${errors > 0 ? `, errors: ${errors}` : ''}`,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Importing Coupang data...');

  // Look up the "geoyoung" company (must exist from db:seed)
  const geoyoung = await prisma.company.findFirst({
    where: { slug: 'geoyoung' },
  });
  if (!geoyoung) {
    throw new Error(
      'Company "geoyoung" not found. Run npm run db:seed first.',
    );
  }

  await importOrders(geoyoung.id);
  await importReturns(geoyoung.id);
  await importProductDetails();

  console.log('Coupang data import complete!');
}

main()
  .catch((e) => {
    console.error('Import error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
