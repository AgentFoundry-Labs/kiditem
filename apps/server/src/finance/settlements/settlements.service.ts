import { Injectable, BadRequestException } from '@nestjs/common';
import type { SettlementListItem, SettlementListResponse } from '@kiditem/shared/settlements';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';
import { readSettlements, type SettlementFact } from './read/settlement-facts';

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

  /**
   * The listed settlements and the card totals over them. Deposits and
   * differences are summed over confirmed rows only; an unconfirmed deposit is
   * not a deposit of zero.
   */
  async findAll(organizationId: string, period?: string): Promise<SettlementListResponse> {
    const rows = await this.prisma.$transaction((tx) => readSettlements(tx, {
      organizationId,
      period,
    }));
    const items = rows.map(toListItem);
    const confirmed = items.filter((item) => item.actualAmount !== null);
    return {
      items,
      summary: {
        totalExpected: items.reduce((sum, item) => sum + item.expectedAmount, 0),
        totalConfirmedActual: confirmed.reduce((sum, item) => sum + item.actualAmount!, 0),
        totalConfirmedDifference: confirmed.reduce((sum, item) => sum + item.difference!, 0),
        pendingCount: items.filter((item) => item.status === 'pending').length,
      },
    } satisfies SettlementListResponse;
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

  async update(id: string, organizationId: string, dto: UpdateSettlementDto): Promise<SettlementListItem> {
    // A confirmed deposit is the amount entered with the confirmation. The
    // stored column's default is not a deposit of zero, so confirming without
    // an amount would publish one nobody entered; and `null` is no amount for
    // the non-null column either.
    const actualAmount: number | null | undefined = dto.actualAmount;
    if (actualAmount === null) {
      throw new BadRequestException('실제 입금액은 숫자로 입력해야 합니다');
    }
    if (dto.status === 'confirmed' && actualAmount === undefined) {
      throw new BadRequestException('정산을 확정하려면 실제 입금액을 입력해야 합니다');
    }
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
