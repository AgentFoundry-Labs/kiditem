import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  /** KC 인증 이미지. data:image/ base64 또는 호스팅 URL. */
  @IsOptional()
  @IsString()
  @MaxLength(5_000_000)
  kcCertificationImageUrl?: string;

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

  /** 쿠팡 로켓 묶음 수량 (소비자가 만원 미만일 때 묶음 계산용). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  rocketBundleQuantity?: number;

  /** 쿠팡 로켓 마진 계산용 단가 원가(KRW). 위안 원가 자동 환산값을 덮어쓸 수 있음. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  rocketUnitCost?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  thumbnailUrls?: string[];

  @IsOptional()
  @IsISO8601()
  basePreparationUpdatedAt?: string | null;
}
