import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 이미 마켓에 등록된 상품을 우리 등록상품으로 확정할 때의 입력.
 *
 * 확장 자동 제출이 완료를 확증했거나, 사용자가 WING 에서 직접 등록한 뒤
 * 등록상품ID 를 입력한 경우에만 쓴다. 서버는 provider 를 호출하지 않는다.
 */
export class ConfirmExternalRegistrationDto {
  @IsUUID()
  channelAccountId!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(500)
  displayName!: string;

  /**
   * 쿠팡 등록상품ID(vendorInventoryId). 숫자만 허용한다 —
   * 임의 문자열을 그대로 `ChannelListing.externalId` 로 굳히면 이후 조인·삭제 가드가
   * 전부 흔들린다.
   */
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{6,20}$/, { message: '등록상품ID는 6~20자리 숫자여야 합니다.' })
  externalListingId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  channel?: string;
}
