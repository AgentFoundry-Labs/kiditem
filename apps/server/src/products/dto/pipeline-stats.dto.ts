import { IsOptional, IsString } from 'class-validator';

export class PipelineStatsQueryDto {
  @IsString() @IsOptional() status?: string;
}
