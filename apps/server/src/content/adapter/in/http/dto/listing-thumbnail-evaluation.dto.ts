import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EvaluateListingThumbnailDto {
  // 몰 CDN 과 로컬 저장소(TLD 없는 localhost) 주소가 모두 온다.
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  @MaxLength(2_000)
  imageUrl!: string;

  /** 평가에 쓸 vision 모델. 명시해야 한다(모델 선택 필수). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  modelId!: string;
}

export class ListingThumbnailCurrentItemDto {
  @IsUUID()
  channelListingId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  imageUrl?: string | null;
}

export class ReadCurrentListingThumbnailsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ListingThumbnailCurrentItemDto)
  listings!: ListingThumbnailCurrentItemDto[];
}
