import { IsString, IsOptional, IsNumber, IsBoolean, IsUUID, MinLength } from 'class-validator';

export class CreateAgentBodyDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) name: string;
  @IsString() type: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @MinLength(1) promptTemplate: string;
  @IsString() @IsOptional() allowedTools?: string;
  @IsString() @IsOptional() permissionMode?: string;
  @IsNumber() @IsOptional() monthlyTokenBudget?: number;
  @IsString() @IsOptional() schedule?: string;
  @IsNumber() @IsOptional() timeoutSeconds?: number;
  @IsBoolean() @IsOptional() requiresApproval?: boolean;
}
