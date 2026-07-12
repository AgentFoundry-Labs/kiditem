import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../common/legacy-family-master-scope';

/**
 * Product APIs own legacy family Masters only. The additive 0.1.8 physical
 * rows are Inventory-owned and must stay outside ordinary family CRUD even if
 * one marker is incomplete during a rolling import/recovery.
 */
export const PRODUCTS_OWNED_MASTER_SCOPE = LEGACY_FAMILY_MASTER_SCOPE;
