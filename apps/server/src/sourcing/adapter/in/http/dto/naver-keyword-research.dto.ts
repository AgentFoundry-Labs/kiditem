import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchNaverRelatedKeywordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  seedKeywords!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxResults?: number;
}

export class SearchNaverAutocompleteKeywordsDto {
  @IsString()
  @MaxLength(80)
  keyword!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxResults?: number;
}

export class CompareNaverDatalabSearchTrendsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  keywords!: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsIn(['date', 'week', 'month'])
  timeUnit?: 'date' | 'week' | 'month';

  @IsOptional()
  @IsIn(['pc', 'mo'])
  device?: 'pc' | 'mo';

  @IsOptional()
  @IsIn(['m', 'f'])
  gender?: 'm' | 'f';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(11)
  @IsString({ each: true })
  ages?: string[];
}

export class SearchNaverDatalabPopularKeywordsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(['all_categories', 'birth_kids', 'toys_dolls', 'stationery_office', 'kids_fashion'], { each: true })
  boardKeys?: Array<'all_categories' | 'birth_kids' | 'toys_dolls' | 'stationery_office' | 'kids_fashion'>;

  @IsOptional()
  @IsIn(['date', 'week', 'month'])
  timeUnit?: 'date' | 'week' | 'month';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsIn(['pc', 'mo'])
  device?: 'pc' | 'mo';

  @IsOptional()
  @IsIn(['m', 'f'])
  gender?: 'm' | 'f';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(['10', '20', '30', '40', '50', '60'], { each: true })
  @IsString({ each: true })
  ages?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50)
  limit?: number;
}

export class SourcingWorkspaceSnapshotParamsDto {
  @IsIn(['keyword_analysis', 'today_recommendations'])
  scope!: 'keyword_analysis' | 'today_recommendations';
}

export class SaveSourcingWorkspaceSnapshotDto {
  @IsObject()
  payload!: Record<string, unknown>;
}
