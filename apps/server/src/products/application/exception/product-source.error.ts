import {
  FactConflictError,
  FactInputError,
  FactNotFoundError,
  FactReferenceError,
} from '../../../common/errors/fact-errors';

/** A submitted Sellpia artifact or collection request is invalid. */
export class ProductSourceInputError extends FactInputError {}

/** The source execution no longer has authority to publish its result. */
export class ProductSourceConflictError extends FactConflictError {}

/** The requested product source identity is absent from the organization. */
export class ProductSourceNotFoundError extends FactNotFoundError {}

/** A calculation requires the exact successful source collection. */
export class ProductCollectionRequiredError extends FactConflictError {
  constructor() {
    super('A completed Sellpia product collection is required before purchase.', {
      code: 'SELLPIA_SYNC_REQUIRED',
    });
  }
}

/** A source product or attempt reference is invalid for the organization. */
export class ProductSourceReferenceInvalidError extends FactReferenceError {
  constructor() {
    super(
      'A product source reference is invalid for this organization.',
      'PRODUCT_SOURCE_REFERENCE_INVALID',
    );
  }
}

/** A physical product source identity or quantity is not valid. */
export class InvalidProductSourceError extends FactInputError {}
