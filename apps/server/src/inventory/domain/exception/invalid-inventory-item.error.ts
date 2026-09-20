import { FactInputError } from '../../../common/errors/fact-errors';

/** A physical inventory identity or quantity is not a valid domain input. */
export class InvalidInventoryItemError extends FactInputError {}
