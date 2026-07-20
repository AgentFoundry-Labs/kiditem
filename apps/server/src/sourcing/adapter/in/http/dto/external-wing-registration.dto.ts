import { Transform } from 'class-transformer';
import { IsObject, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class PrepareExternalWingRegistrationDto {
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
}

export class ExternalWingEvidenceDto {
  @IsObject()
  evidence!: Record<string, unknown>;
}
