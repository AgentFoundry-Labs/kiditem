import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProductBasicsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  target?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ageGroup?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kcCertificationStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  kcCertificationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  colorVariantStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  colorVariantNames?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  boxSetStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  boxSetQuantity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate?: number;
}
