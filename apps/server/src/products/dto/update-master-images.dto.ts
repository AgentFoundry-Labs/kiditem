import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { MasterImageItemDto } from './master-image-item.dto';

/**
 * Body for PATCH `/api/products/masters/:id/images` — replaces the stored
 * image list with the provided structured items. Validated end-to-end by
 * class-validator (`@ValidateNested` + `MasterImageItemDto`) so unknown
 * roles / invalid urls / negative sortOrder are rejected before the
 * service ever runs `normalizeMasterImages`.
 */
export class UpdateMasterImagesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MasterImageItemDto)
  items!: MasterImageItemDto[];
}
