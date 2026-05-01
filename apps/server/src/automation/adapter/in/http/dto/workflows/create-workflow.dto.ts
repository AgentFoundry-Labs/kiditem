import { IsString, IsOptional, IsBoolean, IsArray, IsDefined, MinLength } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateWorkflowBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() description?: string = '';
  @IsString() @IsOptional() module?: string = 'general';
  @IsString() @IsOptional() triggerType?: string = 'manual';
  @IsString() @IsOptional() schedule?: string | null;
  @IsDefined() @IsArray() nodesJson: unknown[];
  @IsDefined() @IsArray() edgesJson: unknown[];
  @IsBoolean() @IsOptional() isActive?: boolean = true;
}
