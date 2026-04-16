import { IsIn, IsOptional } from 'class-validator';

export class ListActionTasksDto {
  @IsOptional()
  @IsIn(['me', 'team', 'all'])
  assignedTo?: 'me' | 'team' | 'all';
}
