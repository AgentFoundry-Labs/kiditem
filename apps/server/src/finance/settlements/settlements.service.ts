import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  SettlementListItem,
  SettlementReconcileDetail,
  SettlementReconcileResponse,
} from '@kiditem/shared/settlements';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isOrderWindowComplete,
  perListingProfitRows,
  profitWindowBasis,
  readProfitWindowFacts,
  totalOrUnavailable,
} from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readListingOptionOrderFacts,
} from '../../orders/read/order-facts.reader';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';
import { readSettlements, type SettlementFact } from './read/settlement-facts';
import { classifySettlementDifference } from './settlement-reconciliation';

/**
 * A settlement's actual amount exists once someone confirmed the deposit.
 * Until then the stored column holds its schema default, which is not a
 * deposit of zero, so neither it nor a difference from it is published.
 */
function toListItem(row: SettlementFact): SettlementListItem {
  const confirmed = row.status === 'confirmed';
  return {
    id: row.id,
    period: row.period,
    expectedAmount: row.expectedAmount,
    actualAmount: confirmed ? row.actualAmount : null,
    commission: row.commission,
    shippingFee: row.shippingFee,
    adjustments: row.adjustments,
    difference: confirmed ? row.actualAmount - row.expectedAmount : null,
    orderCount: row.orderCount,
    returnCount: row.returnCount,
    status: row.status,
    settledAt: row.settledAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies SettlementListItem;
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private resolveWindow(period: string) {
    const [year, month] = period.split('-').map(Number);
    return {
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

  async findAll(organizationId: string, period?: string): Promise<SettlementListItem[]> {
    const rows = await this.prisma.$transaction((tx) => readSettlements(tx, {
      organizationId,
      period,
    }));
    return rows.map(toListItem);
  }

  async create(organizationId: string, dto: CreateSettlementDto): Promise<SettlementListItem> {
    const row = await this.prisma.settlement.create({
      data: {
        organizationId,
        period: dto.period,
        expectedAmount: dto.expectedAmount,
        commission: dto.commission,
        shippingFee: dto.shippingFee,
        orderCount: dto.orderCount,
        returnCount: dto.returnCount,
      },
    });
    return toListItem(row);
  }

  /**
   * Compares the month's per-listing profit revenue with the same month's
   * order-line totals, both read from the Orders collection. Month totals are
   * published only when that collection covered every date of the month.
   */
  async reconcile(organizationId: string, period: string): Promise<SettlementReconcileResponse> {
    const { from, to } = this.resolveWindow(period);

    const { facts, orderLines, optionListings } = await this.prisma.$transaction(async (tx) => {
      const facts = await readProfitWindowFacts(tx, organizationId, from, to);
      const orderLines = await readListingOptionOrderFacts(tx, {
        organizationId,
        from,
        to,
        excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
      });
      const optionIds = [...new Set(orderLines.map((line) => line.listingOptionId))];
      const optionListings = optionIds.length === 0 ? [] : await tx.channelListingOption.findMany({
        where: { organizationId, id: { in: optionIds } },
        select: { id: true, listingId: true },
      });
      return { facts, orderLines, optionListings };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const listingByOption = new Map(optionListings.map((option) => [option.id, option.listingId]));
    const orderSide = new Map<string, { total: number; orderIds: Set<string> }>();
    for (const line of orderLines) {
      const listingId = listingByOption.get(line.listingOptionId);
      if (!listingId) continue;
      const entry = orderSide.get(listingId) ?? { total: 0, orderIds: new Set<string>() };
      entry.total += line.revenue;
      entry.orderIds.add(line.orderId);
      orderSide.set(listingId, entry);
    }

    const rows = perListingProfitRows(facts);
    let matchedCount = 0;
    let mismatchCount = 0;
    const details = rows.map((metric) => {
      // Both sides read the same collected orders, so a listing with no order
      // lines has a measured order total of zero.
      const order = orderSide.get(metric.listingId);
      const orderTotal = order ? order.total : 0;
      const orderCount = order ? order.orderIds.size : 0;
      const revenueDiff = metric.revenue - orderTotal;
      const status = classifySettlementDifference(revenueDiff);
      if (status === 'matched') matchedCount++;
      else mismatchCount++;

      return {
        listingId: metric.listingId,
        externalId: metric.externalId,
        channelName: metric.channelName,
        masterCode: metric.masterCode,
        masterName: metric.masterName,
        plRevenue: metric.revenue,
        plCommission: metric.commission,
        plNetProfit: metric.netProfit,
        plOrderCount: metric.orderCount,
        orderTotal,
        orderCount,
        revenueDiff,
        isMatched: status === 'matched',
        status,
      } satisfies SettlementReconcileDetail;
    });

    const collected = isOrderWindowComplete(facts.orderWindow);
    const totalPlRevenue = collected ? details.reduce((sum, detail) => sum + detail.plRevenue, 0) : null;
    const totalOrderRevenue = collected ? details.reduce((sum, detail) => sum + detail.orderTotal, 0) : null;
    const productCount = details.length;

    return {
      success: true,
      period,
      summary: {
        totalPlRevenue,
        totalOrderRevenue,
        totalCommission: collected ? totalOrUnavailable(rows.map((row) => row.commission)) : null,
        totalShipping: collected ? rows.reduce((sum, row) => sum + row.shippingCost, 0) : null,
        revenueDifference: totalPlRevenue === null || totalOrderRevenue === null
          ? null
          : totalPlRevenue - totalOrderRevenue,
        productCount,
        orderCount: facts.orderWindow.orderCount,
        matchedCount,
        mismatchCount,
        matchRate: productCount > 0 ? Math.round((matchedCount / productCount) * 100) : null,
      },
      details,
      basis: profitWindowBasis(facts),
    } satisfies SettlementReconcileResponse;
  }

  async update(id: string, organizationId: string, dto: UpdateSettlementDto): Promise<SettlementListItem> {
    const existing = await this.prisma.settlement.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new BadRequestException('정산 내역을 찾을 수 없습니다');
    }

    const row = await this.prisma.settlement.update({
      where: { id },
      data: {
        ...(dto.actualAmount !== undefined && { actualAmount: dto.actualAmount }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    return toListItem(row);
  }
}
