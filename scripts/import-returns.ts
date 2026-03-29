import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';

const connectionString = process.env.DATABASE_URL || 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface ReturnItemJSON {
  vendorItemId: number;
  vendorItemName: string;
  sellerProductId: number;
  sellerProductName: string;
  purchaseCount: number;
  cancelCount: number;
}

interface ReturnJSON {
  receiptId: number;
  orderId: number;
  receiptType: string;
  receiptStatus: string;
  createdAt: string;
  modifiedAt: string;
  requesterName: string;
  cancelReasonCategory1: string;
  cancelReasonCategory2: string;
  cancelReason: string;
  faultByType: string;
  returnDeliveryId: number | null;
  enclosePrice: number;
  completeConfirmDate: string | null;
  returnItems: ReturnItemJSON[];
  reasonCode: string;
  reasonCodeText: string;
  returnShippingCharge: number;
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('No company found in DB');
    process.exit(1);
  }
  console.log(`Using company: ${company.id}`);

  const jsonPath = '/Users/yhc125/workspace/kiditem_dashboard/data/coupang_returns_all.json';
  const raw = readFileSync(jsonPath, 'utf-8');
  const returns: ReturnJSON[] = JSON.parse(raw);
  console.log(`Found ${returns.length} return records to import`);

  await prisma.coupangReturnItem.deleteMany({});
  await prisma.coupangReturn.deleteMany({});
  console.log('Cleared existing return data');

  let insertedReturns = 0;
  let insertedItems = 0;

  for (const r of returns) {
    const created = await prisma.coupangReturn.create({
      data: {
        companyId: company.id,
        receiptId: String(r.receiptId),
        orderId: String(r.orderId),
        requesterName: r.requesterName || '',
        receiptStatus: r.receiptStatus,
        receiptType: r.receiptType,
        faultByType: r.faultByType || 'CUSTOMER',
        cancelReason: r.cancelReason || '',
        cancelReasonCategory1: r.cancelReasonCategory1 || null,
        cancelReasonCategory2: r.cancelReasonCategory2 || null,
        reasonCode: r.reasonCode || null,
        reasonCodeText: r.reasonCodeText || null,
        returnDeliveryId: r.returnDeliveryId ? String(r.returnDeliveryId) : null,
        enclosePrice: r.enclosePrice || 0,
        requestedAt: new Date(r.createdAt),
        completedAt: r.completeConfirmDate ? new Date(r.completeConfirmDate) : null,
        returnItems: {
          create: (r.returnItems || []).map((item) => ({
            vendorItemId: item.vendorItemId ? String(item.vendorItemId) : null,
            vendorItemName: item.vendorItemName || '',
            sellerProductId: item.sellerProductId ? String(item.sellerProductId) : null,
            sellerProductName: item.sellerProductName || '',
            purchaseCount: item.purchaseCount || 1,
            cancelCount: item.cancelCount || 1,
          })),
        },
      },
      include: { returnItems: true },
    });

    insertedReturns++;
    insertedItems += created.returnItems.length;
  }

  console.log(`\nImport complete:`);
  console.log(`  Returns: ${insertedReturns}`);
  console.log(`  Return Items: ${insertedItems}`);

  const count = await prisma.coupangReturn.count();
  const itemCount = await prisma.coupangReturnItem.count();
  console.log(`\nVerification:`);
  console.log(`  coupang_returns: ${count}`);
  console.log(`  coupang_return_items: ${itemCount}`);
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
