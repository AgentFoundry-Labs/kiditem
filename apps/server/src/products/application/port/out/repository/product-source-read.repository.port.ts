import type { ProductSourceReadModel } from '../../in/product-source-read.port';

export const PRODUCT_SOURCE_READ_REPOSITORY_PORT = Symbol(
  'PRODUCT_SOURCE_READ_REPOSITORY_PORT',
);

export interface ProductSourceReadRepositoryPort {
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

export type { ProductSourceReadModel };
