import { Transform } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const EDITABLE_FIELDS = [
  'displayName',
  'registrationInput',
  'selectedThumbnailUrl',
  'selectedThumbnailGenerationId',
  'selectedThumbnailGenerationCandidateId',
  'selectedDetailPageArtifactId',
  'selectedDetailPageRevisionId',
  'selectedDetailPageGenerationId',
] as const;

@ValidatorConstraint({ name: 'atLeastOneProductPreparationField', async: false })
class AtLeastOneProductPreparationFieldConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value = args.object as UpdateProductPreparationDto;
    return EDITABLE_FIELDS.some((field) => value[field] !== undefined);
  }

  defaultMessage(): string {
    return 'At least one preparation field must be supplied.';
  }
}

export class UpdateProductPreparationDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(1)
  @MaxLength(500)
  displayName?: string;

  @IsOptional()
  @IsObject()
  registrationInput?: Record<string, unknown>;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  selectedThumbnailUrl?: string | null;

  @IsOptional()
  @IsUUID()
  selectedThumbnailGenerationId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedThumbnailGenerationCandidateId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageArtifactId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageRevisionId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageGenerationId?: string | null;

  @Validate(AtLeastOneProductPreparationFieldConstraint)
  private readonly atLeastOneField?: never;
}
