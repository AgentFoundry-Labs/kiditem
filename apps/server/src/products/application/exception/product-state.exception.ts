export class ProductStateException extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'SOURCE_CONFLICT', message: string) {
    super(message);
    this.name = 'ProductStateException';
  }
}
