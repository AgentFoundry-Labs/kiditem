import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export const WING_IDENTITY_SOURCES = [
  'dom:data-vendor-id',
  'meta:vendor-id',
  'url:vendorId',
] as const;

@ValidatorConstraint({ name: 'verifiedWingEvidence', async: false })
class VerifiedWingEvidenceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const evidence = value as Record<string, unknown>;
    return Object.keys(evidence).length === 2
      && typeof evidence.wingVendorId === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(evidence.wingVendorId.trim())
      && typeof evidence.wingIdentitySource === 'string'
      && (WING_IDENTITY_SOURCES as readonly string[]).includes(evidence.wingIdentitySource);
  }
  defaultMessage(): string { return 'Verified WING account evidence is required.'; }
}

/**
 * 이미 마켓에 등록된 상품을 우리 등록상품으로 확정할 때의 입력.
 *
 * 확장 자동 제출이 완료를 확증했거나, 사용자가 WING 에서 직접 등록한 뒤
 * 등록상품ID 를 입력한 경우에만 쓴다. 서버는 provider 를 호출하지 않는다.
 */
export class ConfirmExternalRegistrationDto {
  @IsUUID()
  executionId!: string;

  /**
   * 쿠팡 등록상품ID(vendorInventoryId). 숫자만 허용한다 —
   * 임의 문자열을 그대로 `ChannelListing.externalId` 로 굳히면 이후 조인·삭제 가드가
   * 전부 흔들린다.
   */
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{6,20}$/, { message: '등록상품ID는 6~20자리 숫자여야 합니다.' })
  externalListingId!: string;

  /** Browser completion evidence; identity source/value are validated by the extension. */
  @Validate(VerifiedWingEvidenceConstraint)
  evidence!: { wingVendorId: string; wingIdentitySource: typeof WING_IDENTITY_SOURCES[number] };
}
