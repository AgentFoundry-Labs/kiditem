import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import type { MulterFile } from '../common/types';

function parseRoasPercent(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '-') return 0;
  const str = String(val).replace(/%/g, '').replace(/,/g, '').trim();
  if (!str || str === '-') return 0;
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function safeInt(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '-') return 0;
  const num = parseInt(String(val).replace(/,/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function safeFloat(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '-') return 0;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function extractProductName(raw: string): string {
  if (!raw || raw === '-') return '';
  const parts = raw.split(',');
  return parts[0].trim();
}

function normalizeName(name: string): string {
  return name
    .replace(/[\/\s,\-()（）\[\]【】·•_]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function extractDateFromFilename(fileName: string): Date | null {
  const isoMatch = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      12,
    );
    if (!isNaN(d.getTime())) return d;
  }
  const compactMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const d = new Date(
      Number(compactMatch[1]),
      Number(compactMatch[2]) - 1,
      Number(compactMatch[3]),
      12,
    );
    if (
      !isNaN(d.getTime()) &&
      d.getFullYear() >= 2020 &&
      d.getFullYear() <= 2030
    )
      return d;
  }
  return null;
}

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async processAdCsv(file: MulterFile, reportDate?: string) {
    const buffer = file.buffer;
    const fileName = file.originalname;

    const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      throw new BadRequestException('CSV에 데이터가 없습니다.');
    }

    const company = await this.prisma.company.findFirst();
    if (!company) {
      throw new BadRequestException('회사 정보가 없습니다.');
    }
    const companyId = company.id;

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    const colMap: Record<string, string> = {};
    for (const k of keys) {
      const kk = k.trim();
      if (kk.includes('과금') && kk.includes('방식')) colMap['billingType'] = k;
      else if (kk.includes('판매') && kk.includes('방식')) colMap['saleType'] = k;
      else if (kk.includes('광고유형') || kk.includes('광고 유형')) colMap['adType'] = k;
      else if (kk.includes('캠페인 ID') || kk.includes('캠페인ID')) colMap['campaignId'] = k;
      else if (kk === '캠페인명') colMap['campaignName'] = k;
      else if (kk === '광고그룹') colMap['adGroup'] = k;
      else if (kk.includes('광고집행 상품명') || kk.includes('광고집행상품명')) colMap['adProductName'] = k;
      else if (kk.includes('광고집행 옵션ID') || kk.includes('광고집행옵션ID')) colMap['adOptionId'] = k;
      else if (kk.includes('전환매출발생 상품명')) colMap['convProductName'] = k;
      else if (kk.includes('전환매출발생 옵션ID')) colMap['convOptionId'] = k;
      else if (kk.includes('노출 지면') || kk.includes('노출지면')) colMap['placement'] = k;
      else if (kk === '키워드') colMap['keyword'] = k;
      else if (kk === '노출수') colMap['impressions'] = k;
      else if (kk === '클릭수') colMap['clicks'] = k;
      else if (kk === '광고비' || kk === '집행광고비' || kk === '집행금액') colMap['spend'] = k;
      else if (kk === '클릭률') colMap['ctr'] = k;
      else if (kk === '총 주문수(1일)') colMap['totalOrders1d'] = k;
      else if (kk === '직접 주문수(1일)') colMap['directOrders1d'] = k;
      else if (kk === '간접 주문수(1일)') colMap['indirectOrders1d'] = k;
      else if (kk === '총 판매수량(1일)') colMap['totalQty1d'] = k;
      else if (kk === '직접 판매수량(1일)') colMap['directQty1d'] = k;
      else if (kk === '간접 판매수량(1일)') colMap['indirectQty1d'] = k;
      else if (kk === '총 전환매출액(1일)') colMap['totalRevenue1d'] = k;
      else if (kk === '직접 전환매출액(1일)') colMap['directRevenue1d'] = k;
      else if (kk === '간접 전환매출액(1일)') colMap['indirectRevenue1d'] = k;
      else if (kk === '총 주문수(14일)') colMap['totalOrders14d'] = k;
      else if (kk.includes('직접주문수(14일)') || kk === '직접 주문수(14일)') colMap['directOrders14d'] = k;
      else if (kk === '간접 주문수(14일)') colMap['indirectOrders14d'] = k;
      else if (kk === '총 판매수량(14일)') colMap['totalQty14d'] = k;
      else if (kk === '직접 판매수량(14일)') colMap['directQty14d'] = k;
      else if (kk === '간접 판매수량(14일)') colMap['indirectQty14d'] = k;
      else if (kk === '총 전환매출액(14일)') colMap['totalRevenue14d'] = k;
      else if (kk === '직접 전환매출액(14일)') colMap['directRevenue14d'] = k;
      else if (kk === '간접 전환매출액(14일)') colMap['indirectRevenue14d'] = k;
      else if (kk === '총광고수익률(1일)') colMap['totalRoas1d'] = k;
      else if (kk === '직접광고수익률(1일)') colMap['directRoas1d'] = k;
      else if (kk.includes('간접광고수익률(1일)')) colMap['indirectRoas1d'] = k;
      else if (kk === '총광고수익률(14일)') colMap['totalRoas14d'] = k;
      else if (kk === '직접광고수익률(14일)') colMap['directRoas14d'] = k;
      else if (kk.includes('간접광고수익률(14일)')) colMap['indirectRoas14d'] = k;
      else if (kk.includes('캠페인 시작일')) colMap['campaignStartDate'] = k;
      else if (kk.includes('캠페인 종료일')) colMap['campaignEndDate'] = k;
      else if (kk === '비고') colMap['note'] = k;
    }

    const productCache = new Map<string, string>();
    const nameCache = new Map<string, string>();

    const allProducts = await this.prisma.product.findMany({
      select: { id: true, name: true, coupangProductId: true },
    });
    const normalizedCache = new Map<string, string>();
    for (const p of allProducts) {
      if (p.name) {
        nameCache.set(p.name, p.id);
        nameCache.set(p.name.substring(0, 20), p.id);
        const norm = normalizeName(p.name);
        normalizedCache.set(norm, p.id);
        if (norm.length >= 10) {
          normalizedCache.set(norm.substring(0, 15), p.id);
        }
      }
    }

    let inserted = 0;
    let matched = 0;
    let unmatched = 0;
    const unmatchedNames = new Set<string>();

    let adDate: Date;
    if (reportDate) {
      const parsed = new Date(reportDate + 'T12:00:00');
      adDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      adDate = extractDateFromFilename(fileName) || new Date();
    }

    const dayStart = new Date(
      adDate.getFullYear(),
      adDate.getMonth(),
      adDate.getDate(),
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const existingCount = await this.prisma.ad.count({
      where: { date: { gte: dayStart, lt: dayEnd } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adRecords: any[] = [];

    for (const row of rows) {
      const adProductName = String(row[colMap['adProductName']] || '').trim();
      const adOptionId = String(row[colMap['adOptionId']] || '').trim();
      const spend = safeFloat(row[colMap['spend']]);
      const impressions = safeInt(row[colMap['impressions']]);
      const clicks = safeInt(row[colMap['clicks']]);

      const totalOrders1d = safeInt(row[colMap['totalOrders1d']]);
      const totalRevenue1d = safeFloat(row[colMap['totalRevenue1d']]);
      const totalOrders14d = safeInt(row[colMap['totalOrders14d']]);
      const totalRevenue14d = safeFloat(row[colMap['totalRevenue14d']]);

      if (
        impressions === 0 &&
        clicks === 0 &&
        spend === 0 &&
        totalOrders1d === 0 &&
        totalOrders14d === 0 &&
        totalRevenue1d === 0 &&
        totalRevenue14d === 0
      ) {
        continue;
      }

      let productId: string | null = null;

      if (adOptionId && productCache.has(adOptionId)) {
        productId = productCache.get(adOptionId)!;
      }

      if (!productId && adProductName) {
        const cleanName = extractProductName(adProductName);
        if (cleanName) {
          if (nameCache.has(cleanName)) {
            productId = nameCache.get(cleanName)!;
          }
          if (!productId) {
            const short = cleanName.substring(0, 20);
            if (nameCache.has(short)) {
              productId = nameCache.get(short)!;
            }
          }
          if (!productId) {
            const norm = normalizeName(cleanName);
            if (normalizedCache.has(norm)) {
              productId = normalizedCache.get(norm)!;
            } else if (
              norm.length >= 10 &&
              normalizedCache.has(norm.substring(0, 15))
            ) {
              productId = normalizedCache.get(norm.substring(0, 15))!;
            }
          }
          if (!productId) {
            const searchStr = cleanName.substring(0, 10);
            if (searchStr.length >= 5) {
              const found = await this.prisma.product.findFirst({
                where: { name: { contains: searchStr } },
                select: { id: true, name: true },
              });
              if (found) {
                productId = found.id;
                nameCache.set(cleanName, found.id);
                normalizedCache.set(normalizeName(cleanName), found.id);
              }
            }
          }
          if (!productId) {
            const stripped = cleanName
              .replace(
                /^(KY\s*I\s*&\s*D\s*|kiditem\s*|거영\s*I\s*&\s*D\s*|거영아이앤디\s*|키드아이템\s*)/i,
                '',
              )
              .trim();
            if (stripped.length >= 5 && stripped !== cleanName) {
              const found = await this.prisma.product.findFirst({
                where: { name: { contains: stripped.substring(0, 10) } },
                select: { id: true },
              });
              if (found) {
                productId = found.id;
                nameCache.set(cleanName, found.id);
                productCache.set(adOptionId, found.id);
              }
            }
          }
        }
      }

      if (!productId && adOptionId) {
        const found = allProducts.find((p) => p.coupangProductId === adOptionId);
        if (found) {
          productId = found.id;
          productCache.set(adOptionId, found.id);
        }
      }

      if (!productId) {
        unmatched++;
        const name = extractProductName(adProductName);
        if (name) unmatchedNames.add(name.substring(0, 30));
        continue;
      }

      matched++;
      if (adOptionId) productCache.set(adOptionId, productId);

      adRecords.push({
        companyId,
        productId,
        campaignName: String(row[colMap['campaignName']] || '').trim() || null,
        spend: Math.round(spend),
        impressions,
        clicks,
        conversions: totalOrders1d,
        revenue: Math.round(totalRevenue1d),
        billingType: String(row[colMap['billingType']] || '').trim() || null,
        saleType: String(row[colMap['saleType']] || '').trim() || null,
        adType: String(row[colMap['adType']] || '').trim() || null,
        campaignId: String(row[colMap['campaignId']] || '').trim() || null,
        adGroup: String(row[colMap['adGroup']] || '').trim() || null,
        adProductName: adProductName || null,
        adOptionId: adOptionId || null,
        convProductName: String(row[colMap['convProductName']] || '').trim() || null,
        convOptionId: String(row[colMap['convOptionId']] || '').trim() || null,
        placement: String(row[colMap['placement']] || '').trim() || null,
        keyword: String(row[colMap['keyword']] || '').trim() || null,
        directOrders1d: safeInt(row[colMap['directOrders1d']]),
        indirectOrders1d: safeInt(row[colMap['indirectOrders1d']]),
        directQty1d: safeInt(row[colMap['directQty1d']]),
        indirectQty1d: safeInt(row[colMap['indirectQty1d']]),
        directRevenue1d: Math.round(safeFloat(row[colMap['directRevenue1d']])),
        indirectRevenue1d: Math.round(safeFloat(row[colMap['indirectRevenue1d']])),
        totalOrders14d,
        directOrders14d: safeInt(row[colMap['directOrders14d']]),
        indirectOrders14d: safeInt(row[colMap['indirectOrders14d']]),
        totalQty14d: safeInt(row[colMap['totalQty14d']]),
        directQty14d: safeInt(row[colMap['directQty14d']]),
        indirectQty14d: safeInt(row[colMap['indirectQty14d']]),
        totalRevenue14d: Math.round(totalRevenue14d),
        directRevenue14d: Math.round(safeFloat(row[colMap['directRevenue14d']])),
        indirectRevenue14d: Math.round(safeFloat(row[colMap['indirectRevenue14d']])),
        totalRoas1d: parseRoasPercent(row[colMap['totalRoas1d']]),
        directRoas1d: parseRoasPercent(row[colMap['directRoas1d']]),
        totalRoas14d: parseRoasPercent(row[colMap['totalRoas14d']]),
        directRoas14d: parseRoasPercent(row[colMap['directRoas14d']]),
        campaignStartDate:
          String(row[colMap['campaignStartDate']] || '').trim() || null,
        campaignEndDate:
          String(row[colMap['campaignEndDate']] || '').trim() || null,
        note: String(row[colMap['note']] || '').trim() || null,
        date: adDate,
      });
    }

    if (adRecords.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.ad.deleteMany({
          where: { date: { gte: dayStart, lt: dayEnd } },
        });
        const batchSize = 100;
        for (let i = 0; i < adRecords.length; i += batchSize) {
          const batch = adRecords.slice(i, i + batchSize);
          await tx.ad.createMany({ data: batch });
          inserted += batch.length;
        }
      });
    }

    const matchedProductIds = new Set(adRecords.map((r) => r.productId));
    for (const pid of matchedProductIds) {
      const productAds = adRecords.filter((r) => r.productId === pid);
      const totalSpend = productAds.reduce((s, a) => s + a.spend, 0);

      let adTier = '3차';
      if (totalSpend >= 10000) adTier = '1차';
      else if (totalSpend >= 3000) adTier = '2차';

      await this.prisma.product.update({
        where: { id: pid },
        data: { adTier },
      });
    }

    const totalSpend = adRecords.reduce((s, a) => s + a.spend, 0);
    const totalImpressions = adRecords.reduce((s, a) => s + a.impressions, 0);
    const totalClicks = adRecords.reduce((s, a) => s + a.clicks, 0);
    const totalRevenue1dSum = adRecords.reduce((s, a) => s + a.revenue, 0);
    const totalRevenue14dSum = adRecords.reduce(
      (s, a) => s + a.totalRevenue14d,
      0,
    );
    const totalOrders1dSum = adRecords.reduce((s, a) => s + a.conversions, 0);
    const avgRoas =
      totalSpend > 0
        ? Math.round((totalRevenue14dSum / totalSpend) * 100)
        : 0;

    return {
      success: true,
      message: `쿠팡 광고 데이터 ${inserted}건 저장 완료 (기준일: ${adDate.toISOString().slice(0, 10)})`,
      fileName,
      reportDate: adDate.toISOString().slice(0, 10),
      stats: {
        totalRows: rows.length,
        inserted,
        matched,
        unmatched,
        uniqueProducts: matchedProductIds.size,
        previousDataDeleted: existingCount,
        unmatchedSamples: Array.from(unmatchedNames).slice(0, 10),
        summary: {
          totalSpend: Math.round(totalSpend),
          totalImpressions,
          totalClicks,
          totalOrders1d: totalOrders1dSum,
          totalRevenue1d: Math.round(totalRevenue1dSum),
          totalRevenue14d: Math.round(totalRevenue14dSum),
          avgRoas: `${avgRoas}%`,
          ctr:
            totalImpressions > 0
              ? `${((totalClicks / totalImpressions) * 100).toFixed(2)}%`
              : '0%',
        },
      },
    };
  }
}
