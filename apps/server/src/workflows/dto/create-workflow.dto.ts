import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateWorkflowBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() description?: string = '';
  @IsString() @IsOptional() module?: string = 'general';
  @IsString() @IsOptional() triggerType?: string = 'manual';
  @IsString() @IsOptional() schedule?: string | null;
  nodesJson: any;
  edgesJson: any;
  @IsBoolean() @IsOptional() isActive?: boolean = true;
}
