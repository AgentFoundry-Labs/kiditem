import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class Append1688NewProductItemsDto {
  @IsString()
  @MaxLength(80)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  items!: Record<string, unknown>[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
