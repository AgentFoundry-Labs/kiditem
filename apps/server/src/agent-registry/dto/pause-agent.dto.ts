import { IsOptional, IsString } from 'class-validator';

export class PauseAgentBodyDto {
  @IsString() @IsOptional() reason?: string;
}
