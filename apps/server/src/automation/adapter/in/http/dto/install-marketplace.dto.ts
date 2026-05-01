import { IsOptional, IsObject } from 'class-validator';

/**
 * organizationId 는 `@CurrentOrganization()` 에서 주입 — DTO 에 포함하지 않는다.
 * root AGENTS.md multi-tenant scope rule을 따른다.
 */
export class InstallMarketplaceBodyDto {
  @IsObject() @IsOptional() params?: Record<string, any>;
}
