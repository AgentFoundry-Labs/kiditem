export type RocketPurchaseConfirmationLineQueryRow = {
  confirmationId: string;
  confirmationLineId: string;
  channelAccountId: string;
  poNumber: string;
  productNo: string;
  barcode: string | null;
  productName: string;
  orderQuantity: number;
  confirmedQuantity: number;
  confirmedBy: { id: string; name: string };
  confirmedAt: string;
};

export interface RocketPurchaseConfirmationQueryRepositoryPort {
  listLines(input: {
    organizationId: string;
    channelAccountId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: RocketPurchaseConfirmationLineQueryRow[];
    nextCursor: string | null;
  }>;
}

export const ROCKET_PURCHASE_CONFIRMATION_QUERY_REPOSITORY_PORT = Symbol(
  'ROCKET_PURCHASE_CONFIRMATION_QUERY_REPOSITORY_PORT',
);
