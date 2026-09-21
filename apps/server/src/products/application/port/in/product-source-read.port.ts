import type { ProductSourceReadModel } from '../../../domain/product-source-read-model';

export type {
  ProductSourceReadModel,
} from '../../../domain/product-source-read-model';

export type ProductSourceIdentitySelector =
  | { kind: 'all' }
  | { kind: 'ids'; values: string[] }
  | { kind: 'codes'; values: string[] }
  | {
      kind: 'source_identity';
      sourceAccountKey: string;
      sourceProductCode: string;
      sourceOptionCode: string;
    }
  | {
      kind: 'source_codes';
      sourceAccountKey: string;
      values: ReadonlyArray<Readonly<{
        sourceProductCode: string;
        sourceOptionCode: string;
      }>>;
    }
  | { kind: 'barcodes'; values: string[] }
  | { kind: 'normalized_barcodes'; values: string[] }
  | { kind: 'normalized_names'; values: string[] }
  | { kind: 'search'; query: string; limit: number };

export type ProductSourceIdentityQuery = {
  organizationId: string;
  selector: ProductSourceIdentitySelector;
};

export type ProductMatchingCandidate = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
}>;

export const PRODUCT_SOURCE_READ_PORT = Symbol('PRODUCT_SOURCE_READ_PORT');

export interface ProductSourceReadPort {
  listActiveForMatching(organizationId: string): Promise<ProductSourceReadModel[]>;
  findByIds(organizationId: string, ids: string[]): Promise<ProductSourceReadModel[]>;
  findByCodes(organizationId: string, codes: string[]): Promise<ProductSourceReadModel[]>;
  findByBarcodes(organizationId: string, barcodes: string[]): Promise<ProductSourceReadModel[]>;
  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<ProductSourceReadModel[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<ProductSourceReadModel[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<ProductSourceReadModel[]>;
}
