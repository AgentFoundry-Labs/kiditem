export class ListingException extends Error {
  constructor(readonly code: 'invalid' | 'not_found', message: string) {
    super(message);
    this.name = 'ListingException';
  }
}
