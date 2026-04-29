import { IsOptional, IsObject } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * root AGENTS.md multi-tenant scope rule을 따른다.
 */
export class InstallMarketplaceBodyDto {
  @IsObject() @IsOptional() params?: Record<string, any>;
}
