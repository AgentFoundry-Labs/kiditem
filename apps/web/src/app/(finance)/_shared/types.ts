/**
 * Finance route group shared types.
 *
 * Only types consumed by 2+ routes inside `app/(finance)/...` belong here.
 * Cross-domain types belong in `@kiditem/shared/...`.
 */

export interface Settlement {
  id: string;
  period: string;
  expectedAmount: number;
  actualAmount: number;
  commission: number;
  shippingFee: number;
  adjustments: number;
  difference: number;
  orderCount: number;
  returnCount: number;
  status: string;
  settledAt: string | null;
  notes: string | null;
  createdAt?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  paidDate?: string | null;
  purchaseOrderId?: string | null;
  notes: string | null;
  createdAt: string;
}
