import { HttpException } from '@nestjs/common';

export class AppException extends HttpException {
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super({ statusCode, error: code, message }, statusCode);
    this.code = code;
  }
}
