import { IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ListActivityEventsQueryDto {
  @IsString() @IsOptional() objectType?: string;
  @IsString() @IsOptional() objectId?: string;
  @IsUUID() @IsOptional() companyId?: string;
  @IsString() @IsOptional() eventType?: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
