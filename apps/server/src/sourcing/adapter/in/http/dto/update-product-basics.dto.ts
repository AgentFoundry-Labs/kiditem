import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { IsBoundedStringMap } from './bounded-string-map.validator';

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

  /**
   * 몰별 상품등록 칸 값. `{ 몰키: { 칸키: 값 } }`.
   *
   * 서버는 뜻을 모른다 — 어느 몰이 어떤 칸을 요구하는지 아는 것은 프런트 어댑터뿐이다.
   * 여기서는 **모양과 크기만** 지킨다. 자유 JSON 을 그대로 받으면 `rawData` 가
   * 끝없이 자라고, 그건 우리가 만든 사고다.
   */
  @IsOptional()
  @IsObject()
  @Validate(IsBoundedStringMap, [2])
  mallRegisterValues?: Record<string, Record<string, string>>;

  /**
   * 여러 몰이 함께 쓰는 칸 값. `{ 칸키: 값 }`.
   *
   * 안전인증번호처럼 상품에 하나뿐인 값이다. 몰마다 따로 담으면 서로 다르게 적히고,
   * 그것도 우리가 만든 오류다.
   */
  @IsOptional()
  @IsObject()
  @Validate(IsBoundedStringMap, [1])
  mallRegisterShared?: Record<string, string>;

  @IsOptional()
  @IsISO8601()
  basePreparationUpdatedAt?: string | null;
}
