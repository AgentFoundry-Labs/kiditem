import type { SabangnetMallListingsPort } from '../../in/sabangnet-mall-listings.port';

export interface SabangnetMallListingsRepositoryPort extends SabangnetMallListingsPort {}

export const SABANGNET_MALL_LISTINGS_REPOSITORY_PORT = Symbol(
  'SABANGNET_MALL_LISTINGS_REPOSITORY_PORT',
);
