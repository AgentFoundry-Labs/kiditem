import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  // Module-specific stats endpoint
  const moduleStats: Record<string, any> = {
    order: {
      todayOrders: 35,
      todayRevenue: 1567800,
      pendingOrders: 5,
      unmatchedOrders: 3,
      platformBreakdown: {
        '자사몰': { orders: 8, revenue: 156000 },
        '스마트스토어': { orders: 6, revenue: 234000 },
        '쿠팡': { orders: 5, revenue: 189000 },
        '지마켓': { orders: 4, revenue: 112000 },
      },
    },
    accounting: {
      openingBalance: 45678900,
      closingBalance: 48234800,
      totalDeposits: 5193900,
      totalWithdrawals: 3231000,
      taxInvoicesIssued: 12,
      taxInvoicesPending: 3,
      unmatchedPayments: 2,
    },
    inventory: {
      totalSkus: 40,
      outOfStock: 4,
      lowStock: 8,
      mismatches: 6,
      lastSyncAt: new Date().toISOString(),
    },
    cs: {
      pendingInquiries: 4,
      autoReplied: 12,
      manualReplied: 6,
      avgResponseTime: 15,
      outOfStockNoticesSent: 14,
    },
    report: {
      lastDailyReport: new Date().toISOString(),
      lastMonthlyReport: '2026-03-01',
      totalRevenue: 8760000,
      totalOrders: 487,
    },
  };

  const stats = moduleStats[params.moduleId] || { message: 'No stats available' };

  return NextResponse.json({
    success: true,
    module: params.moduleId,
    data: stats,
  });
}
