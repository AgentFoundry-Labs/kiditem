import { IsOptional, IsIn, IsString, MaxLength } from 'class-validator';

export class PromoteAlertDto {
  @IsOptional() @IsIn(['urgent', 'high', 'medium'])
  priorityOverride?: string;

  @IsOptional() @IsString()
  roleOverride?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
