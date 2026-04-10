import { IsArray, IsUUID, IsOptional, IsIn } from 'class-validator';

export class EditThumbnailDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds: string[];

  @IsOptional()
  @IsIn(['compliance', 'quality'])
  purpose?: 'compliance' | 'quality';
}
