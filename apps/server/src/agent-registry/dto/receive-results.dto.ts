import { IsOptional, IsArray, IsNumber, IsObject } from 'class-validator';

export class ReceiveResultsBodyDto {
  @IsArray() @IsOptional() actions?: unknown[];
  @IsObject() @IsOptional() summary?: Record<string, unknown>;
  @IsNumber() @IsOptional() tokensUsed?: number;
}
