import type { BundleOptionForRules } from '../../../domain/policy/bundle-component-rules';
import type { ListBundleComponentsQuery } from '../../../dto/list-bundle-components.query';
import type { ProductsRepositoryTransaction } from './products-transaction.port';

export const PRODUCT_BUNDLE_REPOSITORY_PORT = Symbol('PRODUCT_BUNDLE_REPOSITORY_PORT');

export interface BundleComponentRow {
  id: string;
  organizationId: string;
  bundleOptionId: string;
  componentOptionId: string;
  qty: number;
  [key: string]: unknown;
}

export interface ActiveBundleComponentRow {
  id: string;
  qty: number;
  componentOption: {
    isDeleted: boolean;
    inventory: { currentStock: number } | null;
  };
}

export interface ProductBundleRepositoryPort {
  lockBundleOptionRow(
    tx: ProductsRepositoryTransaction,
    bundleOptionId: string,
    organizationId: string,
  ): Promise<void>;
  findBundleOptionId(
    tx: ProductsRepositoryTransaction,
    bundleOptionId: string,
    organizationId: string,
  ): Promise<{ id: string } | null>;
  listActiveBundleComponentsWithStock(
    tx: ProductsRepositoryTransaction,
    bundleOptionId: string,
    organizationId: string,
  ): Promise<ActiveBundleComponentRow[]>;
  writeBundleAvailableStock(
    tx: ProductsRepositoryTransaction,
    bundleOptionId: string,
    organizationId: string,
    capacity: number,
  ): Promise<number>;
  listBundlesUsingComponent(
    tx: ProductsRepositoryTransaction,
    componentOptionId: string,
    organizationId: string,
  ): Promise<{ bundleOptionId: string }[]>;
  findBundleRuleOptions(input: {
    organizationId: string;
    bundleOptionId: string;
    componentOptionId: string;
    tx?: ProductsRepositoryTransaction;
  }): Promise<{
    bundleOpt: BundleOptionForRules | null;
    compOpt: BundleOptionForRules | null;
  }>;
  findBundleComponentForTenant(
    tx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
  ): Promise<BundleComponentRow | null>;
  createBundleComponent(
    tx: ProductsRepositoryTransaction,
    data: {
      bundleOptionId: string;
      componentOptionId: string;
      qty: number;
      organizationId: string;
    },
  ): Promise<BundleComponentRow>;
  listBundleComponentsForTenant(
    organizationId: string,
    query: ListBundleComponentsQuery,
  ): Promise<BundleComponentRow[]>;
  updateBundleComponentQty(
    tx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
    qty: number,
  ): Promise<number>;
  deleteBundleComponentScoped(
    tx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
  ): Promise<number>;
}
