import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

/** `a,b,c` 또는 반복 쿼리스트링 둘 다 배열로 받는다. */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const items = raw
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

export class MallPreflightQueryDto {
  @Transform(({ value }) => toStringArray(value))
  @IsOptional()
  @IsString({ each: true })
  mallKeys?: string[];

  @Transform(({ value }) => toStringArray(value))
  @IsOptional()
  @IsString({ each: true })
  masterProductIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 25;
}

export class MallAvailabilityPreviewQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  // 표는 100건이면 되지만 품절 송신은 **그 몰의 전부**를 알아야 한다. 창 안에 안 든
  // 몰은 버튼조차 서지 않아 통째로 빠진다(실측 2026-09-18: 후보 958건 중 앞 100건에
  // 키드키즈·아이스크림몰이 없어 두 몰이 사라졌다). 화면은 남은 건수를 함께 읽는다.
  @Max(3_000)
  limit = 50;
}

export class MallMatrixQueryDto {
  @Transform(({ value }) => toStringArray(value))
  @IsOptional()
  @IsString({ each: true })
  mallKeys?: string[];

  @IsOptional()
  @IsIn(['all', 'listed', 'unlisted'])
  filter?: 'all' | 'listed' | 'unlisted';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 25;
}
