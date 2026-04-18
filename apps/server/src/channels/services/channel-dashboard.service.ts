import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChannelDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(_companyId: string): Promise<{
    todayOrders: { count: number; revenue: number };
    pendingAccept: number;
    pendingReturns: number;
    lastSyncedAt: Date | null;
  }> {
    // Plan A.5 dropped CoupangOrder/CoupangReturn in favor of Order/OrderReturn.
    // Plan B2c will rewrite this aggregate against the new schema.
    throw new Error('Not implemented: Plan B2c migration');
  }

  async getRevenueTrend(
    _companyId: string,
    _from: Date,
    _to: Date,
  ): Promise<{ day: string; revenue: number; orderCount: number }[]> {
    // Plan A.5 dropped coupang_orders. Plan B2c will rewrite against orders/order_line_items.
    throw new Error('Not implemented: Plan B2c migration');
  }

  async getProductRanking(
    _companyId: string,
    _from: Date,
    _to: Date,
  ): Promise<{
    sellerProductId: string;
    sellerProductName: string;
    revenue: number;
    orderCount: number;
  }[]> {
    // Plan A.5 dropped coupang_order_items. Plan B2c will rewrite against order_line_items.
    throw new Error('Not implemented: Plan B2c migration');
  }

  async getReturnSummary(
    _companyId: string,
    _from: Date,
    _to: Date,
  ): Promise<{ returnCount: number; orderCount: number; returnRate: number }> {
    // Plan A.5 dropped coupang_returns/coupang_orders. Plan B2c will rewrite against order_returns/orders.
    throw new Error('Not implemented: Plan B2c migration');
  }

  async getReturnReasonBreakdown(
    _companyId: string,
    _from: Date,
    _to: Date,
  ): Promise<{ reason: string; count: number }[]> {
    // Plan A.5 dropped coupang_returns. Plan B2c will rewrite against order_returns + metadata.
    throw new Error('Not implemented: Plan B2c migration');
  }

  async getReturnFaultSplit(
    _companyId: string,
    _from: Date,
    _to: Date,
  ): Promise<{ customer: number; vendor: number }> {
    // Plan A.5 dropped coupang_returns. Plan B2c will rewrite against order_returns + metadata.
    throw new Error('Not implemented: Plan B2c migration');
  }
}
