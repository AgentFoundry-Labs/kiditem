import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterManualProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  target?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  thumbnailUrls?: string[];

  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  imageUrls!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  optionNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  keywords?: string[];

  // 사방넷 신규등록의 가격정보 · 기본정보와 같은 칸이다. 여기서 받으면 수집상품을 거쳐 판매상품까지 그대로 간다.

  /** 사방넷 `판매가`. 0이면 셀피아 이름매칭 폴백을 쓴다. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  salePrice?: number;

  /** 사방넷 `TAG가`(소비자가). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  tagPrice?: number;

  /** 사방넷 `원가`(공급가 · 매입 지불 금액). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  costPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  /** 사방넷 `원산지(제조국)`. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  originCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelName?: string;

  /** 사방넷 `자체상품코드`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownCode?: string;

  /** 사방넷 `세금구분` — `taxable` 과세 · `tax_free` 면세. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxType?: string;

  /** 사방넷 `배송비`(VAT 포함). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  deliveryFee?: number;

  /** 사방넷 `배송비구분` — free 무료 · prepay 선결제 · collect 착불 · collect_or_prepay 착불/선결제. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  deliveryFeeType?: string;

  /** 사방넷 인증정보의 `인증기관`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificationIssuer?: string;

  /** 사방넷 인증정보의 `인증분야`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificationField?: string;
}
