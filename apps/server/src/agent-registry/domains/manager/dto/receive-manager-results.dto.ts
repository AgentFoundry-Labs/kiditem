import { IsOptional, IsString, IsNumber, IsArray, IsObject } from 'class-validator';

export class ReceiveManagerResultsBodyDto {
  @IsString() @IsOptional() answer?: string;
  @IsObject() @IsOptional() data?: Record<string, unknown>;
  @IsArray() @IsOptional() recommendations?: any[];
  @IsNumber() @IsOptional() tokensUsed?: number;
}
