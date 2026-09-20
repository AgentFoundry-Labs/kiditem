import { FactConflictError, FactInputError, FactNotFoundError, FactReferenceError } from '../../../common/errors/fact-errors';

/** The submitted source artifact or collection request cannot be processed. */
export class InventoryImportInputError extends FactInputError {}

/** This execution no longer has authority to publish the inventory result. */
export class InventoryImportConflictError extends FactConflictError {}

/** The requested inventory identity is absent from the authenticated organization. */
export class InventoryItemNotFoundError extends FactNotFoundError {}

/** A calculation requires the exact successful collection requested by its caller. */
export class InventoryCollectionRequiredError extends FactConflictError {
  constructor() {
    super('A completed Sellpia inventory collection is required before purchase.', {
      code: 'SELLPIA_SYNC_REQUIRED',
    });
  }
}

/** A supplied SKU or attempt reference cannot be used by this organization. */
export class InventoryReferenceInvalidError extends FactReferenceError {
  constructor() {
    super('A purchase item reference is invalid for this organization.', 'PURCHASE_REFERENCE_INVALID');
  }
}
