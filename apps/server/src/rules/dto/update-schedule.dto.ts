import { IsString } from 'class-validator';

export class UpdateScheduleBodyDto {
  @IsString() schedule: string;
}
