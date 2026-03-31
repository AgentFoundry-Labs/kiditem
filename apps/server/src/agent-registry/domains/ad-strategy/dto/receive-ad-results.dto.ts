import { IsOptional, IsArray, IsObject } from 'class-validator';

export class ReceiveAdResultsBodyDto {
  @IsArray() @IsOptional() actions?: unknown[];
  @IsObject() @IsOptional() summary?: Record<string, unknown>;
}
