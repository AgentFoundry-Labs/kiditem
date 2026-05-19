export const PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT = Symbol(
  'PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT',
);

export interface ProductGenerationChildIds {
  detailPageGenerationId: string | null;
  thumbnailGenerationId: string | null;
}

export interface ProductGenerationChildLedgerStatuses {
  detailPageStatus: string | null;
  thumbnailStatus: string | null;
}

export interface ProductGenerationChildLedgerRepositoryPort {
  readChildStatuses(input: {
    organizationId: string;
    childIds: ProductGenerationChildIds;
  }): Promise<ProductGenerationChildLedgerStatuses>;
}
