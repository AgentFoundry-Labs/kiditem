export const UNSHIPPED_REPOSITORY_PORT = Symbol('UnshippedRepositoryPort');

export type UnshippedItemRow = {
  id: string;
  organizationId: string;
  orderId: string;
  orderLineItemId: string;
  productName: string;
  optionName: string | null;
  externalSku: string | null;
  quantity: number;
  orderDate: Date;
  delayDays: number;
  reason: string | null;
  isNotified: boolean;
  notifiedAt: Date | null;
  createdAt: Date;
};

export type ListUnshippedRepositoryInput = {
  minDays: number;
  skip: number;
  take: number;
};

export interface UnshippedRepositoryPort {
  list(
    organizationId: string,
    input: ListUnshippedRepositoryInput,
  ): Promise<{ items: UnshippedItemRow[]; total: number; delayedCount: number }>;
}
