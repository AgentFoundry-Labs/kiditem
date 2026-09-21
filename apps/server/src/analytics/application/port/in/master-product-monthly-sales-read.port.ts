export const MASTER_PRODUCT_MONTHLY_SALES_READ_PORT = Symbol('MASTER_PRODUCT_MONTHLY_SALES_READ_PORT');

/** Published Sellpia sales only; purchase amounts are not sold-goods costs. */
export type MasterProductMonthlySales = Readonly<{
  revenue: number;
  soldQuantity: number;
  coverageStartDate: string;
  coverageEndDate: string;
}>;

export interface MasterProductMonthlySalesReadPort {
  readMonthlySales(input: {
    organizationId: string;
    masterProductIds: readonly string[];
    yearMonth: string;
  }): Promise<ReadonlyMap<string, MasterProductMonthlySales>>;
}
