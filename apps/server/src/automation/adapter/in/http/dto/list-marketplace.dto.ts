import { IsOptional, IsString } from 'class-validator';

/**
 * organizationId 는 `@CurrentOrganization()` 에서 주입 — DTO 필드에서 제거.
 * 필터는 그대로 유지.
 */
export class ListMarketplaceQueryDto {
  @IsString() @IsOptional() module?: string;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() role?: string;
}
