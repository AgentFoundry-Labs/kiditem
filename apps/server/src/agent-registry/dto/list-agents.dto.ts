import { IsString, IsOptional } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class ListAgentsQueryDto {
  @IsString() @IsOptional() isActive?: string;
}
