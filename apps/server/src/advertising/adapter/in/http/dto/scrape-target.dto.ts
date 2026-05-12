import { IsString, IsOptional } from 'class-validator';

export class CreateScrapeTargetDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class MarkScrapedDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  action?: string;
}
