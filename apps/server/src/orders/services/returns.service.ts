import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderReturn, OrderReturnLineItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../../channels/application/port/out/provider/coupang-provider.port';

type OrderReturnWithLineItems = OrderReturn & {
  lineItems: OrderReturnLineItem[];
};

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COUPANG_PROVIDER_PORT) private readonly coupang: CoupangProviderPort,
  ) {}

  async findAll(
    organizationId: string,
    query: { from?: string; to?: string; type?: string },
  ): Promise<{
    items: OrderReturnWithLineItems[];
    total: number;
    type: string;
  }> {
    const type = query.type || 'return';

    const where: Record<string, unknown> = {
      organizationId,
      type: type === 'exchange' ? 'EXCHANGE' : 'RETURN',
    };

    if (query.from || query.to) {
      const from = query.from
        ? new Date(query.from)
        : new Date(Date.now() - 30 * 86400000);
      const to = query.to ? new Date(query.to) : new Date();
      where.requestedAt = { gte: from, lte: to };
    }

    const data = await this.prisma.orderReturn.findMany({
      where,
      include: { lineItems: true },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      items: data,
      total: data.length,
      type,
    };
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<OrderReturnWithLineItems> {
    const ret = await this.prisma.orderReturn.findFirst({
      where: { id, organizationId },
      include: { lineItems: true },
    });
    if (!ret) throw new NotFoundException('OrderReturn not found');
    return ret;
  }

  async getStats(organizationId: string): Promise<{
    stats: { total: number; uc: number; rc: number; completed: number };
  }> {
    const [total, uc, rc, completed, returnsCompleted] = await Promise.all([
      this.prisma.orderReturn.count({ where: { organizationId } }),
      this.prisma.orderReturn.count({ where: { organizationId, status: 'UC' } }),
      this.prisma.orderReturn.count({ where: { organizationId, status: 'RC' } }),
      this.prisma.orderReturn.count({
        where: { organizationId, status: 'COMPLETED' },
      }),
      this.prisma.orderReturn.count({
        where: { organizationId, status: 'RETURNS_COMPLETED' },
      }),
    ]);

    return {
      stats: { total, uc, rc, completed: completed + returnsCompleted },
    };
  }

  async approve(
    receiptId: number,
    organizationId: string,
  ): Promise<{ message: string; data: unknown }> {
    const ret = await this.prisma.orderReturn.findFirst({
      where: {
        organizationId,
        externalReturnId: String(receiptId),
        channelAccount: { channel: 'coupang', status: 'active' },
      },
      select: { channelAccountId: true },
    });
    if (!ret?.channelAccountId) throw new NotFoundException('OrderReturn not found');
    const result = await this.coupang.approveReturn(
      organizationId,
      ret.channelAccountId,
      receiptId,
    );
    return { message: '반품 승인 완료', data: result };
  }
}
