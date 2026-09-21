export class ProductInputException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductInputException';
  }
}
