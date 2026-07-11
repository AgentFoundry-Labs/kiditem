import type { ProductOptionListItem } from '@kiditem/shared/product';
import type { CreateOptionDto } from '../../../../dto/create-option.dto';
import type { ListOptionsQuery } from '../../../../dto/list-options.query';
import type { ProductsRepositoryTransaction } from '../transaction/products-transaction.port';

export const PRODUCT_OPTION_REPOSITORY_PORT = Symbol('PRODUCT_OPTION_REPOSITORY_PORT');

export interface ProductOptionRow {
  id: string;
  organizationId: string;
  masterId: string;
  sku: string;
  optionName: string | null;
  isBundle: boolean;
  [key: string]: unknown;
}

export interface OptionsListPage {
  items: ProductOptionListItem[];
  nextCursor: string | null;
}

export interface ProductOptionRepositoryPort {
  incrementMasterOptionCounter(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    masterId: string,
  ): Promise<{ code: string; optionCounter: number }>;
  createOptionWithSku(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    masterId: string,
    sku: string,
    data: Partial<CreateOptionDto>,
  ): Promise<ProductOptionRow>;
  list(organizationId: string, query: ListOptionsQuery): Promise<OptionsListPage>;
  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOptionRow>;
  findBySku(organizationId: string, sku: string): Promise<ProductOptionRow>;
  findByBarcode(organizationId: string, barcode: string): Promise<ProductOptionRow>;
  findActiveByBarcode(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    barcode: string,
  ): Promise<ProductOptionRow | null>;
  findCurrentOption(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
  ): Promise<ProductOptionRow>;
  assertNoBundleComponents(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    bundleOptionId: string,
  ): Promise<void>;
  assertNotUsedAsComponent(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    componentOptionId: string,
  ): Promise<void>;
  applyOptionPatch(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<ProductOptionRow>;
  softDeleteOptionRow(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
  ): Promise<void>;
  restoreOptionRow(
    organizationId: string,
    id: string,
    tx?: ProductsRepositoryTransaction,
  ): Promise<void>;
}
