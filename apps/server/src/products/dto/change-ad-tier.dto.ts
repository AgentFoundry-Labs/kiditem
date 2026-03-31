import { IsString } from 'class-validator';

export class ChangeAdTierBodyDto {
  @IsString() adTier: string;
}
