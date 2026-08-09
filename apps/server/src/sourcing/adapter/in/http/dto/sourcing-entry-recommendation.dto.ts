import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ListEntryRecommendationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AskSourcingAssistantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  question!: string;

  /** 화면이 지금 보고 있는 추천 행 요약. 프롬프트 근거로만 쓰인다. */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  visibleContext?: string;
}
