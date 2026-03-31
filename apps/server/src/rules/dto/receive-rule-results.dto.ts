import { IsOptional, IsArray, IsObject } from 'class-validator';

export class ReceiveRuleResultsBodyDto {
  @IsArray() @IsOptional() products?: any[];
  @IsObject() @IsOptional() summary?: Record<string, unknown>;
}
