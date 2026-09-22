import { Transform } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PrepareWingRegistrationExecutionDto {
  @IsUUID()
  channelAccountId!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(1)
  @MaxLength(500)
  displayName!: string;

  @IsObject()
  registrationInput!: Record<string, unknown>;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsUUID()
  sellpiaInventorySkuId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sellpiaQuantity?: number;
}

export class PreviewWingRegistrationMatchDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(1)
  @MaxLength(500)
  listingName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MaxLength(500)
  itemName?: string;
}

export class RegistrationExecutionEvidenceDto {
  @IsObject()
  evidence!: Record<string, unknown>;
}
