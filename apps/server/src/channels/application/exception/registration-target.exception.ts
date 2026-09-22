export class RegistrationTargetException extends Error {
  constructor(readonly code: 'not_found' | 'conflict' | 'invalid', message: string) {
    super(message);
    this.name = 'RegistrationTargetException';
  }
}
