import { IsString } from 'class-validator';

export class SelectCandidateDto {
  @IsString()
  selectedUrl: string;
}
