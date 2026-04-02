export interface StandardOrder {
  id: string;
  platform: string;
  platformOrderId: string;
  productId?: string;
  productName: string;
  customerName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  trackingNumber?: string;
  shippingCompany?: string;
  orderedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface StandardProduct {
  id: string;
  name: string;
  status: string;
  category?: string;
  sellPrice?: number;
  costCny?: number;
  marginRate?: number;
  commissionRate?: number;
  shippingCost?: number;
  abcGrade?: string;
  adTier?: string;
  thumbnailUrl?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
}

export interface StandardInventory {
  productId: string;
  productName: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailySalesAvg: number;
  daysOfStock: number;
  needsReorder: boolean;
}

export interface StandardAd {
  productId: string;
  productName: string;
  platform: string;
  campaignName?: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  roas?: number;
  adCostRate?: number;
}

export interface StandardProfitLoss {
  productId: string;
  productName: string;
  year: number;
  month: number;
  revenue: number;
  cogs: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
  returnCount: number;
}

export interface StandardReview {
  id: string;
  productId: string;
  productName: string;
  platform: string;
  rating: number;
  content?: string;
  reviewerName?: string;
  reviewedAt: string;
}

export interface StandardThumbnail {
  productId: string;
  productName: string;
  imageUrl: string;
  ctr?: number;
  impressions: number;
  clicks: number;
  status: string;
}

export type ConfigFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'boolean'
  | 'cron'
  | 'credential'
  | 'template'
  | 'json';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface OutputField {
  key: string;
  type: string;
  description: string;
}

export interface NodeDefinition {
  type: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  configSchema: ConfigField[];
  outputSchema: OutputField[];
  isConcurrencySafe?: boolean;
}
