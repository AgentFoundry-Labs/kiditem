import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class ListActivityEventsQueryDto {
  @IsString() @IsOptional() objectType?: string;
  @IsString() @IsOptional() objectId?: string;
  @IsString() @IsOptional() eventType?: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
