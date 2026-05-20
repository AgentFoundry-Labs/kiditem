import { IsString, IsOptional } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class ListWorkflowsQueryDto {
  @IsString() @IsOptional() module?: string;
  @IsString() @IsOptional() isActive?: string;
}
