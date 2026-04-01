import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateRuleBodyDto {
  @IsOptional() threshold?: unknown;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsBoolean() @IsOptional() autoExecute?: boolean;
}
