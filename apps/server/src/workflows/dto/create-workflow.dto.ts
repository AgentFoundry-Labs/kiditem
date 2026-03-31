import { IsString, IsOptional, IsBoolean, IsUUID, MinLength } from 'class-validator';

export class CreateWorkflowBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsUUID() companyId: string;
  @IsString() @IsOptional() description?: string = '';
  @IsString() @IsOptional() module?: string = 'general';
  @IsString() @IsOptional() triggerType?: string = 'manual';
  @IsString() @IsOptional() schedule?: string | null;
  nodesJson: any;
  edgesJson: any;
  @IsBoolean() @IsOptional() isActive?: boolean = true;
}
