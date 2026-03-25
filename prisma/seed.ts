import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const geoyoung = await prisma.company.upsert({
    where: { slug: 'geoyoung' },
    update: {},
    create: { name: '거영', slug: 'geoyoung' },
  });

  const happyfriends = await prisma.company.upsert({
    where: { slug: 'happyfriends' },
    update: {},
    create: { name: '해피프렌즈', slug: 'happyfriends' },
  });

  console.log(`Companies: ${geoyoung.name}, ${happyfriends.name}`);

  const productsData = [
    { name: '유아용 실리콘 빨대컵 세트', companyId: geoyoung.id, status: 'active', abcGrade: 'A', adTier: 'premium', sellPrice: 15900, commissionRate: 0.108, shippingCost: 3000, costCny: 28.5, sourcePlatform: 'ALIBABA_1688', category: '유아식기' },
    { name: '아기 이유식 보관용기 10P', companyId: geoyoung.id, status: 'active', abcGrade: 'A', adTier: 'premium', sellPrice: 12900, commissionRate: 0.108, shippingCost: 3000, costCny: 18.0, sourcePlatform: 'ALIBABA_1688', category: '유아식기' },
    { name: '유아 방수 턱받이 3P', companyId: geoyoung.id, status: 'active', abcGrade: 'B', adTier: 'standard', sellPrice: 9900, commissionRate: 0.108, shippingCost: 3000, costCny: 12.0, sourcePlatform: 'ALIBABA_1688', category: '유아의류' },
    { name: '아기 면 손수건 10P', companyId: geoyoung.id, status: 'active', abcGrade: 'B', adTier: 'standard', sellPrice: 7900, commissionRate: 0.108, shippingCost: 3000, costCny: 8.5, sourcePlatform: 'ALIBABA_1688', category: '유아위생' },
    { name: '실리콘 이유식 매트', companyId: geoyoung.id, status: 'active', abcGrade: 'C', adTier: 'none', sellPrice: 11900, commissionRate: 0.108, shippingCost: 3000, costCny: 15.0, sourcePlatform: 'ALIBABA_1688', category: '유아식기' },
    { name: '유아용 스텐 수저 세트', companyId: happyfriends.id, status: 'active', abcGrade: 'A', adTier: 'premium', sellPrice: 8900, commissionRate: 0.108, shippingCost: 2500, costCny: 10.0, sourcePlatform: 'ALIBABA_1688', category: '유아식기' },
    { name: '아기 목욕 장난감 세트', companyId: happyfriends.id, status: 'active', abcGrade: 'B', adTier: 'standard', sellPrice: 13900, commissionRate: 0.108, shippingCost: 3000, costCny: 20.0, sourcePlatform: 'ALIBABA_1688', category: '유아완구' },
    { name: '유아 안전 모서리 보호대 8P', companyId: happyfriends.id, status: 'active', abcGrade: 'C', adTier: 'none', sellPrice: 6900, commissionRate: 0.108, shippingCost: 2500, costCny: 5.0, sourcePlatform: 'ALIBABA_1688', category: '안전용품' },
    { name: '아기 보행기 양말 3P', companyId: happyfriends.id, status: 'inactive', abcGrade: 'C', adTier: 'none', sellPrice: 5900, commissionRate: 0.108, shippingCost: 2500, costCny: 4.0, sourcePlatform: 'ALIBABA_1688', category: '유아의류' },
    { name: '실리콘 칫솔 세트 (0-3세)', companyId: geoyoung.id, status: 'active', abcGrade: 'A', adTier: 'premium', sellPrice: 10900, commissionRate: 0.108, shippingCost: 3000, costCny: 12.0, sourcePlatform: 'ALIBABA_1688', category: '유아위생' },
  ];

  const products = [];
  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        companyId: p.companyId,
        name: p.name,
        status: p.status,
        abcGrade: p.abcGrade,
        adTier: p.adTier,
        sellPrice: p.sellPrice,
        commissionRate: p.commissionRate,
        shippingCost: p.shippingCost,
        costCny: p.costCny,
        sourcePlatform: p.sourcePlatform,
        category: p.category,
        inventory: {
          create: {
            companyId: p.companyId,
            currentStock: Math.floor(Math.random() * 200) + 20,
            safetyStock: 30,
            reorderPoint: 50,
            reorderQuantity: 100,
            leadTimeDays: Math.floor(Math.random() * 10) + 7,
            dailySalesAvg: Math.floor(Math.random() * 15) + 3,
          },
        },
      },
    });
    products.push(product);
  }
  console.log(`Products: ${products.length} created with inventory`);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  for (const product of products) {
    for (let m = 0; m < 3; m++) {
      let month = thisMonth - m;
      let year = thisYear;
      if (month <= 0) { month += 12; year -= 1; }

      const revenue = Math.floor(Math.random() * 2000000) + 500000;
      const cogs = Math.floor(revenue * (0.25 + Math.random() * 0.15));
      const commission = Math.floor(revenue * 0.108);
      const shipping = Math.floor(Math.random() * 100000) + 30000;
      const adCost = Math.floor(revenue * (0.05 + Math.random() * 0.15));
      const netProfit = revenue - cogs - commission - shipping - adCost;
      const orderCount = Math.floor(Math.random() * 80) + 20;

      await prisma.profitLoss.create({
        data: {
          companyId: product.companyId,
          productId: product.id,
          year,
          month,
          revenue,
          cogs,
          commission,
          shippingCost: shipping,
          adCost,
          netProfit,
          orderCount,
          returnCount: Math.floor(Math.random() * 5),
        },
      });
    }
  }
  console.log('ProfitLoss: 3 months per product');

  for (const product of products) {
    const daysBack = 30;
    for (let d = 0; d < daysBack; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);

      const spend = Math.floor(Math.random() * 15000) + 2000;
      const impressions = Math.floor(Math.random() * 5000) + 500;
      const clicks = Math.floor(impressions * (0.01 + Math.random() * 0.04));
      const conversions = Math.floor(clicks * (0.05 + Math.random() * 0.1));
      const roas = spend > 0 ? ((conversions * (product.sellPrice ?? 10000)) / spend) * 100 : 0;

      await prisma.ad.create({
        data: {
          companyId: product.companyId,
          productId: product.id,
          platform: 'coupang',
          spend,
          impressions,
          clicks,
          conversions,
          roas: Math.round(roas * 100) / 100,
          date,
        },
      });
    }
  }
  console.log('Ads: 30 days per product');

  for (const product of products) {
    await prisma.thumbnail.create({
      data: {
        companyId: product.companyId,
        productId: product.id,
        imageUrl: `https://placehold.co/400x400?text=${encodeURIComponent(product.name.slice(0, 6))}`,
        strategy: product.abcGrade === 'A' ? 'premium' : 'standard',
        status: 'active',
        ctr: Math.round((0.02 + Math.random() * 0.06) * 10000) / 10000,
        impressions: Math.floor(Math.random() * 10000) + 1000,
        clicks: Math.floor(Math.random() * 500) + 50,
      },
    });
  }
  console.log('Thumbnails: 1 per product');

  const reviewers = ['김지은', '박민수', '이서연', '최준혁', '정하늘', '한소율', '강도윤', '윤서진'];
  const reviewContents = [
    '아이가 정말 좋아해요!',
    '품질이 좋습니다. 재구매 의사 있어요.',
    '배송이 빨라서 좋았어요.',
    '가성비 최고입니다.',
    '선물용으로 샀는데 반응이 좋아요.',
    '생각보다 작아요. 그래도 괜찮습니다.',
    '색상이 예쁘고 실용적이에요.',
    '두번째 구매입니다. 만족해요.',
  ];

  for (const product of products) {
    const count = Math.floor(Math.random() * 8) + 2;
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const reviewDate = new Date(now);
      reviewDate.setDate(reviewDate.getDate() - daysAgo);

      await prisma.review.create({
        data: {
          companyId: product.companyId,
          productId: product.id,
          rating: Math.floor(Math.random() * 2) + 4,
          content: reviewContents[Math.floor(Math.random() * reviewContents.length)],
          reviewerName: reviewers[Math.floor(Math.random() * reviewers.length)],
          reviewedAt: reviewDate,
        },
      });
    }
  }
  console.log('Reviews: 2-9 per product');

  const coupangStatuses = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
  for (const product of products) {
    const count = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(Math.random() * 14);
      const orderDate = new Date(now);
      orderDate.setDate(orderDate.getDate() - daysAgo);
      const qty = Math.floor(Math.random() * 3) + 1;
      const price = product.sellPrice ?? 10000;
      const customerName = reviewers[Math.floor(Math.random() * reviewers.length)];

      const coupangOrder = await prisma.coupangOrder.create({
        data: {
          companyId: product.companyId,
          shipmentBoxId: `SEED-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
          orderId: `SEEDORD-${Date.now()}-${i}`,
          orderer: { name: customerName },
          receiver: { name: customerName },
          totalPrice: price * qty,
          shippingPrice: 0,
          status: coupangStatuses[Math.floor(Math.random() * coupangStatuses.length)],
          orderedAt: orderDate,
        },
      });

      await prisma.coupangOrderItem.create({
        data: {
          orderId: coupangOrder.id,
          vendorItemId: `SEEDVI-${Date.now()}-${i}`,
          vendorItemName: product.name,
          sellerProductId: product.coupangProductId ?? null,
          sellerProductName: product.name,
          shippingCount: qty,
          salesPrice: price,
          orderPrice: price * qty,
          instantCouponDiscount: 0,
        },
      });
    }
  }
  console.log('CoupangOrders: 5-14 per product with CoupangOrderItems');

  const alertTypes = ['stock_low', 'profit_low', 'ad_high', 'thumbnail_drop'];
  const alertMessages = [
    '재고가 안전재고 이하로 떨어졌습니다.',
    '수익률이 3% 미만입니다. 점검이 필요합니다.',
    '광고비 비율이 15%를 초과했습니다.',
    '썸네일 클릭률이 20% 이상 하락했습니다.',
  ];

  for (let i = 0; i < 8; i++) {
    const typeIdx = Math.floor(Math.random() * alertTypes.length);
    await prisma.alert.create({
      data: {
        companyId: i < 5 ? geoyoung.id : happyfriends.id,
        productId: products[Math.floor(Math.random() * products.length)].id,
        type: alertTypes[typeIdx],
        severity: Math.random() > 0.5 ? 'warning' : 'critical',
        title: alertMessages[typeIdx].split('.')[0],
        message: alertMessages[typeIdx],
      },
    });
  }
  console.log('Alerts: 8 created');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
