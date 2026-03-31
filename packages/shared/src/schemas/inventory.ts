import { z } from 'zod';

// GET /api/inventory 응답의 각 item
// 출처: inventory.service.ts enriched result (line 61-77)
export const InventoryItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string().nullable(),
  company: z.string(),
  grade: z.string(),
  currentStock: z.number(),
  safetyStock: z.number(),
  reorderPoint: z.number(),
  leadTimeDays: z.number(),
  avgDailySales: z.number(),
  optimalStock: z.number(),
  daysRemaining: z.number(),
  recommendedOrder: z.number(),
  status: z.string(),
});

// GET /api/inventory summary 필드
// 출처: inventory.service.ts InventorySummary (line 10-16)
export const InventorySummarySchema = z.object({
  total: z.number(),
  reorderCount: z.number(),
  outOfStockCount: z.number(),
  unsyncedCount: z.number(),
  overstockCount: z.number(),
});

// 타입 export
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventorySummary = z.infer<typeof InventorySummarySchema>;
