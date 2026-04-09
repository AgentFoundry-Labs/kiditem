import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import type { MulterFile } from '../common/types';

@Injectable()
export class TrafficService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadTrafficStats(file: MulterFile) {
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('파일 크기 10MB 초과');
    }

    const buffer = file.buffer;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      throw new BadRequestException('데이터가 없습니다');
    }

    const keys = Object.keys(rows[0]);

    function findCol(...candidates: string[]): string | null {
      for (const c of candidates) {
        const found = keys.find((k) => k === c);
        if (found) return found;
      }
      for (const c of candidates) {
        const found = keys.find(
          (k) => k.includes(c) && !k.includes('전환') && !k.includes('총'),
        );
        if (found) return found;
      }
      return null;
    }

    const colProductId = findCol('등록상품ID', '등록상품 ID', 'sellerProductId');
    const colVisitors = findCol('방문자');
    const colViews =
      keys.find((k) => k === '조회') || keys.find((k) => k === '조회수') || null;
    const colCart = findCol('장바구니');
    const colOrders =
      keys.find((k) => k === '주문') || keys.find((k) => k === '주문수') || null;
    const colSalesQty = findCol('판매량', '판매수량');
    const colRevenue =
      keys.find((k) => k === '매출(원)') ||
      keys.find((k) => k === '매출') ||
      null;
    const colDate = findCol('날짜', '기간', '일자');

    if (!colProductId) {
      throw new BadRequestException(
        `등록상품ID 컬럼을 찾을 수 없습니다. 감지된 컬럼: ${keys.join(', ')}`,
      );
    }

    const products = await this.prisma.product.findMany({
      where: { coupangProductId: { not: null } },
      select: { id: true, coupangProductId: true },
    });
    const productMap = new Map(
      products.map((p) => [p.coupangProductId!, p.id]),
    );

    const today = new Date().toISOString().slice(0, 10);

    const parseNum = (val: unknown): number => {
      if (val === null || val === undefined) return 0;
      const n = Number(String(val).replace(/[,%]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const aggregated = new Map<
      string,
      {
        productId: string;
        periodDays: number;
        visitors: number;
        views: number;
        cartAdds: number;
        orders: number;
        salesQty: number;
        revenue: number;
        conversionRate: number;
        date: string;
      }
    >();

    let skipped = 0;

    for (const row of rows) {
      const cpId = String(row[colProductId] || '').trim();
      if (!cpId) {
        skipped++;
        continue;
      }

      const productId = productMap.get(cpId);
      if (!productId) {
        skipped++;
        continue;
      }

      const date = colDate
        ? String(row[colDate] || today).slice(0, 10)
        : today;
      const periodDays = 7;
      const key = `${productId}::${date}::${periodDays}`;

      const visitors = parseNum(colVisitors ? row[colVisitors] : 0);
      const views = parseNum(colViews ? row[colViews] : 0);
      const cartAdds = parseNum(colCart ? row[colCart] : 0);
      const orders = parseNum(colOrders ? row[colOrders] : 0);
      const salesQty = parseNum(colSalesQty ? row[colSalesQty] : 0);
      const revenue = parseNum(colRevenue ? row[colRevenue] : 0);

      const existing = aggregated.get(key);
      if (existing) {
        existing.visitors += visitors;
        existing.views += views;
        existing.cartAdds += cartAdds;
        existing.orders += orders;
        existing.salesQty += salesQty;
        existing.revenue += revenue;
      } else {
        aggregated.set(key, {
          productId,
          date,
          periodDays,
          visitors,
          views,
          cartAdds,
          orders,
          salesQty,
          revenue,
          conversionRate: 0,
        });
      }
    }

    for (const d of aggregated.values()) {
      d.conversionRate =
        d.visitors > 0
          ? Math.round((d.orders / d.visitors) * 10000) / 100
          : 0;
    }

    const dataArr = [...aggregated.values()];
    if (dataArr.length > 0) {
      await this.prisma.$transaction(
        dataArr.map((d) =>
          this.prisma.trafficStats.upsert({
            where: {
              productId_date_periodDays: {
                productId: d.productId,
                date: d.date,
                periodDays: d.periodDays,
              },
            },
            update: {
              visitors: d.visitors,
              views: d.views,
              cartAdds: d.cartAdds,
              orders: d.orders,
              salesQty: d.salesQty,
              revenue: d.revenue,
              conversionRate: d.conversionRate,
            },
            create: d,
          }),
        ),
      );
    }

    return {
      success: true,
      upserted: dataArr.length,
      skipped,
      detectedColumns: {
        productId: colProductId,
        visitors: colVisitors,
        views: colViews,
        cart: colCart,
        orders: colOrders,
        salesQty: colSalesQty,
        revenue: colRevenue,
        date: colDate,
      },
    };
  }
}
