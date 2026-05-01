import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAgentTasksQueryDto {
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() agentType?: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
