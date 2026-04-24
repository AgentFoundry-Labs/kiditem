import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min, ValidateIf } from 'class-validator';

export const MASTER_IMAGE_ROLES = ['box', 'product', 'color_variant', 'size_chart', 'detail'] as const;
export type MasterImageRoleDtoValue = (typeof MASTER_IMAGE_ROLES)[number];

export class MasterImageItemDto {
  @IsUrl()
  url!: string;

  @IsIn([...MASTER_IMAGE_ROLES])
  role!: MasterImageRoleDtoValue;

  @ValidateIf((_obj, value) => value !== null)
  @IsOptional()
  @IsString()
  label!: string | null;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
