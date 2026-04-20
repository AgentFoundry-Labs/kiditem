import { Injectable } from '@nestjs/common';
import type { PLData } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Plan B2c.dashboard T14 — listingId-primary P&L service.
 *
 * ADR-0013 (3-layer) / ADR-0015 (Order schema unification) 완료 후 쓰기 가능.
 * ProfitLoss row 는 이미 `(year, month)` + `listingId` 조합으로 집계된 상태(다른 워크플로우가 채운다).
 * 본 service 는 **읽기 전용** — row 를 회사 스코프로 가져와 master hydration 후 PLData shape 로 반환한다.
 *
 * ## 프로젝션 선택 (explicit select, NOT spread)
 *
 * `LISTING_WITH_MASTER_SELECT_EXTENDED` 는 statistics/settlements 용으로 `channel`/`isDeleted` 등
 * 추가 필드를 포함한다. P&L 은 PLData shape 에만 필요한 컬럼만 가져와 drift 여지를 줄이기 위해
 * 독자적으로 select 를 기술한다 (plan v2 R-03).
 *
 * ## Decimal → number 변환 (R-04)
 *
 * `profitRate` 는 Prisma `Decimal(5,4)`. JS number 로 좁혀 API 경계에서 serializable 하게 유지.
 * null 인 row 는 0 으로 폴백 (스키마 default 와 동일).
 *
 * ## null listing 방어 (onDelete: Restrict)
 *
 * `ChannelListing` FK 는 `onDelete: Restrict` — listing 삭제 시 PL row 도 유지된다(거부됨).
 * 즉 런타임에 `listing === null` 경로는 이론상 불가하지만, 저비용 방어로 filter 한다.
 */
@Injectable()
export class ProfitLossService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PLData[]> {
    const rows = await this.prisma.profitLoss.findMany({
      where: { companyId, year, month },
      include: {
        listing: {
          select: {
            externalId: true,
            channelName: true,
            master: {
              select: {
                id: true,
                code: true,
                legacyCode: true,
                name: true,
                category: true,
                abcGrade: true,
                thumbnailUrl: true,
              },
            },
          },
        },
      },
    });

    return rows
      .filter((r) => r.listing !== null)
      .map((r) => ({
        listingId: r.listingId,
        externalId: r.listing!.externalId,
        channelName: r.listing!.channelName ?? null,
        masterId: r.listing!.master.id,
        masterCode: r.listing!.master.legacyCode ?? r.listing!.master.code,
        masterName: r.listing!.master.name,
        category: r.listing!.master.category ?? null,
        grade: r.listing!.master.abcGrade ?? null,
        thumbnailUrl: r.listing!.master.thumbnailUrl ?? null,
        revenue: r.revenue,
        cogs: r.cogs,
        commission: r.commission,
        shippingCost: r.shippingCost,
        adCost: r.adCost,
        otherCost: r.otherCost,
        netProfit: r.netProfit,
        profitRate: r.profitRate?.toNumber() ?? 0,
        orderCount: r.orderCount,
        returnCount: r.returnCount,
      } satisfies PLData));
  }
}
