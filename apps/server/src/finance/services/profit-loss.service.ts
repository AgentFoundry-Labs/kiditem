import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PLData } from '@kiditem/shared';

@Injectable()
export class ProfitLossService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(_period?: string): Promise<PLData[]> {
    // Plan A.5 dropped coupang_orders/coupang_order_items. ProfitLoss.productId still references
    // the legacy Product model (also dropped in ADR-0013). Plan B2c will rewrite this aggregate
    // against Order/OrderLineItem + ChannelListing schema.
    throw new Error('Not implemented: Plan B2c migration');
  }
}
