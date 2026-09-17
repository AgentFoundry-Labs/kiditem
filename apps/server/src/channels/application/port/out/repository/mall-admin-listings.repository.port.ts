import type { MallAdminListingsPort } from '../../in/mall-admin-listings.port';

export interface MallAdminListingsRepositoryPort extends MallAdminListingsPort {}

export const MALL_ADMIN_LISTINGS_REPOSITORY_PORT = Symbol(
  'MALL_ADMIN_LISTINGS_REPOSITORY_PORT',
);
