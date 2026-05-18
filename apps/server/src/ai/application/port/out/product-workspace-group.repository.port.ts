export const PRODUCT_WORKSPACE_GROUP_REPOSITORY_PORT = Symbol(
  'PRODUCT_WORKSPACE_GROUP_REPOSITORY_PORT',
);

export type ProductWorkspaceGroupSource =
  | 'detail_page_generation'
  | 'post_promotion';

export interface ProductWorkspaceGroupSnapshot {
  id: string;
  targetMasterId: string | null;
}

export interface ProductWorkspaceGroupRepositoryPort {
  ensureProductWorkspaceGroup(input: {
    organizationId: string;
    productId: string;
    title: string;
    triggeredByUserId: string | null;
    source: ProductWorkspaceGroupSource;
  }): Promise<ProductWorkspaceGroupSnapshot>;
}
