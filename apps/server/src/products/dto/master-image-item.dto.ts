import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { MasterImageRoleSchema, type MasterImageRole } from '@kiditem/shared';

/**
 * Role enum values derive from the shared `MasterImageRoleSchema` so the
 * server DTO cannot drift from the Zod contract when a role is added or
 * removed. Exported as a readonly array for class-validator's `@IsIn`.
 */
export const MASTER_IMAGE_ROLES = MasterImageRoleSchema.options;

export class MasterImageItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUrl()
  url!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  storageKey?: string | null;

  @IsIn([...MASTER_IMAGE_ROLES])
  role!: MasterImageRole;

  // Shared contract is `string | null` — the key is required, only the value
  // may be null. `ValidateIf(value !== null)` defers `@IsString` until the
  // value is non-null, so `null` passes but `undefined` does not.
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  label!: string | null;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  mimeType?: string | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsInt()
  @Min(1)
  width?: number | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsInt()
  @Min(1)
  height?: number | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsInt()
  @Min(0)
  fileSize?: number | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
