import { IsOptional, IsString } from 'class-validator';

export class CollectAdsDto {
  @IsOptional()
  @IsString()
  period?: string = '7d';
}
