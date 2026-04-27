import type { PrismaService } from '../../../prisma/prisma.service';
import type { HydratedListing, InventoryRow } from '../types';

/**
 * 현재 시점의 year + 1-indexed month.
 * - 인자 없으면 `new Date()` (테스트에서 inject 가능).
 */
export function getCurrentPeriod(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * 분석 기간 ISO date 범위 (local timezone 기준 — KST 운영 환경의 "오늘" 과 일치).
 * - `7d` / `14d`: today 기준 N 일 전 ~ today
 * - `month`: 이번 달 1일 ~ today
 *
 * 주의: `toISOString()` 은 UTC 변환이라 KST 자정 직후엔 day off-by-one.
 * local Date component (`getFullYear/getMonth/getDate`) + zero-pad 로 day 정합 보장.
 */
export function getWeekRange(period: '7d' | '14d' | 'month'): { start: string; end: string } {
  const today = new Date();
  const end = formatLocalDate(today);
  let start: string;
  if (period === 'month') {
    start = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  } else {
    const days = period === '7d' ? 7 : 14;
    start = formatLocalDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));
  }
  return { start, end };
}

/** Date → 'YYYY-MM-DD' (local). */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * listingIds → HydratedListing[] (master + ABC/tier/health 메타 + primary option pricing 포함).
 * Prisma relation 명은 `master` 이지만 결과는 `masterProduct` 로 remap (shared AdListingSummary 와 정합).
 * companyId scope 강제 (ADR-0006).
 *
 * primaryOption 은 ad-grade-rules 가 margin / adBudgetLimit 계산에 쓰는 active option 의
 * deterministic 첫 번째(오래된 매핑 우선, tie-breaker 로 externalOptionId/id).
 * isActive 인 옵션이 없으면 null.
 */
export async function hydrateListings(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<HydratedListing[]> {
  if (listingIds.length === 0) return [];
  const rows = await prisma.channelListing.findMany({
    where: { id: { in: listingIds }, companyId, isDeleted: false },
    select: {
      id: true,
      externalId: true,
      channelName: true,
      master: {
        select: { id: true, code: true, name: true, abcGrade: true, adTier: true, healthScore: true },
      },
      options: {
        where: { isActive: true },
        orderBy: [
          { createdAt: 'asc' },
          { externalOptionId: 'asc' },
          { id: 'asc' },
        ],
        select: {
          // Wave C4: also surface the active ChannelListingOption.id so the
          // strategy reader can fetch option daily snapshots for the same
          // deterministic primary option that hydrate picked.
          id: true,
          option: {
            select: {
              id: true,
              availableStock: true,
              costPrice: true,
              sellPrice: true,
              commissionRate: true,
              shippingCost: true,
            },
          },
        },
      },
    },
  });
  return rows.map((r) => {
    const firstClo =
      r.options.find((clo): clo is typeof clo & { option: NonNullable<typeof clo.option> } => clo.option != null) ?? null;
    return {
      id: r.id,
      externalId: r.externalId,
      channelName: r.channelName,
      masterProduct: {
        id: r.master.id,
        code: r.master.code,
        name: r.master.name,
        abcGrade: r.master.abcGrade as 'A' | 'B' | 'C' | null,
        adTier: r.master.adTier,
        healthScore: r.master.healthScore,
      },
      primaryOption: firstClo
        ? {
            id: firstClo.option.id,
            listingOptionId: firstClo.id,
            availableStock: firstClo.option.availableStock,
            costPrice: firstClo.option.costPrice,
            sellPrice: firstClo.option.sellPrice,
            commissionRate: firstClo.option.commissionRate,
            shippingCost: firstClo.option.shippingCost,
          }
        : null,
    };
  });
}

/**
 * listingIds → optionId 별 InventoryRow Map.
 * Sub-service (ad-grade-rules) 가 snapshot.optionId 로 stock/cost 조회 시 사용.
 * companyId scope 강제. isActive=true + optionId NOT NULL 만.
 */
export async function getInventorySnapshot(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, InventoryRow>> {
  if (listingIds.length === 0) return new Map();
  const options = await prisma.channelListingOption.findMany({
    where: { companyId, listingId: { in: listingIds }, isActive: true, optionId: { not: null } },
    select: {
      optionId: true,
      listingId: true,
      option: {
        select: { availableStock: true, costPrice: true, sellPrice: true, commissionRate: true },
      },
    },
  });
  const map = new Map<string, InventoryRow>();
  for (const o of options) {
    if (!o.optionId || !o.option) continue;
    map.set(o.optionId, {
      optionId: o.optionId,
      listingId: o.listingId,
      availableStock: o.option.availableStock ?? 0,
      costPrice: o.option.costPrice,
      sellPrice: o.option.sellPrice,
      commissionRate: o.option.commissionRate,
    });
  }
  return map;
}

/**
 * HydratedListing → AdListingSummary shape (Zod schema 와 정합).
 * 3 sub-service (ad-grade-rules, ad-budget-allocator, ad-exposure) 공통 사용 — DRY.
 * ad/inventory 메타 필드 (abcGrade, adTier, healthScore) 는 strip.
 */
export function toListingSummary(listing: HydratedListing): {
  listingId: string;
  externalId: string;
  channelName: string | null;
  masterProduct: { id: string; code: string; name: string };
  option: null;
} {
  return {
    listingId: listing.id,
    externalId: listing.externalId,
    channelName: listing.channelName,
    masterProduct: { id: listing.masterProduct.id, code: listing.masterProduct.code, name: listing.masterProduct.name },
    option: null,
  };
}
