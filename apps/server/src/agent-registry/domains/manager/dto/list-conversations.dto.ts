import { IsOptional, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ListConversationsQueryDto {
  @IsUUID() companyId: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
