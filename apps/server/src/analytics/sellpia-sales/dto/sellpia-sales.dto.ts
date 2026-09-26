import {
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// Sellpia 판매현황(몰별 매출) read 쿼리 DTO. 수집은 실행 kind `analytics.sellpia_sales`가 맡는다.

export class SellpiaSalesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
