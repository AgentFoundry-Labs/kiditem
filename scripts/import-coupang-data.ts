/**
 * 쿠팡 실제 데이터 → DB 임포트 스크립트
 *
 * data/ 폴더의 raw JSON 데이터를 Prisma DB에 적재한다.
 * - Company: kiditem 셀러
 * - Product: 쿠팡 상품 1131개 (상세 가격 200개 매칭)
 * - Order: 쿠팡 주문 298건 → orderItem 단위로 분리
 * - Inventory: 상품별 1:1 생성 (초기값)
 *
 * Usage: npx tsx scripts/import-coupang-data.ts [--clean]
 *   --clean: 기존 데이터 삭제 후 임포트
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFile } from 'fs/promises';
import path from 'path';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_COMMISSION_RATE = 0.108;

// ─── Types ───────────────────────────────────────────────────────────────────

interface CoupangProduct {
  sellerProductId: number;
  sellerProductName: string;
  displayCategoryCode: number;
  statusName: string;
  createdAt: string;
}

interface CoupangDetailItem {
  salePrice: number;
  originalPrice: number;
  supplyPrice: number;
  saleAgentCommission: number;
}

interface CoupangDetail {
  code: string;
  data: {
    sellerProductId: number;
    sellerProductName: string;
    deliveryCharge: number;
    returnCharge: number;
    items?: CoupangDetailItem[];
  };
}

interface CoupangOrderItem {
  sellerProductId: number;
  sellerProductName: string;
  vendorItemId: number;
  salesPrice: number;
  orderPrice: number;
  shippingCount: number;
}

interface CoupangOrder {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  status: string;
  shippingPrice: number;
  orderer: { name: string };
  receiver: { name: string };
  orderItems: CoupangOrderItem[];
  deliveryCompanyName?: string;
  invoiceNumber?: string;
  deliveredDate?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

function statusMap(coupangStatus: string): string {
  const map: Record<string, string> = {
    '승인완료': 'active',
    '판매중지': 'inactive',
    '일시품절': 'inactive',
    '삭제': 'deleted',
  };
  return map[coupangStatus] ?? 'draft';
}

function orderStatusMap(coupangStatus: string): string {
  const map: Record<string, string> = {
    ACCEPT: 'processing',
    INSTRUCT: 'processing',
    DEPARTURE: 'shipped',
    DELIVERING: 'shipped',
    FINAL_DELIVERY: 'delivered',
    NONE_TRACKING: 'pending',
  };
  return map[coupangStatus] ?? 'pending';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const clean = process.argv.includes('--clean');
  console.log(`🚀 쿠팡 데이터 임포트 시작${clean ? ' (clean mode)' : ''}...`);

  // ── Step 0: Clean ──
  if (clean) {
    console.log('🗑️  기존 데이터 삭제...');
    await prisma.order.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.ad.deleteMany({});
    await prisma.profitLoss.deleteMany({});
    await prisma.thumbnail.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.alert.deleteMany({});
    await prisma.product.deleteMany({});
    console.log('   ✓ 기존 데이터 삭제 완료');
  }

  // ── Step 1: Company ──
  const company = await prisma.company.upsert({
    where: { slug: 'kiditem' },
    update: {},
    create: { name: '키드아이템', slug: 'kiditem' },
  });
  console.log(`✓ Company: ${company.name} (${company.id})`);

  // ── Step 2: Load data files ──
  console.log('📂 데이터 파일 로딩...');
  const [productsAll, detail50, detail150, ordersRaw] = await Promise.all([
    loadJson<CoupangProduct[]>('coupang_products_all.json'),
    loadJson<CoupangDetail[]>('coupang_products_detail_50.json'),
    loadJson<CoupangDetail[]>('coupang_products_detail_150more.json'),
    loadJson<CoupangOrder[]>('coupang_orders_raw.json'),
  ]);

  console.log(`   상품: ${productsAll.length}개, 상세: ${detail50.length + detail150.length}개, 주문: ${ordersRaw.length}건`);

  // ── Step 3: Build pricing map from detail data ──
  const pricingMap = new Map<
    number,
    { sellPrice: number; shippingCost: number; originalPrice: number }
  >();

  for (const detail of [...detail50, ...detail150]) {
    if (detail.code !== 'SUCCESS' || !detail.data) continue;
    const d = detail.data;
    const item = d.items?.[0];
    if (!item) continue;

    pricingMap.set(d.sellerProductId, {
      sellPrice: item.salePrice,
      shippingCost: d.deliveryCharge,
      originalPrice: item.originalPrice,
    });
  }
  console.log(`✓ 가격 매핑: ${pricingMap.size}개 상품`);

  // ── Step 4: Import products ──
  console.log('📦 상품 임포트...');
  const productIdMap = new Map<number, string>();
  let importedProducts = 0;
  let skippedProducts = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < productsAll.length; i += BATCH_SIZE) {
    const batch = productsAll.slice(i, i + BATCH_SIZE);

    for (const cp of batch) {
      const pricing = pricingMap.get(cp.sellerProductId);

      // 상품명 prefix에서 도매가 추출 시도 (예: "2000포켓몬메타몽" → 2000)
      const nameMatch = cp.sellerProductName.match(/^(\d+)/);
      const namePriceHint = nameMatch ? parseInt(nameMatch[1], 10) : null;

      const sellPrice = pricing?.sellPrice ?? null;
      const shippingCost = pricing?.shippingCost ?? 3000;

      try {
        const product = await prisma.product.create({
          data: {
            companyId: company.id,
            name: cp.sellerProductName,
            status: statusMap(cp.statusName),
            category: cp.displayCategoryCode ? String(cp.displayCategoryCode) : null,
            coupangProductId: String(cp.sellerProductId),
            sellPrice,
            shippingCost,
            commissionRate: COUPANG_COMMISSION_RATE,
            abcGrade: 'C',
            rawData: namePriceHint
              ? { namePriceHint, originalPrice: pricing?.originalPrice ?? namePriceHint }
              : pricing?.originalPrice
                ? { originalPrice: pricing.originalPrice }
                : undefined,
            inventory: {
              create: {
                companyId: company.id,
                currentStock: 0, // 실재고 데이터 없음
                safetyStock: 0,
                reorderPoint: 0,
                leadTimeDays: 14,
                dailySalesAvg: 0, // recalculate 서비스가 계산
              },
            },
          },
        });

        productIdMap.set(cp.sellerProductId, product.id);
        importedProducts++;
      } catch (e: unknown) {
        skippedProducts++;
        if (skippedProducts <= 3) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`   ⚠ 상품 스킵: ${cp.sellerProductName.slice(0, 30)} — ${msg.slice(0, 80)}`);
        }
      }
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= productsAll.length) {
      console.log(`   ${Math.min(i + BATCH_SIZE, productsAll.length)}/${productsAll.length} 처리...`);
    }
  }
  console.log(`✓ 상품: ${importedProducts}개 임포트, ${skippedProducts}개 스킵`);

  // ── Step 5: Import orders ──
  console.log('🛒 주문 임포트...');
  let importedOrders = 0;
  let unmatchedOrders = 0;

  for (const order of ordersRaw) {
    for (const item of order.orderItems) {
      const productId = productIdMap.get(item.sellerProductId);

      if (!productId) {
        unmatchedOrders++;
        continue;
      }

      const quantity = item.shippingCount || 1;
      const unitPrice = item.salesPrice || item.orderPrice || 0;
      const totalPrice = unitPrice * quantity;

      try {
        await prisma.order.create({
          data: {
            companyId: company.id,
            productId,
            orderNumber: `CPG-${order.shipmentBoxId}-${item.vendorItemId}`,
            platform: 'coupang',
            coupangOrderId: String(order.orderId),
            customerName: order.receiver?.name ?? order.orderer?.name ?? '',
            productName: item.sellerProductName,
            quantity,
            unitPrice,
            totalPrice,
            status: orderStatusMap(order.status),
            orderedAt: new Date(order.orderedAt),
            shippingCompany: order.deliveryCompanyName ?? null,
            trackingNumber: order.invoiceNumber ?? null,
            deliveredAt: order.deliveredDate ? new Date(order.deliveredDate) : null,
          },
        });
        importedOrders++;
      } catch (e: unknown) {
        if (importedOrders === 0) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`   ⚠ 주문 에러: ${msg.slice(0, 100)}`);
        }
      }
    }
  }
  console.log(`✓ 주문: ${importedOrders}건 임포트, ${unmatchedOrders}건 상품 미매칭`);

  // ── Summary ──
  const [productCount, orderCount, inventoryCount] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.inventory.count(),
  ]);

  console.log('\n═══════════════════════════════════════');
  console.log('📊 임포트 결과:');
  console.log(`   Company:   1 (${company.name})`);
  console.log(`   Products:  ${productCount}`);
  console.log(`   Orders:    ${orderCount}`);
  console.log(`   Inventory: ${inventoryCount}`);
  console.log('═══════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Import error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
