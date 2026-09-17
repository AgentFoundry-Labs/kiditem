// Framework-free errors a ledger reader or other transaction-client function
// throws when the facts it was asked for cannot be read as asked. The HTTP
// boundary maps them (GlobalExceptionFilter): not found 404, conflict 409,
// input 400. An integrity failure stays a plain Error, which answers 500.

/** A fact the caller named does not exist in its organization. */
export class FactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactNotFoundError';
  }
}

/** The stored facts disagree with what the read requires. */
export class FactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactConflictError';
  }
}

/** The read's own input cannot select any facts. */
export class FactInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactInputError';
  }
}
