import type { RocketPoCatalogPort } from '../../in/rocket-po-catalog.port';
export interface RocketPoCatalogRepositoryPort extends RocketPoCatalogPort {}
export const ROCKET_PO_CATALOG_REPOSITORY_PORT = Symbol('ROCKET_PO_CATALOG_REPOSITORY_PORT');
