export interface ChannelAnalysis {
  channelName: string;
  channelType: string;
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  returnCount: number;
  returnRate: number;
  avgOrderValue: number;
}

export interface SalesAnalysisResult {
  period: string;
  channels: ChannelAnalysis[];
  totals: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    totalCost: number;
  };
}
