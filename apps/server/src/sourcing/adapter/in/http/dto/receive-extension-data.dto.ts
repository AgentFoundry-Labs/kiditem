import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 1688 / Alibaba 등의 sourcing extension 이 push 하는 product/description payload.
 *
 * apps/server/AGENTS.md "DTO boundary":
 *   "controllers do not use `as any`; service parameters match DTOs or
 *    service-internal interfaces. Avoid `Record<string, unknown>` as a DTO
 *    substitute."
 *
 * Extension payload 가 다양한 1688 / alibaba page shape 을 흡수하다 보니 known
 * field 만 명시적으로 검증하고, 추가 raw 필드는 `extra` (객체) 로만 받는다.
 * `extra` 안에서 sourcing.service 가 known image-array 키들을 다시 collect.
 */
export class ReceiveExtensionDataDto {
  @IsOptional()
  @IsIn(['detail', 'description', 'search'])
  page_type?: 'detail' | 'description' | 'search';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  source_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source_platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  description_text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  description_images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  detail_images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category_name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  priceRange?: string;

  @IsOptional()
  @IsObject()
  offer?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  skuProps?: unknown[];

  @IsOptional()
  @IsArray()
  priceRanges?: unknown[];

  @IsOptional()
  @IsInt()
  @Min(0)
  total_found?: number;

  /**
   * Vendor extension 별로 다양한 image-array / metadata 키 (`offerImgList`,
   * `mainImages`, `imageUrls` 등) 를 흡수하기 위한 escape hatch.
   *
   * Service 가 `IMAGE_FIELD_KEYS` 화이트리스트로 image url 만 다시 추출하므로
   * extra 의 unknown 필드는 DB write 에는 직접 닿지 않는다 (`rawData` JSON
   * column 에는 화이트리스트된 image 키만 normalize 되어 저장).
   */
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

/**
 * Service 가 사용하는 정규화된 표현. controller 가 DTO + extra spread 로 평탄화.
 * Service 시그니처는 이 형태로 받아 `any` 차단.
 */
export type ReceiveExtensionDataInput = ReceiveExtensionDataDto & {
  /**
   * controller 가 DTO 의 known field + extra 를 평탄화한 결과. service 는 known
   * field 는 DTO 타입에서, 그 외 vendor-specific 키는 `extra` 에서 읽는다.
   */
};
