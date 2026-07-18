import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  RocketPurchaseConfirmationLineQueryRow,
  RocketPurchaseConfirmationQueryRepositoryPort,
} from '../../../application/port/out/repository/rocket-purchase-confirmation-query.repository.port';

@Injectable()
export class RocketPurchaseConfirmationQueryRepositoryAdapter
implements RocketPurchaseConfirmationQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listLines(input: {
    organizationId: string;
    channelAccountId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: RocketPurchaseConfirmationLineQueryRow[];
    nextCursor: string | null;
  }> {
    const cursor = input.cursor
      ? await this.prisma.rocketPurchaseConfirmationLine.findFirst({
        where: {
          id: input.cursor,
          organizationId: input.organizationId,
        },
        select: { id: true, createdAt: true },
      })
      : null;
    if (input.cursor && !cursor) {
      throw new NotFoundException('Rocket commitment cursor was not found');
    }

    const rows = await this.prisma.rocketPurchaseConfirmationLine.findMany({
      where: {
        organizationId: input.organizationId,
        confirmation: {
          is: {
            organizationId: input.organizationId,
            ...(input.channelAccountId && {
              channelAccountId: input.channelAccountId,
            }),
          },
        },
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      },
      include: {
        confirmation: {
          include: {
            confirmer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const pageRows = rows.slice(0, input.limit);
    return {
      items: pageRows.map((row) => ({
        confirmationId: row.confirmationId,
        confirmationLineId: row.id,
        channelAccountId: row.confirmation.channelAccountId,
        poNumber: row.poNumber,
        productNo: row.productNo,
        barcode: row.barcode,
        productName: row.productName,
        orderQuantity: row.orderQuantity,
        confirmedQuantity: row.confirmedQuantity,
        confirmedBy: row.confirmation.confirmer,
        confirmedAt: row.confirmation.confirmedAt.toISOString(),
      })),
      nextCursor: hasMore ? pageRows.at(-1)?.id ?? null : null,
    };
  }
}
