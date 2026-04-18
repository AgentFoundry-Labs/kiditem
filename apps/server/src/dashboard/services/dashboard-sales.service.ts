import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardSalesSummary } from '@kiditem/shared';
import type { DashboardContext } from './context';

@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(_ctx: DashboardContext): Promise<DashboardSalesSummary> {
    // Plan A.5 dropped CoupangOrder/CoupangOrderItem in favor of Order/OrderLineItem.
    // Plan B2c will rewrite this aggregate against the new schema.
    throw new Error('Not implemented: Plan B2c migration');
  }
}
