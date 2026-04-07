import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'active', 'done'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium'])
  priority?: string;
}
